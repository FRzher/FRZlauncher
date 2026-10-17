use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemSpecs {
    pub cpu_cores: usize,
    pub cpu_brand: String,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub os_name: String,
    pub os_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub vendor: String,
    pub is_64_bit: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkSettings {
    #[serde(default = "default_proxy_type")]
    pub proxy_type: String, // "none", "http", "socks5"
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub modrinth_api_mirror: Option<String>,
    #[serde(default)]
    pub modrinth_cdn_mirror: Option<String>,
    #[serde(default = "default_true")]
    pub auto_fallback_ru: bool,
    #[serde(default)]
    pub bypass_ssl_verify: bool,
}

fn default_proxy_type() -> String {
    "none".to_string()
}

fn default_true() -> bool {
    true
}

impl Default for NetworkSettings {
    fn default() -> Self {
        Self {
            proxy_type: "none".to_string(),
            proxy_url: None,
            modrinth_api_mirror: None,
            modrinth_cdn_mirror: None,
            auto_fallback_ru: true,
            bypass_ssl_verify: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub latency_ms: Option<u64>,
    pub status_code: Option<u16>,
    pub message: String,
}
