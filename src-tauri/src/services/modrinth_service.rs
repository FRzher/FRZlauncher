use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

use crate::models::{
    CreateInstanceRequest, InstanceConfig, InstallModResult, LoaderType, ModInfo,
    ModpackVersionOption, ModrinthHit, ModrinthSearchResult,
};
use crate::services::{ChecksumType, Downloader, InstanceManager};

const MODRINTH_API_URL: &str = "https://api.modrinth.com/v2";

#[derive(Deserialize, Debug)]
pub struct MrpackIndex {
    pub name: String,
    #[serde(default)]
    pub dependencies: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub files: Vec<MrpackFile>,
}

#[derive(Deserialize, Debug)]
pub struct MrpackFile {
    pub path: String,
    #[serde(default)]
    pub hashes: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub downloads: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModpackInstallProgress {
    pub modpack_name: String,
    pub stage: String,
    pub current_file: String,
    pub completed: usize,
    pub total: usize,
    pub percentage: f32,
}

#[derive(Deserialize)]
struct ModrinthSearchResponse {
    hits: Vec<ModrinthSearchHit>,
    offset: Option<usize>,
    limit: Option<usize>,
    total_hits: Option<usize>,
}

#[derive(Deserialize)]
struct ModrinthSearchHit {
    project_id: String,
    slug: String,
    title: String,
    description: String,
    icon_url: Option<String>,
    downloads: u64,
    author: String,
    categories: Option<Vec<String>>,
    #[serde(default)]
    client_side: Option<String>,
    #[serde(default)]
    server_side: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ModrinthDependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub dependency_type: String, // "required", "optional", "incompatible"
}

#[derive(Deserialize, Clone, Debug)]
pub struct ModrinthVersionResponse {
    pub id: String,
    pub project_id: Option<String>,
    pub name: Option<String>,
    pub files: Vec<ModrinthFile>,
    #[serde(default)]
    pub dependencies: Vec<ModrinthDependency>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: Option<ModrinthHashes>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ModrinthHashes {
    pub sha1: Option<String>,
}

#[derive(Clone)]
pub struct ModrinthService {
    client: Arc<RwLock<Client>>,
    downloader: Arc<Downloader>,
    network_settings: Arc<RwLock<crate::models::NetworkSettings>>,
}

impl ModrinthService {
    pub fn new(downloader: Arc<Downloader>) -> Self {
        Self::with_settings(downloader, &crate::models::NetworkSettings::default())
    }

    pub fn with_settings(downloader: Arc<Downloader>, settings: &crate::models::NetworkSettings) -> Self {
        let client = Self::build_client(settings);
        Self {
            client: Arc::new(RwLock::new(client)),
            downloader,
            network_settings: Arc::new(RwLock::new(settings.clone())),
        }
    }

    pub fn build_client(settings: &crate::models::NetworkSettings) -> Client {
        let mut builder = Client::builder()
            .timeout(std::time::Duration::from_secs(25))
            .connect_timeout(std::time::Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) FRZlauncher/1.0.0 (contact@frzlauncher.app)");

        if settings.bypass_ssl_verify {
            builder = builder.danger_accept_invalid_certs(true);
        }

        if let Some(proxy_str) = &settings.proxy_url {
            let p = proxy_str.trim();
            if !p.is_empty() {
                let full_proxy = if !p.starts_with("http://") && !p.starts_with("https://") && !p.starts_with("socks5://") {
                    if settings.proxy_type == "socks5" {
                        format!("socks5://{}", p)
                    } else {
                        format!("http://{}", p)
                    }
                } else {
                    p.to_string()
                };

                if let Ok(proxy) = reqwest::Proxy::all(&full_proxy) {
                    builder = builder.proxy(proxy);
                }
            }
        }

        builder.build().unwrap_or_else(|_| Client::new())
    }

    pub async fn update_network_settings(&self, settings: &crate::models::NetworkSettings) {
        let new_client = Self::build_client(settings);
        let mut cl = self.client.write().await;
        *cl = new_client;
        let mut s = self.network_settings.write().await;
        *s = settings.clone();
    }

    pub async fn get_api_base_url(&self) -> String {
        let s = self.network_settings.read().await;
        s.modrinth_api_mirror
            .as_ref()
            .map(|m| m.trim().trim_end_matches('/').to_string())
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| MODRINTH_API_URL.to_string())
    }

    pub async fn get_client(&self) -> Client {
        self.client.read().await.clone()
    }

    /// Search content on Modrinth filtered by type, Minecraft version, modloader, category, environment, and pagination
    pub async fn search_mods(
        &self,
        query: &str,
        game_version: Option<&str>,
        loader: Option<&str>,
        project_type: Option<&str>,
        category: Option<&str>,
        environment: Option<&str>,
        offset: Option<usize>,
        limit: Option<usize>,
    ) -> Result<ModrinthSearchResult, String> {
        let ptype = match project_type.unwrap_or("mod") {
            "datapack" => "datapack",
            "resourcepack" => "resourcepack",
            "shader" => "shader",
            "modpack" => "modpack",
            _ => "mod",
        };

        let mut facets: Vec<String> = vec![format!(r#"["project_type:{}"]"#, ptype)];

        if let Some(gv) = game_version {
            let gv_trim = gv.trim();
            if !gv_trim.is_empty() && gv_trim != "all" {
                facets.push(format!(r#"["versions:{}"]"#, gv_trim));
            }
        }

        if ptype == "mod" || ptype == "modpack" {
            if let Some(ld) = loader {
                let ld_trim = ld.trim();
                if !ld_trim.is_empty() && ld_trim != "vanilla" && ld_trim != "all" {
                    facets.push(format!(r#"["categories:{}"]"#, ld_trim.to_lowercase()));
                }
            }
        }

        if let Some(cat) = category {
            let cat_trim = cat.trim();
            if !cat_trim.is_empty() && cat_trim != "all" {
                facets.push(format!(r#"["categories:{}"]"#, cat_trim.to_lowercase()));
            }
        }

        if let Some(env) = environment {
            let env_trim = env.trim();
            match env_trim {
                "client" => {
                    // Client-supported (either required or optional)
                    facets.push(r#"["client_side:required","client_side:optional"]"#.to_string());
                }
                "client_only" => {
                    // Client-only mods (not needed on server)
                    facets.push(r#"["server_side:unsupported"]"#.to_string());
                }
                "server" => {
                    // Server-supported (required or optional)
                    facets.push(r#"["server_side:required","server_side:optional"]"#.to_string());
                }
                "server_only" => {
                    // Server-only mods (not needed on client)
                    facets.push(r#"["client_side:unsupported"]"#.to_string());
                }
                "both" => {
                    // Both client and server (must have both)
                    facets.push(r#"["client_side:required","client_side:optional"]"#.to_string());
                    facets.push(r#"["server_side:required","server_side:optional"]"#.to_string());
                }
                _ => {}
            }
        }

        let page_limit = limit.unwrap_or(24).min(100);
        let page_offset = offset.unwrap_or(0);

        let facets_param = format!("[{}]", facets.join(","));
        let trimmed = query.trim();
        let base_url = self.get_api_base_url().await;
        let client = self.get_client().await;
        let url = if trimmed.is_empty() {
            format!(
                "{}/search?index=downloads&facets={}&limit={}&offset={}",
                base_url,
                urlencoding::encode(&facets_param),
                page_limit,
                page_offset
            )
        } else {
            format!(
                "{}/search?query={}&facets={}&limit={}&offset={}",
                base_url,
                urlencoding::encode(trimmed),
                urlencoding::encode(&facets_param),
                page_limit,
                page_offset
            )
        };

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Modrinth search error: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Modrinth API returned status: {}", resp.status()));
        }

        let search_resp: ModrinthSearchResponse = resp.json().await.map_err(|e| e.to_string())?;

        let hits = search_resp
            .hits
            .into_iter()
            .map(|h| ModrinthHit {
                project_id: h.project_id,
                slug: h.slug,
                title: h.title,
                description: h.description,
                icon_url: h.icon_url,
                downloads: h.downloads,
                author: h.author,
                categories: h.categories.unwrap_or_default(),
                client_side: h.client_side,
                server_side: h.server_side,
            })
            .collect();

        Ok(ModrinthSearchResult {
            hits,
            total_hits: search_resp.total_hits.unwrap_or(0),
            offset: search_resp.offset.unwrap_or(page_offset),
            limit: search_resp.limit.unwrap_or(page_limit),
        })
    }

    /// Fetch compatible version for a Modrinth project
    pub async fn get_project_version(
        &self,
        project_id: &str,
        game_version: &str,
        loader: &str,
    ) -> Result<ModrinthVersionResponse, String> {
        let loader_lower = loader.to_lowercase();
        let base_url = self.get_api_base_url().await;
        let client = self.get_client().await;
        let url = if loader_lower == "vanilla" || loader_lower.is_empty() {
            format!(
                "{}/project/{}/version?game_versions=[%22{}%22]",
                base_url, project_id, game_version
            )
        } else {
            format!(
                "{}/project/{}/version?loaders=[%22{}%22]&game_versions=[%22{}%22]",
                base_url, project_id, loader_lower, game_version
            )
        };

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch versions for {}: {}", project_id, e))?;

        if !resp.status().is_success() {
            return Err(format!("Modrinth versions error: {}", resp.status()));
        }

        let versions: Vec<ModrinthVersionResponse> =
            resp.json().await.map_err(|e| e.to_string())?;

        versions
            .into_iter()
            .next()
            .ok_or_else(|| format!("No compatible version found for Minecraft {} with {}", game_version, loader))
    }

    /// Fetch specific version by ID
    pub async fn get_version_by_id(&self, version_id: &str) -> Result<ModrinthVersionResponse, String> {
        let base_url = self.get_api_base_url().await;
        let client = self.get_client().await;
        let url = format!("{}/version/{}", base_url, version_id);
        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch version {}: {}", version_id, e))?;

        if !resp.status().is_success() {
            return Err(format!("Modrinth version {} error: {}", version_id, resp.status()));
        }

        resp.json().await.map_err(|e| e.to_string())
    }

    /// Fetch all available versions for a modpack project
    pub async fn get_modpack_versions(
        &self,
        project_id: &str,
    ) -> Result<Vec<ModpackVersionOption>, String> {
        let base_url = self.get_api_base_url().await;
        let client = self.get_client().await;
        let url = format!("{}/project/{}/version", base_url, project_id);
        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Ошибка получения версий сборки {}: {}", project_id, e))?;

        if !resp.status().is_success() {
            return Err(format!("Сервер Modrinth вернул статус: {}", resp.status()));
        }

        let raw_versions: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        for v in raw_versions {
            let id = v.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
            let name = v.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
            let version_number = v.get("version_number").and_then(|n| n.as_str()).unwrap_or("").to_string();
            let version_type = v.get("version_type").and_then(|t| t.as_str()).unwrap_or("release").to_string();
            let game_versions = v.get("game_versions")
                .and_then(|arr| arr.as_array())
                .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|x| x.to_string())).collect())
                .unwrap_or_default();
            let loaders = v.get("loaders")
                .and_then(|arr| arr.as_array())
                .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|x| x.to_string())).collect())
                .unwrap_or_default();

            if !id.is_empty() {
                list.push(ModpackVersionOption {
                    id,
                    name,
                    version_number,
                    game_versions,
                    loaders,
                    version_type,
                });
            }
        }
        Ok(list)
    }

    /// Fetch compatible version files for a Modrinth project
    pub async fn get_project_file(
        &self,
        project_id: &str,
        game_version: &str,
        loader: &str,
    ) -> Result<(String, String, Option<String>), String> {
        let version = self.get_project_version(project_id, game_version, loader).await?;
        let file = version
            .files
            .iter()
            .find(|f| f.primary)
            .or_else(|| version.files.first())
            .ok_or_else(|| "No downloadable file found in version".to_string())?;

        let sha1 = file.hashes.as_ref().and_then(|h| h.sha1.clone());
        Ok((file.url.clone(), file.filename.clone(), sha1))
    }

    /// Install a project and automatically resolve and download its required dependencies
    pub async fn install_project_with_dependencies(
        &self,
        target_dir: &Path,
        project_id: &str,
        game_version: &str,
        loader: &str,
    ) -> Result<InstallModResult, String> {
        fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;

        let version = self.get_project_version(project_id, game_version, loader).await?;
        let primary_file = version
            .files
            .iter()
            .find(|f| f.primary)
            .or_else(|| version.files.first())
            .ok_or_else(|| "No downloadable file found in version".to_string())?;

        let sha1 = primary_file.hashes.as_ref().and_then(|h| h.sha1.as_deref());
        self.install_mod(target_dir, &primary_file.url, &primary_file.filename, sha1).await?;

        let mut installed_dependencies = Vec::new();
        let mut visited = std::collections::HashSet::new();
        visited.insert(project_id.to_string());
        if let Some(pid) = &version.project_id {
            visited.insert(pid.clone());
        }

        // Collect required dependencies
        let mut queue: Vec<ModrinthDependency> = version
            .dependencies
            .into_iter()
            .filter(|d| d.dependency_type == "required")
            .collect();

        let mut depth = 0;
        while !queue.is_empty() && depth < 8 {
            depth += 1;
            let current_batch = std::mem::take(&mut queue);

            for dep in current_batch {
                let dep_version = if let Some(vid) = &dep.version_id {
                    self.get_version_by_id(vid).await.ok()
                } else if let Some(pid) = &dep.project_id {
                    if visited.contains(pid) {
                        continue;
                    }
                    self.get_project_version(pid, game_version, loader).await.ok()
                } else {
                    None
                };

                if let Some(dv) = dep_version {
                    if let Some(pid) = &dv.project_id {
                        if visited.contains(pid) {
                            continue;
                        }
                        visited.insert(pid.clone());
                    }

                    if let Some(dfile) = dv.files.iter().find(|f| f.primary).or_else(|| dv.files.first()) {
                        let dest = target_dir.join(&dfile.filename);
                        if !dest.exists() {
                            let dsha1 = dfile.hashes.as_ref().and_then(|h| h.sha1.as_deref());
                            if self.install_mod(target_dir, &dfile.url, &dfile.filename, dsha1).await.is_ok() {
                                let dep_title = dv.name.clone().unwrap_or_else(|| dfile.filename.clone());
                                installed_dependencies.push(dep_title);
                            }
                        }

                        for trans_dep in dv.dependencies {
                            if trans_dep.dependency_type == "required" {
                                queue.push(trans_dep);
                            }
                        }
                    }
                }
            }
        }

        Ok(InstallModResult {
            filename: primary_file.filename.clone(),
            installed_dependencies,
        })
    }

    /// Install a mod file directly into an instance's mods directory
    pub async fn install_mod(
        &self,
        mods_dir: &Path,
        file_url: &str,
        filename: &str,
        sha1: Option<&str>,
    ) -> Result<PathBuf, String> {
        fs::create_dir_all(mods_dir).map_err(|e| e.to_string())?;
        let dest = mods_dir.join(filename);

        let checksum = match sha1 {
            Some(hash) => ChecksumType::Sha1(hash.to_string()),
            None => ChecksumType::None,
        };

        self.downloader
            .download_file(file_url, &dest, checksum, Some("mod_install"), None)
            .await
    }

    /// Get detailed list of mods in an instance
    pub fn get_instance_mods_detailed(&self, mods_dir: &Path) -> Vec<ModInfo> {
        fn scan_dir(dir: &Path, rel_prefix: &str, mods: &mut Vec<ModInfo>) {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        let lower_name = name.to_lowercase();
                        if meta.is_file() {
                            let is_jar = lower_name.ends_with(".jar");
                            let is_disabled = lower_name.ends_with(".jar.disabled") || lower_name.ends_with(".disabled");
                            let is_zip = lower_name.ends_with(".zip");

                            if is_jar || is_disabled || is_zip {
                                let filename = if rel_prefix.is_empty() {
                                    name.clone()
                                } else {
                                    format!("{}/{}", rel_prefix, name)
                                };
                                let display_name = name
                                    .trim_end_matches(".disabled")
                                    .trim_end_matches(".DISABLED")
                                    .trim_end_matches(".jar")
                                    .trim_end_matches(".JAR")
                                    .trim_end_matches(".zip")
                                    .trim_end_matches(".ZIP")
                                    .to_string();

                                mods.push(ModInfo {
                                    filename,
                                    display_name,
                                    is_enabled: !is_disabled,
                                    size_bytes: meta.len(),
                                });
                            }
                        } else if meta.is_dir() && !name.starts_with('.') {
                            let sub_prefix = if rel_prefix.is_empty() {
                                name.clone()
                            } else {
                                format!("{}/{}", rel_prefix, name)
                            };
                            scan_dir(&entry.path(), &sub_prefix, mods);
                        }
                    }
                }
            }
        }

        let mut mods = Vec::new();
        if mods_dir.exists() {
            scan_dir(mods_dir, "", &mut mods);
        }

        // If no mods were found in mods_dir, also check if they are in .minecraft/mods
        if mods.is_empty() {
            if let Some(parent) = mods_dir.parent() {
                let alt_mods = parent.join(".minecraft").join("mods");
                if alt_mods.exists() {
                    scan_dir(&alt_mods, "", &mut mods);
                }
            }
        }

        mods.sort_by(|a, b| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()));
        mods
    }

    /// Toggle mod state between enabled (.jar) and disabled (.jar.disabled)
    pub fn toggle_mod(&self, mods_dir: &Path, filename: &str) -> Result<bool, String> {
        let mut current_path = mods_dir.join(filename);
        if !current_path.exists() {
            if let Some(parent) = mods_dir.parent() {
                let alt_path = parent.join(".minecraft").join("mods").join(filename);
                if alt_path.exists() {
                    current_path = alt_path;
                } else {
                    return Err(format!("Файл '{}' не найден", filename));
                }
            } else {
                return Err(format!("Файл '{}' не найден", filename));
            }
        }

        let lower = filename.to_lowercase();
        let parent_dir = current_path.parent().unwrap_or(mods_dir);

        if lower.ends_with(".disabled") {
            let new_filename = filename
                .trim_end_matches(".disabled")
                .trim_end_matches(".DISABLED");
            let new_path = parent_dir.join(new_filename);
            fs::rename(current_path, new_path).map_err(|e| e.to_string())?;
            Ok(true) // Now enabled
        } else if lower.ends_with(".jar") || lower.ends_with(".zip") {
            let new_filename = format!("{}.disabled", filename);
            let new_path = parent_dir.join(new_filename);
            fs::rename(current_path, new_path).map_err(|e| e.to_string())?;
            Ok(false) // Now disabled
        } else {
            Err("Файл не является модом (.jar, .zip или .disabled)".to_string())
        }
    }

    /// Delete a mod file from the instance
    pub fn delete_mod(&self, mods_dir: &Path, filename: &str) -> Result<(), String> {
        let path = mods_dir.join(filename);
        if path.exists() {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Install a ready-made modpack from Modrinth (.mrpack) into a brand new isolated instance
    pub async fn install_modpack(
        &self,
        instance_manager: &InstanceManager,
        project_id: &str,
        custom_name: Option<&str>,
        version_id: Option<&str>,
        target_game_version: Option<&str>,
        app_handle: Option<&AppHandle>,
    ) -> Result<InstanceConfig, String> {
        let base_url = self.get_api_base_url().await;
        let client = self.get_client().await;
        let url = format!("{}/project/{}/version", base_url, project_id);
        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Ошибка получения версии сборки: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Сервер Modrinth вернул статус: {}", resp.status()));
        }

        let versions: Vec<serde_json::Value> = resp.json().await.map_err(|e| e.to_string())?;

        // 1. If explicit version_id given, match it
        let chosen_version = if let Some(vid) = version_id {
            let vid_trim = vid.trim();
            if !vid_trim.is_empty() {
                versions.iter().find(|v| {
                    v.get("id").and_then(|i| i.as_str()) == Some(vid_trim)
                        || v.get("version_number").and_then(|vn| vn.as_str()) == Some(vid_trim)
                })
            } else {
                None
            }
        } else {
            None
        };

        // 2. If target_game_version given (e.g. "1.21.1"), find matching release version
        let chosen_version = chosen_version.or_else(|| {
            if let Some(tgv) = target_game_version {
                let tgv_trim = tgv.trim();
                if !tgv_trim.is_empty() && tgv_trim != "all" {
                    versions.iter().find(|v| {
                        let is_release = v.get("version_type").and_then(|vt| vt.as_str()) == Some("release");
                        let has_gv = v.get("game_versions")
                            .and_then(|gvs| gvs.as_array())
                            .map(|arr| arr.iter().any(|gv| gv.as_str() == Some(tgv_trim)))
                            .unwrap_or(false);
                        is_release && has_gv
                    }).or_else(|| {
                        versions.iter().find(|v| {
                            v.get("game_versions")
                                .and_then(|gvs| gvs.as_array())
                                .map(|arr| arr.iter().any(|gv| gv.as_str() == Some(tgv_trim)))
                                .unwrap_or(false)
                        })
                    })
                } else {
                    None
                }
            } else {
                None
            }
        });

        // 3. Fallback: Find first STABLE RELEASE with standard Minecraft version starting with "1."
        let chosen_version = chosen_version.or_else(|| {
            versions.iter().find(|v| {
                let is_release = v.get("version_type").and_then(|vt| vt.as_str()) == Some("release");
                let has_valid_gv = v.get("game_versions")
                    .and_then(|gvs| gvs.as_array())
                    .map(|arr| arr.iter().any(|gv| {
                        gv.as_str().map(|s| s.starts_with("1.")).unwrap_or(false)
                    }))
                    .unwrap_or(false);
                is_release && has_valid_gv
            })
        });

        // 4. Ultimate fallback to first version in list
        let latest_version = chosen_version
            .or_else(|| versions.first())
            .ok_or_else(|| "Для данной сборки не найдено версий".to_string())?;

        let files = latest_version
            .get("files")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "В сборке отсутствуют файлы".to_string())?;

        let mrpack_file = files
            .iter()
            .find(|f| {
                f.get("filename")
                    .and_then(|n| n.as_str())
                    .map(|n| n.ends_with(".mrpack"))
                    .unwrap_or(false)
            })
            .or_else(|| files.first())
            .ok_or_else(|| "Файл .mrpack не найден".to_string())?;

        let mrpack_url = mrpack_file
            .get("url")
            .and_then(|u| u.as_str())
            .ok_or_else(|| "Отсутствует URL файла сборки".to_string())?;

        if let Some(app) = app_handle {
            let _ = app.emit(
                "modpack-progress",
                ModpackInstallProgress {
                    modpack_name: project_id.to_string(),
                    stage: "Загрузка архива сборки (.mrpack)...".to_string(),
                    current_file: "archive.mrpack".to_string(),
                    completed: 0,
                    total: 100,
                    percentage: 10.0,
                },
            );
        }

        let temp_mrpack = instance_manager
            .cache_dir()
            .join(format!("modpack_{}.mrpack", uuid::Uuid::new_v4()));

        self.downloader
            .download_file(mrpack_url, &temp_mrpack, ChecksumType::None, None, None)
            .await?;

        // Open zip
        let file = fs::File::open(&temp_mrpack).map_err(|e| e.to_string())?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Некорректный .mrpack zip архив: {}", e))?;

        // Read modrinth.index.json
        let mut index_str = String::new();
        {
            let mut index_file = archive
                .by_name("modrinth.index.json")
                .map_err(|e| format!("Файл modrinth.index.json не найден в сборке: {}", e))?;
            use std::io::Read;
            index_file.read_to_string(&mut index_str).map_err(|e| e.to_string())?;
        }

        let index: MrpackIndex = serde_json::from_str(&index_str)
            .map_err(|e| format!("Ошибка парсинга modrinth.index.json: {}", e))?;

        let mc_version = index
            .dependencies
            .get("minecraft")
            .cloned()
            .unwrap_or_else(|| "1.21.1".to_string());

        let (loader_type, loader_version) = if let Some(v) = index.dependencies.get("fabric-loader") {
            (LoaderType::Fabric, Some(v.clone()))
        } else if let Some(v) = index.dependencies.get("neoforge") {
            (LoaderType::NeoForge, Some(v.clone()))
        } else if let Some(v) = index.dependencies.get("forge") {
            (LoaderType::Forge, Some(v.clone()))
        } else if let Some(v) = index.dependencies.get("quilt-loader") {
            (LoaderType::Quilt, Some(v.clone()))
        } else {
            (LoaderType::Fabric, None)
        };

        let inst_name = custom_name.unwrap_or(&index.name).to_string();

        // Create new isolated instance!
        let config = instance_manager.create_instance(CreateInstanceRequest {
            name: inst_name.clone(),
            game_version: mc_version,
            loader_type,
            loader_version,
            icon: None,
            memory: None,
            gc_preset: None,
        })?;

        let instance_dir = instance_manager.instance_path(&config.id);

        if let Some(app) = app_handle {
            let _ = app.emit(
                "modpack-progress",
                ModpackInstallProgress {
                    modpack_name: inst_name.clone(),
                    stage: "Распаковка конфигураций и ресурсов сборки...".to_string(),
                    current_file: "overrides".to_string(),
                    completed: 20,
                    total: 100,
                    percentage: 25.0,
                },
            );
        }

        // Extract overrides/ first, then client-overrides/ (so client configs take precedence)
        for prefix in &["overrides/", "client-overrides/"] {
            for i in 0..archive.len() {
                let mut zip_file = archive.by_index(i).map_err(|e| e.to_string())?;
                let name = zip_file.name().to_string();
                if name.starts_with(prefix) {
                    let rel = name.trim_start_matches(prefix);
                    if rel.is_empty() {
                        continue;
                    }
                    let dest = instance_dir.join(rel);
                    if zip_file.is_dir() {
                        let _ = fs::create_dir_all(&dest);
                    } else {
                        if let Some(parent) = dest.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        if let Ok(mut out) = fs::File::create(&dest) {
                            use std::io::copy;
                            let _ = copy(&mut zip_file, &mut out);
                        }
                    }
                }
            }
        }

        // Download modpack files
        let total_files = index.files.len();
        for (idx, f) in index.files.iter().enumerate() {
            if let Some(dl_url) = f.downloads.first() {
                let dest = instance_dir.join(&f.path);
                if let Some(parent) = dest.parent() {
                    let _ = fs::create_dir_all(parent);
                }

                let sha1 = f.hashes.get("sha1").cloned();
                let checksum = match sha1 {
                    Some(hash) => ChecksumType::Sha1(hash),
                    None => ChecksumType::None,
                };

                let file_label = f.path.split('/').next_back().unwrap_or(&f.path).to_string();

                if let Some(app) = app_handle {
                    let pct = 30.0 + (idx as f32 / total_files.max(1) as f32) * 65.0;
                    let _ = app.emit(
                        "modpack-progress",
                        ModpackInstallProgress {
                            modpack_name: inst_name.clone(),
                            stage: "Загрузка модов сборки...".to_string(),
                            current_file: file_label,
                            completed: idx + 1,
                            total: total_files,
                            percentage: pct,
                        },
                    );
                }

                let _ = self.downloader.download_file(dl_url, &dest, checksum, None, None).await;
            }
        }

        // Clean up temporary .mrpack
        let _ = fs::remove_file(&temp_mrpack);

        // Auto-tune options.txt for maximum FPS (disables vsync lock, sets uncapped FPS, optimal render distance)
        crate::services::launcher::auto_tune_options_for_max_fps(&instance_dir);

        if let Some(app) = app_handle {
            let _ = app.emit(
                "modpack-progress",
                ModpackInstallProgress {
                    modpack_name: inst_name,
                    stage: "Сборка готова к игре!".to_string(),
                    current_file: "Завершено".to_string(),
                    completed: total_files,
                    total: total_files,
                    percentage: 100.0,
                },
            );
        }

        Ok(config)
    }
}
