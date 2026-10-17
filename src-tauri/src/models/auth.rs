use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthProvider {
    Offline,
    Microsoft,
    ElyBy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub username: String,
    pub provider: AuthProvider,
    pub uuid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skin_url: Option<String>,
    pub is_active: bool,
    pub created_at: i64,
}

impl Account {
    /// Generates an offline account with deterministic UUIDv3 according to the Minecraft specification
    pub fn new_offline(username: &str) -> Self {
        // Minecraft calculates offline UUID as UUIDv3 of "OfflinePlayer:" + username using the Nil UUID namespace
        let offline_seed = format!("OfflinePlayer:{}", username);
        let mc_uuid = Uuid::new_v3(&Uuid::nil(), offline_seed.as_bytes());
        let now = chrono::Utc::now().timestamp();

        Self {
            id: Uuid::new_v4().to_string(),
            username: username.to_string(),
            provider: AuthProvider::Offline,
            uuid: mc_uuid.to_string(),
            skin_url: None,
            is_active: true,
            created_at: now,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offline_uuid_deterministic() {
        let acc1 = Account::new_offline("Steve");
        let acc2 = Account::new_offline("Steve");
        assert_eq!(acc1.uuid, acc2.uuid);

        let acc_alex = Account::new_offline("Alex");
        assert_ne!(acc1.uuid, acc_alex.uuid);
    }
}
