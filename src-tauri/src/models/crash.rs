use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrashDiagnosis {
    pub instance_id: String,
    pub cause_type: String, // "java_mismatch" | "jvm_args" | "missing_fabric_api" | "duplicate_mods" | "mod_crash" | "corrupted_assets" | "opengl_driver" | "vanilla_mods" | "general"
    pub title: String,
    pub description: String,
    pub details: String,
    pub suggested_fix: String,
    pub can_auto_fix: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offending_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offending_arg: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_java_major: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoRepairResult {
    pub success: bool,
    pub message: String,
    pub actions_taken: Vec<String>,
    pub can_relaunch: bool,
}
