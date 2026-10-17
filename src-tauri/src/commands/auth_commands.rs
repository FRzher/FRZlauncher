use tauri::State;
use crate::models::Account;
use crate::AppState;

#[tauri::command]
pub async fn create_offline_account(
    state: State<'_, AppState>,
    username: String,
) -> Result<Account, String> {
    let username = username.trim();
    if username.is_empty() {
        return Err("Username cannot be empty".to_string());
    }

    if username.len() < 3 || username.len() > 16 {
        return Err("Username must be between 3 and 16 characters".to_string());
    }

    let account = Account::new_offline(username);
    state.keyring_service.save_account(account.clone(), None)?;
    Ok(account)
}

#[tauri::command]
pub async fn get_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    state.keyring_service.get_accounts()
}

#[tauri::command]
pub async fn get_active_account(state: State<'_, AppState>) -> Result<Option<Account>, String> {
    state.keyring_service.get_active_account()
}

#[tauri::command]
pub async fn set_active_account(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.keyring_service.set_active_account(&id)
}

#[tauri::command]
pub async fn delete_account(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.keyring_service.delete_account(&id)
}

#[tauri::command]
pub async fn start_elyby_oauth(
    state: State<'_, AppState>,
    client_id: Option<String>,
) -> Result<Account, String> {
    let (account, token) = state.elyby_service.start_oauth_flow(client_id).await?;
    state.keyring_service.save_account(account.clone(), Some(&token))?;
    Ok(account)
}

#[tauri::command]
pub async fn login_elyby_credentials(
    state: State<'_, AppState>,
    identity: String,
    password: String,
) -> Result<Account, String> {
    let (account, token) = state.elyby_service.login_with_credentials(&identity, &password).await?;
    state.keyring_service.save_account(account.clone(), Some(&token))?;
    Ok(account)
}

#[tauri::command]
pub async fn start_microsoft_login(
    state: State<'_, AppState>,
) -> Result<crate::services::DeviceCodeResponse, String> {
    state.microsoft_service.start_device_code().await
}

#[tauri::command]
pub async fn poll_microsoft_login(
    state: State<'_, AppState>,
    device_code: String,
) -> Result<Account, String> {
    let (account, token) = state.microsoft_service.poll_device_code(&device_code).await?;
    state.keyring_service.save_account(account.clone(), Some(&token))?;
    Ok(account)
}
