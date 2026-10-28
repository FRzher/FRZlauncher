use tauri::State;
use crate::models::{AutoRepairResult, CrashDiagnosis};
use crate::AppState;

#[tauri::command]
pub async fn diagnose_crash(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<CrashDiagnosis, String> {
    let config = state.instance_manager.get_instance(&instance_id)?;
    let instance_dir = state.instance_manager.instance_path(&instance_id);

    Ok(state.crash_repair_service.analyze_crash(
        &instance_id,
        &instance_dir,
        Some(-1),
        &[],
        &config.game_version,
        &config.loader_type,
    ))
}

#[tauri::command]
pub async fn auto_repair_instance(
    state: State<'_, AppState>,
    instance_id: String,
) -> Result<AutoRepairResult, String> {
    state.crash_repair_service.repair_instance(&instance_id).await
}
