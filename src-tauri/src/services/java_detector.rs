use std::path::{Path, PathBuf};
use std::process::Command;
use crate::models::JavaInstallation;

#[derive(Clone, Debug, Default)]
pub struct JavaDetector;

impl JavaDetector {
    pub fn new() -> Self {
        Self
    }

    /// Scan system for installed Java runtimes
    pub fn detect_all(&self) -> Vec<JavaInstallation> {
        let mut candidates: Vec<PathBuf> = Vec::new();

        // 1. Check JAVA_HOME
        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            let p = PathBuf::from(java_home).join("bin").join("java.exe");
            if p.exists() {
                candidates.push(p);
            }
        }

        // 2. Check PATH
        if let Ok(path_var) = std::env::var("PATH") {
            for dir in std::env::split_paths(&path_var) {
                let p = dir.join("java.exe");
                if p.exists() {
                    candidates.push(p);
                }
            }
        }

        // 3. Check standard Windows installation directories
        let search_roots = [
            r"C:\Program Files\Java",
            r"C:\Program Files (x86)\Java",
            r"C:\Program Files\Eclipse Adoptium",
            r"C:\Program Files\BellSoft",
            r"C:\Program Files\Zulu",
            r"C:\Program Files\Microsoft",
        ];

        for root in &search_roots {
            let p = Path::new(root);
            if p.exists() {
                if let Ok(entries) = std::fs::read_dir(p) {
                    for entry in entries.flatten() {
                        let java_bin = entry.path().join("bin").join("java.exe");
                        if java_bin.exists() {
                            candidates.push(java_bin);
                        }
                    }
                }
            }
        }

        // Check user AppData for Eclipse Adoptium / local runtimes
        if let Some(data_dir) = dirs::data_local_dir() {
            let adoptium_user = data_dir.join("Programs").join("Eclipse Adoptium");
            if adoptium_user.exists() {
                if let Ok(entries) = std::fs::read_dir(adoptium_user) {
                    for entry in entries.flatten() {
                        let java_bin = entry.path().join("bin").join("java.exe");
                        if java_bin.exists() {
                            candidates.push(java_bin);
                        }
                    }
                }
            }
        }

        // Check launcher cached java runtimes
        if let Some(data_dir) = dirs::data_dir() {
            let launcher_java = data_dir.join("FRZlauncher").join("cache").join("java");
            if launcher_java.exists() {
                if let Ok(entries) = std::fs::read_dir(launcher_java) {
                    for entry in entries.flatten() {
                        if let Some(bin) = find_java_in_dir(&entry.path()) {
                            candidates.push(bin);
                        }
                    }
                }
            }
        }

        // Deduplicate and inspect each candidate
        let mut results: Vec<JavaInstallation> = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        for path in candidates {
            if let Ok(canonical) = path.canonicalize() {
                let key = canonical.to_string_lossy().to_lowercase();
                if seen_paths.insert(key) {
                    if let Some(info) = self.inspect_java(&canonical) {
                        results.push(info);
                    }
                }
            }
        }

        // Sort by major version descending
        results.sort_by(|a, b| b.major_version.cmp(&a.major_version));
        results
    }

    /// Inspect a java.exe binary to extract its version and metadata
    pub fn inspect_java(&self, path: &Path) -> Option<JavaInstallation> {
        let mut cmd = Command::new(path);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let output = cmd.arg("-version").output().ok()?;

        // `java -version` prints to stderr
        let output_str = String::from_utf8_lossy(&output.stderr);
        let first_line = output_str.lines().next().unwrap_or("");

        let (version, major_version) = parse_java_version(first_line)?;
        let is_64_bit = output_str.contains("64-Bit") || output_str.contains("x86_64");

        let vendor = if output_str.contains("Adoptium") || output_str.contains("Temurin") {
            "Eclipse Adoptium".to_string()
        } else if output_str.contains("Zulu") {
            "Azul Zulu".to_string()
        } else if output_str.contains("Oracle") {
            "Oracle".to_string()
        } else if output_str.contains("Microsoft") {
            "Microsoft".to_string()
        } else {
            "OpenJDK".to_string()
        };

        Some(JavaInstallation {
            path: path.to_string_lossy().to_string(),
            version,
            major_version,
            vendor,
            is_64_bit,
        })
    }

    /// Determine the required Java major version for a given Minecraft version
    pub fn required_java_major(game_version: &str) -> (u32, &'static str) {
        let clean = game_version.trim();

        // 1. Year-based snapshot or calendar release format: e.g. "25w14a", "26w02a", "26.3", "25.1", "26.1.0"
        if clean.len() >= 2 {
            let prefix = &clean[..2];
            if let Ok(year) = prefix.parse::<u32>() {
                if year >= 25 {
                    if clean.len() == 2 || clean.chars().nth(2) == Some('w') || clean.chars().nth(2) == Some('.') {
                        return (25, "Java 25+");
                    }
                }
            }
        }

        // 2. Standard 1.x version format: "1.12.2", "1.16.5", "1.17", "1.20.4", "1.20.5", "1.21.1", "1.25"
        if clean.starts_with("1.") {
            let parts: Vec<&str> = clean[2..].split('.').collect();
            if let Some(minor_str) = parts.first() {
                let num_str: String = minor_str.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(minor) = num_str.parse::<u32>() {
                    if minor <= 16 {
                        return (8, "Java 8");
                    } else if minor == 17 {
                        return (17, "Java 17");
                    } else if minor < 20 {
                        return (17, "Java 17");
                    } else if minor == 20 {
                        if parts.len() > 1 {
                            let patch_str: String = parts[1].chars().take_while(|c| c.is_ascii_digit()).collect();
                            if let Ok(patch) = patch_str.parse::<u32>() {
                                if patch >= 5 {
                                    return (21, "Java 21");
                                }
                            }
                        }
                        return (17, "Java 17");
                    } else if minor < 25 {
                        return (21, "Java 21");
                    } else {
                        return (25, "Java 25+");
                    }
                }
            }
        }

        // 3. Fallback for older snapshots (e.g. 20w14a, 21w14a, 22w..., 23w..., 24w...)
        if clean.len() >= 3 && clean.chars().nth(2) == Some('w') {
            if let Ok(year) = clean[..2].parse::<u32>() {
                if year <= 20 {
                    return (8, "Java 8");
                } else if year < 24 {
                    return (17, "Java 17");
                } else if year == 24 {
                    return (21, "Java 21");
                } else {
                    return (25, "Java 25+");
                }
            }
        }

        (21, "Java 21+")
    }

    /// Ensure a compatible Java installation exists; if missing, automatically download and unpack Eclipse Temurin JRE
    pub async fn ensure_compatible_java(
        &self,
        custom_path: Option<&str>,
        game_version: &str,
        expected_major: Option<u32>,
        cache_dir: &Path,
        downloader: &crate::services::Downloader,
        app: Option<&tauri::AppHandle>,
        instance_id: Option<&str>,
    ) -> Result<JavaInstallation, String> {
        let (req_major, _desc) = if let Some(major) = expected_major {
            if major > 0 {
                let desc = match major {
                    8 => "Java 8",
                    16 | 17 => "Java 17",
                    21 => "Java 21+",
                    _ if major >= 25 => "Java 25+",
                    _ => "Java",
                };
                (major, desc)
            } else {
                Self::required_java_major(game_version)
            }
        } else {
            Self::required_java_major(game_version)
        };

        // 1. If user specified custom Java path, validate it
        if let Some(custom) = custom_path {
            let p = Path::new(custom);
            if p.exists() {
                if let Some(info) = self.inspect_java(p) {
                    if is_version_compatible(info.major_version, req_major) {
                        return Ok(info);
                    }
                }
            }
        }

        // 2. Auto-detect among installed runtimes
        let installed = self.detect_all();
        let is_64_bit_os = cfg!(target_pointer_width = "64");

        if is_64_bit_os {
            // Priority 1: Exact version match AND 64-bit (prevents heap memory allocation crashes)
            for java in &installed {
                if java.major_version == req_major && java.is_64_bit {
                    return Ok(java.clone());
                }
            }

            // Priority 2: Closest compatible version AND 64-bit
            let mut compatible_64: Vec<&JavaInstallation> = installed
                .iter()
                .filter(|j| is_version_compatible(j.major_version, req_major) && j.is_64_bit)
                .collect();
            compatible_64.sort_by_key(|j| j.major_version);
            if let Some(best) = compatible_64.first() {
                return Ok((*best).clone());
            }

            // Priority 3: No 64-bit compatible runtime found -> Auto-download portable 64-bit Temurin JRE!
            // 32-bit Java cannot allocate > 1.2GB heap on Windows and crashes immediately with
            // "The specified size exceeds the maximum representable size: -Xms4096M".
            // Therefore, on a 64-bit OS, we always download 64-bit Temurin instead of using a broken 32-bit Java.
            match self.auto_download_java(req_major, cache_dir, downloader, app, instance_id).await {
                Ok(downloaded) => return Ok(downloaded),
                Err(e) => {
                    eprintln!("Auto-download of 64-bit Java {} failed: {}", req_major, e);
                }
            }
        }

        // Priority 4 (Fallback only): Installed 32-bit Java if offline or download failed
        for java in &installed {
            if java.major_version == req_major {
                return Ok(java.clone());
            }
        }
        let mut compatible: Vec<&JavaInstallation> = installed
            .iter()
            .filter(|j| is_version_compatible(j.major_version, req_major))
            .collect();
        compatible.sort_by_key(|j| j.major_version);
        if let Some(best) = compatible.first() {
            return Ok((*best).clone());
        }

        // Priority 5: Attempt auto-download on non-64-bit OS if not tried yet
        if !is_64_bit_os {
            return self.auto_download_java(req_major, cache_dir, downloader, app, instance_id).await;
        }

        Err(format!(
            "Не удалось найти или загрузить совместимую Java для Minecraft {}. Требуется Java {}.",
            game_version, req_major
        ))
    }

    /// Auto-download portable Eclipse Temurin JRE from Adoptium and unpack into cache
    pub async fn auto_download_java(
        &self,
        major_version: u32,
        cache_dir: &Path,
        downloader: &crate::services::Downloader,
        app: Option<&tauri::AppHandle>,
        instance_id: Option<&str>,
    ) -> Result<JavaInstallation, String> {
        let java_cache_dir = cache_dir.join("java");
        let target_dir = java_cache_dir.join(format!("temurin-{}", major_version));

        if let Some(found) = find_java_in_dir(&target_dir) {
            if let Some(info) = self.inspect_java(&found) {
                return Ok(info);
            }
        }

        let _ = std::fs::create_dir_all(&java_cache_dir);

        if let Some(app_handle) = app {
            use tauri::Emitter;
            let _ = app_handle.emit(
                "launch-status",
                crate::models::LaunchStatus {
                    instance_id: instance_id.unwrap_or("").to_string(),
                    state: "downloading".to_string(),
                    message: format!("Автозагрузка Java {} (Eclipse Temurin JRE)...", major_version),
                    progress: Some(8.0),
                },
            );
        }

        let jre_url = format!(
            "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jre/hotspot/normal/eclipse",
            major_version
        );
        let jdk_url = format!(
            "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jdk/hotspot/normal/eclipse",
            major_version
        );

        let temp_zip = java_cache_dir.join(format!("temurin-{}.zip", major_version));

        // Try JRE first, fallback to JDK if JRE is unavailable
        let dl_res = downloader
            .download_file(
                &jre_url,
                &temp_zip,
                crate::services::ChecksumType::None,
                instance_id,
                app,
            )
            .await;

        if dl_res.is_err() {
            downloader
                .download_file(
                    &jdk_url,
                    &temp_zip,
                    crate::services::ChecksumType::None,
                    instance_id,
                    app,
                )
                .await?;
        }

        if let Some(app_handle) = app {
            use tauri::Emitter;
            let _ = app_handle.emit(
                "launch-status",
                crate::models::LaunchStatus {
                    instance_id: instance_id.unwrap_or("").to_string(),
                    state: "verifying".to_string(),
                    message: format!("Распаковка Java {}...", major_version),
                    progress: Some(15.0),
                },
            );
        }

        let file = std::fs::File::open(&temp_zip)
            .map_err(|e| format!("Не удалось открыть архив Java: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Ошибка распаковки архива Java: {}", e))?;

        let _ = std::fs::create_dir_all(&target_dir);
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let raw_path = file.mangled_name();
            let components: Vec<_> = raw_path.components().collect();
            let relative_path = if components.len() > 1 {
                let mut pb = PathBuf::new();
                for c in &components[1..] {
                    pb.push(c);
                }
                pb
            } else {
                raw_path
            };

            let outpath = target_dir.join(relative_path);
            if file.name().ends_with('/') {
                let _ = std::fs::create_dir_all(&outpath);
            } else {
                if let Some(p) = outpath.parent() {
                    let _ = std::fs::create_dir_all(p);
                }
                if let Ok(mut outfile) = std::fs::File::create(&outpath) {
                    let _ = std::io::copy(&mut file, &mut outfile);
                }
            }
        }

        let _ = std::fs::remove_file(&temp_zip);

        if let Some(found) = find_java_in_dir(&target_dir) {
            if let Some(info) = self.inspect_java(&found) {
                return Ok(info);
            }
        }

        Err(format!("Не удалось обнаружить java.exe после распаковки Java {}", major_version))
    }

    /// Select or validate a compatible Java binary for the target Minecraft version
    pub fn get_compatible_java(
        &self,
        custom_path: Option<&str>,
        game_version: &str,
    ) -> Result<JavaInstallation, String> {
        let (req_major, desc) = Self::required_java_major(game_version);

        // If user specified custom path, validate it
        if let Some(custom) = custom_path {
            let p = Path::new(custom);
            if !p.exists() {
                return Err(format!("Configured Java path '{}' does not exist", custom));
            }
            if let Some(info) = self.inspect_java(p) {
                if is_version_compatible(info.major_version, req_major) {
                    return Ok(info);
                } else {
                    return Err(format!(
                        "Configured Java is version {} ({}), but Minecraft {} requires {}.",
                        info.major_version, info.version, game_version, desc
                    ));
                }
            } else {
                return Err(format!("Could not execute Java binary at '{}'", custom));
            }
        }

        // Auto-detect among installed runtimes
        let installed = self.detect_all();
        if installed.is_empty() {
            return Err(format!(
                "No Java installation found on your system! Minecraft {} requires {}. Please install Eclipse Adoptium Temurin.",
                game_version, desc
            ));
        }

        let is_64_bit_os = cfg!(target_pointer_width = "64");

        if is_64_bit_os {
            // Find exact or closest compatible 64-bit match first
            for java in &installed {
                if java.major_version == req_major && java.is_64_bit {
                    return Ok(java.clone());
                }
            }
            let mut compatible_64: Vec<&JavaInstallation> = installed
                .iter()
                .filter(|j| is_version_compatible(j.major_version, req_major) && j.is_64_bit)
                .collect();
            compatible_64.sort_by_key(|j| j.major_version);
            if let Some(best) = compatible_64.first() {
                return Ok((*best).clone());
            }
        }

        // Find exact or closest compatible match (fallback to 32-bit if necessary)
        for java in &installed {
            if java.major_version == req_major {
                return Ok(java.clone());
            }
        }
        let mut compatible: Vec<&JavaInstallation> = installed
            .iter()
            .filter(|j| is_version_compatible(j.major_version, req_major))
            .collect();
        compatible.sort_by_key(|j| j.major_version);
        if let Some(best) = compatible.first() {
            return Ok((*best).clone());
        }

        // No compatible Java found
        let found_versions: Vec<String> = installed
            .iter()
            .map(|j| format!("Java {} ({})", j.major_version, j.vendor))
            .collect();

        Err(format!(
            "Incompatible Java version detected! Minecraft {} requires {}, but only [{}] were found. Please install Eclipse Adoptium Temurin {}.",
            game_version,
            desc,
            found_versions.join(", "),
            req_major
        ))
    }
}

fn find_java_in_dir(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }
    let direct_bin = dir.join("bin").join("java.exe");
    if direct_bin.exists() {
        return Some(direct_bin);
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                let sub_bin = entry.path().join("bin").join("java.exe");
                if sub_bin.exists() {
                    return Some(sub_bin);
                }
            }
        }
    }
    None
}

fn is_version_compatible(actual: u32, required: u32) -> bool {
    if required == 8 {
        actual == 8 || actual == 11
    } else if required == 17 {
        actual >= 17
    } else if required == 21 {
        actual >= 21
    } else {
        actual >= required
    }
}

/// Parse first line of `java -version` output
/// Examples:
/// `openjdk version "17.0.20.8" 2026-01-20` -> ("17.0.20.8", 17)
/// `java version "1.8.0_351"` -> ("1.8.0_351", 8)
fn parse_java_version(line: &str) -> Option<(String, u32)> {
    let re = regex::Regex::new(r#"version "([^"]+)""#).ok()?;
    let caps = re.captures(line)?;
    let version_str = caps.get(1)?.as_str().to_string();

    let major = if version_str.starts_with("1.") {
        // e.g. 1.8.0
        let parts: Vec<&str> = version_str.split('.').collect();
        parts.get(1).and_then(|v| v.parse::<u32>().ok()).unwrap_or(8)
    } else {
        // e.g. 17.0.2 or 21.0.1
        let parts: Vec<&str> = version_str.split('.').collect();
        parts.first().and_then(|v| v.parse::<u32>().ok()).unwrap_or(17)
    };

    Some((version_str, major))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_java_version() {
        assert_eq!(
            parse_java_version(r#"openjdk version "17.0.20.8" 2026-01-20"#),
            Some(("17.0.20.8".to_string(), 17))
        );
        assert_eq!(
            parse_java_version(r#"java version "1.8.0_351""#),
            Some(("1.8.0_351".to_string(), 8))
        );
        assert_eq!(
            parse_java_version(r#"openjdk version "21.0.1" 2023-10-17"#),
            Some(("21.0.1".to_string(), 21))
        );
    }

    #[test]
    fn test_required_java_major() {
        assert_eq!(JavaDetector::required_java_major("1.12.2").0, 8);
        assert_eq!(JavaDetector::required_java_major("1.16.5").0, 8);
        assert_eq!(JavaDetector::required_java_major("1.17.1").0, 17);
        assert_eq!(JavaDetector::required_java_major("1.20.1").0, 17);
        assert_eq!(JavaDetector::required_java_major("1.21.1").0, 21);
        assert_eq!(JavaDetector::required_java_major("26.3").0, 25);
        assert_eq!(JavaDetector::required_java_major("25w14a").0, 25);
        assert_eq!(JavaDetector::required_java_major("1.25").0, 25);
    }
}
