use tauri::{AppHandle, Emitter, Manager};
use std::time::Duration;
use tokio::time::sleep;

// --- Platform-specific ALT key detection ---

#[cfg(windows)]
mod platform {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_LMENU, VK_MENU, VK_RMENU,
    };

    /// Check if ALT key is currently pressed using Win32 API.
    pub fn is_alt_pressed() -> bool {
        unsafe {
            let lmenu = GetAsyncKeyState(VK_LMENU.0 as i32);
            let rmenu = GetAsyncKeyState(VK_RMENU.0 as i32);
            let menu = GetAsyncKeyState(VK_MENU.0 as i32);

            (lmenu as u16 & 0x8000) != 0
                || (rmenu as u16 & 0x8000) != 0
                || (menu as u16 & 0x8000) != 0
        }
    }
}

#[cfg(not(windows))]
mod platform {
    /// Stub for non-Windows platforms.
    /// TODO: Implement using `rdev` or `device_query` crate for Linux/macOS.
    pub fn is_alt_pressed() -> bool {
        false
    }
}

/// Spawns a background task that polls ALT key state at ~20fps.
/// When the state changes, it:
/// 1. Emits an `alt-key-state` event to the frontend
/// 2. Toggles click-through on the main window
pub fn spawn_input_tracker(app_handle: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut alt_pressed = false;

        loop {
            let is_alt_now = platform::is_alt_pressed();

            if is_alt_now != alt_pressed {
                alt_pressed = is_alt_now;
                log::info!("ALT key state changed: {}", alt_pressed);

                let _ = app_handle.emit(
                    "alt-key-state",
                    serde_json::json!({ "pressed": alt_pressed }),
                );

                // Toggle click-through: ALT pressed → allow interaction
                if let Some(window) = app_handle.get_webview_window("main") {
                    if let Err(e) = window.set_ignore_cursor_events(!alt_pressed) {
                        log::error!("Failed to set ignore_cursor_events: {:?}", e);
                    }
                }
            }

            sleep(Duration::from_millis(50)).await;
        }
    });
}
