use tauri::State;
use crate::models::{AddFriendRequest, Friend, UpdateFriendRequest};
use crate::AppState;

#[tauri::command]
pub async fn get_friends(state: State<'_, AppState>) -> Result<Vec<Friend>, String> {
    Ok(state.friend_service.get_friends().await)
}

#[tauri::command]
pub async fn add_friend(
    state: State<'_, AppState>,
    req: AddFriendRequest,
) -> Result<Friend, String> {
    state.friend_service.add_friend(req.nickname, req.note).await
}

#[tauri::command]
pub async fn remove_friend(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.friend_service.remove_friend(&id).await
}

#[tauri::command]
pub async fn update_friend(
    state: State<'_, AppState>,
    req: UpdateFriendRequest,
) -> Result<Friend, String> {
    let friend = Friend {
        id: req.id,
        nickname: req.nickname,
        note: req.note,
        favorite: req.favorite,
        created_at: chrono::Utc::now().timestamp_millis(),
        last_seen: Some(chrono::Utc::now().timestamp_millis()),
        status: req.status,
        current_server: None,
        avatar_url: None,
    };
    state.friend_service.update_friend(friend).await
}

#[tauri::command]
pub async fn toggle_favorite_friend(
    state: State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    state.friend_service.toggle_favorite(&id).await
}
