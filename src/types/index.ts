export type LoaderType = "vanilla" | "fabric" | "neoforge" | "forge" | "quilt";

export type AuthProvider = "offline" | "microsoft" | "elyby";

export interface MemoryConfig {
  min_mb: number;
  max_mb: number;
}

export interface InstanceConfig {
  id: string;
  name: string;
  mcVersion: string;
  game_version?: string;
  loader: LoaderType;
  loader_type?: LoaderType;
  loaderVersion?: string;
  loader_version?: string;
  created?: number;
  created_at?: number;
  icon?: string;
  java_path?: string;
  memory: MemoryConfig;
  custom_jvm_args: string[];
  gc_preset: string;
  last_played?: number;
  play_time_seconds: number;
  notes?: string;
}

export interface InstanceSummary {
  id: string;
  name: string;
  mcVersion?: string;
  game_version: string;
  loader?: LoaderType;
  loader_type: LoaderType;
  loaderVersion?: string;
  loader_version?: string;
  created?: number;
  created_at?: number;
  icon?: string;
  last_played?: number;
  play_time_seconds: number;
  mod_count: number;
  memory: MemoryConfig;
}

export interface CreateInstanceRequest {
  name: string;
  game_version: string;
  mcVersion?: string;
  loader_type: LoaderType;
  loader?: LoaderType;
  loader_version?: string;
  loaderVersion?: string;
  icon?: string;
  memory?: MemoryConfig;
  gc_preset?: string;
}

export interface GameStatusChangedPayload {
  running: boolean;
  exit_code?: number;
  instance_id?: string;
  pid?: number;
}

export interface Account {
  id: string;
  username: string;
  provider: AuthProvider;
  uuid: string;
  skin_url?: string;
  is_active: boolean;
  created_at: number;
}

export interface SystemSpecs {
  cpu_cores: number;
  cpu_brand: string;
  total_ram_mb: number;
  available_ram_mb: number;
  os_name: string;
  os_version: string;
}

export interface JavaInstallation {
  path: string;
  version: string;
  major_version: number;
  vendor: string;
  is_64_bit: boolean;
}

export interface VersionEntry {
  id: string;
  type: string;
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
}

export interface FabricLoaderItem {
  loader: {
    version: string;
    stable: boolean;
    maven: string;
  };
  intermediary: {
    version: string;
    stable: boolean;
  };
}

export interface GameLogEntry {
  instance_id: string;
  line: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  timestamp: number;
}

export interface LaunchStatus {
  instance_id: string;
  state: "ready" | "downloading" | "verifying" | "launching" | "starting" | "running" | "crashed" | "exited";
  message: string;
  progress?: number;
}

export interface DownloadProgressPayload {
  instance_id: string;
  stage: string;
  current_file: string;
  completed_items: number;
  total_items: number;
  downloaded_bytes: number;
  total_bytes: number;
  percentage: number;
}

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  icon_url?: string;
  downloads: number;
  author: string;
  categories: string[];
  client_side?: "required" | "optional" | "unsupported" | string;
  server_side?: "required" | "optional" | "unsupported" | string;
}

export interface ModrinthSearchResult {
  hits: ModrinthHit[];
  total_hits: number;
  offset: number;
  limit: number;
}

export interface ModpackVersionOption {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  version_type: string;
}

export interface ModInfo {
  filename: string;
  display_name: string;
  is_enabled: boolean;
  size_bytes: number;
}

export interface DownloadProgress {
  task_id: string;
  current_bytes: number;
  total_bytes: number;
  percentage: number;
  speed_bytes_per_sec: number;
}

export interface GameStartedPayload {
  instance_id: string;
  pid: number;
}

export interface GameExitedPayload {
  instance_id: string;
  exit_code: number;
}

export interface DeviceCodeResponse {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export type ProjectType = "mod" | "datapack" | "resourcepack" | "shader" | "modpack" | "map";

export interface InstallModResult {
  filename: string;
  installed_dependencies: string[];
}

export interface MinecraftInsideSearchResult {
  title: string;
  url: string;
  category: string;
  description: string;
}

export interface MinecraftInsideDownloadItem {
  name: string;
  url: string;
  size: string;
  date: string;
}

export interface AiModSuggestion {
  project_id: string;
  slug: string;
  title: string;
  author: string;
  icon_url?: string;
  downloads: number;
}

export interface AiModResolvedItem {
  raw_query: string;
  project_id: string | null;
  slug: string | null;
  title: string;
  description: string;
  icon_url: string | null;
  author: string | null;
  downloads: number;
  status: "compatible" | "incompatible" | "not_found" | "minecraft_inside";
  version_id: string | null;
  filename: string | null;
  categories: string[];
  external_url?: string;
  match_confidence?: "exact" | "high" | "fuzzy" | "inside";
  suggestions?: AiModSuggestion[];
}

export interface AiBatchInstallProgress {
  current_index: number;
  total_count: number;
  current_mod: string;
  stage: string;
  percentage: number;
}

export interface NetworkSettings {
  proxy_type: "none" | "http" | "socks5";
  proxy_url?: string | null;
  modrinth_api_mirror?: string | null;
  modrinth_cdn_mirror?: string | null;
  auto_fallback_ru: boolean;
  bypass_ssl_verify: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  latency_ms?: number | null;
  status_code?: number | null;
  message: string;
}

export interface UltraFpsBoostResult {
  success: boolean;
  installed_mods: string[];
  memory_allocated_mb: number;
  gc_preset: string;
  tweaks_applied: string[];
  message: string;
}

export interface Friend {
  id: string;
  nickname: string;
  note?: string | null;
  favorite: boolean;
  created_at: number;
  last_seen?: number | null;
  status: "online" | "offline" | "in_game";
  current_server?: string | null;
  avatar_url?: string | null;
}

export interface AddFriendRequest {
  nickname: string;
  note?: string | null;
}

export interface UpdateFriendRequest {
  id: string;
  nickname: string;
  note?: string | null;
  favorite: boolean;
  status: "online" | "offline" | "in_game";
}

export interface CrashDiagnosis {
  instance_id: string;
  cause_type: string;
  title: string;
  description: string;
  details: string;
  suggested_fix: string;
  can_auto_fix: bool_or_boolean;
  offending_file?: string | null;
  offending_arg?: string | null;
  target_java_major?: number | null;
}

type bool_or_boolean = boolean;

export interface AutoRepairResult {
  success: boolean;
  message: string;
  actions_taken: string[];
  can_relaunch: boolean;
}


