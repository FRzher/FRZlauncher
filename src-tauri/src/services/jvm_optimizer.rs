use sysinfo::System;
use crate::models::{MemoryConfig, SystemSpecs};

#[derive(Clone, Debug, Default)]
pub struct JvmOptimizer;

impl JvmOptimizer {
    pub fn new() -> Self {
        Self
    }

    /// Retrieve host hardware telemetry
    pub fn get_system_specs(&self) -> SystemSpecs {
        let mut sys = System::new_all();
        sys.refresh_all();

        let cpu_brand = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown CPU".to_string());

        let total_ram_mb = sys.total_memory() / 1024 / 1024;
        let available_ram_mb = sys.available_memory() / 1024 / 1024;

        SystemSpecs {
            cpu_cores: sys.cpus().len(),
            cpu_brand,
            total_ram_mb,
            available_ram_mb,
            os_name: System::name().unwrap_or_else(|| "Windows".to_string()),
            os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
        }
    }

    /// Calculate optimal memory allocation recommendations based on host RAM
    pub fn recommend_memory(&self) -> MemoryConfig {
        let specs = self.get_system_specs();
        let total = specs.total_ram_mb;

        if total >= 32768 {
            MemoryConfig {
                min_mb: 512,
                max_mb: 8192,
            }
        } else if total >= 16384 {
            MemoryConfig {
                min_mb: 512,
                max_mb: 6144,
            }
        } else if total >= 8192 {
            MemoryConfig {
                min_mb: 512,
                max_mb: 4096,
            }
        } else {
            MemoryConfig {
                min_mb: 512,
                max_mb: 2048,
            }
        }
    }

    /// Generate complete JVM arguments including memory, GC preset, and custom flags
    pub fn build_jvm_args(
        &self,
        memory: &MemoryConfig,
        gc_preset: &str,
        custom_args: &[String],
    ) -> Result<Vec<String>, String> {
        self.build_jvm_args_for_java(memory, gc_preset, custom_args, true)
    }

    pub fn build_jvm_args_for_java(
        &self,
        memory: &MemoryConfig,
        gc_preset: &str,
        custom_args: &[String],
        is_64_bit: bool,
    ) -> Result<Vec<String>, String> {
        let mut args = Vec::new();

        // Memory bounds:
        let (max_mb, min_mb) = if !is_64_bit {
            // 32-bit JVM safe memory cap:
            // 32-bit Windows user-space processes are strictly limited to 2GB address space.
            // Any heap allocation >= 1536M causes "The specified size exceeds the maximum representable size"
            // or JVM initialization fatal exception. We cap heap to safe 1024MB max and 512MB min.
            let safe_max = memory.max_mb.min(1024);
            let safe_min = memory.min_mb.min(safe_max).min(512);
            (safe_max, safe_min)
        } else {
            // IMPORTANT: For stutter-free gameplay on 64-bit, -Xms can equal -Xmx.
            let max = memory.max_mb;
            let min = if gc_preset.eq_ignore_ascii_case("fps_boost") || gc_preset.eq_ignore_ascii_case("aikar") {
                max
            } else {
                memory.min_mb.min(memory.max_mb)
            };
            (max, min)
        };

        args.push(format!("-Xms{}M", min_mb));
        args.push(format!("-Xmx{}M", max_mb));

        // Garbage collection preset
        if !is_64_bit {
            // For 32-bit JVMs, avoid 64-bit specific large heap flags (e.g. 16M heap region sizes or huge new sizes)
            args.extend(
                [
                    "-XX:+UseG1GC",
                    "-XX:MaxGCPauseMillis=100",
                    "-XX:+DisableExplicitGC",
                    "-Dio.netty.allocator.type=pooled",
                ]
                .iter()
                .map(|s| s.to_string()),
            );
        } else {
            match gc_preset.to_lowercase().as_str() {
                "fps_boost" => {
                    args.extend(
                        [
                            "-XX:+UnlockExperimentalVMOptions",
                            "-XX:+UseG1GC",
                            "-XX:G1NewSizePercent=25",
                            "-XX:G1MaxNewSizePercent=40",
                        "-XX:G1ReservePercent=20",
                        "-XX:MaxGCPauseMillis=50",
                        "-XX:G1HeapRegionSize=16M",
                        "-XX:G1MixedGCCountTarget=4",
                        "-XX:InitiatingHeapOccupancyPercent=45",
                        "-XX:G1MixedGCLiveThresholdPercent=90",
                        "-XX:G1RSetUpdatingPauseTimePercent=5",
                        "-XX:SurvivorRatio=32",
                        "-XX:+ParallelRefProcEnabled",
                        "-XX:+AlwaysPreTouch",
                        "-XX:+DisableExplicitGC",
                        "-XX:+PerfDisableSharedMem",
                        "-XX:+UseStringDeduplication",
                        "-Dio.netty.allocator.type=pooled",
                    ]
                    .iter()
                    .map(|s| s.to_string()),
                );
            }
            "aikar" => {
                args.extend(
                    [
                        "-XX:+UnlockExperimentalVMOptions",
                        "-XX:+UseG1GC",
                        "-XX:+ParallelRefProcEnabled",
                        "-XX:MaxGCPauseMillis=200",
                        "-XX:+DisableExplicitGC",
                        "-XX:+AlwaysPreTouch",
                        "-XX:G1NewSizePercent=30",
                        "-XX:G1MaxNewSizePercent=40",
                        "-XX:G1ReservePercent=20",
                        "-XX:G1HeapWastePercent=5",
                        "-XX:G1MixedGCCountTarget=4",
                        "-XX:InitiatingHeapOccupancyPercent=15",
                        "-XX:G1MixedGCLiveThresholdPercent=90",
                        "-XX:G1RSetUpdatingPauseTimePercent=5",
                        "-XX:SurvivorRatio=32",
                        "-XX:+PerfDisableSharedMem",
                        "-XX:MaxTenuringThreshold=1",
                    ]
                    .iter()
                    .map(|s| s.to_string()),
                );
            }
            "shenandoah" => {
                args.extend(
                    [
                        "-XX:+UnlockExperimentalVMOptions",
                        "-XX:+UseShenandoahGC",
                        "-XX:+AlwaysPreTouch",
                        "-XX:+UseNUMA",
                    ]
                    .iter()
                    .map(|s| s.to_string()),
                );
            }
            "zgc" => {
                args.extend(
                    [
                        "-XX:+UnlockExperimentalVMOptions",
                        "-XX:+UseZGC",
                        "-XX:+AlwaysPreTouch",
                    ]
                    .iter()
                    .map(|s| s.to_string()),
                );
            }
            _ => {
                // Default fallback to basic G1GC
                args.push("-XX:+UseG1GC".to_string());
            }
        }
    }

        // Validate and sanitize user-supplied custom JVM arguments
        for arg in custom_args {
            let sanitized = self.sanitize_arg(arg)?;
            if !sanitized.is_empty() {
                args.push(sanitized);
            }
        }

        Ok(args)
    }

    /// Sanitize JVM arguments to prevent command injection
    pub fn sanitize_arg(&self, arg: &str) -> Result<String, String> {
        let trimmed = arg.trim();

        // Reject dangerous shell metacharacters
        const FORBIDDEN_CHARS: [char; 10] = [';', '&', '|', '`', '$', '>', '<', '\n', '\r', '\0'];
        if trimmed.chars().any(|c| FORBIDDEN_CHARS.contains(&c)) {
            return Err(format!(
                "JVM argument '{}' contains forbidden shell characters",
                trimmed
            ));
        }

        // Prevent disabling security manager or dangerous system modifications
        if trimmed.starts_with("-Djava.security.manager") {
            return Err("Disabling or setting java.security.manager is prohibited".to_string());
        }

        Ok(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jvm_args_sanitization_valid() {
        let optimizer = JvmOptimizer::new();
        let valid_arg = "-Dforge.logging.console.level=debug";
        assert_eq!(optimizer.sanitize_arg(valid_arg).unwrap(), valid_arg);
    }

    #[test]
    fn test_jvm_args_sanitization_rejects_injection() {
        let optimizer = JvmOptimizer::new();
        assert!(optimizer.sanitize_arg("-Xmx4G; rm -rf /").is_err());
        assert!(optimizer.sanitize_arg("-Dfoo=bar & calc.exe").is_err());
        assert!(optimizer.sanitize_arg("-Dfoo=bar | whoami").is_err());
        assert!(optimizer.sanitize_arg("-Djava.security.manager=allow").is_err());
    }

    #[test]
    fn test_jvm_args_preset_generation() {
        let optimizer = JvmOptimizer::new();
        let memory = MemoryConfig {
            min_mb: 2048,
            max_mb: 4096,
        };

        let aikar_args = optimizer.build_jvm_args(&memory, "aikar", &[]).unwrap();
        assert!(aikar_args.contains(&"-Xms4096M".to_string()));
        assert!(aikar_args.contains(&"-Xmx4096M".to_string()));
        assert!(aikar_args.contains(&"-XX:+UseG1GC".to_string()));

        let zgc_args = optimizer.build_jvm_args(&memory, "zgc", &[]).unwrap();
        assert!(zgc_args.contains(&"-XX:+UseZGC".to_string()));
        assert!(zgc_args.contains(&"-XX:+AlwaysPreTouch".to_string()));
    }

    #[test]
    fn test_32_bit_java_heap_capping() {
        let optimizer = JvmOptimizer::new();
        let memory = MemoryConfig {
            min_mb: 2048,
            max_mb: 4096,
        };

        let args_32 = optimizer.build_jvm_args_for_java(&memory, "fps_boost", &[], false).unwrap();
        assert!(args_32.contains(&"-Xms512M".to_string()));
        assert!(args_32.contains(&"-Xmx1024M".to_string()));
    }
}
