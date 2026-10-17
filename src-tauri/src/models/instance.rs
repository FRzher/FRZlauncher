use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LoaderType {
    Vanilla,
    Fabric,
    NeoForge,
    Forge,
    Quilt,
}

impl Default for LoaderType {
    fn default() -> Self {
        LoaderType::Vanilla
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryConfig {
    pub min_mb: u32,
    pub max_mb: u32,
}

impl Default for MemoryConfig {
    fn default() -> Self {
        Self {
            min_mb: 2048,
            max_mb: 4096,
        }
    }
}

fn default_gc_preset() -> String {
    "fps_boost".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceConfig {
    pub id: String,
    pub name: String,
    #[serde(rename = "mcVersion", alias = "game_version")]
    pub game_version: String,
    #[serde(rename = "loader", alias = "loader_type")]
    pub loader_type: LoaderType,
    #[serde(rename = "loaderVersion", alias = "loader_version", skip_serializing_if = "Option::is_none")]
    pub loader_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub java_path: Option<String>,
    #[serde(default)]
    pub memory: MemoryConfig,
    #[serde(default)]
    pub custom_jvm_args: Vec<String>,
    #[serde(default = "default_gc_preset")]
    pub gc_preset: String,
    #[serde(rename = "created", alias = "created_at")]
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_played: Option<i64>,
    #[serde(default)]
    pub play_time_seconds: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstanceSummary {
    pub id: String,
    pub name: String,
    pub game_version: String,
    #[serde(rename = "mcVersion")]
    pub mc_version: String,
    pub loader_type: LoaderType,
    #[serde(rename = "loader")]
    pub loader: LoaderType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loader_version: Option<String>,
    #[serde(rename = "loaderVersion", skip_serializing_if = "Option::is_none")]
    pub loader_version_camel: Option<String>,
    #[serde(rename = "created")]
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub last_played: Option<i64>,
    pub play_time_seconds: u64,
    pub mod_count: usize,
    pub memory: MemoryConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInstanceRequest {
    pub name: String,
    #[serde(alias = "mcVersion")]
    pub game_version: String,
    #[serde(alias = "loader")]
    pub loader_type: LoaderType,
    #[serde(alias = "loaderVersion")]
    pub loader_version: Option<String>,
    pub icon: Option<String>,
    pub memory: Option<MemoryConfig>,
    pub gc_preset: Option<String>,
}
