use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tokio::sync::Mutex;
use tracing::{info, warn};

pub const DEFAULT_DISCORD_CLIENT_ID: &str = "1553111139443937300";
pub const DISCORD_PUBLIC_KEY: &str = "7ee219aa49a112235e701015f47229f50e79e4987995bc859fdb4eef715209f8";

pub struct DiscordService {
    client: Arc<Mutex<Option<DiscordIpcClient>>>,
    client_id: Arc<Mutex<String>>,
    enabled: Arc<Mutex<bool>>,
    start_timestamp: i64,
}

impl DiscordService {
    pub fn new(custom_client_id: Option<String>) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let client_id = custom_client_id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_DISCORD_CLIENT_ID.to_string());

        Self {
            client: Arc::new(Mutex::new(None)),
            client_id: Arc::new(Mutex::new(client_id)),
            enabled: Arc::new(Mutex::new(true)),
            start_timestamp: now,
        }
    }

    /// Check if Discord RPC is enabled
    pub async fn is_enabled(&self) -> bool {
        *self.enabled.lock().await
    }

    /// Toggle Discord RPC
    pub async fn set_enabled(&self, is_enabled: bool) -> Result<(), String> {
        let mut en = self.enabled.lock().await;
        *en = is_enabled;
        if !is_enabled {
            let _ = self.clear_activity().await;
        } else {
            let _ = self.set_idle().await;
        }
        Ok(())
    }

    /// Check if currently connected to Discord IPC
    pub async fn is_connected(&self) -> bool {
        self.client.lock().await.is_some()
    }

    /// Try connecting to Discord IPC client
    pub async fn connect(&self) -> Result<(), String> {
        if !self.is_enabled().await {
            return Ok(());
        }

        let mut client_lock = self.client.lock().await;
        if client_lock.is_some() {
            return Ok(());
        }

        let cid = self.client_id.lock().await.clone();
        let mut ipc = DiscordIpcClient::new(&cid);
        match ipc.connect() {
            Ok(_) => {
                info!("Успешное подключение к Discord Rich Presence (App ID: {})!", cid);
                *client_lock = Some(ipc);
                Ok(())
            }
            Err(e) => {
                warn!("Discord IPC недоступен (Discord закрыт или не запущен): {}", e);
                Err(format!("Discord IPC connect error: {}", e))
            }
        }
    }

    /// Set idle presence in launcher
    pub async fn set_idle(&self) -> Result<(), String> {
        self.set_activity(
            "FRZlauncher Next-Gen",
            "В главном меню",
            Some(self.start_timestamp),
        ).await
    }

    /// Set browsing mods presence
    pub async fn set_browsing_mods(&self) -> Result<(), String> {
        self.set_activity(
            "FRZlauncher Next-Gen",
            "Выбирает моды и шейдеры",
            Some(self.start_timestamp),
        ).await
    }

    /// Set browsing modpacks presence
    pub async fn set_browsing_modpacks(&self) -> Result<(), String> {
        self.set_activity(
            "FRZlauncher Next-Gen",
            "Изучает каталог готовых сборок",
            Some(self.start_timestamp),
        ).await
    }

    /// Set launching presence
    pub async fn set_launching(&self, instance_name: &str, mc_version: &str) -> Result<(), String> {
        self.set_activity(
            &format!("Запуск: {}", instance_name),
            &format!("Minecraft {}", mc_version),
            Some(self.start_timestamp),
        ).await
    }

    /// Set in-game presence
    pub async fn set_in_game(&self, instance_name: &str, mc_version: &str) -> Result<(), String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        self.set_activity(
            &format!("В игре: {}", instance_name),
            &format!("Minecraft {}", mc_version),
            Some(now),
        ).await
    }

    /// Generic update presence
    pub async fn set_activity(
        &self,
        details: &str,
        state: &str,
        start_time: Option<i64>,
    ) -> Result<(), String> {
        if !self.is_enabled().await {
            return Ok(());
        }

        let mut client_lock = self.client.lock().await;
        if client_lock.is_none() {
            // Attempt to connect if not yet connected
            let cid = self.client_id.lock().await.clone();
            let mut ipc = DiscordIpcClient::new(&cid);
            if ipc.connect().is_ok() {
                *client_lock = Some(ipc);
            }
        }

        if let Some(client) = client_lock.as_mut() {
            let mut act = activity::Activity::new()
                .state(state)
                .details(details);

            if let Some(st) = start_time {
                act = act.timestamps(activity::Timestamps::new().start(st));
            }

            act = act.assets(
                activity::Assets::new()
                    .large_image("minecraft")
                    .large_text("FRZlauncher @FRzher")
                    .small_image("grass")
                    .small_text("Канал @FRzher"),
            );

            let buttons = vec![
                activity::Button::new("Канал @FRzher", "https://www.youtube.com/@FRzher"),
                activity::Button::new("Скачать лаунчер", "https://www.youtube.com/@FRzher"),
            ];
            act = act.buttons(buttons);

            if let Err(e) = client.set_activity(act) {
                // If setting activity failed, socket might be broken: clear client so next call reconnects
                warn!("Ошибка отправки Discord Rich Presence: {}", e);
                *client_lock = None;
            }
            Ok(())
        } else {
            // Discord is not running, silently ignore
            Ok(())
        }
    }

    /// Clear presence
    pub async fn clear_activity(&self) -> Result<(), String> {
        let mut client_lock = self.client.lock().await;
        if let Some(client) = client_lock.as_mut() {
            let _ = client.clear_activity();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_discord_connect() {
        let service = DiscordService::new(None);
        let res = service.connect().await;
        println!("Connect result: {:?}", res);
        let res2 = service.set_idle().await;
        println!("Set idle result: {:?}", res2);
    }
}
