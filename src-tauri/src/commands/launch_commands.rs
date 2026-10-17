use tauri::{AppHandle, State};
use crate::models::{FabricLoaderItem, JavaInstallation, VersionEntry};
use crate::AppState;

#[tauri::command]
pub async fn launch_instance(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    state.launcher.launch(app, &id).await
}

#[tauri::command]
pub async fn kill_active_game(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    state.launcher.kill_active_game(&app).await
}

#[tauri::command]
pub async fn kill_instance_process(
    state: State<'_, AppState>,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    state.launcher.kill_process(&app, &id).await
}

#[tauri::command]
pub async fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_mojang_versions(
    state: State<'_, AppState>,
) -> Result<Vec<VersionEntry>, String> {
    state.manifest_service.get_versions().await
}

#[tauri::command]
pub async fn get_fabric_versions(
    state: State<'_, AppState>,
    game_version: String,
) -> Result<Vec<FabricLoaderItem>, String> {
    state.manifest_service.get_fabric_loaders(&game_version).await
}

#[tauri::command]
pub async fn get_neoforge_versions(
    state: State<'_, AppState>,
    game_version: String,
) -> Result<Vec<String>, String> {
    state.manifest_service.get_neoforge_versions(&game_version).await
}

#[tauri::command]
pub async fn get_forge_versions(
    state: State<'_, AppState>,
    game_version: String,
) -> Result<Vec<String>, String> {
    state.manifest_service.get_forge_versions(&game_version).await
}

#[tauri::command]
pub async fn detect_installed_javas(
    state: State<'_, AppState>,
) -> Result<Vec<JavaInstallation>, String> {
    Ok(state.java_detector.detect_all())
}

#[tauri::command]
pub async fn get_instance_mods(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<String>, String> {
    let mods_dir = state.instance_manager.instance_path(&id).join("mods");
    if !mods_dir.exists() {
        return Ok(Vec::new());
    }

    let mut mods = Vec::new();
    if let Ok(entries) = std::fs::read_dir(mods_dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.ends_with(".jar") {
                        mods.push(name.to_string());
                    }
                }
            }
        }
    }
    mods.sort();
    Ok(mods)
}
