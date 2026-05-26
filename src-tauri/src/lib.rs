mod commands;
mod input_tracking;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Start background input tracking (ALT key polling)
            input_tracking::spawn_input_tracker(app_handle);

            // Make window click-through initially
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![commands::set_click_through])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
