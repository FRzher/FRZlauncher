use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::models::Friend;

#[derive(Clone)]
pub struct FriendService {
    base_dir: PathBuf,
    cache: Arc<RwLock<Vec<Friend>>>,
}

impl FriendService {
    pub fn new(base_dir: PathBuf) -> Self {
        let file_path = base_dir.join("friends.json");
        let initial_friends = if file_path.exists() {
            if let Ok(content) = fs::read_to_string(&file_path) {
                serde_json::from_str::<Vec<Friend>>(&content).unwrap_or_default()
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };

        Self {
            base_dir,
            cache: Arc::new(RwLock::new(initial_friends)),
        }
    }

    pub fn friends_file_path(&self) -> PathBuf {
        self.base_dir.join("friends.json")
    }

    async fn persist(&self, friends: &[Friend]) -> Result<(), String> {
        let file_path = self.friends_file_path();
        if let Some(parent) = file_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(friends).map_err(|e| e.to_string())?;
        fs::write(file_path, json).map_err(|e| e.to_string())
    }

    pub async fn get_friends(&self) -> Vec<Friend> {
        let cache = self.cache.read().await;
        let mut list = cache.clone();
        // Sort: favorites first, then alphabetically by nickname
        list.sort_by(|a, b| {
            b.favorite
                .cmp(&a.favorite)
                .then_with(|| a.nickname.to_lowercase().cmp(&b.nickname.to_lowercase()))
        });
        list
    }

    pub async fn add_friend(&self, nickname: String, note: Option<String>) -> Result<Friend, String> {
        let clean_nick = nickname.trim();
        if clean_nick.is_empty() {
            return Err("Никнейм не может быть пустым".to_string());
        }
        if clean_nick.len() < 2 || clean_nick.len() > 32 {
            return Err("Никнейм должен содержать от 2 до 32 символов".to_string());
        }

        // Validate characters: standard Minecraft nicknames allow alphanumeric and underscores
        if !clean_nick.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err("Никнейм может содержать только буквы, цифры и символ подчеркивания (_) ".to_string());
        }

        let mut cache = self.cache.write().await;
        if cache.iter().any(|f| f.nickname.eq_ignore_ascii_case(clean_nick)) {
            return Err(format!("Игрок с никнеймом «{}» уже добавлен в друзья", clean_nick));
        }

        let now = chrono::Utc::now().timestamp_millis();
        let friend = Friend {
            id: Uuid::new_v4().to_string(),
            nickname: clean_nick.to_string(),
            note: note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty()),
            favorite: false,
            created_at: now,
            last_seen: Some(now),
            status: "online".to_string(),
            current_server: None,
            avatar_url: Some(format!("https://minotar.net/helm/{}/100.png", clean_nick)),
        };

        cache.push(friend.clone());
        self.persist(&cache).await?;
        Ok(friend)
    }

    pub async fn remove_friend(&self, id: &str) -> Result<(), String> {
        let mut cache = self.cache.write().await;
        let original_len = cache.len();
        cache.retain(|f| f.id != id && !f.nickname.eq_ignore_ascii_case(id));
        if cache.len() == original_len {
            return Err("Друг не найден".to_string());
        }
        self.persist(&cache).await?;
        Ok(())
    }

    pub async fn update_friend(&self, updated: Friend) -> Result<Friend, String> {
        let mut cache = self.cache.write().await;
        if let Some(item) = cache.iter_mut().find(|f| f.id == updated.id) {
            item.nickname = updated.nickname;
            item.note = updated.note;
            item.favorite = updated.favorite;
            item.status = updated.status;
            item.current_server = updated.current_server;
            item.avatar_url = Some(format!("https://minotar.net/helm/{}/100.png", item.nickname));
            let res = item.clone();
            self.persist(&cache).await?;
            Ok(res)
        } else {
            Err("Друг не найден".to_string())
        }
    }

    pub async fn toggle_favorite(&self, id: &str) -> Result<bool, String> {
        let mut cache = self.cache.write().await;
        if let Some(item) = cache.iter_mut().find(|f| f.id == id || f.nickname.eq_ignore_ascii_case(id)) {
            item.favorite = !item.favorite;
            let val = item.favorite;
            self.persist(&cache).await?;
            Ok(val)
        } else {
            Err("Друг не найден".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_friend_crud_and_sorting() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_friends_{}", Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let service = FriendService::new(temp_dir.clone());

        // Add friends
        let f1 = service.add_friend("Steve".to_string(), Some("Best miner".to_string())).await.unwrap();
        let f2 = service.add_friend("Alex".to_string(), None).await.unwrap();
        assert_eq!(f1.nickname, "Steve");
        assert_eq!(f2.nickname, "Alex");

        // Duplicate check
        let dup = service.add_friend("steve".to_string(), None).await;
        assert!(dup.is_err(), "Duplicate nickname must be rejected");

        // Toggle favorite
        service.toggle_favorite(&f2.id).await.unwrap();
        let list = service.get_friends().await;
        assert_eq!(list.len(), 2);
        // Alex is favorite, so Alex must be first
        assert_eq!(list[0].nickname, "Alex");
        assert!(list[0].favorite);

        // Remove Steve
        service.remove_friend(&f1.id).await.unwrap();
        let list_after = service.get_friends().await;
        assert_eq!(list_after.len(), 1);
        assert_eq!(list_after[0].nickname, "Alex");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
