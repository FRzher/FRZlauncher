use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use regex::Regex;

use crate::models::{AutoRepairResult, CrashDiagnosis, LoaderType};
use crate::services::{InstanceManager, JavaDetector, ModrinthService};

#[derive(Clone)]
pub struct CrashRepairService {
    instance_manager: Arc<InstanceManager>,
    #[allow(dead_code)]
    java_detector: Arc<JavaDetector>,
    modrinth_service: Arc<ModrinthService>,
}

impl CrashRepairService {
    pub fn new(
        instance_manager: Arc<InstanceManager>,
        java_detector: Arc<JavaDetector>,
        modrinth_service: Arc<ModrinthService>,
    ) -> Self {
        Self {
            instance_manager,
            java_detector,
            modrinth_service,
        }
    }

    /// Analyze log lines and crash reports to identify the exact cause of the crash
    pub fn analyze_crash(
        &self,
        instance_id: &str,
        instance_dir: &Path,
        exit_code: Option<i32>,
        recent_logs: &[String],
        game_version: &str,
        loader_type: &LoaderType,
    ) -> CrashDiagnosis {
        let mut full_log = recent_logs.join("\n");

        // 1. Check if there's a recent crash report in crash-reports/
        let crash_reports_dir = instance_dir.join("crash-reports");
        let mut crash_report_content = String::new();
        if crash_reports_dir.exists() {
            if let Ok(entries) = fs::read_dir(&crash_reports_dir) {
                let mut reports: Vec<PathBuf> = entries
                    .flatten()
                    .filter(|e| {
                        e.path().is_file()
                            && e.path()
                                .extension()
                                .map(|ext| ext == "txt")
                                .unwrap_or(false)
                    })
                    .map(|e| e.path())
                    .collect();

                // Sort newest first
                reports.sort_by_key(|p| {
                    p.metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                });
                reports.reverse();

                if let Some(newest) = reports.first() {
                    if let Ok(content) = fs::read_to_string(newest) {
                        crash_report_content = content;
                    }
                }
            }
        }

        // 2. Also check logs/latest.log
        let latest_log_path = instance_dir.join("logs").join("latest.log");
        let mut latest_log_content = String::new();
        if latest_log_path.exists() {
            if let Ok(content) = fs::read_to_string(latest_log_path) {
                // Take last 400 lines
                let lines: Vec<&str> = content.lines().collect();
                let start = if lines.len() > 400 { lines.len() - 400 } else { 0 };
                latest_log_content = lines[start..].join("\n");
            }
        }

        let fabric_log_path = instance_dir.join("fabricloader.log");
        if fabric_log_path.exists() {
            if let Ok(content) = fs::read_to_string(&fabric_log_path) {
                full_log.push_str("\n--- FABRICLOADER.LOG ---\n");
                full_log.push_str(&content);
            }
        }

        full_log.push_str("\n");
        full_log.push_str(&latest_log_content);
        full_log.push_str("\n");
        full_log.push_str(&crash_report_content);

        // --- Cause: Fabric Loader / Sinytra Connector missing dependency or Mod resolution failed ---
        if full_log.contains("Mod resolution failed") || full_log.contains("HARD_DEP_NO_CANDIDATE") {
            let mut offending_file = None;
            let re_cand = Regex::new(r"HARD_DEP_NO_CANDIDATE\s+([a-zA-Z0-9_\-]+)").unwrap();
            let dep_name = if let Some(caps) = re_cand.captures(&full_log) {
                caps.get(1).map(|m| m.as_str().to_string())
            } else {
                None
            };

            let mods_dir = instance_dir.join("mods");
            if let Some(ref d_name) = dep_name {
                if let Ok(entries) = fs::read_dir(&mods_dir) {
                    for entry in entries.flatten() {
                        let fname = entry.file_name().to_string_lossy().to_string();
                        if fname.to_lowercase().contains(&d_name.to_lowercase()) && fname.ends_with(".jar") {
                            offending_file = Some(fname);
                            break;
                        }
                    }
                }
            }

            let desc = if let Some(ref m) = offending_file {
                format!("Мод «{}» не может запуститься, так как для него отсутствуют обязательные библиотеки.", m)
            } else if let Some(ref d) = dep_name {
                format!("В сборке отсутствует обязательный мод/зависимость «{}».", d)
            } else {
                "Сборка содержит моды с неразрешенными зависимостями.".to_string()
            };

            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "missing_dependency".to_string(),
                title: "Отсутствуют зависимости для модов".to_string(),
                description: desc,
                details: "Один или несколько модов требуют дополнительные библиотеки (например, Fabric API / Forgified Fabric API) для работы.".to_string(),
                suggested_fix: if offending_file.is_some() {
                    "Автоматически отключить несовместимый мод, чтобы запустить игру.".to_string()
                } else {
                    "Установите недостающие библиотеки или удалите несовместимый мод из папки mods.".to_string()
                },
                can_auto_fix: offending_file.is_some(),
                offending_file,
                offending_arg: None,
                target_java_major: None,
            };
        }

        // --- Cause 1: 32-bit Java or Incompatible JVM arguments / Memory overflow ---
        if full_log.contains("The specified size exceeds the maximum representable size")
            || full_log.contains("Could not reserve enough space for")
            || full_log.contains("Unrecognized VM option")
            || full_log.contains("Could not create the Java Virtual Machine")
            || full_log.contains("Error occurred during initialization of VM")
            || full_log.contains("OutOfMemoryError")
        {
            let mut offending_arg = None;
            if let Some(start) = full_log.find("Unrecognized VM option '") {
                let rest = &full_log[start + 24..];
                if let Some(end) = rest.find('\'') {
                    offending_arg = Some(rest[..end].to_string());
                }
            }

            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "jvm_args".to_string(),
                title: "Сбой параметров JVM или нехватка памяти".to_string(),
                description: "Игра не смогла запуститься из-за некорректного аргумента запуска или переполнения памяти для текущей версии Java.".to_string(),
                details: "32-битная Java ограничена 1 ГБ памяти, либо в параметрах запуска указан неверный флаг.".to_string(),
                suggested_fix: "Автоматически сбросить параметры памяти до безопасных значений и очистить несовместимые JVM аргументы.".to_string(),
                can_auto_fix: true,
                offending_file: None,
                offending_arg,
                target_java_major: None,
            };
        }

        // --- Cause 2: Java Version Mismatch ---
        if full_log.contains("UnsupportedClassVersionError")
            || full_log.contains("has been compiled by a more recent version of the Java Runtime")
            || full_log.contains("InaccessibleObjectException: Unable to make field")
        {
            let (req_major, _) = JavaDetector::required_java_major(game_version);
            let mut detected_needed_major = req_major;

            // Extract class file version e.g. "class file version 65.0" -> Java 21, "61.0" -> Java 17, "52.0" -> Java 8
            let re = Regex::new(r"class file version (\d+)\.0").unwrap();
            if let Some(caps) = re.captures(&full_log) {
                if let Some(ver_str) = caps.get(1) {
                    if let Ok(class_ver) = ver_str.as_str().parse::<u32>() {
                        detected_needed_major = match class_ver {
                            52 => 8,
                            61 => 17,
                            65 => 21,
                            66 => 22,
                            67 => 23,
                            68 => 24,
                            69 => 25,
                            _ if class_ver > 65 => 21,
                            _ => req_major,
                        };
                    }
                }
            }

            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "java_mismatch".to_string(),
                title: format!("Несовместимая версия Java (требуется Java {})", detected_needed_major),
                description: format!(
                    "Версия игры Minecraft {} или установленные моды требуют среду Java {}, но используется неподходящая версия Java.",
                    game_version, detected_needed_major
                ),
                details: "Классы модов скомпилированы под более новую версию JVM.".to_string(),
                suggested_fix: format!("Автоматически переключить сборку на совместимую Java {} и скачать её при необходимости.", detected_needed_major),
                can_auto_fix: true,
                offending_file: None,
                offending_arg: None,
                target_java_major: Some(detected_needed_major),
            };
        }

        // --- Cause 3: Missing Fabric API ---
        if full_log.contains("requires version") && full_log.contains("of 'fabric-api'")
            || full_log.contains("requires {fabric @")
            || full_log.contains("Mod resolution encountered an incompatible mod set") && full_log.contains("fabric-api")
        {
            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "missing_fabric_api".to_string(),
                title: "Отсутствует Fabric API".to_string(),
                description: "Установленным модам для работы необходима библиотека Fabric API.".to_string(),
                details: "Fabric Loader запущен без базового API для модов.".to_string(),
                suggested_fix: "Автоматически скачать и установить Fabric API для вашей версии Minecraft.".to_string(),
                can_auto_fix: true,
                offending_file: None,
                offending_arg: None,
                target_java_major: None,
            };
        }

        // --- Cause 4: Duplicate Mods in mods/ ---
        let mods_dir = instance_dir.join("mods");
        if mods_dir.exists() {
            if let Ok(entries) = fs::read_dir(&mods_dir) {
                let jar_files: Vec<String> = entries
                    .flatten()
                    .filter(|e| e.path().is_file())
                    .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
                    .filter(|n| n.ends_with(".jar"))
                    .collect();

                for name in &jar_files {
                    if name.contains(" (1).jar") || name.contains(" - копия.jar") || name.contains(" (copy).jar") {
                        return CrashDiagnosis {
                            instance_id: instance_id.to_string(),
                            cause_type: "duplicate_mods".to_string(),
                            title: "Обнаружен файл-дубликат мода".to_string(),
                            description: format!("В папке mods найден дублирующийся файл: {}", name),
                            details: "Наличие двух копий одного мода вызывает критический конфликт загрузчика.".to_string(),
                            suggested_fix: format!("Автоматически отключить дубликат «{}».", name),
                            can_auto_fix: true,
                            offending_file: Some(name.clone()),
                            offending_arg: None,
                            target_java_major: None,
                        };
                    }
                }
            }
        }

        // Check for duplicate mod errors reported in logs
        if full_log.to_lowercase().contains("duplicate mod") || full_log.contains("DuplicateModsFoundException") {
            let dup_re = Regex::new(r"(?i)duplicate\s+mod(?: id)?\s+['\x22]([a-zA-Z0-9_\-]+)['\x22]").unwrap();
            let mut dup_file = None;
            if let Some(caps) = dup_re.captures(&full_log) {
                if let Some(m) = caps.get(1) {
                    dup_file = self.find_mod_jar_by_identifier(&mods_dir, m.as_str());
                }
            }
            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "duplicate_mods".to_string(),
                title: "Обнаружены дублирующиеся моды".to_string(),
                description: format!(
                    "Загрузчик модов обнаружил несколько копий одного и того же мода{}",
                    dup_file.as_ref().map(|f| format!(": {}", f)).unwrap_or_default()
                ),
                details: "Одновременная загрузка двух версий одного мода вызывает аварийную остановку.".to_string(),
                suggested_fix: "Автоматически отключить дублирующиеся файлы модов в папке mods/.".to_string(),
                can_auto_fix: true,
                offending_file: dup_file,
                offending_arg: None,
                target_java_major: None,
            };
        }

        // Check for OptiFine conflicting with Sodium/Embeddium
        if (full_log.to_lowercase().contains("optifine") && (full_log.to_lowercase().contains("sodium") || full_log.to_lowercase().contains("embeddium")))
            || full_log.contains("OptiFine is not compatible with Sodium")
            || full_log.contains("Embeddium and OptiFine cannot be used together")
        {
            let optifine_file = self.find_mod_jar_by_identifier(&mods_dir, "optifine");
            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "mod_crash".to_string(),
                title: "Конфликт OptiFine и Sodium/Embeddium".to_string(),
                description: "Установлен OptiFine вместе с Sodium/Embeddium. Эти моды несовместимы и вызывают сбой при запуске.".to_string(),
                details: "Sodium и OptiFine оба перехватывают конвейер рендеринга Minecraft.".to_string(),
                suggested_fix: "Автоматически отключить OptiFine для обеспечения стабильной работы и высокого FPS.".to_string(),
                can_auto_fix: true,
                offending_file: optifine_file.or_else(|| Some("OptiFine.jar".to_string())),
                offending_arg: None,
                target_java_major: None,
            };
        }

        // --- Cause 5: Crashing or Incompatible Mod (Mixin / ClassNotFound / Initialization failure) ---
        let mut culprit_mod = None;

        // Try extracting mod from mixin crash: e.g. "Mixin prepare failed ... in mymod.mixins.json"
        let mixin_re = Regex::new(r"in\s+([a-zA-Z0-9_\-]+)\.mixins\.json").unwrap();
        if let Some(caps) = mixin_re.captures(&full_log) {
            if let Some(m) = caps.get(1) {
                let mod_id = m.as_str().to_lowercase();
                culprit_mod = self.find_mod_jar_by_identifier(&mods_dir, &mod_id);
            }
        }

        // Try extracting from crash report: "Plugin / Mod: ..."
        if culprit_mod.is_none() {
            let mod_crash_re = Regex::new(r"(?:Suspected Mods?|Mod File|at\s+)([a-zA-Z0-9_\-\.]+)\.jar").unwrap();
            if let Some(caps) = mod_crash_re.captures(&full_log) {
                if let Some(m) = caps.get(1) {
                    let jar_candidate = format!("{}.jar", m.as_str());
                    if mods_dir.join(&jar_candidate).exists() {
                        culprit_mod = Some(jar_candidate);
                    }
                }
            }
        }

        if let Some(mod_filename) = culprit_mod {
            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "mod_crash".to_string(),
                title: format!("Конфликт или сбой мода: {}", mod_filename),
                description: format!("Мод «{}» вызвал ошибку при инициализации игры.", mod_filename),
                details: "Сбой произошел при применении миксинов или загрузке классов мода.".to_string(),
                suggested_fix: format!("Автоматически отключить проблемный мод «{}», чтобы игра смогла запуститься.", mod_filename),
                can_auto_fix: true,
                offending_file: Some(mod_filename),
                offending_arg: None,
                target_java_major: None,
            };
        }

        // --- Cause 6: OpenGL / GLFW / Graphics Driver Error ---
        if full_log.contains("GLFW error 65542")
            || full_log.contains("Pixel format not accelerated")
            || full_log.contains("The driver does not appear to support OpenGL")
            || full_log.contains("nvoglv64.dll")
            || full_log.contains("atio6axx.dll")
            || full_log.contains("ig9ic64.dll")
        {
            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "opengl_driver".to_string(),
                title: "Сбой графического драйвера OpenGL / GLFW".to_string(),
                description: "Видеокарта или драйвер не поддерживают требуемый профиль аппаратного OpenGL.".to_string(),
                details: "GLFW error 65542 / WGL Pixel format not accelerated.".to_string(),
                suggested_fix: "Включить программную совместимость OpenGL и принудительное назначение высокопроизводительной видеокарты.".to_string(),
                can_auto_fix: true,
                offending_file: None,
                offending_arg: None,
                target_java_major: None,
            };
        }

        // --- Cause 7: Vanilla loader with mods installed ---
        if *loader_type == LoaderType::Vanilla && mods_dir.exists() {
            let has_jars = fs::read_dir(&mods_dir)
                .map(|entries| {
                    entries.flatten().any(|e| {
                        e.path()
                            .extension()
                            .map(|ext| ext.eq_ignore_ascii_case("jar"))
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            if has_jars {
                return CrashDiagnosis {
                    instance_id: instance_id.to_string(),
                    cause_type: "vanilla_mods".to_string(),
                    title: "Моды установлены на ванильный загрузчик".to_string(),
                    description: "В папке mods присутствуют моды, но сборка настроена с загрузчиком Vanilla (без Fabric/Forge).".to_string(),
                    details: "Оригинальный клиент Minecraft не поддерживает загрузку модов без модлоадера.".to_string(),
                    suggested_fix: "Автоматически переключить сборку на Fabric Loader.".to_string(),
                    can_auto_fix: true,
                    offending_file: None,
                    offending_arg: None,
                    target_java_major: None,
                };
            }
        }

        // --- Cause 8: Corrupted assets or missing client jar ---
        if full_log.contains("ClassNotFoundException: net.minecraft.client.main.Main")
            || full_log.contains("ZipException: error in opening zip file")
            || full_log.contains("Invalid or corrupt jarfile")
        {
            return CrashDiagnosis {
                instance_id: instance_id.to_string(),
                cause_type: "corrupted_assets".to_string(),
                title: "Поврежден клиент игры или библиотеки".to_string(),
                description: "Один из скачанных jar-файлов игры или библиотек поврежден либо имеет нулевой размер.".to_string(),
                details: "ZipException или ClassNotFoundException в основном классе Minecraft.".to_string(),
                suggested_fix: "Очистить кэш версий и библиотек и повторно скачать проверенные файлы.".to_string(),
                can_auto_fix: true,
                offending_file: None,
                offending_arg: None,
                target_java_major: None,
            };
        }

        // Default General Diagnosis
        let exit_msg = exit_code.map(|c| format!(" (код {})", c)).unwrap_or_default();
        CrashDiagnosis {
            instance_id: instance_id.to_string(),
            cause_type: "general".to_string(),
            title: format!("Непредвиденный сбой процесса игры{}", exit_msg),
            description: "Процесс Minecraft неожиданно завершил работу. Рекомендуется сбросить настройки графики и оптимизировать параметры запуска.".to_string(),
            details: if let Some(last_line) = full_log.lines().rev().find(|l| !l.trim().is_empty()) {
                last_line.to_string()
            } else {
                "Не удалось определить точную причину сбоя.".to_string()
            },
            suggested_fix: "Выполнить безопасную автопочинку: оптимизировать options.txt, сбросить кэш и применить безопасные JVM аргументы.".to_string(),
            can_auto_fix: true,
            offending_file: None,
            offending_arg: None,
            target_java_major: None,
        }
    }

    fn find_mod_jar_by_identifier(&self, mods_dir: &Path, id: &str) -> Option<String> {
        if !mods_dir.exists() {
            return None;
        }
        let entries = fs::read_dir(mods_dir).ok()?;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let lower = name.to_lowercase();
            if lower.ends_with(".jar") && lower.contains(id) {
                return Some(name);
            }
        }
        None
    }

    /// Automatically repair an instance based on detected crash diagnosis
    pub async fn repair_instance(
        &self,
        instance_id: &str,
    ) -> Result<AutoRepairResult, String> {
        let mut config = self.instance_manager.get_instance(instance_id)?;
        let instance_dir = self.instance_manager.instance_path(instance_id);

        let diagnosis = self.analyze_crash(
            instance_id,
            &instance_dir,
            Some(-1),
            &[],
            &config.game_version,
            &config.loader_type,
        );

        let mut actions = Vec::new();

        match diagnosis.cause_type.as_str() {
            "jvm_args" => {
                // Reset memory to safe values & clear invalid custom args
                config.memory.min_mb = 512;
                config.memory.max_mb = 4096;
                config.custom_jvm_args.clear();
                config.gc_preset = "fps_boost".to_string();
                self.instance_manager.update_instance(config)?;
                actions.push("Сброшены пользовательские JVM аргументы".to_string());
                actions.push("Установлен безопасный объем ОЗУ: 4096 МБ (min: 512 МБ)".to_string());
                actions.push("Применен стабильный профиль сборщика мусора G1GC".to_string());
            }
            "java_mismatch" => {
                // Clear custom bad java_path and configure optimal compatible Java
                config.java_path = None;
                self.instance_manager.update_instance(config)?;
                actions.push(format!(
                    "Сброшен путь к Java. При следующем запуске будет автоматически загружена совместимая 64-битная Java {}.",
                    diagnosis.target_java_major.unwrap_or(21)
                ));
            }
            "missing_fabric_api" => {
                let mods_dir = instance_dir.join("mods");
                let _ = fs::create_dir_all(&mods_dir);
                match self
                    .modrinth_service
                    .install_project_with_dependencies(&mods_dir, "fabric-api", &config.game_version, "fabric")
                    .await
                {
                    Ok(res) => {
                        actions.push(format!("Автоматически установлен Fabric API ({}) с Modrinth", res.filename));
                    }
                    Err(e) => {
                        return Err(format!("Не удалось скачать Fabric API: {}", e));
                    }
                }
            }
            "duplicate_mods" => {
                let mods_dir = instance_dir.join("mods");
                if let Some(dup_file) = diagnosis.offending_file {
                    let dup_path = mods_dir.join(&dup_file);
                    if dup_path.exists() {
                        let disabled_name = format!("{}.disabled", dup_file);
                        let _ = fs::rename(&dup_path, mods_dir.join(&disabled_name));
                        actions.push(format!("Отключен файл-дубликат: {} -> {}", dup_file, disabled_name));
                    }
                } else if mods_dir.exists() {
                    if let Ok(entries) = fs::read_dir(&mods_dir) {
                        for entry in entries.flatten() {
                            let name = entry.file_name().to_string_lossy().to_string();
                            if name.ends_with(".jar") && (name.contains(" (1)") || name.contains(" - копия") || name.contains(" (copy)")) {
                                let disabled_name = format!("{}.disabled", name);
                                let _ = fs::rename(entry.path(), mods_dir.join(&disabled_name));
                                actions.push(format!("Отключен дубликат: {}", name));
                            }
                        }
                    }
                }
            }
            "mod_crash" => {
                if let Some(mod_file) = diagnosis.offending_file {
                    let mods_dir = instance_dir.join("mods");
                    let mod_path = mods_dir.join(&mod_file);
                    if mod_path.exists() {
                        let disabled_name = format!("{}.disabled", mod_file);
                        let _ = fs::rename(&mod_path, mods_dir.join(&disabled_name));
                        actions.push(format!("Отключен конфликтующий мод: {} -> {}", mod_file, disabled_name));
                    }
                }
            }
            "opengl_driver" => {
                // Add software OpenGL flag and reset options.txt
                if !config.custom_jvm_args.iter().any(|a| a.contains("allowSoftwareOpenGL")) {
                    config.custom_jvm_args.push("-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=true".to_string());
                }
                self.instance_manager.update_instance(config)?;
                crate::services::launcher::auto_tune_options_for_max_fps(&instance_dir);
                actions.push("Активирован режим совместимости OpenGL (-Dorg.lwjgl.opengl.Display.allowSoftwareOpenGL=true)".to_string());
                actions.push("Настройки графики (options.txt) сброшены к безопасным параметрам".to_string());
            }
            "vanilla_mods" => {
                config.loader_type = LoaderType::Fabric;
                config.loader_version = Some("0.16.9".to_string());
                self.instance_manager.update_instance(config)?;
                actions.push("Загрузчик сборки переключен с Vanilla на Fabric Loader".to_string());
            }
            "corrupted_assets" => {
                let assets_dir = self.instance_manager.cache_dir().join("assets");
                if let Ok(entries) = fs::read_dir(&assets_dir) {
                    for entry in entries.flatten() {
                        if let Some(name) = entry.file_name().to_str() {
                            if name.ends_with(".verified") {
                                let _ = fs::remove_file(entry.path());
                            }
                        }
                    }
                }
                actions.push("Сброшен маркер верификации ассетов (файлы будут проверены заново)".to_string());
            }
            _ => {
                // General safe tuning
                crate::services::launcher::auto_tune_options_for_max_fps(&instance_dir);
                let lock_file = instance_dir.join("session.lock");
                if lock_file.exists() {
                    let _ = fs::remove_file(lock_file);
                    actions.push("Удален зависший файл блокировки session.lock".to_string());
                }
                actions.push("Оптимизирован файл настроек options.txt для безопасного запуска".to_string());
            }
        }

        // Clean lock files in root if any
        let root_lock = instance_dir.join("session.lock");
        if root_lock.exists() {
            let _ = fs::remove_file(root_lock);
        }

        Ok(AutoRepairResult {
            success: true,
            message: format!("Автопочинка сборки «{}» успешно выполнена!", diagnosis.title),
            actions_taken: actions,
            can_relaunch: true,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crash_analyzer_detects_32bit_ram_overflow() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_crash_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let inst_mgr = Arc::new(InstanceManager::new(temp_dir.clone()));
        let java_det = Arc::new(JavaDetector::new());
        let downloader = Arc::new(crate::services::Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));

        let service = CrashRepairService::new(inst_mgr, java_det, modrinth);

        let logs = vec![
            "Error occurred during initialization of VM".to_string(),
            "The specified size exceeds the maximum representable size: -Xms4096M".to_string(),
        ];

        let diagnosis = service.analyze_crash("inst1", &temp_dir, Some(1), &logs, "1.21.1", &LoaderType::Fabric);
        assert_eq!(diagnosis.cause_type, "jvm_args");
        assert!(diagnosis.can_auto_fix);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_crash_analyzer_detects_java_version_mismatch() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_crash_jvm_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let inst_mgr = Arc::new(InstanceManager::new(temp_dir.clone()));
        let java_det = Arc::new(JavaDetector::new());
        let downloader = Arc::new(crate::services::Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));

        let service = CrashRepairService::new(inst_mgr, java_det, modrinth);

        let logs = vec![
            "java.lang.UnsupportedClassVersionError: net/fabricmc/loader/impl/launch/knot/KnotClient has been compiled by a more recent version of the Java Runtime (class file version 65.0), this version of the Java Runtime only recognizes class file versions up to 52.0".to_string(),
        ];

        let diagnosis = service.analyze_crash("inst1", &temp_dir, Some(1), &logs, "1.21.1", &LoaderType::Fabric);
        assert_eq!(diagnosis.cause_type, "java_mismatch");
        assert_eq!(diagnosis.target_java_major, Some(21));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_crash_analyzer_detects_duplicate_mods_from_log() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_crash_dup_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let inst_mgr = Arc::new(InstanceManager::new(temp_dir.clone()));
        let java_det = Arc::new(JavaDetector::new());
        let downloader = Arc::new(crate::services::Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));

        let service = CrashRepairService::new(inst_mgr, java_det, modrinth);

        let logs = vec![
            "net.fabricmc.loader.impl.FormattedException: Duplicate mod id 'sodium' found: [sodium-fabric-0.5.8.jar, sodium-fabric-0.6.0.jar]".to_string(),
        ];

        let diagnosis = service.analyze_crash("inst1", &temp_dir, Some(1), &logs, "1.21.1", &LoaderType::Fabric);
        assert_eq!(diagnosis.cause_type, "duplicate_mods");
        assert!(diagnosis.can_auto_fix);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_crash_analyzer_detects_optifine_conflict() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_crash_opti_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let inst_mgr = Arc::new(InstanceManager::new(temp_dir.clone()));
        let java_det = Arc::new(JavaDetector::new());
        let downloader = Arc::new(crate::services::Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));

        let service = CrashRepairService::new(inst_mgr, java_det, modrinth);

        let logs = vec![
            "OptiFine is not compatible with Sodium. Please remove one of them to continue.".to_string(),
        ];

        let diagnosis = service.analyze_crash("inst1", &temp_dir, Some(1), &logs, "1.21.1", &LoaderType::Fabric);
        assert_eq!(diagnosis.cause_type, "mod_crash");
        assert!(diagnosis.title.contains("OptiFine"));
        assert!(diagnosis.can_auto_fix);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_crash_analyzer_detects_fabric_missing_dependencies() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_crash_dep_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let inst_mgr = Arc::new(InstanceManager::new(temp_dir.clone()));
        let java_det = Arc::new(JavaDetector::new());
        let downloader = Arc::new(crate::services::Downloader::new());
        let modrinth = Arc::new(ModrinthService::new(downloader));

        let service = CrashRepairService::new(inst_mgr, java_det, modrinth);

        // Put a fabricloader.log
        let fabric_log = "[18:28:43] [WARN] [FabricLoader/Resolution]: Mod resolution failed\n[18:28:43] [INFO] [FabricLoader/Resolution]: Immediate reason: [HARD_DEP_NO_CANDIDATE enhancedblockentities 0.9+1.20 {depends fabric @ [*]}]";
        fs::write(temp_dir.join("fabricloader.log"), fabric_log).unwrap();

        let diagnosis = service.analyze_crash("inst1", &temp_dir, Some(1), &[], "1.20.1", &LoaderType::Forge);
        assert_eq!(diagnosis.cause_type, "missing_dependency");
        assert!(diagnosis.title.contains("зависимости"));

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
