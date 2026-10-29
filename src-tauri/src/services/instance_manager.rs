use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use crate::models::{CreateInstanceRequest, InstanceConfig, InstanceSummary, NetworkSettings};

#[derive(Clone, Debug)]
pub struct InstanceManager {
    base_dir: PathBuf,
}

impl InstanceManager {
    pub fn new(base_dir: PathBuf) -> Self {
        let manager = Self { base_dir };
        manager.ensure_directories();
        manager
    }

    pub fn default_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("FRZlauncher")
    }

    pub fn base_dir(&self) -> PathBuf {
        self.base_dir.clone()
    }

    pub fn instances_dir(&self) -> PathBuf {
        self.base_dir.join("instances")
    }

    pub fn cache_dir(&self) -> PathBuf {
        self.base_dir.join("cache")
    }

    pub fn instance_path(&self, id: &str) -> PathBuf {
        self.instances_dir().join(id)
    }

    pub fn instance_config_path(&self, id: &str) -> PathBuf {
        self.instance_path(id).join("instance.json")
    }

    pub fn network_settings_path(&self) -> PathBuf {
        self.base_dir.join("network_settings.json")
    }

    pub fn load_network_settings(&self) -> NetworkSettings {
        let path = self.network_settings_path();
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(settings) = serde_json::from_str::<NetworkSettings>(&content) {
                    return settings;
                }
            }
        }
        NetworkSettings::default()
    }

    pub fn save_network_settings(&self, settings: &NetworkSettings) -> Result<(), String> {
        let path = self.network_settings_path();
        let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())
    }

    fn ensure_directories(&self) {
        let _ = fs::create_dir_all(self.instances_dir());
        let _ = fs::create_dir_all(self.cache_dir().join("libraries"));
        let _ = fs::create_dir_all(self.cache_dir().join("assets").join("objects"));
        let _ = fs::create_dir_all(self.cache_dir().join("assets").join("indexes"));
        let _ = fs::create_dir_all(self.cache_dir().join("versions"));
    }

    /// Create a new isolated instance with its dedicated directory structure
    pub fn create_instance(&self, req: CreateInstanceRequest) -> Result<InstanceConfig, String> {
        let full_uuid = Uuid::new_v4().to_string();
        let id = format!("{}-{}", &full_uuid[0..8], &full_uuid[9..13]);
        let instance_dir = self.instance_path(&id);

        if instance_dir.exists() {
            return Err("Instance directory already exists".to_string());
        }

        // Create isolated folder structure (MultiMC / Prism style)
        fs::create_dir_all(&instance_dir).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("mods")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("config")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("saves")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("resourcepacks")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("shaderpacks")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("logs")).map_err(|e| e.to_string())?;
        fs::create_dir_all(instance_dir.join("crash-reports")).map_err(|e| e.to_string())?;

        let now = chrono::Utc::now().timestamp();
        let config = InstanceConfig {
            id: id.clone(),
            name: req.name,
            game_version: req.game_version,
            loader_type: req.loader_type,
            loader_version: req.loader_version,
            icon: req.icon,
            java_path: None,
            memory: req.memory.unwrap_or_default(),
            custom_jvm_args: Vec::new(),
            gc_preset: req.gc_preset.unwrap_or_else(|| "aikar".to_string()),
            created_at: now,
            last_played: None,
            play_time_seconds: 0,
            notes: None,
        };

        self.save_instance_config(&config)?;
        Ok(config)
    }

    /// Atomic write of instance.json
    pub fn save_instance_config(&self, config: &InstanceConfig) -> Result<(), String> {
        let config_path = self.instance_config_path(&config.id);
        let temp_path = config_path.with_extension("json.tmp");

        let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;

        let mut file = File::create(&temp_path).map_err(|e| e.to_string())?;
        file.write_all(json.as_bytes()).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;

        fs::rename(temp_path, config_path).map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Read an instance config by ID
    pub fn get_instance(&self, id: &str) -> Result<InstanceConfig, String> {
        let config_path = self.instance_config_path(id);
        if !config_path.exists() {
            return Err(format!("Instance '{}' does not exist", id));
        }

        let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        let config: InstanceConfig = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(config)
    }

    /// List all instances with summary metadata
    pub fn get_instances(&self) -> Result<Vec<InstanceSummary>, String> {
        let dir = self.instances_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
        let mut summaries = Vec::new();

        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let config_file = entry.path().join("instance.json");
                if config_file.exists() {
                    if let Ok(content) = fs::read_to_string(&config_file) {
                        if let Ok(config) = serde_json::from_str::<InstanceConfig>(&content) {
                            let mod_count = self.count_mods(&config.id);
                            summaries.push(InstanceSummary {
                                id: config.id,
                                name: config.name,
                                game_version: config.game_version.clone(),
                                mc_version: config.game_version,
                                loader_type: config.loader_type.clone(),
                                loader: config.loader_type,
                                loader_version: config.loader_version.clone(),
                                loader_version_camel: config.loader_version,
                                icon: config.icon,
                                last_played: config.last_played,
                                play_time_seconds: config.play_time_seconds,
                                mod_count,
                                memory: config.memory,
                                created_at: config.created_at,
                            });
                        }
                    }
                }
            }
        }

        // Sort by last_played descending, then created_at
        summaries.sort_by(|a, b| b.last_played.cmp(&a.last_played));
        Ok(summaries)
    }

    /// Count enabled mods in an instance's mods folder
    pub fn count_mods(&self, id: &str) -> usize {
        let mods_dir = self.instance_path(id).join("mods");
        if !mods_dir.exists() {
            return 0;
        }

        fs::read_dir(mods_dir)
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|e| {
                        e.path().is_file()
                            && e.path()
                                .extension()
                                .and_then(|ext| ext.to_str())
                                .map(|ext| ext.eq_ignore_ascii_case("jar"))
                                .unwrap_or(false)
                    })
                    .count()
            })
            .unwrap_or(0)
    }

    /// Update instance configuration
    pub fn update_instance(&self, config: InstanceConfig) -> Result<InstanceConfig, String> {
        self.save_instance_config(&config)?;
        Ok(config)
    }

    /// Delete an instance and all its contents
    pub fn delete_instance(&self, id: &str) -> Result<(), String> {
        let path = self.instance_path(id);
        if path.exists() {
            fs::remove_dir_all(path).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Duplicate / clone an existing instance
    pub fn clone_instance(&self, source_id: &str, new_name: &str) -> Result<InstanceConfig, String> {
        let source_config = self.get_instance(source_id)?;
        let full_uuid = Uuid::new_v4().to_string();
        let new_id = format!("{}-{}", &full_uuid[0..8], &full_uuid[9..13]);
        let target_dir = self.instance_path(&new_id);

        fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
        
        // Copy standard directories
        let dirs_to_copy = ["mods", "config", "resourcepacks", "shaderpacks"];
        for d in &dirs_to_copy {
            let src = self.instance_path(source_id).join(d);
            let dst = target_dir.join(d);
            if src.exists() {
                copy_dir_recursive(&src, &dst).map_err(|e| e.to_string())?;
            } else {
                fs::create_dir_all(&dst).map_err(|e| e.to_string())?;
            }
        }
        
        fs::create_dir_all(target_dir.join("saves")).map_err(|e| e.to_string())?;
        fs::create_dir_all(target_dir.join("logs")).map_err(|e| e.to_string())?;
        fs::create_dir_all(target_dir.join("crash-reports")).map_err(|e| e.to_string())?;

        let now = chrono::Utc::now().timestamp();
        let mut new_config = source_config;
        new_config.id = new_id;
        new_config.name = new_name.to_string();
        new_config.created_at = now;
        new_config.last_played = None;
        new_config.play_time_seconds = 0;

        self.save_instance_config(&new_config)?;
        Ok(new_config)
    }

    /// Hardlink or copy file from shared cache to instance directory
    pub fn link_or_copy_file(source: &Path, target: &Path) -> Result<(), String> {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        // Remove existing target if any
        if target.exists() {
            let _ = fs::remove_file(target);
        }

        // Attempt hardlink first to save disk space
        if fs::hard_link(source, target).is_ok() {
            return Ok(());
        }

        // Fallback to standard file copy
        fs::copy(source, target)
            .map(|_| ())
            .map_err(|e| format!("Failed to copy file {:?} to {:?}: {}", source, target, e))
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{LoaderType, MemoryConfig};

    #[test]
    fn test_instance_creation_and_isolation() {
        let temp_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".temp")
            .join(format!("frz_test_{}", Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);
        let manager = InstanceManager::new(temp_dir.clone());

        let req = CreateInstanceRequest {
            name: "Test Fabric".to_string(),
            game_version: "1.21.1".to_string(),
            loader_type: LoaderType::Fabric,
            loader_version: Some("0.16.9".to_string()),
            icon: None,
            memory: Some(MemoryConfig {
                min_mb: 2048,
                max_mb: 4096,
            }),
            gc_preset: Some("aikar".to_string()),
        };

        let created = manager.create_instance(req).expect("Failed to create instance");
        assert_eq!(created.name, "Test Fabric");
        assert_eq!(created.loader_type, LoaderType::Fabric);

        // Verify isolated directory structure
        let inst_dir = manager.instance_path(&created.id);
        assert!(inst_dir.exists());
        assert!(inst_dir.join("instance.json").exists());
        assert!(inst_dir.join("mods").is_dir());
        assert!(inst_dir.join("config").is_dir());
        assert!(inst_dir.join("saves").is_dir());
        assert!(inst_dir.join("resourcepacks").is_dir());
        assert!(inst_dir.join("shaderpacks").is_dir());

        // Verify reading back
        let read_back = manager.get_instance(&created.id).expect("Failed to read instance");
        assert_eq!(read_back.id, created.id);
        assert_eq!(read_back.name, "Test Fabric");

        // Verify summary list
        let summaries = manager.get_instances().expect("Failed to get instances");
        assert!(summaries.iter().any(|s| s.id == created.id));

        // Clean up
        let _ = manager.delete_instance(&created.id);
        assert!(!inst_dir.exists());
        let _ = fs::remove_dir_all(temp_dir);
    }
}
