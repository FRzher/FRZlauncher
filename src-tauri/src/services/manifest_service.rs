use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use reqwest::Client;
use tokio::sync::RwLock;

use crate::models::{
    FabricLoaderItem, FabricProfile, ForgeProfile, Rule, VersionEntry, VersionManifest, VersionPackage,
};
use crate::services::Downloader;

const MOJANG_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META_URL: &str = "https://meta.fabricmc.net/v2/versions/loader";
const NEOFORGE_MAVEN_URL: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml";

#[derive(Clone)]
pub struct ManifestService {
    client: Client,
    _downloader: Arc<Downloader>,
    cache_dir: PathBuf,
    manifest_cache: Arc<RwLock<Option<VersionManifest>>>,
}

impl ManifestService {
    pub fn new(cache_dir: PathBuf, downloader: Arc<Downloader>) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            client,
            _downloader: downloader,
            cache_dir,
            manifest_cache: Arc::new(RwLock::new(None)),
        }
    }

    /// Fetch Mojang Version Manifest V2 with memory and disk caching
    pub async fn get_mojang_manifest(&self) -> Result<VersionManifest, String> {
        // 1. Check in-memory cache
        {
            let cache = self.manifest_cache.read().await;
            if let Some(ref m) = *cache {
                return Ok(m.clone());
            }
        }

        // 2. Try fetching from Mojang API
        let manifest_file = self.cache_dir.join("version_manifest_v2.json");
        match self.client.get(MOJANG_MANIFEST_URL).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(manifest) = resp.json::<VersionManifest>().await {
                    // Cache to disk
                    if let Ok(json) = serde_json::to_string(&manifest) {
                        let _ = fs::create_dir_all(&self.cache_dir);
                        let _ = fs::write(&manifest_file, json);
                    }
                    // Cache to memory
                    *self.manifest_cache.write().await = Some(manifest.clone());
                    return Ok(manifest);
                }
            }
            _ => {}
        }

        // 3. Fallback to cached disk copy
        if manifest_file.exists() {
            if let Ok(content) = fs::read_to_string(&manifest_file) {
                if let Ok(manifest) = serde_json::from_str::<VersionManifest>(&content) {
                    *self.manifest_cache.write().await = Some(manifest.clone());
                    return Ok(manifest);
                }
            }
        }

        Err("Failed to fetch Mojang version manifest and no cache available".to_string())
    }

    /// Get list of all versions from Mojang
    pub async fn get_versions(&self) -> Result<Vec<VersionEntry>, String> {
        let manifest = self.get_mojang_manifest().await?;
        Ok(manifest.versions)
    }

    /// Fetch version package metadata for a specific Minecraft version
    pub async fn get_version_package(&self, version_id: &str) -> Result<VersionPackage, String> {
        let package_cache = self
            .cache_dir
            .join("versions")
            .join(version_id)
            .join(format!("{}.json", version_id));

        if package_cache.exists() {
            if let Ok(content) = fs::read_to_string(&package_cache) {
                if let Ok(pkg) = serde_json::from_str::<VersionPackage>(&content) {
                    return Ok(pkg);
                }
            }
        }

        let manifest = self.get_mojang_manifest().await?;
        let entry = manifest
            .versions
            .iter()
            .find(|v| v.id == version_id)
            .ok_or_else(|| format!("Minecraft version '{}' not found in manifest", version_id))?;

        let resp = self
            .client
            .get(&entry.url)
            .send()
            .await
            .map_err(|e| format!("Failed to download version package: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Server returned {}", resp.status()));
        }

        let text = resp.text().await.map_err(|e| e.to_string())?;
        let pkg: VersionPackage = serde_json::from_str(&text).map_err(|e| e.to_string())?;

        // Save to cache
        if let Some(parent) = package_cache.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::write(package_cache, text);

        Ok(pkg)
    }

    /// Fetch available Fabric Loader versions for a specific Minecraft version
    pub async fn get_fabric_loaders(&self, game_version: &str) -> Result<Vec<FabricLoaderItem>, String> {
        let url = format!("{}/{}", FABRIC_META_URL, game_version);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Fabric loaders: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Fabric Meta returned status: {}", resp.status()));
        }

        let items: Vec<FabricLoaderItem> = resp.json().await.map_err(|e| e.to_string())?;
        Ok(items)
    }

    /// Fetch Fabric Profile JSON for launching
    pub async fn get_fabric_profile(
        &self,
        game_version: &str,
        loader_version: &str,
    ) -> Result<FabricProfile, String> {
        let url = format!("{}/{}/{}/profile/json", FABRIC_META_URL, game_version, loader_version);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch Fabric profile: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("Fabric profile returned status: {}", resp.status()));
        }

        let profile: FabricProfile = resp.json().await.map_err(|e| e.to_string())?;
        Ok(profile)
    }

    /// Fetch available NeoForge versions for a specific Minecraft version
    pub async fn get_neoforge_versions(&self, game_version: &str) -> Result<Vec<String>, String> {
        let resp = self
            .client
            .get(NEOFORGE_MAVEN_URL)
            .send()
            .await
            .map_err(|e| format!("Failed to fetch NeoForge versions: {}", e))?;

        let text = resp.text().await.map_err(|e| e.to_string())?;

        // Extract <version>...</version> tags matching game version
        let clean_mc = game_version.strip_prefix("1.").unwrap_or(game_version); // e.g. "21.1" or "20.4"
        let re = regex::Regex::new(r"<version>([^<]+)</version>").map_err(|e| e.to_string())?;

        let mut versions = Vec::new();
        for cap in re.captures_iter(&text) {
            if let Some(v) = cap.get(1) {
                let ver_str = v.as_str();
                if ver_str.starts_with(clean_mc) {
                    versions.push(ver_str.to_string());
                }
            }
        }

        versions.reverse(); // Newest first
        Ok(versions)
    }

    /// Fetch available Forge versions for a specific Minecraft version
    pub async fn get_forge_versions(&self, game_version: &str) -> Result<Vec<String>, String> {
        let bmcl_url = format!("https://bmclapi2.bangbang93.com/forge/minecraft/{}", game_version);
        if let Ok(resp) = self.client.get(&bmcl_url).send().await {
            if resp.status().is_success() {
                if let Ok(list) = resp.json::<Vec<serde_json::Value>>().await {
                    let versions: Vec<String> = list
                        .into_iter()
                        .filter_map(|item| item.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()))
                        .collect();
                    if !versions.is_empty() {
                        return Ok(versions);
                    }
                }
            }
        }

        // Fallback: Forge official promotions slim
        let promo_url = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
        if let Ok(resp) = self.client.get(promo_url).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    if let Some(promos) = json.get("promos").and_then(|p| p.as_object()) {
                        let mut versions = Vec::new();
                        let rec_key = format!("{}-recommended", game_version);
                        let lat_key = format!("{}-latest", game_version);

                        if let Some(lat) = promos.get(&lat_key).and_then(|v| v.as_str()) {
                            versions.push(lat.to_string());
                        }
                        if let Some(rec) = promos.get(&rec_key).and_then(|v| v.as_str()) {
                            if !versions.contains(&rec.to_string()) {
                                versions.push(rec.to_string());
                            }
                        }

                        if !versions.is_empty() {
                            return Ok(versions);
                        }
                    }
                }
            }
        }

        // Hardcoded fallbacks for standard versions
        let fallbacks = match game_version {
            "1.12.2" => vec!["14.23.5.2860".to_string(), "14.23.5.2859".to_string()],
            "1.7.10" => vec!["10.13.4.1614".to_string(), "10.13.4.1558".to_string()],
            "1.16.5" => vec!["36.2.39".to_string()],
            "1.18.2" => vec!["40.2.21".to_string()],
            "1.19.2" => vec!["43.4.13".to_string()],
            "1.20.1" => vec!["47.3.0".to_string(), "47.2.0".to_string()],
            _ => Vec::new(),
        };

        if !fallbacks.is_empty() {
            Ok(fallbacks)
        } else {
            Err(format!("Версии Forge для Minecraft {} не найдены", game_version))
        }
    }

    /// Fetch Forge Profile JSON for launching
    pub async fn get_forge_profile(
        &self,
        game_version: &str,
        loader_version: Option<&str>,
    ) -> Result<ForgeProfile, String> {
        let versions_dir = self.cache_dir.join("versions");
        let _ = fs::create_dir_all(&versions_dir);

        // 1. Resolve Forge version
        let forge_version = if let Some(v) = loader_version {
            if !v.trim().is_empty() {
                v.trim().to_string()
            } else {
                self.resolve_cached_or_remote_forge_ver(game_version, &versions_dir).await?
            }
        } else {
            self.resolve_cached_or_remote_forge_ver(game_version, &versions_dir).await?
        };

        // 2. Check if cached profile JSON exists
        let profile_path = versions_dir.join(format!("{}-forge-{}.json", game_version, forge_version));
        let nested_profile_path = versions_dir
            .join(format!("{}-forge-{}", game_version, forge_version))
            .join(format!("{}-forge-{}.json", game_version, forge_version));

        let candidate_path = if profile_path.exists() {
            Some(profile_path.clone())
        } else if nested_profile_path.exists() {
            Some(nested_profile_path)
        } else {
            None
        };

        if let Some(path) = candidate_path {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(profile) = serde_json::from_str::<ForgeProfile>(&content) {
                    return Ok(profile);
                }
            }
        }

        // 3. Download Forge installer jar and extract version.json & maven libraries
        let installer_url = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}-{}/forge-{}-{}-installer.jar",
            game_version, forge_version, game_version, forge_version
        );
        let bmcl_installer_url = format!(
            "https://bmclapi2.bangbang93.com/forge/download?mcversion={}&version={}&category=installer&format=jar",
            game_version, forge_version
        );

        let installer_bytes = match self.client.get(&installer_url).send().await {
            Ok(resp) if resp.status().is_success() => resp.bytes().await.map_err(|e| e.to_string())?,
            _ => {
                let resp = self
                    .client
                    .get(&bmcl_installer_url)
                    .send()
                    .await
                    .map_err(|e| format!("Не удалось скачать установщик Forge: {}", e))?;
                if !resp.status().is_success() {
                    return Err(format!("Forge installer returned HTTP {}", resp.status()));
                }
                resp.bytes().await.map_err(|e| e.to_string())?
            }
        };

        // 4. Open Zip and extract
        let reader = std::io::Cursor::new(installer_bytes);
        let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("Не удалось прочитать ZIP установщика Forge: {}", e))?;

        let mut version_json_content = String::new();
        let libraries_dir = self.cache_dir.join("libraries");

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();

            if name == "version.json" {
                use std::io::Read;
                let mut buf = String::new();
                let _ = file.read_to_string(&mut buf);
                version_json_content = buf;
            } else if let Some(stripped) = name.strip_prefix("maven/") {
                if !file.is_dir() && !stripped.is_empty() {
                    let dest = libraries_dir.join(stripped);
                    if let Some(p) = dest.parent() {
                        let _ = fs::create_dir_all(p);
                    }
                    if let Ok(mut out) = fs::File::create(&dest) {
                        let _ = std::io::copy(&mut file, &mut out);
                    }
                }
            }
        }

        if version_json_content.is_empty() {
            return Err("version.json не найден внутри установщика Forge".to_string());
        }

        let _ = fs::write(&profile_path, &version_json_content);
        let profile: ForgeProfile = serde_json::from_str(&version_json_content)
            .map_err(|e| format!("Ошибка парсинга Forge version.json: {}", e))?;

        Ok(profile)
    }

    async fn resolve_cached_or_remote_forge_ver(&self, game_version: &str, versions_dir: &Path) -> Result<String, String> {
        let prefix = format!("{}-forge-", game_version);
        if let Ok(entries) = fs::read_dir(versions_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(&prefix) && name.ends_with(".json") {
                    let v = name.trim_start_matches(&prefix).trim_end_matches(".json");
                    return Ok(v.to_string());
                }
            }
        }
        let versions = self.get_forge_versions(game_version).await?;
        versions.into_iter().next().ok_or_else(|| format!("Нет доступных версий Forge для {}", game_version))
    }

    /// Fetch NeoForge Profile for launching
    pub async fn get_neoforge_profile(
        &self,
        game_version: &str,
        loader_version: Option<&str>,
    ) -> Result<ForgeProfile, String> {
        let versions_dir = self.cache_dir.join("versions");
        let _ = fs::create_dir_all(&versions_dir);

        let neoforge_version = if let Some(v) = loader_version {
            if !v.trim().is_empty() {
                v.trim().to_string()
            } else {
                self.resolve_cached_or_remote_neoforge_ver(game_version, &versions_dir).await?
            }
        } else {
            self.resolve_cached_or_remote_neoforge_ver(game_version, &versions_dir).await?
        };

        let profile_path = versions_dir.join(format!("{}-neoforge-{}.json", game_version, neoforge_version));
        if profile_path.exists() {
            if let Ok(content) = fs::read_to_string(&profile_path) {
                if let Ok(profile) = serde_json::from_str::<ForgeProfile>(&content) {
                    return Ok(profile);
                }
            }
        }

        let installer_url = format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
            neoforge_version, neoforge_version
        );
        let bmcl_installer_url = format!(
            "https://bmclapi2.bangbang93.com/neoforge/version/{}/download/installer.jar",
            neoforge_version
        );

        let installer_bytes = match self.client.get(&installer_url).send().await {
            Ok(resp) if resp.status().is_success() => resp.bytes().await.map_err(|e| e.to_string())?,
            _ => {
                let resp = self
                    .client
                    .get(&bmcl_installer_url)
                    .send()
                    .await
                    .map_err(|e| format!("Не удалось скачать установщик NeoForge: {}", e))?;
                if !resp.status().is_success() {
                    return Err(format!("NeoForge installer returned HTTP {}", resp.status()));
                }
                resp.bytes().await.map_err(|e| e.to_string())?
            }
        };

        let reader = std::io::Cursor::new(installer_bytes);
        let mut archive = zip::ZipArchive::new(reader).map_err(|e| format!("Ошибка чтения ZIP установщика NeoForge: {}", e))?;

        let mut version_json_content = String::new();
        let libraries_dir = self.cache_dir.join("libraries");

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();

            if name == "version.json" {
                use std::io::Read;
                let mut buf = String::new();
                let _ = file.read_to_string(&mut buf);
                version_json_content = buf;
            } else if let Some(stripped) = name.strip_prefix("maven/") {
                if !file.is_dir() && !stripped.is_empty() {
                    let dest = libraries_dir.join(stripped);
                    if let Some(p) = dest.parent() {
                        let _ = fs::create_dir_all(p);
                    }
                    if let Ok(mut out) = fs::File::create(&dest) {
                        let _ = std::io::copy(&mut file, &mut out);
                    }
                }
            }
        }

        if version_json_content.is_empty() {
            return Err("version.json не найден внутри установщика NeoForge".to_string());
        }

        let _ = fs::write(&profile_path, &version_json_content);
        let profile: ForgeProfile = serde_json::from_str(&version_json_content)
            .map_err(|e| format!("Ошибка парсинга NeoForge version.json: {}", e))?;

        Ok(profile)
    }

    async fn resolve_cached_or_remote_neoforge_ver(&self, game_version: &str, versions_dir: &Path) -> Result<String, String> {
        let prefix = format!("{}-neoforge-", game_version);
        if let Ok(entries) = fs::read_dir(versions_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(&prefix) && name.ends_with(".json") {
                    let v = name.trim_start_matches(&prefix).trim_end_matches(".json");
                    return Ok(v.to_string());
                }
            }
        }
        let versions = self.get_neoforge_versions(game_version).await?;
        versions.into_iter().next().ok_or_else(|| format!("Нет доступных версий NeoForge для {}", game_version))
    }

    /// Fetch Quilt profile (with fallback to Fabric profile)
    pub async fn get_quilt_profile(
        &self,
        game_version: &str,
        loader_version: &str,
    ) -> Result<FabricProfile, String> {
        let url = format!("https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json", game_version, loader_version);
        if let Ok(resp) = self.client.get(&url).send().await {
            if resp.status().is_success() {
                if let Ok(profile) = resp.json::<FabricProfile>().await {
                    return Ok(profile);
                }
            }
        }
        // Fallback to Fabric
        self.get_fabric_profile(game_version, loader_version).await
    }

    /// Check if a library rule allows installation on Windows
    pub fn is_library_allowed_on_windows(rules: Option<&[Rule]>) -> bool {
        let rules = match rules {
            Some(r) => r,
            None => return true, // Allowed by default if no rules
        };

        let mut allowed = false;
        for rule in rules {
            let matches_os = match &rule.os {
                Some(os) => os.name.as_deref() == Some("windows"),
                None => true,
            };

            if matches_os {
                allowed = rule.action == "allow";
            }
        }
        allowed
    }

    /// Convert Maven coordinate (e.g. "net.fabricmc:sponge-mixin:0.15.3+mixin.0.8.7") to path
    pub fn maven_to_path(maven: &str) -> Option<String> {
        let parts: Vec<&str> = maven.split(':').collect();
        if parts.len() < 3 {
            return None;
        }

        let group = parts[0].replace('.', "/");
        let artifact = parts[1];
        let version = parts[2];
        let classifier = if parts.len() >= 4 {
            format!("-{}", parts[3])
        } else {
            "".to_string()
        };

        Some(format!(
            "{}/{}/{}/{}-{}{}.jar",
            group, artifact, version, artifact, version, classifier
        ))
    }

    /// Resolve candidate download URLs for a Maven coordinate with multiple mirrors
    pub fn resolve_library_download_urls(
        lib_name: &str,
        rel_path: &str,
        custom_base_url: Option<&str>,
    ) -> Vec<String> {
        let mut urls = Vec::new();
        if let Some(base) = custom_base_url {
            let b = base.trim().trim_end_matches('/');
            if !b.is_empty() {
                urls.push(format!("{}/{}", b, rel_path));
            }
        }

        if lib_name.starts_with("net.minecraft:") || lib_name.starts_with("org.lwjgl") || lib_name.starts_with("com.mojang") {
            urls.push(format!("https://libraries.minecraft.net/{}", rel_path));
            urls.push(format!("https://bmclapi2.bangbang93.com/maven/{}", rel_path));
        } else if lib_name.starts_with("net.minecraftforge:") {
            urls.push(format!("https://maven.minecraftforge.net/{}", rel_path));
            urls.push(format!("https://bmclapi2.bangbang93.com/maven/{}", rel_path));
        } else if lib_name.starts_with("net.neoforged:") {
            urls.push(format!("https://maven.neoforged.net/releases/{}", rel_path));
            urls.push(format!("https://bmclapi2.bangbang93.com/maven/{}", rel_path));
        } else if lib_name.starts_with("net.fabricmc:") {
            urls.push(format!("https://maven.fabricmc.net/{}", rel_path));
        } else if lib_name.starts_with("org.quiltmc:") {
            urls.push(format!("https://maven.quiltmc.org/repository/release/{}", rel_path));
        }

        // Standard fallbacks
        urls.push(format!("https://libraries.minecraft.net/{}", rel_path));
        urls.push(format!("https://repo1.maven.org/maven2/{}", rel_path));
        urls.push(format!("https://maven.minecraftforge.net/{}", rel_path));
        urls.push(format!("https://bmclapi2.bangbang93.com/maven/{}", rel_path));

        urls.dedup();
        urls
    }
}
