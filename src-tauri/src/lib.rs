// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use tauri::Manager;

use tauri::Emitter;
use std::time::Duration;
use tokio::time::sleep;

#[cfg(windows)]
use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
#[cfg(windows)]
use windows::Win32::Foundation::POINT;
#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LMENU, VK_RMENU, VK_MENU};

#[tauri::command]
fn set_click_through(window: tauri::Window, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            
            // Background task to track global mouse position and ALT key state
            tauri::async_runtime::spawn(async move {
                let mut alt_pressed = false;
                loop {
                    #[cfg(windows)]
                    {
                        let mut point = POINT { x: 0, y: 0 };
                        unsafe {
                            // Check if ALT key is pressed
                            let lmenu = GetAsyncKeyState(VK_LMENU.0 as i32);
                            let rmenu = GetAsyncKeyState(VK_RMENU.0 as i32);
                            let menu = GetAsyncKeyState(VK_MENU.0 as i32);
                            
                            let is_alt_pressed_now = (lmenu as u16 & 0x8000) != 0 || 
                                                     (rmenu as u16 & 0x8000) != 0 || 
                                                     (menu as u16 & 0x8000) != 0;
                            
                            if is_alt_pressed_now != alt_pressed {
                                alt_pressed = is_alt_pressed_now;
                                log::info!("ALT key state changed: {}", alt_pressed);
                                let _ = app_handle.emit("alt-key-state", serde_json::json!({
                                    "pressed": alt_pressed
                                }));
                                
                                // Toggle click-through based on ALT key
                                // If ALT is pressed, don't ignore cursor events (allow drag)
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    let result = window.set_ignore_cursor_events(!alt_pressed);
                                    if let Err(e) = result {
                                        log::error!("Failed to set ignore_cursor_events: {:?}", e);
                                    } else {
                                        log::info!("Successfully set ignore_cursor_events to: {}", !alt_pressed);
                                    }
                                }
                            }

                            if GetCursorPos(&mut point).is_ok() {
                                let _ = app_handle.emit("global-mouse-move", serde_json::json!({
                                    "x": point.x,
                                    "y": point.y
                                }));
                            }
                        }
                    }
                    sleep(Duration::from_millis(50)).await; // 20fps tracking
                }
            });

            // Make window click-through initially
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_ignore_cursor_events(true);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, set_click_through])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
