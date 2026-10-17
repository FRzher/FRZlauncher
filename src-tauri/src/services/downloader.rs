use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use sha1::{Digest as Sha1Digest, Sha1};
use sha2::Sha256;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub task_id: String,
    pub current_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f32,
    pub speed_bytes_per_sec: u64,
}

#[derive(Debug, Clone)]
pub enum ChecksumType {
    Sha1(String),
    Sha256(String),
    None,
}

#[derive(Clone)]
pub struct Downloader {
    client: Arc<RwLock<Client>>,
    cdn_mirror: Arc<RwLock<Option<String>>>,
}

impl Default for Downloader {
    fn default() -> Self {
        Self::new()
    }
}

impl Downloader {
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) FRZlauncher/1.0.0")
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(20))
            .pool_idle_timeout(Duration::from_secs(60))
            .pool_max_idle_per_host(10)
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client: Arc::new(RwLock::new(client)),
            cdn_mirror: Arc::new(RwLock::new(None)),
        }
    }

    pub fn with_settings(settings: &crate::models::NetworkSettings) -> Self {
        let client = Self::build_client(settings);
        Self {
            client: Arc::new(RwLock::new(client)),
            cdn_mirror: Arc::new(RwLock::new(settings.modrinth_cdn_mirror.clone())),
        }
    }

    pub fn build_client(settings: &crate::models::NetworkSettings) -> Client {
        let mut builder = Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) FRZlauncher/1.0.0")
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(20))
            .pool_idle_timeout(Duration::from_secs(60))
            .pool_max_idle_per_host(10);

        if settings.bypass_ssl_verify {
            builder = builder.danger_accept_invalid_certs(true);
        }

        if let Some(proxy_str) = &settings.proxy_url {
            let p = proxy_str.trim();
            if !p.is_empty() {
                let full_proxy = if !p.starts_with("http://") && !p.starts_with("https://") && !p.starts_with("socks5://") {
                    if settings.proxy_type == "socks5" {
                        format!("socks5://{}", p)
                    } else {
                        format!("http://{}", p)
                    }
                } else {
                    p.to_string()
                };

                if let Ok(proxy) = reqwest::Proxy::all(&full_proxy) {
                    builder = builder.proxy(proxy);
                }
            }
        }

        builder.build().unwrap_or_else(|_| Client::new())
    }

    pub async fn update_network_settings(&self, settings: &crate::models::NetworkSettings) {
        let new_client = Self::build_client(settings);
        let mut cl = self.client.write().await;
        *cl = new_client;
        let mut cdn = self.cdn_mirror.write().await;
        *cdn = settings.modrinth_cdn_mirror.clone();
    }

    /// Download a file with chunked streaming, retry logic, and SHA1/SHA256 verification
    pub async fn download_file(
        &self,
        url: &str,
        destination: &Path,
        checksum: ChecksumType,
        task_id: Option<&str>,
        app_handle: Option<&AppHandle>,
    ) -> Result<PathBuf, String> {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let temp_dest = destination.with_extension("download.part");
        let task_name = task_id.unwrap_or("default").to_string();

        let effective_url = {
            let mirror_guard = self.cdn_mirror.read().await;
            if let Some(mirror) = mirror_guard.as_ref() {
                let m = mirror.trim().trim_end_matches('/');
                if !m.is_empty() && url.starts_with("https://cdn.modrinth.com") {
                    url.replace("https://cdn.modrinth.com", m)
                } else {
                    url.to_string()
                }
            } else {
                url.to_string()
            }
        };

        let mut attempts = 0;
        const MAX_ATTEMPTS: u32 = 3;

        loop {
            attempts += 1;
            match self
                .download_attempt(&effective_url, &temp_dest, &checksum, &task_name, app_handle)
                .await
            {
                Ok(()) => {
                    // Move temp file to final destination
                    if destination.exists() {
                        let _ = fs::remove_file(destination);
                    }
                    fs::rename(&temp_dest, destination).map_err(|e| e.to_string())?;
                    return Ok(destination.to_path_buf());
                }
                Err(err) => {
                    if attempts >= MAX_ATTEMPTS {
                        let _ = fs::remove_file(&temp_dest);
                        return Err(format!(
                            "Failed to download '{}' after {} attempts: {}",
                            effective_url, MAX_ATTEMPTS, err
                        ));
                    }
                    tokio::time::sleep(Duration::from_millis(500 * (2u64.pow(attempts)))).await;
                }
            }
        }
    }

    async fn download_attempt(
        &self,
        url: &str,
        temp_dest: &Path,
        checksum: &ChecksumType,
        task_id: &str,
        app_handle: Option<&AppHandle>,
    ) -> Result<(), String> {
        let client = self.client.read().await.clone();
        let response = client
            .get(url)
            .send()
            .await
            .map_err(|e| format!("HTTP request error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Server returned error: {}", response.status()));
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut stream = response.bytes_stream();
        let mut file = File::create(temp_dest).map_err(|e| e.to_string())?;

        let mut downloaded_bytes: u64 = 0;
        let mut last_progress_time = std::time::Instant::now();
        let mut bytes_since_last_progress: u64 = 0;

        let mut sha1_hasher = Sha1::new();
        let mut sha256_hasher = Sha256::new();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Error receiving chunk: {}", e))?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;

            match checksum {
                ChecksumType::Sha1(_) => sha1_hasher.update(&chunk),
                ChecksumType::Sha256(_) => sha256_hasher.update(&chunk),
                ChecksumType::None => {}
            }

            downloaded_bytes += chunk.len() as u64;
            bytes_since_last_progress += chunk.len() as u64;

            let elapsed = last_progress_time.elapsed();
            if elapsed >= Duration::from_millis(150) {
                let speed = (bytes_since_last_progress as f64 / elapsed.as_secs_f64()) as u64;
                let percentage = if total_size > 0 {
                    (downloaded_bytes as f32 / total_size as f32) * 100.0
                } else {
                    0.0
                };

                if let Some(app) = app_handle {
                    let _ = app.emit(
                        "download-progress",
                        DownloadProgress {
                            task_id: task_id.to_string(),
                            current_bytes: downloaded_bytes,
                            total_bytes: total_size,
                            percentage,
                            speed_bytes_per_sec: speed,
                        },
                    );
                    let _ = app.emit(
                        "download-progress-granular",
                        crate::models::DownloadProgressPayload {
                            instance_id: task_id.to_string(),
                            stage: "Загрузка клиента (client.jar)".to_string(),
                            current_file: "client.jar".to_string(),
                            completed_items: 0,
                            total_items: 1,
                            downloaded_bytes,
                            total_bytes: total_size,
                            percentage,
                        },
                    );
                }

                last_progress_time = std::time::Instant::now();
                bytes_since_last_progress = 0;
            }
        }

        file.sync_all().map_err(|e| e.to_string())?;

        // Verify checksum
        match checksum {
            ChecksumType::Sha1(expected) => {
                let computed = hex::encode(sha1_hasher.finalize());
                if !computed.eq_ignore_ascii_case(expected) {
                    return Err(format!(
                        "SHA-1 mismatch! Expected '{}', computed '{}'",
                        expected, computed
                    ));
                }
            }
            ChecksumType::Sha256(expected) => {
                let computed = hex::encode(sha256_hasher.finalize());
                if !computed.eq_ignore_ascii_case(expected) {
                    return Err(format!(
                        "SHA-256 mismatch! Expected '{}', computed '{}'",
                        expected, computed
                    ));
                }
            }
            ChecksumType::None => {}
        }

        // Final progress event
        if let Some(app) = app_handle {
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    task_id: task_id.to_string(),
                    current_bytes: downloaded_bytes,
                    total_bytes: total_size,
                    percentage: 100.0,
                    speed_bytes_per_sec: 0,
                },
            );
        }

        Ok(())
    }
}
