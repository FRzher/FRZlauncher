use std::time::Duration;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::models::{Account, AuthProvider};

const MS_CLIENT_ID: &str = "00000000402b5328";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub user_code: String,
    pub device_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub struct MicrosoftAuthService {
    client: Client,
}

impl MicrosoftAuthService {
    pub fn new() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| Client::new()),
        }
    }

    pub async fn start_device_code(&self) -> Result<DeviceCodeResponse, String> {
        let resp = self.client
            .post("https://login.live.com/oauth20_connect.srf")
            .form(&[
                ("client_id", MS_CLIENT_ID),
                ("scope", "service::user.auth.xboxlive.com::MBI_SSL"),
                ("response_type", "device_code"),
            ])
            .send()
            .await
            .map_err(|e| format!("Ошибка подключения к Microsoft OAuth: {}", e))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("Ошибка получения кода Microsoft: {}", text));
        }

        let json: DeviceCodeResponse = resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга ответа Microsoft Device Code: {}", e))?;

        Ok(json)
    }

    pub async fn poll_device_code(&self, device_code: &str) -> Result<(Account, String), String> {
        let poll_interval = Duration::from_secs(5);
        let max_attempts = 60; // 5 minutes max

        let mut access_token = String::new();
        for _ in 0..max_attempts {
            tokio::time::sleep(poll_interval).await;

            let resp = self.client
                .post("https://login.live.com/oauth20_token.srf")
                .form(&[
                    ("client_id", MS_CLIENT_ID),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                    ("device_code", device_code),
                ])
                .send()
                .await
                .map_err(|e| format!("Ошибка опроса токена Microsoft: {}", e))?;

            let json: serde_json::Value = resp.json().await.unwrap_or_default();

            if let Some(token) = json["access_token"].as_str() {
                access_token = token.to_string();
                break;
            }

            if let Some(err) = json["error"].as_str() {
                if err == "authorization_pending" {
                    continue;
                } else if err == "authorization_declined" {
                    return Err("Авторизация отклонена пользователем".to_string());
                } else if err == "expired_token" {
                    return Err("Время действия кода авторизации истекло".to_string());
                } else {
                    let desc = json["error_description"].as_str().unwrap_or(err);
                    return Err(format!("Ошибка Microsoft: {}", desc));
                }
            }
        }

        if access_token.is_empty() {
            return Err("Время ожидания входа Microsoft истекло".to_string());
        }

        // 1. Authenticate with Xbox Live
        let xbl_resp = self.client
            .post("https://user.auth.xboxlive.com/user/authenticate")
            .json(&serde_json::json!({
                "Properties": {
                    "AuthMethod": "RPS",
                    "SiteName": "user.auth.xboxlive.com",
                    "RpsTicket": format!("d={}", access_token)
                },
                "RelyingParty": "http://auth.xboxlive.com",
                "TokenType": "JWT"
            }))
            .send()
            .await
            .map_err(|e| format!("Ошибка авторизации Xbox Live: {}", e))?;

        let xbl_json: serde_json::Value = xbl_resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга ответа Xbox Live: {}", e))?;

        let xbl_token = xbl_json["Token"]
            .as_str()
            .ok_or_else(|| "Не удалось получить токен Xbox Live".to_string())?;

        let user_hash = xbl_json["DisplayClaims"]["xui"][0]["uhs"]
            .as_str()
            .ok_or_else(|| "Не удалось получить user hash Xbox Live".to_string())?;

        // 2. Exchange for XSTS token
        let xsts_resp = self.client
            .post("https://xsts.auth.xboxlive.com/xsts/authorize")
            .json(&serde_json::json!({
                "Properties": {
                    "SandboxId": "RETAIL",
                    "UserTokens": [xbl_token]
                },
                "RelyingParty": "rp://api.minecraftservices.com/",
                "TokenType": "JWT"
            }))
            .send()
            .await
            .map_err(|e| format!("Ошибка авторизации XSTS: {}", e))?;

        let xsts_json: serde_json::Value = xsts_resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга ответа XSTS: {}", e))?;

        let xsts_token = xsts_json["Token"]
            .as_str()
            .ok_or_else(|| {
                let err_num = xsts_json["XErr"].as_u64().unwrap_or(0);
                match err_num {
                    2148916233 => "У этой учетной записи Microsoft нет профиля Xbox. Создайте его на xbox.com.".to_string(),
                    2148916238 => "Учетная запись несовершеннолетнего требует добавления в семью Xbox.".to_string(),
                    _ => "Не удалось получить токен XSTS".to_string(),
                }
            })?;

        // 3. Login to Minecraft
        let mc_resp = self.client
            .post("https://api.minecraftservices.com/authentication/login_with_xbox")
            .json(&serde_json::json!({
                "identityToken": format!("XBL3.0 x={};{}", user_hash, xsts_token)
            }))
            .send()
            .await
            .map_err(|e| format!("Ошибка авторизации Minecraft: {}", e))?;

        let mc_json: serde_json::Value = mc_resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга токена Minecraft: {}", e))?;

        let mc_token = mc_json["access_token"]
            .as_str()
            .ok_or_else(|| "Не удалось получить доступ к Minecraft Services".to_string())?
            .to_string();

        // 4. Fetch Minecraft Profile
        let profile_resp = self.client
            .get("https://api.minecraftservices.com/minecraft/profile")
            .bearer_auth(&mc_token)
            .send()
            .await
            .map_err(|e| format!("Ошибка запроса профиля Minecraft: {}", e))?;

        let profile_json: serde_json::Value = profile_resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга профиля Minecraft: {}", e))?;

        let username = profile_json["name"]
            .as_str()
            .ok_or_else(|| "У данного аккаунта Microsoft нет купленной лицензии Minecraft".to_string())?;

        let uuid = profile_json["id"]
            .as_str()
            .unwrap_or_default();

        let skin_url = profile_json["skins"][0]["url"]
            .as_str()
            .map(|s| s.to_string())
            .or_else(|| Some(format!("https://mc-heads.net/avatar/{}", username)));

        let account = Account {
            id: Uuid::new_v4().to_string(),
            username: username.to_string(),
            provider: AuthProvider::Microsoft,
            uuid: uuid.to_string(),
            skin_url,
            is_active: true,
            created_at: chrono::Utc::now().timestamp(),
        };

        Ok((account, mc_token))
    }
}
