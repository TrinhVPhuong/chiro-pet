use tauri::Manager;

/// Toggle click-through on the main window.
/// When `ignore` is true, mouse events pass through to the desktop.
#[tauri::command]
pub fn set_click_through(window: tauri::Window, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

use crate::core::behavior::{AnimationCommand, AnimationState, AnimationDirector};

#[tauri::command]
pub async fn anim_play(
    app: tauri::AppHandle,
    state: tauri::State<'_, std::sync::Arc<AnimationDirector>>,
    command: AnimationCommand,
) -> Result<(), String> {
    state.play(&app, command).await
}

#[tauri::command]
pub async fn anim_stop_context(
    app: tauri::AppHandle,
    state: tauri::State<'_, std::sync::Arc<AnimationDirector>>,
    context_id: String,
) -> Result<(), String> {
    state.stop_context(&app, &context_id).await
}

#[tauri::command]
pub async fn anim_force_idle(
    app: tauri::AppHandle,
    state: tauri::State<'_, std::sync::Arc<AnimationDirector>>,
) -> Result<(), String> {
    state.force_idle(&app).await
}

#[tauri::command]
pub async fn anim_list_available(
    state: tauri::State<'_, std::sync::Arc<AnimationDirector>>,
) -> Result<Vec<String>, String> {
    // For now return an empty list or mock list, as we haven't exposed the manifest list directly
    // Ideally we should add a method to AnimationDirector to return this
    Ok(vec![])
}

#[tauri::command]
pub fn get_app_data_dir_path(app: tauri::AppHandle) -> Result<String, String> {
    crate::core::fs_utils::get_app_data_dir(&app)
        .map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_app_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = crate::core::fs_utils::get_app_data_dir(&app)?;
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(())
}
