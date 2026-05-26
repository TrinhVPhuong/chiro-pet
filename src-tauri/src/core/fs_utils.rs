use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn init_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let directories = [
        app_data_dir.join("animations").join("vrma"),
        app_data_dir.join("models"),
        app_data_dir.join("memory"),
        app_data_dir.join("config"),
    ];

    for dir in &directories {
        if !dir.exists() {
            fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
        }
    }

    // Attempt to copy default manifest if it doesn't exist
    let manifest_path = app_data_dir.join("animations").join("manifest.json");
    if !manifest_path.exists() {
        if let Ok(resource_path) = app.path().resource_dir() {
            let default_manifest = resource_path.join("public").join("animation").join("manifest.json");
            if default_manifest.exists() {
                let _ = fs::copy(&default_manifest, &manifest_path);
            }
        }
    }

    Ok(app_data_dir)
}

pub fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))
}
