use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Friend {
    pub id: String,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(default)]
    pub favorite: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<i64>,
    pub status: String, // "online" | "in_game" | "offline"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddFriendRequest {
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFriendRequest {
    pub id: String,
    pub nickname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub favorite: bool,
    pub status: String,
}
