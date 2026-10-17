use tauri::State;
use crate::models::{CreateInstanceRequest, InstanceConfig, InstanceSummary};
use crate::AppState;

#[tauri::command]
pub async fn create_instance(
    state: State<'_, AppState>,
    req: CreateInstanceRequest,
) -> Result<InstanceConfig, String> {
    state.instance_manager.create_instance(req)
}

#[tauri::command]
pub async fn get_instances(state: State<'_, AppState>) -> Result<Vec<InstanceSummary>, String> {
    state.instance_manager.get_instances()
}

#[tauri::command]
pub async fn get_instance(
    state: State<'_, AppState>,
    id: String,
) -> Result<InstanceConfig, String> {
    state.instance_manager.get_instance(&id)
}

#[tauri::command]
pub async fn update_instance(
    state: State<'_, AppState>,
    config: InstanceConfig,
) -> Result<InstanceConfig, String> {
    state.instance_manager.update_instance(config)
}

#[tauri::command]
pub async fn delete_instance(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.instance_manager.delete_instance(&id)
}

#[tauri::command]
pub async fn clone_instance(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> Result<InstanceConfig, String> {
    state.instance_manager.clone_instance(&id, &new_name)
}

#[tauri::command]
pub async fn open_instance_folder(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let path = state.instance_manager.instance_path(&id);
    if path.exists() {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
