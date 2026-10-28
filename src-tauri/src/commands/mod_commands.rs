use tauri::{AppHandle, State};
use crate::models::{
    Account, InstanceConfig, InstallModResult, MinecraftInsideDownloadItem,
    MinecraftInsideSearchResult, ModInfo, ModpackVersionOption, ModrinthSearchResult,
};
use crate::AppState;

#[tauri::command]
pub async fn search_modrinth(
    state: State<'_, AppState>,
    query: String,
    game_version: Option<String>,
    loader: Option<String>,
    project_type: Option<String>,
    category: Option<String>,
    environment: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<ModrinthSearchResult, String> {
    state
        .modrinth_service
        .search_mods(
            &query,
            game_version.as_deref(),
            loader.as_deref(),
            project_type.as_deref(),
            category.as_deref(),
            environment.as_deref(),
            offset,
            limit,
        )
        .await
}

#[tauri::command]
pub async fn install_modpack(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    custom_name: Option<String>,
    version_id: Option<String>,
    game_version: Option<String>,
) -> Result<InstanceConfig, String> {
    state
        .modrinth_service
        .install_modpack(
            &state.instance_manager,
            &project_id,
            custom_name.as_deref(),
            version_id.as_deref(),
            game_version.as_deref(),
            Some(&app),
        )
        .await
}

#[tauri::command]
pub async fn get_modpack_versions(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<ModpackVersionOption>, String> {
    state.modrinth_service.get_modpack_versions(&project_id).await
}

#[tauri::command]
pub async fn install_modrinth_mod(
    state: State<'_, AppState>,
    instance_id: String,
    project_id: String,
    game_version: Option<String>,
    loader: Option<String>,
    project_type: Option<String>,
) -> Result<InstallModResult, String> {
    let instance_path = state.instance_manager.instance_path(&instance_id);
    let subfolder = match project_type.as_deref() {
        Some("datapack") => "datapacks",
        Some("resourcepack") => "resourcepacks",
        Some("shader") => "shaderpacks",
        _ => "mods",
    };
    let target_dir = instance_path.join(subfolder);

    // If game_version or loader are omitted or empty, lookup from instance config
    let (g_version, l_type) = if game_version.as_deref().unwrap_or("").trim().is_empty()
        || loader.as_deref().unwrap_or("").trim().is_empty()
    {
        let inst = state.instance_manager.get_instance(&instance_id)?;
        let g = game_version
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(inst.game_version);
        let l = loader
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| match inst.loader_type {
                crate::models::LoaderType::Fabric => "fabric".to_string(),
                crate::models::LoaderType::Forge => "forge".to_string(),
                crate::models::LoaderType::NeoForge => "neoforge".to_string(),
                crate::models::LoaderType::Quilt => "quilt".to_string(),
                crate::models::LoaderType::Vanilla => "vanilla".to_string(),
            });
        (g, l)
    } else {
        (game_version.unwrap(), loader.unwrap())
    };

    state
        .modrinth_service
        .install_project_with_dependencies(&target_dir, &project_id, &g_version, &l_type)
        .await
}

#[tauri::command]
pub async fn install_optimization_pack(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<String>, String> {
    let inst = state.instance_manager.get_instance(&instance_id)?;
    let instance_path = state.instance_manager.instance_path(&instance_id);
    let mods_dir = instance_path.join("mods");
    let g_version = inst.game_version.clone();
    let l_type = match inst.loader_type {
        crate::models::LoaderType::Fabric => "fabric",
        crate::models::LoaderType::Quilt => "quilt",
        crate::models::LoaderType::NeoForge => "neoforge",
        crate::models::LoaderType::Forge => "forge",
        crate::models::LoaderType::Vanilla => {
            return Err("Для установки пакета оптимизации требуется сборка Fabric, Quilt, NeoForge или Forge!".to_string())
        }
    };

    let opt_slugs = match l_type {
        "fabric" | "quilt" => vec![
            "fabric-api",
            "sodium",
            "lithium",
            "ferrite-core",
            "immediatelyfast",
            "entityculling",
            "modernfix",
        ],
        "neoforge" => vec![
            "sodium",
            "ferrite-core",
            "immediatelyfast",
            "entityculling",
            "modernfix",
        ],
        "forge" => vec![
            "embeddium",
            "ferrite-core",
            "entityculling",
            "modernfix",
        ],
        _ => vec!["sodium", "lithium", "ferrite-core"],
    };

    let mut installed_files = Vec::new();
    for slug in opt_slugs {
        match state
            .modrinth_service
            .install_project_with_dependencies(&mods_dir, slug, &g_version, l_type)
            .await
        {
            Ok(res) => {
                installed_files.push(res.filename);
            }
            Err(e) => {
                eprintln!("Could not auto-install {} for {}: {}", slug, g_version, e);
            }
        }
    }

    if installed_files.is_empty() {
        return Err("Не удалось загрузить моды оптимизации с Modrinth (проверьте подключение или используйте прокси/зеркало)".to_string());
    }

    Ok(installed_files)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UltraFpsBoostResult {
    pub success: bool,
    pub installed_mods: Vec<String>,
    pub memory_allocated_mb: u32,
    pub gc_preset: String,
    pub tweaks_applied: Vec<String>,
    pub message: String,
}

#[tauri::command]
pub async fn apply_ultra_fps_boost(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<UltraFpsBoostResult, String> {
    let mut inst = state.instance_manager.get_instance(&instance_id)?;
    let instance_path = state.instance_manager.instance_path(&instance_id);
    let mods_dir = instance_path.join("mods");
    let g_version = inst.game_version.clone();
    let l_type = match inst.loader_type {
        crate::models::LoaderType::Fabric => "fabric",
        crate::models::LoaderType::Quilt => "quilt",
        crate::models::LoaderType::NeoForge => "neoforge",
        crate::models::LoaderType::Forge => "forge",
        crate::models::LoaderType::Vanilla => {
            return Err("Для максимального FPS требуется загрузчик модов (Fabric, Quilt, NeoForge или Forge). Переключите сборку на Fabric в настройках!".to_string());
        }
    };

    let opt_slugs = match l_type {
        "fabric" | "quilt" => vec![
            "fabric-api",
            "sodium",
            "lithium",
            "ferrite-core",
            "immediatelyfast",
            "entityculling",
            "modernfix",
        ],
        "neoforge" => vec![
            "sodium",
            "ferrite-core",
            "immediatelyfast",
            "entityculling",
            "modernfix",
        ],
        "forge" => vec![
            "embeddium",
            "ferrite-core",
            "entityculling",
            "modernfix",
        ],
        _ => vec!["sodium", "lithium", "ferrite-core"],
    };

    // 1. Purge or disable conflicting mods in mods_dir
    let _ = std::fs::create_dir_all(&mods_dir);
    if let Ok(entries) = std::fs::read_dir(&mods_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let fname = entry.file_name().to_string_lossy().to_lowercase();
                if fname.ends_with(".jar") {
                    if fname.contains("optifine") {
                        let disabled_name = format!("{}.disabled", entry.file_name().to_string_lossy());
                        let _ = std::fs::rename(&path, mods_dir.join(disabled_name));
                    } else if l_type == "forge" && fname.contains("rubidium") {
                        let disabled_name = format!("{}.disabled", entry.file_name().to_string_lossy());
                        let _ = std::fs::rename(&path, mods_dir.join(disabled_name));
                    }
                }
            }
        }
    }

    // Read current existing mods to avoid downloading duplicates
    let existing_jars: Vec<String> = std::fs::read_dir(&mods_dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().is_file())
                .filter_map(|e| e.file_name().to_str().map(|s| s.to_lowercase()))
                .filter(|n| n.ends_with(".jar"))
                .collect()
        })
        .unwrap_or_default();

    let mut installed_mods = Vec::new();
    for slug in opt_slugs {
        let slug_clean = slug.replace('-', "");
        let already_present = existing_jars.iter().any(|j| {
            let j_clean = j.replace('-', "").replace('_', "");
            j_clean.contains(&slug_clean)
        });

        if already_present {
            continue;
        }

        match state
            .modrinth_service
            .install_project_with_dependencies(&mods_dir, slug, &g_version, l_type)
            .await
        {
            Ok(res) => {
                installed_mods.push(res.filename);
            }
            Err(e) => {
                eprintln!("FPS Boost: unable to install {} for {}: {}", slug, g_version, e);
            }
        }
    }

    // 2. High-performance GC preset & RAM tuning
    inst.gc_preset = "fps_boost".to_string();
    let specs = state.jvm_optimizer.get_system_specs();
    let optimal_ram = if specs.total_ram_mb >= 16384 {
        6144
    } else if specs.total_ram_mb >= 8192 {
        4096
    } else {
        2560
    };

    if inst.memory.max_mb < optimal_ram {
        inst.memory.max_mb = optimal_ram;
    }
    inst.memory.min_mb = 512.min(inst.memory.max_mb);

    state.instance_manager.update_instance(inst.clone())?;

    // 3. Auto-tune options.txt in root and .minecraft
    crate::services::launcher::auto_tune_options_for_max_fps(&instance_path);

    let mut tweaks_applied = vec![
        "Отключен VSync (разблокирована частота кадров)".to_string(),
        "Установлен лимит FPS 260+ (Unlimited)".to_string(),
        "Оптимизирована дистанция прорисовки (14) и симуляции (10)".to_string(),
        format!("Выделено {} МБ оперативной памяти", inst.memory.max_mb),
        "Применен низколатентный сборщик мусора 'fps_boost'".to_string(),
        "Активировано аппаратное ускорение GPU (DirectX High Performance & OpenGL Threaded)".to_string(),
    ];

    if !installed_mods.is_empty() {
        tweaks_applied.push(format!("Установлено {} оптимизационных модов", installed_mods.len()));
    }

    Ok(UltraFpsBoostResult {
        success: true,
        installed_mods,
        memory_allocated_mb: inst.memory.max_mb,
        gc_preset: inst.gc_preset,
        tweaks_applied,
        message: "⚡ Ультра-буст FPS успешно применен! Настройки графики и моды оптимизированы для 500+ FPS.".to_string(),
    })
}

#[tauri::command]
pub async fn search_minecraft_inside(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<MinecraftInsideSearchResult>, String> {
    state.minecraft_inside_service.search(&query).await
}

#[tauri::command]
pub async fn get_minecraft_inside_downloads(
    state: State<'_, AppState>,
    page_url: String,
) -> Result<Vec<MinecraftInsideDownloadItem>, String> {
    state.minecraft_inside_service.get_page_downloads(&page_url).await
}

fn extract_world_map_zip(zip_path: &std::path::Path, saves_dir: &std::path::Path) -> Result<String, String> {
    let file = std::fs::File::open(zip_path).map_err(|e| format!("Не удалось открыть архив: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Ошибка чтения zip архива: {}", e))?;

    // Search for level.dat to locate the world root inside the archive
    let mut level_dat_prefix: Option<String> = None;
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index(i) {
            let name = entry.name().replace('\\', "/");
            if name == "level.dat" {
                level_dat_prefix = Some(String::new());
                break;
            } else if name.ends_with("/level.dat") {
                let prefix = name[..name.len() - "level.dat".len()].to_string();
                level_dat_prefix = Some(prefix);
                break;
            }
        }
    }

    let raw_stem = zip_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("WorldMap");

    let world_name = if let Some(ref prefix) = level_dat_prefix {
        if prefix.is_empty() {
            raw_stem.to_string()
        } else {
            prefix
                .trim_matches('/')
                .split('/')
                .next_back()
                .unwrap_or(raw_stem)
                .to_string()
        }
    } else {
        raw_stem.to_string()
    };

    let target_world_dir = saves_dir.join(&world_name);
    std::fs::create_dir_all(&target_world_dir).map_err(|e| format!("Не удалось создать папку мира: {}", e))?;

    let prefix_to_strip = level_dat_prefix.unwrap_or_default();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_name = entry.name().replace('\\', "/");

        if !prefix_to_strip.is_empty() && !entry_name.starts_with(&prefix_to_strip) {
            continue;
        }

        let rel_path = if prefix_to_strip.is_empty() {
            &entry_name
        } else {
            &entry_name[prefix_to_strip.len()..]
        };

        if rel_path.is_empty() || rel_path.starts_with('/') {
            continue;
        }

        let outpath = target_world_dir.join(rel_path);

        // Security check against path traversal (Zip Slip)
        if !outpath.starts_with(&target_world_dir) {
            continue;
        }

        if entry.is_dir() {
            let _ = std::fs::create_dir_all(&outpath);
        } else {
            if let Some(parent) = outpath.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(mut outfile) = std::fs::File::create(&outpath) {
                let _ = std::io::copy(&mut entry, &mut outfile);
            }
        }
    }

    Ok(world_name)
}

#[tauri::command]
pub async fn install_minecraft_inside_file(
    state: State<'_, AppState>,
    instance_id: String,
    download_url: String,
    page_url: String,
    file_type: Option<String>,
) -> Result<String, String> {
    let instance_path = state.instance_manager.instance_path(&instance_id);

    let is_map = file_type.as_deref() == Some("map") || page_url.contains("/maps/");
    let subfolder = if is_map {
        "saves"
    } else if let Some(ft) = file_type.as_deref() {
        match ft {
            "datapack" => "datapacks",
            "resourcepack" => "resourcepacks",
            "shader" => "shaderpacks",
            _ => "mods",
        }
    } else if page_url.contains("/datapacks/") {
        "datapacks"
    } else if page_url.contains("/resource-packs/") {
        "resourcepacks"
    } else if page_url.contains("/shaders/") {
        "shaderpacks"
    } else {
        "mods"
    };

    let target_dir = instance_path.join(subfolder);
    let downloaded_filename = state
        .minecraft_inside_service
        .download_file(&download_url, &page_url, &target_dir)
        .await?;

    if is_map && downloaded_filename.to_lowercase().ends_with(".zip") {
        let zip_path = target_dir.join(&downloaded_filename);
        let extract_result = extract_world_map_zip(&zip_path, &target_dir);
        let _ = std::fs::remove_file(&zip_path); // Remove temp zip archive after extracting world
        match extract_result {
            Ok(world_name) => {
                return Ok(format!("Карта «{}» распакована в одиночную игру!", world_name));
            }
            Err(e) => {
                return Err(format!("Карта скачана ({}), но ошибка распаковки: {}", downloaded_filename, e));
            }
        }
    }

    Ok(downloaded_filename)
}

#[tauri::command]
pub async fn get_instance_mods_detailed(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<ModInfo>, String> {
    let mods_dir = state.instance_manager.instance_path(&id).join("mods");
    Ok(state.modrinth_service.get_instance_mods_detailed(&mods_dir))
}

#[tauri::command]
pub async fn toggle_mod(
    state: State<'_, AppState>,
    id: String,
    filename: String,
) -> Result<bool, String> {
    let mods_dir = state.instance_manager.instance_path(&id).join("mods");
    state.modrinth_service.toggle_mod(&mods_dir, &filename)
}

#[tauri::command]
pub async fn delete_mod(
    state: State<'_, AppState>,
    id: String,
    filename: String,
) -> Result<(), String> {
    let mods_dir = state.instance_manager.instance_path(&id).join("mods");
    state.modrinth_service.delete_mod(&mods_dir, &filename)
}

#[tauri::command]
pub async fn save_mod_bytes(
    state: State<'_, AppState>,
    id: String,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let mods_dir = state.instance_manager.instance_path(&id).join("mods");
    let _ = std::fs::create_dir_all(&mods_dir);
    let clean_name = std::path::Path::new(&filename)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or(filename);
    let dest = mods_dir.join(&clean_name);
    std::fs::write(&dest, bytes).map_err(|e| format!("Не удалось сохранить файл мода: {}", e))?;
    Ok(clean_name)
}

#[tauri::command]
pub async fn create_elyby_account(
    state: State<'_, AppState>,
    username: String,
    token: Option<String>,
) -> Result<Account, String> {
    let username = username.trim();
    if username.is_empty() {
        return Err("Имя пользователя Ely.by не может быть пустым".to_string());
    }

    let account = state.elyby_service.create_account(username);
    state
        .keyring_service
        .save_account(account.clone(), token.as_deref())?;

    Ok(account)
}

#[tauri::command]
pub async fn ai_parse_and_resolve_mods(
    state: State<'_, AppState>,
    text: String,
    game_version: String,
    loader: String,
) -> Result<Vec<crate::models::AiModResolvedItem>, String> {
    let queries = state.ai_mod_service.parse_input(&text);
    if queries.is_empty() {
        return Ok(Vec::new());
    }
    Ok(state.ai_mod_service.resolve_mods(queries, &game_version, &loader).await)
}

#[tauri::command]
pub async fn ai_batch_install_mods(
    app: AppHandle,
    state: State<'_, AppState>,
    instance_id: String,
    project_ids: Vec<String>,
    game_version: String,
    loader: String,
) -> Result<Vec<crate::models::InstallModResult>, String> {
    state.ai_mod_service.batch_install_mods(&app, &instance_id, project_ids, &game_version, &loader).await
}

#[tauri::command]
pub async fn ai_create_instance_and_install(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    game_version: String,
    loader: String,
    loader_version: Option<String>,
    project_ids: Vec<String>,
) -> Result<crate::models::InstanceConfig, String> {
    let loader_type = match loader.to_lowercase().as_str() {
        "fabric" => crate::models::LoaderType::Fabric,
        "forge" => crate::models::LoaderType::Forge,
        "neoforge" => crate::models::LoaderType::NeoForge,
        "quilt" => crate::models::LoaderType::Quilt,
        _ => crate::models::LoaderType::Vanilla,
    };
    state
        .ai_mod_service
        .create_instance_and_install_mods(&app, name, game_version, loader_type, loader_version, project_ids)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_extract_world_map_zip() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_map_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let saves_dir = temp_dir.join("saves");
        std::fs::create_dir_all(&saves_dir).unwrap();
        let zip_file_path = temp_dir.join("my_cool_map.zip");

        // Create a test zip with "Parkour Island/level.dat" and "Parkour Island/region/r.0.0.mca"
        {
            let file = std::fs::File::create(&zip_file_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            zip.start_file("Parkour Island/level.dat", options).unwrap();
            zip.write_all(b"dummy_level_data").unwrap();
            zip.start_file("Parkour Island/region/r.0.0.mca", options).unwrap();
            zip.write_all(b"dummy_region_data").unwrap();
            zip.finish().unwrap();
        }

        let world_name = extract_world_map_zip(&zip_file_path, &saves_dir).unwrap();
        assert_eq!(world_name, "Parkour Island");
        assert!(saves_dir.join("Parkour Island").join("level.dat").exists());
        assert!(saves_dir.join("Parkour Island").join("region").join("r.0.0.mca").exists());

        // Clean up
        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}


