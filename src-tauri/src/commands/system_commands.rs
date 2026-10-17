use tauri::State;
use crate::models::{ConnectionTestResult, MemoryConfig, NetworkSettings, SystemSpecs};
use crate::AppState;

#[tauri::command]
pub async fn get_system_specs(state: State<'_, AppState>) -> Result<SystemSpecs, String> {
    Ok(state.jvm_optimizer.get_system_specs())
}

#[tauri::command]
pub async fn recommend_memory(state: State<'_, AppState>) -> Result<MemoryConfig, String> {
    Ok(state.jvm_optimizer.recommend_memory())
}

#[tauri::command]
pub async fn get_jvm_args(
    state: State<'_, AppState>,
    memory: MemoryConfig,
    gc_preset: String,
    custom_args: Vec<String>,
) -> Result<Vec<String>, String> {
    state
        .jvm_optimizer
        .build_jvm_args(&memory, &gc_preset, &custom_args)
}

#[tauri::command]
pub async fn open_launcher_dir(state: State<'_, AppState>) -> Result<(), String> {
    open::that(state.instance_manager.base_dir()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clean_launcher_cache(state: State<'_, AppState>) -> Result<u64, String> {
    let cache_dir = state.instance_manager.cache_dir();
    let instances_dir = state.instance_manager.instances_dir();
    let mut freed_bytes: u64 = 0;

    fn clean_folder_contents(path: &std::path::Path) -> u64 {
        let mut freed = 0;
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Ok(meta) = p.metadata() {
                        freed += meta.len();
                    }
                    let _ = std::fs::remove_file(&p);
                } else if p.is_dir() {
                    freed += clean_folder_contents(&p);
                    let _ = std::fs::remove_dir_all(&p);
                }
            }
        }
        freed
    }

    // 1. Clean versions cache
    let versions_dir = cache_dir.join("versions");
    if versions_dir.exists() {
        freed_bytes += clean_folder_contents(&versions_dir);
    }

    // 2. Clean temporary files in cache root (.tmp, .temp, .zip, .part)
    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if name.ends_with(".tmp") || name.ends_with(".temp") || name.ends_with(".part") || name.ends_with(".zip") {
                    if let Ok(meta) = p.metadata() {
                        freed_bytes += meta.len();
                    }
                    let _ = std::fs::remove_file(&p);
                }
            }
        }
    }

    // 3. Clean instance logs and crash reports
    if let Ok(instances) = std::fs::read_dir(&instances_dir) {
        for inst in instances.flatten() {
            let inst_path = inst.path();
            if inst_path.is_dir() {
                let logs_dir = inst_path.join("logs");
                if logs_dir.exists() {
                    freed_bytes += clean_folder_contents(&logs_dir);
                }
                let crashes_dir = inst_path.join("crash-reports");
                if crashes_dir.exists() {
                    freed_bytes += clean_folder_contents(&crashes_dir);
                }
            }
        }
    }

    Ok(freed_bytes)
}

#[tauri::command]
pub async fn get_network_settings(state: State<'_, AppState>) -> Result<NetworkSettings, String> {
    Ok(state.instance_manager.load_network_settings())
}

#[tauri::command]
pub async fn set_network_settings(
    state: State<'_, AppState>,
    settings: NetworkSettings,
) -> Result<NetworkSettings, String> {
    state.instance_manager.save_network_settings(&settings)?;
    state.downloader.update_network_settings(&settings).await;
    state.modrinth_service.update_network_settings(&settings).await;
    Ok(settings)
}

#[tauri::command]
pub async fn test_network_connection(
    state: State<'_, AppState>,
    url: String,
) -> Result<ConnectionTestResult, String> {
    let settings = state.instance_manager.load_network_settings();
    let start = std::time::Instant::now();
    let client = crate::services::Downloader::build_client(&settings);

    let target_url = if url.trim().is_empty() {
        "https://api.modrinth.com/v2".to_string()
    } else {
        url
    };

    match client.get(&target_url).send().await {
        Ok(resp) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let status = resp.status().as_u16();
            let is_success = resp.status().is_success() || status == 301 || status == 302 || status == 404;
            Ok(ConnectionTestResult {
                success: is_success,
                latency_ms: Some(latency_ms),
                status_code: Some(status),
                message: if is_success {
                    format!("Соединение успешно! Задержка {} мс (HTTP {})", latency_ms, status)
                } else {
                    format!("Сервер вернул статус HTTP {}", status)
                },
            })
        }
        Err(e) => Ok(ConnectionTestResult {
            success: false,
            latency_ms: None,
            status_code: None,
            message: format!("Ошибка соединения: {}", e),
        }),
    }
}
