pub mod commands;
pub mod models;
pub mod services;

use std::sync::Arc;
use services::{
    AiModService, CrashRepairService, DiscordService, Downloader, ElyByService, FriendService,
    InstanceManager, JavaDetector, JvmOptimizer, KeyringService, Launcher, ManifestService,
    MicrosoftAuthService, MinecraftInsideService, ModrinthService,
};

pub struct AppState {
    pub instance_manager: Arc<InstanceManager>,
    pub keyring_service: Arc<KeyringService>,
    pub downloader: Arc<Downloader>,
    pub jvm_optimizer: Arc<JvmOptimizer>,
    pub manifest_service: Arc<ManifestService>,
    pub java_detector: Arc<JavaDetector>,
    pub launcher: Arc<Launcher>,
    pub elyby_service: Arc<ElyByService>,
    pub microsoft_service: Arc<MicrosoftAuthService>,
    pub modrinth_service: Arc<ModrinthService>,
    pub minecraft_inside_service: Arc<MinecraftInsideService>,
    pub discord_service: Arc<DiscordService>,
    pub ai_mod_service: Arc<AiModService>,
    pub friend_service: Arc<FriendService>,
    pub crash_repair_service: Arc<CrashRepairService>,
    pub game_process_state: services::GameProcessState,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let base_dir = InstanceManager::default_dir();
    let instance_manager = Arc::new(InstanceManager::new(base_dir.clone()));
    let network_settings = instance_manager.load_network_settings();
    let keyring_service = Arc::new(KeyringService::new(base_dir.clone()));
    let downloader = Arc::new(Downloader::with_settings(&network_settings));
    let jvm_optimizer = Arc::new(JvmOptimizer::new());
    let manifest_service = Arc::new(ManifestService::new(
        instance_manager.cache_dir(),
        downloader.clone(),
    ));
    let java_detector = Arc::new(JavaDetector::new());
    let elyby_service = Arc::new(ElyByService::new(downloader.clone()));
    let microsoft_service = Arc::new(MicrosoftAuthService::new());
    let modrinth_service = Arc::new(ModrinthService::with_settings(downloader.clone(), &network_settings));
    let minecraft_inside_service = Arc::new(MinecraftInsideService::new());
    let discord_service = Arc::new(DiscordService::new(None));
    let friend_service = Arc::new(FriendService::new(base_dir.clone()));
    let crash_repair_service = Arc::new(CrashRepairService::new(
        instance_manager.clone(),
        java_detector.clone(),
        modrinth_service.clone(),
    ));
    let ai_mod_service = Arc::new(AiModService::new(
        modrinth_service.clone(),
        instance_manager.clone(),
        Some(minecraft_inside_service.clone()),
    ));
    let game_process_state = services::GameProcessState::default();
    let launcher = Arc::new(Launcher::new(
        instance_manager.clone(),
        keyring_service.clone(),
        manifest_service.clone(),
        java_detector.clone(),
        jvm_optimizer.clone(),
        downloader.clone(),
        elyby_service.clone(),
        discord_service.clone(),
        modrinth_service.clone(),
        crash_repair_service.clone(),
        game_process_state.clone(),
    ));

    let discord_for_setup = discord_service.clone();

    let state = AppState {
        instance_manager,
        keyring_service,
        downloader,
        jvm_optimizer,
        manifest_service,
        java_detector,
        launcher,
        elyby_service,
        microsoft_service,
        modrinth_service,
        minecraft_inside_service,
        discord_service,
        ai_mod_service,
        friend_service,
        crash_repair_service,
        game_process_state: game_process_state.clone(),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |_app| {
            let discord_init = discord_for_setup.clone();
            tauri::async_runtime::spawn(async move {
                // Retry connection up to 5 times (in case Discord was launched concurrently)
                for _ in 0..5 {
                    if discord_init.connect().await.is_ok() {
                        let _ = discord_init.set_idle().await;
                        break;
                    }
                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                }
            });
            Ok(())
        })
        .manage(state)
        .manage(game_process_state)
        .invoke_handler(tauri::generate_handler![
            // Instance commands
            commands::create_instance,
            commands::get_instances,
            commands::get_instance,
            commands::update_instance,
            commands::delete_instance,
            commands::clone_instance,
            commands::open_instance_folder,
            // Auth commands
            commands::create_offline_account,
            commands::create_elyby_account,
            commands::start_elyby_oauth,
            commands::login_elyby_credentials,
            commands::start_microsoft_login,
            commands::poll_microsoft_login,
            commands::get_accounts,
            commands::get_active_account,
            commands::set_active_account,
            commands::delete_account,
            // System commands
            commands::get_system_specs,
            commands::recommend_memory,
            commands::get_jvm_args,
            commands::open_launcher_dir,
            commands::clean_launcher_cache,
            commands::get_network_settings,
            commands::set_network_settings,
            commands::test_network_connection,
            // Launch & Process commands
            commands::launch_instance,
            commands::kill_active_game,
            commands::kill_instance_process,
            commands::get_mojang_versions,
            commands::get_fabric_versions,
            commands::get_neoforge_versions,
            commands::get_forge_versions,
            commands::detect_installed_javas,
            commands::get_instance_mods,
            // Window controls
            commands::window_minimize,
            commands::window_toggle_maximize,
            commands::window_close,
            // Mod commands
            commands::search_modrinth,
            commands::install_modrinth_mod,
            commands::install_optimization_pack,
            commands::apply_ultra_fps_boost,
            commands::install_modpack,
            commands::get_modpack_versions,
            commands::get_instance_mods_detailed,
            commands::toggle_mod,
            commands::delete_mod,
            commands::save_mod_bytes,
            commands::search_minecraft_inside,
            commands::get_minecraft_inside_downloads,
            commands::install_minecraft_inside_file,
            // AI Mod Builder commands
            commands::ai_parse_and_resolve_mods,
            commands::ai_batch_install_mods,
            commands::ai_create_instance_and_install,
            // Discord RPC commands
            commands::set_discord_activity,
            commands::set_discord_view,
            commands::toggle_discord_rpc,
            commands::get_discord_rpc_status,
            // Friend commands
            commands::get_friends,
            commands::add_friend,
            commands::remove_friend,
            commands::update_friend,
            commands::toggle_favorite_friend,
            // Crash & Auto-repair commands
            commands::diagnose_crash,
            commands::auto_repair_instance,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running FRZlauncher application");
}
