use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex, Semaphore};

use crate::models::{
    AuthProvider, DownloadProgressPayload, GameLogEntry, LaunchStatus, LoaderType,
};
use crate::services::{
    ChecksumType, CrashRepairService, DiscordService, Downloader, ElyByService, InstanceManager, JavaDetector,
    JvmOptimizer, KeyringService, ManifestService, ModrinthService,
};

#[cfg(target_os = "windows")]
fn run_hidden_windows_cmd(cmd: &str, args: &[&str]) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new(cmd)
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .args(args)
        .output();
}

#[derive(Clone)]
pub struct GameProcessState(pub Arc<Mutex<Option<tokio::process::Child>>>);

impl Default for GameProcessState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

#[derive(Clone)]
pub struct Launcher {
    instance_manager: Arc<InstanceManager>,
    keyring_service: Arc<KeyringService>,
    manifest_service: Arc<ManifestService>,
    java_detector: Arc<JavaDetector>,
    jvm_optimizer: Arc<JvmOptimizer>,
    downloader: Arc<Downloader>,
    elyby_service: Arc<ElyByService>,
    pub discord_service: Arc<DiscordService>,
    pub modrinth_service: Arc<ModrinthService>,
    pub crash_repair_service: Arc<CrashRepairService>,
    running_processes: Arc<Mutex<HashMap<String, u32>>>,
    pub game_process_state: GameProcessState,
}

impl Launcher {
    pub fn new(
        instance_manager: Arc<InstanceManager>,
        keyring_service: Arc<KeyringService>,
        manifest_service: Arc<ManifestService>,
        java_detector: Arc<JavaDetector>,
        jvm_optimizer: Arc<JvmOptimizer>,
        downloader: Arc<Downloader>,
        elyby_service: Arc<ElyByService>,
        discord_service: Arc<DiscordService>,
        modrinth_service: Arc<ModrinthService>,
        crash_repair_service: Arc<CrashRepairService>,
        game_process_state: GameProcessState,
    ) -> Self {
        Self {
            instance_manager,
            keyring_service,
            manifest_service,
            java_detector,
            jvm_optimizer,
            downloader,
            elyby_service,
            discord_service,
            modrinth_service,
            crash_repair_service,
            running_processes: Arc::new(Mutex::new(HashMap::new())),
            game_process_state,
        }
    }

    /// Kill active running Minecraft game process forcefully
    pub async fn kill_active_game(&self, app: &AppHandle) -> Result<(), String> {
        let mut lock = self.game_process_state.0.lock().await;
        if let Some(mut child) = lock.take() {
            #[cfg(target_os = "windows")]
            if let Some(pid) = child.id() {
                run_hidden_windows_cmd("taskkill", &["/F", "/PID", &pid.to_string(), "/T"]);
            }
            #[cfg(not(target_os = "windows"))]
            if let Some(pid) = child.id() {
                let _ = std::process::Command::new("kill")
                    .args(["-9", &pid.to_string()])
                    .output();
            }

            let _ = child.kill().await;

            let mut running = self.running_processes.lock().await;
            running.clear();

            let _ = app.emit(
                "game-status-changed",
                serde_json::json!({
                    "running": false,
                    "exit_code": -1
                }),
            );
            Ok(())
        } else {
            let mut running = self.running_processes.lock().await;
            for (_inst, pid) in running.drain() {
                #[cfg(target_os = "windows")]
                {
                    run_hidden_windows_cmd("taskkill", &["/F", "/PID", &pid.to_string(), "/T"]);
                }
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .output();
                }
            }
            let _ = app.emit(
                "game-status-changed",
                serde_json::json!({
                    "running": false,
                    "exit_code": 0
                }),
            );
            Ok(())
        }
    }

    /// Kill running Minecraft process for an instance by ID (delegates to kill_active_game)
    pub async fn kill_process(&self, app: &AppHandle, _instance_id: &str) -> Result<(), String> {
        self.kill_active_game(app).await
    }

    /// Launch an instance by ID with full file provisioning and piped process output
    pub async fn launch(&self, app: AppHandle, instance_id: &str) -> Result<(), String> {
        let instance = self.instance_manager.get_instance(instance_id)?;
        let instance_dir = self.instance_manager.instance_path(instance_id);

        let _ = self.discord_service.set_launching(&instance.name, &instance.game_version).await;

        // Cleanup any stale process or lock files from a previous crash
        {
            let mut running = self.running_processes.lock().await;
            if let Some(old_pid) = running.remove(instance_id) {
                #[cfg(target_os = "windows")]
                if old_pid > 0 {
                    run_hidden_windows_cmd("taskkill", &["/F", "/PID", &old_pid.to_string(), "/T"]);
                }
            }
        }
        {
            let mut proc_lock = self.game_process_state.0.lock().await;
            *proc_lock = None;
        }
        let root_lock = instance_dir.join("session.lock");
        if root_lock.exists() {
            let _ = std::fs::remove_file(&root_lock);
        }

        // 1. Verify Active Account
        let active_account = self
            .keyring_service
            .get_active_account()?
            .ok_or_else(|| "Активный аккаунт не найден! Выберите или добавьте аккаунт во вкладке 'Аккаунты'.".to_string())?;

        // 2. Download & Verify Version Metadata
        self.emit_status(
            &app,
            instance_id,
            "downloading",
            "Загрузка манифеста версии Minecraft...",
            Some(2.0),
        );
        let pkg = self
            .manifest_service
            .get_version_package(&instance.game_version)
            .await?;

        let expected_java_major = pkg.java_version.as_ref().map(|j| j.major_version);

        // 3. Validate / Detect Java
        self.emit_status(
            &app,
            instance_id,
            "verifying",
            "Проверка среды выполнения Java...",
            Some(4.0),
        );
        let java_install = self.java_detector.ensure_compatible_java(
            instance.java_path.as_deref(),
            &instance.game_version,
            expected_java_major,
            &self.instance_manager.cache_dir(),
            &self.downloader,
            Some(&app),
            Some(instance_id),
        ).await?;

        // 4. Download Client Jar
        self.emit_status(
            &app,
            instance_id,
            "downloading",
            "Проверка игрового клиента (client.jar)...",
            Some(5.0),
        );
        let client_jar_path = self
            .instance_manager
            .cache_dir()
            .join("versions")
            .join(&instance.game_version)
            .join(format!("{}.jar", instance.game_version));

        if !client_jar_path.exists() {
            self.downloader
                .download_file(
                    &pkg.downloads.client.url,
                    &client_jar_path,
                    ChecksumType::Sha1(pkg.downloads.client.sha1.clone()),
                    Some(instance_id),
                    Some(&app),
                )
                .await?;
        }

        // 5. Download Vanilla Libraries concurrently with bounded semaphore
        self.emit_status(
            &app,
            instance_id,
            "downloading",
            "Скачивание библиотек Minecraft...",
            Some(5.0),
        );
        let mut classpath_entries: Vec<PathBuf> = Vec::new();
        let libraries_dir = self.instance_manager.cache_dir().join("libraries");

        struct LibDownloadTask {
            urls: Vec<String>,
            path: PathBuf,
            sha1: Option<String>,
            name: String,
        }

        let mut download_tasks = Vec::new();
        let mut native_jar_paths: Vec<PathBuf> = Vec::new();

        for lib in &pkg.libraries {
            if !ManifestService::is_library_allowed_on_windows(lib.rules.as_deref()) {
                continue;
            }

            if let Some(ref downloads) = lib.downloads {
                // 1. Regular artifact for classpath
                if let Some(ref artifact) = downloads.artifact {
                    let lib_path = libraries_dir.join(&artifact.path);
                    if !lib_path.exists() {
                        let dl_urls = ManifestService::resolve_library_download_urls(
                            &lib.name,
                            &artifact.path,
                            Some(&artifact.url),
                        );
                        download_tasks.push(LibDownloadTask {
                            urls: dl_urls,
                            path: lib_path.clone(),
                            sha1: Some(artifact.sha1.clone()),
                            name: lib.name.clone(),
                        });
                    }
                    classpath_entries.push(lib_path);
                }

                // 2. Native classifiers for Windows (LWJGL 2 & 3 dlls: lwjgl64.dll, OpenAL64.dll, etc.)
                if let Some(ref classifiers) = downloads.classifiers {
                    let target_classifier = if let Some(ref natives_map) = lib.natives {
                        natives_map.get("windows").map(|s| {
                            s.replace("${arch}", if java_install.is_64_bit { "64" } else { "32" })
                        })
                    } else {
                        None
                    };

                    let native_artifact = target_classifier
                        .as_deref()
                        .and_then(|k| classifiers.get(k))
                        .or_else(|| {
                            if java_install.is_64_bit {
                                classifiers
                                    .get("natives-windows-64")
                                    .or_else(|| classifiers.get("natives-windows"))
                                    .or_else(|| classifiers.get("natives-windows-x86_64"))
                            } else {
                                classifiers
                                    .get("natives-windows-32")
                                    .or_else(|| classifiers.get("natives-windows"))
                            }
                        })
                        .or_else(|| {
                            classifiers.iter().find_map(|(k, v)| {
                                if k.contains("windows") {
                                    Some(v)
                                } else {
                                    None
                                }
                            })
                        });

                    if let Some(artifact) = native_artifact {
                        let native_path = libraries_dir.join(&artifact.path);
                        if !native_path.exists() {
                            let dl_urls = ManifestService::resolve_library_download_urls(
                                &lib.name,
                                &artifact.path,
                                Some(&artifact.url),
                            );
                            download_tasks.push(LibDownloadTask {
                                urls: dl_urls,
                                path: native_path.clone(),
                                sha1: Some(artifact.sha1.clone()),
                                name: format!("{} (natives)", lib.name),
                            });
                        }
                        native_jar_paths.push(native_path);
                    }
                }
            }
        }

        // 6. Handle Modloader Libraries (Fabric, Forge, NeoForge, Quilt)
        let mut custom_minecraft_args: Option<String> = None;
        let mut custom_game_args: Option<Vec<serde_json::Value>> = None;

        let main_class = match instance.loader_type {
            LoaderType::Fabric => {
                self.emit_status(
                    &app,
                    instance_id,
                    "downloading",
                    "Разрешение компонентов Fabric Loader...",
                    Some(65.0),
                );
                let loader_version = instance
                    .loader_version
                    .as_deref()
                    .unwrap_or("0.16.9");

                let fabric_profile = self
                    .manifest_service
                    .get_fabric_profile(&instance.game_version, loader_version)
                    .await?;

                for lib in &fabric_profile.libraries {
                    if let Some(rel_path) = ManifestService::maven_to_path(&lib.name) {
                        let lib_path = libraries_dir.join(&rel_path);
                        if !lib_path.exists() {
                            let dl_urls = ManifestService::resolve_library_download_urls(
                                &lib.name,
                                &rel_path,
                                Some(&lib.url),
                            );
                            download_tasks.push(LibDownloadTask {
                                urls: dl_urls,
                                path: lib_path.clone(),
                                sha1: None,
                                name: lib.name.clone(),
                            });
                        }
                        classpath_entries.push(lib_path);
                    }
                }
                fabric_profile.main_class
            }
            LoaderType::Quilt => {
                self.emit_status(
                    &app,
                    instance_id,
                    "downloading",
                    "Разрешение компонентов Quilt Loader...",
                    Some(65.0),
                );
                let loader_version = instance
                    .loader_version
                    .as_deref()
                    .unwrap_or("0.27.0");

                let quilt_profile = self
                    .manifest_service
                    .get_quilt_profile(&instance.game_version, loader_version)
                    .await?;

                for lib in &quilt_profile.libraries {
                    if let Some(rel_path) = ManifestService::maven_to_path(&lib.name) {
                        let lib_path = libraries_dir.join(&rel_path);
                        if !lib_path.exists() {
                            let dl_urls = ManifestService::resolve_library_download_urls(
                                &lib.name,
                                &rel_path,
                                Some(&lib.url),
                            );
                            download_tasks.push(LibDownloadTask {
                                urls: dl_urls,
                                path: lib_path.clone(),
                                sha1: None,
                                name: lib.name.clone(),
                            });
                        }
                        classpath_entries.push(lib_path);
                    }
                }
                quilt_profile.main_class
            }
            LoaderType::NeoForge => {
                self.emit_status(
                    &app,
                    instance_id,
                    "downloading",
                    "Разрешение компонентов NeoForge...",
                    Some(65.0),
                );
                let neoforge_profile = self
                    .manifest_service
                    .get_neoforge_profile(&instance.game_version, instance.loader_version.as_deref())
                    .await?;

                for lib in &neoforge_profile.libraries {
                    if !ManifestService::is_library_allowed_on_windows(lib.rules.as_deref()) {
                        continue;
                    }

                    if let Some(ref downloads) = lib.downloads {
                        if let Some(ref artifact) = downloads.artifact {
                            let lib_path = libraries_dir.join(&artifact.path);
                            if !lib_path.exists() {
                                let dl_urls = ManifestService::resolve_library_download_urls(
                                    &lib.name,
                                    &artifact.path,
                                    Some(&artifact.url),
                                );
                                download_tasks.push(LibDownloadTask {
                                    urls: dl_urls,
                                    path: lib_path.clone(),
                                    sha1: Some(artifact.sha1.clone()),
                                    name: lib.name.clone(),
                                });
                            }
                            classpath_entries.push(lib_path);
                        }
                    } else if let Some(rel_path) = ManifestService::maven_to_path(&lib.name) {
                        let lib_path = libraries_dir.join(&rel_path);
                        if !lib_path.exists() {
                            let dl_urls = ManifestService::resolve_library_download_urls(
                                &lib.name,
                                &rel_path,
                                lib.url.as_deref(),
                            );
                            download_tasks.push(LibDownloadTask {
                                urls: dl_urls,
                                path: lib_path.clone(),
                                sha1: None,
                                name: lib.name.clone(),
                            });
                        }
                        classpath_entries.push(lib_path);
                    }
                }

                custom_minecraft_args = neoforge_profile.minecraft_arguments;
                if let Some(ref args) = neoforge_profile.arguments {
                    custom_game_args = Some(args.game.clone());
                }

                neoforge_profile.main_class
            }
            LoaderType::Forge => {
                self.emit_status(
                    &app,
                    instance_id,
                    "downloading",
                    "Разрешение компонентов Minecraft Forge...",
                    Some(65.0),
                );
                let forge_profile = self
                    .manifest_service
                    .get_forge_profile(&instance.game_version, instance.loader_version.as_deref())
                    .await?;

                for lib in &forge_profile.libraries {
                    if !ManifestService::is_library_allowed_on_windows(lib.rules.as_deref()) {
                        continue;
                    }

                    if let Some(ref downloads) = lib.downloads {
                        if let Some(ref artifact) = downloads.artifact {
                            let lib_path = libraries_dir.join(&artifact.path);
                            if !lib_path.exists() {
                                let mut dl_url = artifact.url.clone();
                                if dl_url.trim().is_empty() {
                                    if artifact.path.contains("minecraftforge/forge") {
                                        let ver = &instance.game_version;
                                        let forge_ver = instance.loader_version.as_deref().unwrap_or("14.23.5.2860");
                                        dl_url = format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{}-{}/forge-{}-{}-universal.jar", ver, forge_ver, ver, forge_ver);
                                    } else {
                                        dl_url = format!("https://maven.minecraftforge.net/{}", artifact.path);
                                    }
                                }
                                let dl_urls = ManifestService::resolve_library_download_urls(
                                    &lib.name,
                                    &artifact.path,
                                    Some(&dl_url),
                                );
                                download_tasks.push(LibDownloadTask {
                                    urls: dl_urls,
                                    path: lib_path.clone(),
                                    sha1: Some(artifact.sha1.clone()),
                                    name: lib.name.clone(),
                                });
                            }
                            classpath_entries.push(lib_path);
                        }

                        if let Some(ref classifiers) = downloads.classifiers {
                            let target_classifier = if let Some(ref natives_map) = lib.natives {
                                natives_map.get("windows").map(|s| {
                                    s.replace("${arch}", if java_install.is_64_bit { "64" } else { "32" })
                                })
                            } else {
                                None
                            };

                            let native_artifact = target_classifier
                                .as_deref()
                                .and_then(|k| classifiers.get(k))
                                .or_else(|| {
                                    if java_install.is_64_bit {
                                        classifiers
                                            .get("natives-windows-64")
                                            .or_else(|| classifiers.get("natives-windows"))
                                            .or_else(|| classifiers.get("natives-windows-x86_64"))
                                    } else {
                                        classifiers
                                            .get("natives-windows-32")
                                            .or_else(|| classifiers.get("natives-windows"))
                                    }
                                });

                            if let Some(artifact) = native_artifact {
                                let native_path = libraries_dir.join(&artifact.path);
                                if !native_path.exists() {
                                    let dl_urls = ManifestService::resolve_library_download_urls(
                                        &lib.name,
                                        &artifact.path,
                                        Some(&artifact.url),
                                    );
                                    download_tasks.push(LibDownloadTask {
                                        urls: dl_urls,
                                        path: native_path.clone(),
                                        sha1: Some(artifact.sha1.clone()),
                                        name: format!("{} (natives)", lib.name),
                                    });
                                }
                                native_jar_paths.push(native_path);
                            }
                        }
                    } else if let Some(rel_path) = ManifestService::maven_to_path(&lib.name) {
                        let lib_path = libraries_dir.join(&rel_path);
                        if !lib_path.exists() {
                            let dl_urls = ManifestService::resolve_library_download_urls(
                                &lib.name,
                                &rel_path,
                                lib.url.as_deref(),
                            );
                            download_tasks.push(LibDownloadTask {
                                urls: dl_urls,
                                path: lib_path.clone(),
                                sha1: None,
                                name: lib.name.clone(),
                            });
                        }
                        classpath_entries.push(lib_path);
                    }
                }

                custom_minecraft_args = forge_profile.minecraft_arguments;
                if let Some(ref args) = forge_profile.arguments {
                    custom_game_args = Some(args.game.clone());
                }

                forge_profile.main_class
            }
            _ => pkg.main_class.clone(),
        };

        // Add client jar to classpath
        classpath_entries.push(client_jar_path);

        // Execute concurrent downloads with Semaphore and multi-mirror retries
        let total_items = download_tasks.len();
        if total_items > 0 {
            let semaphore = Arc::new(Semaphore::new(16));
            let completed = Arc::new(AtomicUsize::new(0));

            let mut join_handles = Vec::new();
            for task in download_tasks {
                let sem = semaphore.clone();
                let dl = self.downloader.clone();
                let comp = completed.clone();
                let app_handle = app.clone();
                let inst_id = instance_id.to_string();

                let handle = tokio::spawn(async move {
                    let _permit = sem.acquire().await.unwrap();
                    let checksum = match task.sha1 {
                        Some(ref s) => ChecksumType::Sha1(s.clone()),
                        None => ChecksumType::None,
                    };

                    let mut success = false;
                    for u in &task.urls {
                        if dl.download_file(u, &task.path, checksum.clone(), None, None).await.is_ok() {
                            success = true;
                            break;
                        }
                    }
                    if !success && !task.urls.is_empty() {
                        tracing::warn!("Не удалось скачать библиотеку: {}", task.name);
                    }

                    let c = comp.fetch_add(1, Ordering::SeqCst) + 1;
                    let pct = 5.0 + (c as f32 / total_items as f32) * 50.0;

                    let _ = app_handle.emit(
                        "download-progress-granular",
                        DownloadProgressPayload {
                            instance_id: inst_id,
                            stage: "Скачивание библиотек".to_string(),
                            current_file: task.name,
                            completed_items: c,
                            total_items,
                            downloaded_bytes: 0,
                            total_bytes: 0,
                            percentage: pct,
                        },
                    );
                });
                join_handles.push(handle);
            }

            for h in join_handles {
                let _ = h.await;
            }
        }

        // If Fabric or Quilt and mods are present, ensure Fabric API is installed
        if instance.loader_type == LoaderType::Fabric || instance.loader_type == LoaderType::Quilt {
            let mods_dir = instance_dir.join("mods");
            if mods_dir.exists() {
                let has_mods = std::fs::read_dir(&mods_dir)
                    .map(|entries| {
                        entries.filter_map(|e| e.ok()).any(|e| {
                            let p = e.path();
                            p.is_file() && p.extension().map(|ext| ext == "jar").unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);

                if has_mods {
                    let has_fabric_api = std::fs::read_dir(&mods_dir)
                        .map(|entries| {
                            entries.filter_map(|e| e.ok()).any(|e| {
                                let n = e.file_name().to_string_lossy().to_lowercase();
                                n.contains("fabric-api") || n.contains("fabric_api")
                            })
                        })
                        .unwrap_or(false);

                    if !has_fabric_api {
                        self.emit_status(
                            &app,
                            instance_id,
                            "downloading",
                            "Автоустановка Fabric API для установленных модов...",
                            Some(54.0),
                        );
                        match self
                            .modrinth_service
                            .install_project_with_dependencies(&mods_dir, "fabric-api", &instance.game_version, "fabric")
                            .await
                        {
                            Ok(res) => {
                                let _ = app.emit(
                                    "game-log",
                                    crate::models::GameLogEntry {
                                        instance_id: instance_id.to_string(),
                                        line: format!(
                                            "[FRZlauncher] Автоматически установлен Fabric API ({}) для поддержки Fabric модов.",
                                            res.filename
                                        ),
                                        level: "INFO".to_string(),
                                        timestamp: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            }
                            Err(e) => {
                                tracing::warn!("Не удалось автоматически загрузить Fabric API: {}", e);
                            }
                        }
                    }
                }
            }
        }

        // If Vanilla loader but mods directory has jar files, notify user that Vanilla cannot load mods
        if instance.loader_type == LoaderType::Vanilla {
            let mods_dir = instance_dir.join("mods");
            if mods_dir.exists() {
                let has_mods = std::fs::read_dir(&mods_dir)
                    .map(|entries| {
                        entries.filter_map(|e| e.ok()).any(|e| {
                            let p = e.path();
                            p.is_file()
                                && p.extension()
                                    .map(|ext| ext.eq_ignore_ascii_case("jar") || ext.eq_ignore_ascii_case("zip"))
                                    .unwrap_or(false)
                        })
                    })
                    .unwrap_or(false);

                if has_mods {
                    let _ = app.emit(
                        "game-log",
                        crate::models::GameLogEntry {
                            instance_id: instance_id.to_string(),
                            line: "[FRZlauncher] ⚠️ Внимание: Сборка запущена с загрузчиком 'Vanilla'. Файлы в папке mods/ НЕ будут загружены игрой! Чтобы играть с модами, переключите загрузчик на Fabric, NeoForge или Forge в настройках сборки.".to_string(),
                            level: "WARN".to_string(),
                            timestamp: chrono::Utc::now().timestamp_millis(),
                        },
                    );
                }
            }
        }

        // Extract native libraries (*-natives-windows*.jar) into natives_dir
        self.emit_status(
            &app,
            instance_id,
            "downloading",
            "Распаковка нативных библиотек...",
            Some(55.0),
        );
        let natives_dir = instance_dir.join("natives");
        let _ = std::fs::create_dir_all(&natives_dir);

        // 1. Extract all discovered Windows native libraries
        for native_path in &native_jar_paths {
            let _ = extract_natives_from_jar(native_path, &natives_dir);
        }

        // 2. Also check classpath entries for any remaining native packages
        for lib_path in &classpath_entries {
            let file_name = lib_path.file_name().and_then(|f| f.to_str()).unwrap_or("");
            if (file_name.contains("natives") || file_name.contains("windows")) && file_name.ends_with(".jar") {
                let _ = extract_natives_from_jar(lib_path, &natives_dir);
            }
        }

        // Format Classpath: Windows uses ';'
        let classpath_str = classpath_entries
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect::<Vec<String>>()
            .join(";");

        // 7. Download Assets Index & Objects
        self.emit_status(
            &app,
            instance_id,
            "downloading",
            "Проверка ассетов игры...",
            Some(55.0),
        );
        let assets_dir = self.instance_manager.cache_dir().join("assets");
        let index_file = assets_dir
            .join("indexes")
            .join(format!("{}.json", pkg.assets));

        if !index_file.exists() {
            let _ = self
                .downloader
                .download_file(
                    &pkg.asset_index.url,
                    &index_file,
                    ChecksumType::Sha1(pkg.asset_index.sha1.clone()),
                    Some(instance_id),
                    Some(&app),
                )
                .await;
        }

        // Fast-path: Skip scanning thousands of asset files if already verified on disk
        let verified_marker = assets_dir.join(format!("{}.verified", pkg.assets));
        let objects_dir = assets_dir.join("objects");
        let skip_asset_scan = verified_marker.exists() && objects_dir.exists();

        if !skip_asset_scan {
            if let Ok(content) = std::fs::read_to_string(&index_file) {
                if let Ok(asset_index) = serde_json::from_str::<AssetIndexData>(&content) {
                    let mut asset_tasks = Vec::new();

                    for (_name, obj) in asset_index.objects {
                        if obj.hash.len() >= 2 {
                            let prefix = &obj.hash[..2];
                            let obj_path = objects_dir.join(prefix).join(&obj.hash);
                            let needs_download = !obj_path.exists()
                                || obj_path.metadata().map(|m| m.len() == 0).unwrap_or(true);
                            if needs_download {
                                let url = format!("https://resources.download.minecraft.net/{}/{}", prefix, obj.hash);
                                asset_tasks.push((url, obj_path, obj.hash));
                            }
                        }
                    }

                    let total_assets = asset_tasks.len();
                    if total_assets > 0 {
                        let sem = Arc::new(Semaphore::new(24));
                        let completed = Arc::new(AtomicUsize::new(0));
                        let mut handles = Vec::new();

                        for (url, path, hash) in asset_tasks {
                            let permit_sem = sem.clone();
                            let dl = self.downloader.clone();
                            let comp = completed.clone();
                            let app_handle = app.clone();
                            let inst_id = instance_id.to_string();

                            let h = tokio::spawn(async move {
                                let _permit = permit_sem.acquire().await.unwrap();
                                let _ = dl.download_file(&url, &path, ChecksumType::Sha1(hash), None, None).await;

                                let c = comp.fetch_add(1, Ordering::SeqCst) + 1;
                                if c % 25 == 0 || c == total_assets {
                                    let pct = 55.0 + (c as f32 / total_assets as f32) * 35.0;
                                    let _ = app_handle.emit(
                                        "download-progress-granular",
                                        DownloadProgressPayload {
                                            instance_id: inst_id,
                                            stage: "Загрузка ассетов игры".to_string(),
                                            current_file: format!("Ассеты: {} / {}", c, total_assets),
                                            completed_items: c,
                                            total_items: total_assets,
                                            downloaded_bytes: 0,
                                            total_bytes: 0,
                                            percentage: pct,
                                        },
                                    );
                                }
                            });
                            handles.push(h);
                        }

                        for h in handles {
                            let _ = h.await;
                        }
                    }

                    // Save verified marker so subsequent launches start instantly
                    let _ = std::fs::write(&verified_marker, "verified");
                }
            }
        }

        // 8. Build JVM Arguments
        self.emit_status(
            &app,
            instance_id,
            "launching",
            "Подготовка команды запуска...",
            Some(92.0),
        );
        let mut jvm_args = self.jvm_optimizer.build_jvm_args_for_java(
            &instance.memory,
            &instance.gc_preset,
            &instance.custom_jvm_args,
            java_install.is_64_bit,
        )?;

        if !java_install.is_64_bit {
            use tauri::Emitter;
            let _ = app.emit(
                "game-log",
                crate::models::GameLogEntry {
                    instance_id: instance_id.to_string(),
                    line: "⚠️ Внимание: Используется 32-битная Java. Выделение памяти автоматически ограничено до 1024 МБ во избежание сбоя JVM (The specified size exceeds the maximum representable size). Рекомендуется установить 64-битную версию Java.".to_string(),
                    level: "WARN".to_string(),
                    timestamp: chrono::Utc::now().timestamp_millis(),
                },
            );
        }

        // Standard Minecraft system properties (using universal standard brand to avoid incompatible launcher mod warnings)
        jvm_args.push(format!("-Djava.library.path={}", natives_dir.display()));
        jvm_args.push("-Dminecraft.launcher.brand=minecraft-launcher".to_string());
        jvm_args.push("-Dminecraft.launcher.version=2.1.0".to_string());

        // Networking and system optimizations
        jvm_args.push("-Djava.net.preferIPv4Stack=true".to_string());
        jvm_args.push("-Dio.netty.allocator.type=pooled".to_string());
        jvm_args.push("-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=false".to_string());

        // Add modular opens for modern JVMs (Java 17, 21, 25)
        if java_install.major_version >= 17 {
            jvm_args.push("--add-opens=java.base/java.lang=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.base/java.lang.invoke=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.base/java.lang.reflect=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.base/java.util=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.base/java.util.concurrent=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.base/java.io=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.base/java.text=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.desktop/sun.awt=ALL-UNNAMED".to_string());
            jvm_args.push("--add-opens=java.desktop/sun.java2d=ALL-UNNAMED".to_string());
        }

        // Native access and internal exports for modern JVMs (Java 22, 23, 24, 25+)
        if java_install.major_version >= 22 {
            jvm_args.push("--enable-native-access=ALL-UNNAMED".to_string());
            jvm_args.push("--add-exports=java.base/jdk.internal.misc=ALL-UNNAMED".to_string());
        }

        // Ely.by authlib-injector injection if active account is Ely.by
        if active_account.provider == AuthProvider::ElyBy {
            self.emit_status(
                &app,
                instance_id,
                "verifying",
                "Подключение скинов Ely.by (authlib-injector)...",
                Some(98.0),
            );
            if let Ok(injector_path) = self.elyby_service.ensure_authlib_injector(&libraries_dir).await {
                jvm_args.push(format!("-javaagent:{}=https://authserver.ely.by/api/authlib-injector", injector_path.display()));
            }
        }

        jvm_args.push("-cp".to_string());
        jvm_args.push(classpath_str);

        // 9. Build Game Arguments
        let auth_token = self
            .keyring_service
            .get_token(&active_account.id)
            .unwrap_or_else(|_| "0".to_string());

        let mut game_args = Vec::new();

        // 1. Base vanilla game arguments
        if let Some(ref args_obj) = pkg.arguments {
            for arg_val in &args_obj.game {
                if let Some(s) = arg_val.as_str() {
                    let resolved = resolve_placeholders(
                        s,
                        &active_account.username,
                        &active_account.uuid,
                        &auth_token,
                        &instance.game_version,
                        &instance_dir,
                        &assets_dir,
                        &pkg.assets,
                    );
                    game_args.push(resolved);
                }
            }
        } else if let Some(ref mc_args) = pkg.minecraft_arguments {
            for s in mc_args.split_whitespace() {
                let resolved = resolve_placeholders(
                    s,
                    &active_account.username,
                    &active_account.uuid,
                    &auth_token,
                    &instance.game_version,
                    &instance_dir,
                    &assets_dir,
                    &pkg.assets,
                );
                game_args.push(resolved);
            }
        }

        // 2. Custom loader / Forge game arguments (append without dropping base args)
        if let Some(ref custom_g_args) = custom_game_args {
            for arg_val in custom_g_args {
                if let Some(s) = arg_val.as_str() {
                    let resolved = resolve_placeholders(
                        s,
                        &active_account.username,
                        &active_account.uuid,
                        &auth_token,
                        &instance.game_version,
                        &instance_dir,
                        &assets_dir,
                        &pkg.assets,
                    );
                    if !game_args.contains(&resolved) {
                        game_args.push(resolved);
                    }
                }
            }
        }

        if let Some(ref custom_mc_args) = custom_minecraft_args {
            for s in custom_mc_args.split_whitespace() {
                let resolved = resolve_placeholders(
                    s,
                    &active_account.username,
                    &active_account.uuid,
                    &auth_token,
                    &instance.game_version,
                    &instance_dir,
                    &assets_dir,
                    &pkg.assets,
                );
                if !game_args.contains(&resolved) {
                    game_args.push(resolved);
                }
            }
        }

        // 3. Absolute guarantee: --gameDir must point to instance_dir!
        // Without --gameDir, Minecraft and modloaders default to %APPDATA%\.minecraft,
        // causing all mods in the instance mods/ directory to NOT be loaded by the game!
        if !game_args.iter().any(|a| a == "--gameDir") {
            game_args.push("--gameDir".to_string());
            game_args.push(instance_dir.to_string_lossy().to_string());
        }

        // 4. Guarantee: --assetsDir
        if !game_args.iter().any(|a| a == "--assetsDir") && !assets_dir.as_os_str().is_empty() {
            game_args.push("--assetsDir".to_string());
            game_args.push(assets_dir.to_string_lossy().to_string());
        }

        // 5. Guarantee: --version
        if !game_args.iter().any(|a| a == "--version") {
            game_args.push("--version".to_string());
            game_args.push(instance.game_version.clone());
        }

        // Combine arguments: JVM args + main_class + game args
        let mut final_args = jvm_args;
        final_args.push(main_class);
        final_args.extend(game_args);

        // Auto-tune options.txt for maximum FPS (disables vsync lock, sets uncapped FPS, optimal render distance)
        auto_tune_options_for_max_fps(&instance_dir);

        // 10. Spawn Java Process
        self.emit_status(
            &app,
            instance_id,
            "starting",
            "Запуск JVM и загрузка Minecraft...",
            Some(100.0),
        );

        let app_clone = app.clone();
        let inst_id_string = instance_id.to_string();
        let mut java_bin = java_install.path;
        #[cfg(target_os = "windows")]
        {
            // On Windows, use javaw.exe instead of java.exe to avoid opening a console window (cmd window)
            let java_path = std::path::Path::new(&java_bin);
            if let Some(parent) = java_path.parent() {
                let javaw_candidate = parent.join("javaw.exe");
                if javaw_candidate.exists() {
                    java_bin = javaw_candidate.to_string_lossy().to_string();
                } else if java_bin.ends_with("java.exe") {
                    java_bin = java_bin.replace("java.exe", "javaw.exe");
                }
            }
        }
        let running_map = self.running_processes.clone();
        let game_proc_state = self.game_process_state.clone();
        let discord_serv = self.discord_service.clone();
        let crash_repair = self.crash_repair_service.clone();
        let inst_name = instance.name.clone();
        let inst_ver = instance.game_version.clone();
        let inst_loader = instance.loader_type.clone();
        let instance_dir_clone = instance_dir.clone();

        tokio::spawn(async move {
            #[cfg(target_os = "windows")]
            {
                // Force Dedicated High Performance GPU via Windows DirectX Registry for both java.exe and javaw.exe
                let java_norm = java_bin.replace('/', "\\");
                let javaw_norm = if java_norm.ends_with("java.exe") {
                    java_norm.replace("java.exe", "javaw.exe")
                } else if java_norm.ends_with("javaw.exe") {
                    java_norm.clone()
                } else {
                    format!("{}\\javaw.exe", java_norm.trim_end_matches(".exe"))
                };

                for exe in &[&java_norm, &javaw_norm] {
                    run_hidden_windows_cmd(
                        "reg",
                        &[
                            "add",
                            "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences",
                            "/v",
                            exe,
                            "/t",
                            "REG_SZ",
                            "/d",
                            "GpuPreference=2;",
                            "/f",
                        ],
                    );
                }
            }

            let mut cmd = Command::new(&java_bin);
            cmd.args(&final_args);
            cmd.current_dir(&instance_dir);
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());

            // Performance environment variables
            cmd.env("__NV_PRIME_RENDER_OFFLOAD", "1");
            cmd.env("__GLX_VENDOR_LIBRARY_NAME", "nvidia");
            cmd.env("DRI_PRIME", "1");
            cmd.env("SHIM_MCCOMPAT", "0x80000000");
            cmd.env("__GL_THREADED_OPTIMIZATIONS", "1");
            cmd.env("__GL_YIELD", "NOTHING");
            cmd.env("CUDA_DEVICE_ORDER", "PCI_BUS_ID");

            #[cfg(target_os = "windows")]
            {
                // CREATE_NO_WINDOW (0x08000000) | HIGH_PRIORITY_CLASS (0x00000080) for Minecraft process
                cmd.creation_flags(0x08000000 | 0x00000080);
            }

            match cmd.spawn() {
                Ok(mut child) => {
                    let pid = child.id().unwrap_or(0);
                    running_map.lock().await.insert(inst_id_string.clone(), pid);

                    let stdout = child.stdout.take();
                    let stderr = child.stderr.take();

                    let _ = app_clone.emit(
                        "game-launched",
                        serde_json::json!({
                            "instance_id": &inst_id_string,
                            "pid": pid,
                        }),
                    );
                    let _ = app_clone.emit(
                        "launch-status",
                        LaunchStatus {
                            instance_id: inst_id_string.clone(),
                            state: "starting".to_string(),
                            message: "Инициализация Minecraft и загрузка модов...".to_string(),
                            progress: None,
                        },
                    );

                    let window_ready = Arc::new(std::sync::atomic::AtomicBool::new(false));
                    let recent_logs = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));

                    let app_out = app_clone.clone();
                    let id_out = inst_id_string.clone();
                    let window_ready_out = window_ready.clone();
                    let discord_out = discord_serv.clone();
                    let inst_name_out = inst_name.clone();
                    let inst_ver_out = inst_ver.clone();
                    let recent_logs_out = recent_logs.clone();

                    let stdout_handle = tokio::spawn(async move {
                        if let Some(stream) = stdout {
                            let mut reader = BufReader::new(stream).lines();
                            while let Ok(Some(line)) = reader.next_line().await {
                                let level = parse_log_level(&line);
                                let now = chrono::Utc::now().timestamp_millis();

                                {
                                    if let Ok(mut logs) = recent_logs_out.lock() {
                                        if logs.len() > 600 {
                                            logs.remove(0);
                                        }
                                        logs.push(line.clone());
                                    }
                                }

                                if !window_ready_out.load(std::sync::atomic::Ordering::SeqCst)
                                    && is_window_ready_signal(&line)
                                {
                                    if window_ready_out
                                        .compare_exchange(
                                            false,
                                            true,
                                            std::sync::atomic::Ordering::SeqCst,
                                            std::sync::atomic::Ordering::SeqCst,
                                        )
                                        .is_ok()
                                    {
                                        let _ = app_out.emit(
                                            "game-window-ready",
                                            serde_json::json!({
                                                "instance_id": &id_out,
                                                "pid": pid,
                                            }),
                                        );
                                        let _ = app_out.emit(
                                            "game-status-changed",
                                            serde_json::json!({
                                                "running": true,
                                                "instance_id": &id_out,
                                                "pid": pid,
                                            }),
                                        );
                                        let _ = app_out.emit(
                                            "launch-status",
                                            LaunchStatus {
                                                instance_id: id_out.clone(),
                                                state: "running".to_string(),
                                                message: "В игре".to_string(),
                                                progress: None,
                                            },
                                        );
                                        let disc = discord_out.clone();
                                        let iname = inst_name_out.clone();
                                        let iver = inst_ver_out.clone();
                                        tokio::spawn(async move {
                                            let _ = disc.set_in_game(&iname, &iver).await;
                                        });
                                    }
                                }

                                let _ = app_out.emit(
                                    "game-log",
                                    GameLogEntry {
                                        instance_id: id_out.clone(),
                                        line,
                                        level,
                                        timestamp: now,
                                    },
                                );
                            }
                        }
                    });

                    let app_err = app_clone.clone();
                    let id_err = inst_id_string.clone();
                    let recent_logs_err = recent_logs.clone();
                    let stderr_handle = tokio::spawn(async move {
                        if let Some(stream) = stderr {
                            let mut reader = BufReader::new(stream).lines();
                            while let Ok(Some(line)) = reader.next_line().await {
                                let level = parse_log_level(&line);
                                let now = chrono::Utc::now().timestamp_millis();

                                {
                                    if let Ok(mut logs) = recent_logs_err.lock() {
                                        if logs.len() > 600 {
                                            logs.remove(0);
                                        }
                                        logs.push(line.clone());
                                    }
                                }

                                let _ = app_err.emit(
                                    "game-log",
                                    GameLogEntry {
                                        instance_id: id_err.clone(),
                                        line,
                                        level: if level == "INFO" { "ERROR".to_string() } else { level },
                                        timestamp: now,
                                    },
                                );
                            }
                        }
                    });

                    *game_proc_state.0.lock().await = Some(child);

                    // Active Window Visibility Watcher:
                    // Continuously poll Windows OS window manager for the actual Minecraft HWND window.
                    // Flips to "В игре" ONLY when the game window is genuinely visible on the screen.
                    let window_ready_watcher = window_ready.clone();
                    let app_watcher = app_clone.clone();
                    let discord_watcher = discord_serv.clone();
                    let id_watcher = inst_id_string.clone();
                    let name_watcher = inst_name.clone();
                    let ver_watcher = inst_ver.clone();
                    let active_proc_for_watcher = game_proc_state.clone();

                    tokio::spawn(async move {
                        let start_instant = std::time::Instant::now();
                        loop {
                            tokio::time::sleep(tokio::time::Duration::from_millis(400)).await;

                            if window_ready_watcher.load(std::sync::atomic::Ordering::SeqCst) {
                                break;
                            }

                            let is_still_alive = {
                                let mut lock = active_proc_for_watcher.0.lock().await;
                                if let Some(child_ref) = lock.as_mut() {
                                    child_ref.try_wait().ok().flatten().is_none()
                                } else {
                                    false
                                }
                            };

                            if !is_still_alive {
                                break;
                            }

                            let elapsed = start_instant.elapsed();

                            #[cfg(target_os = "windows")]
                            let is_visible = win_window::is_process_window_visible(pid);
                            #[cfg(not(target_os = "windows"))]
                            let is_visible = false;

                            let should_mark_ready = is_visible || elapsed >= std::time::Duration::from_secs(35);

                            if should_mark_ready
                                && window_ready_watcher
                                    .compare_exchange(
                                        false,
                                        true,
                                        std::sync::atomic::Ordering::SeqCst,
                                        std::sync::atomic::Ordering::SeqCst,
                                    )
                                    .is_ok()
                            {
                                let _ = app_watcher.emit(
                                    "game-window-ready",
                                    serde_json::json!({
                                        "instance_id": &id_watcher,
                                        "pid": pid,
                                    }),
                                );
                                let _ = app_watcher.emit(
                                    "game-status-changed",
                                    serde_json::json!({
                                        "running": true,
                                        "instance_id": &id_watcher,
                                        "pid": pid,
                                    }),
                                );
                                let _ = app_watcher.emit(
                                    "launch-status",
                                    LaunchStatus {
                                        instance_id: id_watcher.clone(),
                                        state: "running".to_string(),
                                        message: "В игре".to_string(),
                                        progress: None,
                                    },
                                );
                                let _ = discord_watcher.set_in_game(&name_watcher, &ver_watcher).await;
                                break;
                            }
                        }
                    });

                    let active_proc_ref = game_proc_state.clone();
                    let app_exit = app_clone.clone();
                    let inst_exit = inst_id_string.clone();
                    let recent_logs_exit = recent_logs.clone();
                    let crash_repair_exit = crash_repair.clone();
                    let inst_ver_exit = inst_ver.clone();
                    let inst_loader_exit = inst_loader.clone();
                    let instance_dir_exit = instance_dir_clone.clone();

                    tokio::spawn(async move {
                        let mut exit_code: Option<i32> = None;
                        loop {
                            tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
                            let mut lock = active_proc_ref.0.lock().await;
                            match lock.as_mut() {
                                Some(child_ref) => {
                                    match child_ref.try_wait() {
                                        Ok(Some(status)) => {
                                            exit_code = status.code();
                                            *lock = None;
                                            break;
                                        }
                                        Ok(None) => {}
                                        Err(_) => {
                                            *lock = None;
                                            break;
                                        }
                                    }
                                }
                                None => {
                                    break;
                                }
                            }
                        }

                        // Flush remaining logs with a bounded 600ms timeout so we never hang if pipe handles stay open
                        let _ = tokio::time::timeout(tokio::time::Duration::from_millis(600), async {
                            let _ = stdout_handle.await;
                            let _ = stderr_handle.await;
                        }).await;

                        if let Some(pid) = running_map.lock().await.remove(&inst_exit) {
                            #[cfg(target_os = "windows")]
                            if exit_code.unwrap_or(0) != 0 && pid > 0 {
                                run_hidden_windows_cmd("taskkill", &["/F", "/PID", &pid.to_string(), "/T"]);
                            }
                        }

                        let _ = discord_serv.set_idle().await;

                        let _ = app_exit.emit(
                            "game-status-changed",
                            serde_json::json!({
                                "running": false,
                                "exit_code": exit_code,
                                "instance_id": &inst_exit,
                            }),
                        );
                        let _ = app_exit.emit(
                            "game-exited",
                            serde_json::json!({
                                "instance_id": &inst_exit,
                                "exit_code": exit_code.unwrap_or(0),
                            }),
                        );

                        if exit_code.unwrap_or(0) == 0 {
                            let _ = app_exit.emit(
                                "launch-status",
                                LaunchStatus {
                                    instance_id: inst_exit.clone(),
                                    state: "ready".to_string(),
                                    message: "Игра завершилась штатно.".to_string(),
                                    progress: None,
                                },
                            );
                        } else {
                            let logs_snapshot = recent_logs_exit.lock().map(|l| l.clone()).unwrap_or_default();
                            let diagnosis = crash_repair_exit.analyze_crash(
                                &inst_exit,
                                &instance_dir_exit,
                                exit_code,
                                &logs_snapshot,
                                &inst_ver_exit,
                                &inst_loader_exit,
                            );

                            let _ = app_exit.emit(
                                "game-crash-diagnosed",
                                serde_json::json!({
                                    "instance_id": &inst_exit,
                                    "diagnosis": &diagnosis,
                                }),
                            );

                            let _ = app_exit.emit(
                                "launch-status",
                                LaunchStatus {
                                    instance_id: inst_exit.clone(),
                                    state: "crashed".to_string(),
                                    message: format!("Сбой игры: {}", diagnosis.title),
                                    progress: None,
                                },
                            );
                        }
                    });
                }
                Err(e) => {
                    let _ = discord_serv.set_idle().await;
                    let _ = app_clone.emit(
                        "game-status-changed",
                        serde_json::json!({
                            "running": false,
                            "exit_code": -1,
                            "instance_id": &inst_id_string,
                        }),
                    );
                    let _ = app_clone.emit(
                        "launch-status",
                        LaunchStatus {
                            instance_id: inst_id_string.clone(),
                            state: "crashed".to_string(),
                            message: format!("Не удалось запустить процесс Java: {}", e),
                            progress: None,
                        },
                    );
                }
            }
        });

        Ok(())
    }

    fn emit_status(
        &self,
        app: &AppHandle,
        instance_id: &str,
        state: &str,
        message: &str,
        progress: Option<f32>,
    ) {
        let _ = app.emit(
            "launch-status",
            LaunchStatus {
                instance_id: instance_id.to_string(),
                state: state.to_string(),
                message: message.to_string(),
                progress,
            },
        );
    }
}

#[derive(serde::Deserialize)]
struct AssetIndexData {
    objects: std::collections::HashMap<String, AssetIndexItem>,
}

#[derive(serde::Deserialize)]
struct AssetIndexItem {
    hash: String,
}

fn extract_natives_from_jar(jar_path: &Path, target_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(jar_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();
        if name.ends_with(".dll") {
            let file_name = Path::new(&name).file_name().unwrap_or_default();
            let dest_path = target_dir.join(file_name);
            if let Ok(mut dest_file) = std::fs::File::create(&dest_path) {
                let _ = std::io::copy(&mut file, &mut dest_file);
            }
        }
    }
    Ok(())
}

fn resolve_placeholders(
    template: &str,
    username: &str,
    uuid: &str,
    token: &str,
    game_version: &str,
    game_dir: &Path,
    assets_dir: &Path,
    assets_index: &str,
) -> String {
    template
        .replace("${auth_player_name}", username)
        .replace("${auth_uuid}", uuid)
        .replace("${auth_access_token}", token)
        .replace("${auth_session}", token)
        .replace("${user_properties}", "{}")
        .replace("${user_type}", "mojang")
        .replace("${version_name}", game_version)
        .replace("${version_type}", "release")
        .replace("${game_directory}", &game_dir.to_string_lossy())
        .replace("${assets_root}", &assets_dir.to_string_lossy())
        .replace("${game_assets}", &assets_dir.to_string_lossy())
        .replace("${assets_index_name}", assets_index)
        .replace("${resolution_width}", "854")
        .replace("${resolution_height}", "480")
}

fn parse_log_level(line: &str) -> String {
    if line.contains("/ERROR") || line.contains("Exception") || line.contains("Error:") {
        "ERROR".to_string()
    } else if line.contains("/WARN") || line.contains("Warning") {
        "WARN".to_string()
    } else if line.contains("/DEBUG") {
        "DEBUG".to_string()
    } else {
        "INFO".to_string()
    }
}

#[cfg(target_os = "windows")]
pub mod win_window {
    type HWND = *mut std::ffi::c_void;
    type BOOL = i32;
    type LPARAM = isize;
    type DWORD = u32;

    #[link(name = "user32")]
    extern "system" {
        fn EnumWindows(lpEnumFunc: extern "system" fn(HWND, LPARAM) -> BOOL, lParam: LPARAM) -> BOOL;
        fn GetWindowThreadProcessId(hWnd: HWND, lpdwProcessId: *mut DWORD) -> DWORD;
        fn IsWindowVisible(hWnd: HWND) -> BOOL;
        fn GetWindowTextLengthW(hWnd: HWND) -> i32;
    }

    struct WindowFinder {
        target_pid: u32,
        found_visible: bool,
    }

    extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let finder = &mut *(lparam as *mut WindowFinder);
            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == finder.target_pid && IsWindowVisible(hwnd) != 0 {
                let title_len = GetWindowTextLengthW(hwnd);
                if title_len > 0 {
                    finder.found_visible = true;
                    return 0;
                }
            }
            1
        }
    }

    pub fn is_process_window_visible(pid: u32) -> bool {
        if pid == 0 {
            return false;
        }
        let mut finder = WindowFinder {
            target_pid: pid,
            found_visible: false,
        };
        unsafe {
            EnumWindows(enum_proc, &mut finder as *mut WindowFinder as LPARAM);
        }
        finder.found_visible
    }
}

pub fn is_window_ready_signal(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    l.contains("openal initialized")
        || l.contains("sound engine started")
        || l.contains("sound engine loaded")
        || (l.contains("created:") && (l.contains("texture") || l.contains("atlas")))
        || l.contains("entering title screen")
        || (l.contains("render thread") && (l.contains("window ready") || l.contains("surface") || l.contains("loaded")))
}

/// Optimize Minecraft options.txt for maximum FPS (500+ FPS)
/// - Disables VSync (which locks FPS to monitor 60/144Hz)
/// - Sets maxFps to 260 (Unlimited)
/// - Sets renderDistance to 14 (prevents vanilla 32-chunk single-thread lag)
/// - Sets simulationDistance to 10
pub fn auto_tune_options_for_max_fps(instance_dir: &Path) {
    fn tune_file(options_path: &Path) {
        if options_path.exists() {
            if let Ok(content) = fs::read_to_string(options_path) {
                let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                let mut vsync_found = false;
                let mut max_fps_found = false;
                let mut render_dist_found = false;
                let mut sim_dist_found = false;

                for line in lines.iter_mut() {
                    if line.starts_with("enableVsync:") {
                        *line = "enableVsync:false".to_string();
                        vsync_found = true;
                    } else if line.starts_with("maxFps:") {
                        *line = "maxFps:260".to_string();
                        max_fps_found = true;
                    } else if line.starts_with("renderDistance:") {
                        let parts: Vec<&str> = line.split(':').collect();
                        if let Some(val_str) = parts.get(1) {
                            if let Ok(val) = val_str.trim().parse::<u32>() {
                                if val > 16 {
                                    *line = "renderDistance:14".to_string();
                                }
                            }
                        }
                        render_dist_found = true;
                    } else if line.starts_with("simulationDistance:") {
                        let parts: Vec<&str> = line.split(':').collect();
                        if let Some(val_str) = parts.get(1) {
                            if let Ok(val) = val_str.trim().parse::<u32>() {
                                if val > 12 {
                                    *line = "simulationDistance:10".to_string();
                                }
                            }
                        }
                        sim_dist_found = true;
                    } else if line.starts_with("entityShadows:") {
                        *line = "entityShadows:false".to_string();
                    }
                }

                if !vsync_found {
                    lines.push("enableVsync:false".to_string());
                }
                if !max_fps_found {
                    lines.push("maxFps:260".to_string());
                }
                if !render_dist_found {
                    lines.push("renderDistance:14".to_string());
                }
                if !sim_dist_found {
                    lines.push("simulationDistance:10".to_string());
                }

                let _ = fs::write(options_path, lines.join("\n"));
            }
        } else {
            let default_options = "\
version:3955
enableVsync:false
maxFps:260
renderDistance:14
simulationDistance:10
gamma:1.0
graphicsMode:0
ao:true
particles:2
entityShadows:false
biomeBlendRadius:1
fullscreen:false
";
            let _ = fs::write(options_path, default_options);
        }
    }

    tune_file(&instance_dir.join("options.txt"));
    let dot_mc = instance_dir.join(".minecraft");
    if dot_mc.exists() {
        tune_file(&dot_mc.join("options.txt"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_placeholders() {
        let template = "--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory}";
        let res = resolve_placeholders(
            template,
            "Steve",
            "1234-uuid",
            "token",
            "1.21.1",
            Path::new(r"C:\mc\instances\test"),
            Path::new(r"C:\mc\cache\assets"),
            "17",
        );
        assert!(res.contains("Steve"));
        assert!(res.contains("1.21.1"));
        assert!(res.contains(r"C:\mc\instances\test"));
    }

    #[test]
    fn test_parse_log_level() {
        assert_eq!(parse_log_level("[12:00:00] [main/INFO]: Loading"), "INFO");
        assert_eq!(parse_log_level("[12:00:00] [main/WARN]: Deprecated"), "WARN");
        assert_eq!(parse_log_level("[12:00:00] [main/ERROR]: Crash!"), "ERROR");
        assert_eq!(parse_log_level("java.lang.ClassNotFoundException"), "ERROR");
    }

    #[test]
    fn test_auto_tune_options_for_max_fps() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);
        let options_file = temp_dir.join("options.txt");
        let initial_options = "enableVsync:true\nmaxFps:60\nrenderDistance:32\nsimulationDistance:32\n";
        fs::write(&options_file, initial_options).unwrap();

        auto_tune_options_for_max_fps(&temp_dir);

        let content = fs::read_to_string(&options_file).unwrap();
        assert!(content.contains("enableVsync:false"), "VSync must be disabled for high FPS");
        assert!(content.contains("maxFps:260"), "FPS must be uncapped");
        assert!(content.contains("renderDistance:14"), "Render distance 32 must be capped to 14");
        assert!(content.contains("simulationDistance:10"), "Simulation distance 32 must be capped to 10");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_is_window_ready_signal() {
        assert!(is_window_ready_signal("[12:00:00] [main/INFO]: OpenAL initialized."));
        assert!(is_window_ready_signal("[12:00:00] [Render thread/INFO]: Created: 1024x1024x4 minecraft:textures/atlas/blocks.png-atlas"));
        assert!(is_window_ready_signal("[12:00:00] [Render thread/INFO]: Sound engine started"));
        assert!(!is_window_ready_signal("[12:00:00] [Render thread/INFO]: Backend library: LWJGL version 3.3.3-SNAPSHOT"));
        assert!(!is_window_ready_signal("[12:00:00] [Client thread/INFO]: Setting user: Steve"));
        assert!(!is_window_ready_signal("[12:00:00] [main/INFO]: Loading Minecraft 1.20.1 with Fabric Loader 0.16.0"));
        assert!(!is_window_ready_signal("[12:00:00] [main/INFO]: SpongePowered MIXIN Subsystem Version=0.8.5"));
    }
}

