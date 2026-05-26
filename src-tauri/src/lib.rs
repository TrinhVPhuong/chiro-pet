mod core;
mod commands;
mod input_tracking;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize App Data Directory
            let app_data_dir = core::fs_utils::init_app_data_dir(&app_handle)
                .expect("Failed to initialize app data directory");

            // Setup Animation Director using manifest from AppData if available, else fallback
            let mut manifest_path = app_data_dir.join("animations").join("manifest.json");
            if !manifest_path.exists() {
                manifest_path = app.path().resource_dir().unwrap_or_default().join("public/animation/manifest.json");
            }
            
            let animation_director = core::behavior::AnimationDirector::new(manifest_path.to_str().unwrap_or(""))
                .unwrap_or_else(|_| core::behavior::AnimationDirector::new_with_manifest(
                    core::behavior::AnimationManifest {
                        version: "1.0".to_string(),
                        default_crossfade_ms: 300.0,
                        animations: vec![],
                    }
                ));
            app.manage(std::sync::Arc::new(animation_director));

            // Start background input tracking (ALT key polling)
            input_tracking::spawn_input_tracker(app_handle);

            // Make window click-through initially
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::set_click_through,
            commands::anim_play,
            commands::anim_stop_context,
            commands::anim_force_idle,
            commands::anim_list_available,
            commands::get_app_data_dir_path,
            commands::open_app_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
