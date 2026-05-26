use tauri::Manager;

/// Toggle click-through on the main window.
/// When `ignore` is true, mouse events pass through to the desktop.
#[tauri::command]
pub fn set_click_through(window: tauri::Window, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}
