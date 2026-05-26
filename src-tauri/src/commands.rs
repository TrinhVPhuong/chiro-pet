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
