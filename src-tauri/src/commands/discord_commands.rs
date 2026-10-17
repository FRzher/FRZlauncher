use serde::{Deserialize, Serialize};
use tauri::State;
use crate::AppState;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DiscordRpcStatus {
    pub enabled: bool,
    pub connected: bool,
}

#[tauri::command]
pub async fn set_discord_activity(
    state: State<'_, AppState>,
    details: String,
    state_text: String,
) -> Result<(), String> {
    state.discord_service.set_activity(&details, &state_text, None).await
}

#[tauri::command]
pub async fn set_discord_view(
    state: State<'_, AppState>,
    view: String,
) -> Result<(), String> {
    match view.as_str() {
        "mods" => state.discord_service.set_browsing_mods().await,
        "modpacks" => state.discord_service.set_browsing_modpacks().await,
        _ => state.discord_service.set_idle().await,
    }
}

#[tauri::command]
pub async fn toggle_discord_rpc(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    state.discord_service.set_enabled(enabled).await
}

#[tauri::command]
pub async fn get_discord_rpc_status(
    state: State<'_, AppState>,
) -> Result<DiscordRpcStatus, String> {
    let enabled = state.discord_service.is_enabled().await;
    let connected = state.discord_service.is_connected().await;
    Ok(DiscordRpcStatus { enabled, connected })
}
