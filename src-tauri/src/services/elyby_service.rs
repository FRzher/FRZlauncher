use std::path::{Path, PathBuf};
use std::sync::Arc;
use reqwest::Client;
use serde::Deserialize;
use uuid::Uuid;

use crate::models::{Account, AuthProvider};
use crate::services::{ChecksumType, Downloader};

pub const DEFAULT_ELY_CLIENT_ID: &str = "tlauncher";
pub const DEFAULT_ELY_CLIENT_SECRET: &str = "SbOVmJHBCjMV1NsewphGgA2SbyrVjN7IBcOte6b1HR7JGup2";
const AUTHLIB_METADATA_URL: &str = "https://authlib-injector.yushi.moe/artifact/latest.json";
const AUTHLIB_FALLBACK_DOWNLOAD_URL: &str =
    "https://authlib-injector.yushi.moe/artifact/56/authlib-injector-1.2.8.jar";

#[derive(Deserialize)]
struct AuthlibArtifact {
    download_url: String,
    checksums: Option<AuthlibChecksums>,
}

#[derive(Deserialize)]
struct AuthlibChecksums {
    sha256: Option<String>,
}

#[derive(Clone)]
pub struct ElyByService {
    client: Client,
    downloader: Arc<Downloader>,
}

impl ElyByService {
    pub fn new(downloader: Arc<Downloader>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self { client, downloader }
    }

    /// Get player skin avatar URL from Ely.by skin system
    pub fn get_skin_url(username: &str) -> String {
        format!("https://skin.ely.by/avatars/{}", username)
    }

    /// Create an Ely.by account structure
    pub fn create_account(&self, username: &str) -> Account {
        let now = chrono::Utc::now().timestamp();
        let offline_seed = format!("ElyBy:{}", username);
        let mc_uuid = Uuid::new_v3(&Uuid::nil(), offline_seed.as_bytes());

        Account {
            id: Uuid::new_v4().to_string(),
            username: username.to_string(),
            provider: AuthProvider::ElyBy,
            uuid: mc_uuid.to_string(),
            skin_url: Some(Self::get_skin_url(username)),
            is_active: true,
            created_at: now,
        }
    }

    /// Download and ensure authlib-injector.jar exists in libraries cache
    pub async fn ensure_authlib_injector(&self, libraries_dir: &Path) -> Result<PathBuf, String> {
        let dest = libraries_dir.join("authlib-injector.jar");
        if dest.exists() {
            return Ok(dest);
        }

        // Try to query latest artifact metadata
        let mut download_url = AUTHLIB_FALLBACK_DOWNLOAD_URL.to_string();
        let mut checksum = ChecksumType::None;

        if let Ok(resp) = self.client.get(AUTHLIB_METADATA_URL).send().await {
            if resp.status().is_success() {
                if let Ok(artifact) = resp.json::<AuthlibArtifact>().await {
                    download_url = artifact.download_url;
                    if let Some(cs) = artifact.checksums {
                        if let Some(sha256) = cs.sha256 {
                            checksum = ChecksumType::Sha256(sha256);
                        }
                    }
                }
            }
        }

        self.downloader
            .download_file(&download_url, &dest, checksum, Some("authlib_injector"), None)
            .await?;

        Ok(dest)
    }

    /// Start browser-based OAuth2 loopback authentication flow
    pub async fn start_oauth_flow(&self, client_id_opt: Option<String>) -> Result<(Account, String), String> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:28472")
            .await
            .map_err(|e| format!("Не удалось запустить локальный сервер авторизации (порт 28472 занят): {}", e))?;

        let client_id_str = client_id_opt.unwrap_or_else(|| DEFAULT_ELY_CLIENT_ID.to_string());
        let client_id = client_id_str.trim();
        let redirect_uri = "http://127.0.0.1:28472/";
        let auth_url = format!(
            "https://account.ely.by/oauth2/v1?client_id={}&response_type=code&redirect_uri={}&scope=account_info%20account_email%20minecraft_server_session&prompt=select_account",
            urlencoding::encode(client_id),
            urlencoding::encode(redirect_uri)
        );

        // Open default browser
        if let Err(e) = open::that(&auth_url) {
            tracing::warn!("Не удалось открыть браузер: {}", e);
        }

        // Await incoming callback with 120s timeout
        let code = tokio::select! {
            res = async {
                let (mut socket, _) = listener.accept().await.map_err(|e| e.to_string())?;
                let mut buf = [0u8; 4096];
                let n = socket.read(&mut buf).await.map_err(|e| e.to_string())?;
                let req = String::from_utf8_lossy(&buf[..n]);

                let mut code = None;
                for line in req.lines() {
                    if line.starts_with("GET ") {
                        if let Some(path) = line.split_whitespace().nth(1) {
                            if let Some(query) = path.split('?').nth(1) {
                                for pair in query.split('&') {
                                    let mut parts = pair.split('=');
                                    if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
                                        if k == "code" {
                                            code = Some(v.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                let html_page = "<!DOCTYPE html><html lang=\"ru\"><head><meta charset=\"UTF-8\"><meta http-equiv=\"refresh\" content=\"0;url=https://account.ely.by/oauth2/code/success?appName=FRZlauncher\"><title>FRZlauncher</title><style>body{background:#0b0d13;color:#f8fafc;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#111420;border:1px solid rgba(99,102,241,0.3);padding:40px 50px;border-radius:20px;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.6)}h1{color:#818cf8;margin:0 0 10px 0;font-size:24px}p{color:#94a3b8;margin:0;font-size:14px;line-height:1.6}</style></head><body><div class=\"card\"><h1>✓ Авторизация успешна!</h1><p>Вход через Ely.by подтвержден.<br>Перенаправление в профиль...</p></div><script>window.location.href = \"https://account.ely.by/oauth2/code/success?appName=FRZlauncher\";</script></body></html>";
                let http_response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html_page.len(),
                    html_page
                );

                let _ = socket.write_all(http_response.as_bytes()).await;
                let _ = socket.flush().await;

                code.ok_or_else(|| "Код авторизации не найден в ответе Ely.by".to_string())
            } => res?,
            _ = tokio::time::sleep(std::time::Duration::from_secs(120)) => {
                return Err("Время ожидания авторизации в браузере истекло (120 секунд)".to_string());
            }
        };

        // Exchange code for token
        let mut form_params = vec![
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri),
        ];
        if client_id == "tlauncher" {
            form_params.push(("client_secret", DEFAULT_ELY_CLIENT_SECRET));
        }

        let token_resp = self.client
            .post("https://account.ely.by/api/oauth2/v1/token")
            .form(&form_params)
            .send()
            .await
            .map_err(|e| format!("Ошибка запроса токена Ely.by: {}", e))?;

        let token_json: serde_json::Value = token_resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга токена Ely.by: {}", e))?;

        let access_token = token_json["access_token"]
            .as_str()
            .ok_or_else(|| {
                let desc = token_json["error_description"].as_str().unwrap_or("Неверный ответ сервера");
                format!("Ely.by OAuth ошибка: {}", desc)
            })?
            .to_string();

        // Fetch user info
        let user_resp = self.client
            .get("https://account.ely.by/api/account/v1/info")
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|e| format!("Ошибка запроса профиля Ely.by: {}", e))?;

        let user_json: serde_json::Value = user_resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга профиля Ely.by: {}", e))?;

        let username = user_json["username"]
            .as_str()
            .ok_or_else(|| "Имя пользователя не найдено в профиле Ely.by".to_string())?;

        let uuid = user_json["uuid"]
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                Uuid::new_v3(&Uuid::nil(), format!("ElyBy:{}", username).as_bytes()).to_string()
            });

        let now = chrono::Utc::now().timestamp();
        let account = Account {
            id: Uuid::new_v4().to_string(),
            username: username.to_string(),
            provider: AuthProvider::ElyBy,
            uuid,
            skin_url: Some(Self::get_skin_url(username)),
            is_active: true,
            created_at: now,
        };

        Ok((account, access_token))
    }

    /// Direct authentication via Ely.by Yggdrasil API (Username/Email + Password)
    pub async fn login_with_credentials(
        &self,
        username_or_email: &str,
        password: &str,
    ) -> Result<(Account, String), String> {
        let client_token = Uuid::new_v4().to_string();
        let payload = serde_json::json!({
            "username": username_or_email.trim(),
            "password": password,
            "clientToken": client_token,
            "requestUser": true,
        });

        let resp = self.client
            .post("https://authserver.ely.by/auth/authenticate")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Ошибка подключения к authserver.ely.by: {}", e))?;

        let json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Ошибка парсинга ответа authserver.ely.by: {}", e))?;

        if let Some(err_msg) = json["errorMessage"].as_str() {
            return Err(format!("Ошибка входа Ely.by: {}", err_msg));
        }

        let access_token = json["accessToken"]
            .as_str()
            .ok_or_else(|| "Не получен accessToken от Ely.by".to_string())?
            .to_string();

        let profile = &json["selectedProfile"];
        let username = profile["name"]
            .as_str()
            .ok_or_else(|| "Не получено имя пользователя от Ely.by".to_string())?;

        let uuid = profile["id"]
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                Uuid::new_v3(&Uuid::nil(), format!("ElyBy:{}", username).as_bytes()).to_string()
            });

        let now = chrono::Utc::now().timestamp();
        let account = Account {
            id: Uuid::new_v4().to_string(),
            username: username.to_string(),
            provider: AuthProvider::ElyBy,
            uuid,
            skin_url: Some(Self::get_skin_url(username)),
            is_active: true,
            created_at: now,
        };

        Ok((account, access_token))
    }
}
