use std::fs;
use std::path::Path;
use super::animation_manifest::AnimationManifestEntry;
use super::animation_state::AnimationState;

pub fn scan_animations(base_dir: &Path) -> Vec<AnimationManifestEntry> {
    let mut entries = Vec::new();
    if !base_dir.exists() || !base_dir.is_dir() {
        log::warn!("Animation directory does not exist or is not a directory: {:?}", base_dir);
        return entries;
    }

    scan_dir_recursive(base_dir, base_dir, &mut entries);
    entries
}

fn scan_dir_recursive(current_dir: &Path, base_dir: &Path, entries: &mut Vec<AnimationManifestEntry>) {
    if let Ok(read_dir) = fs::read_dir(current_dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_dir_recursive(&path, base_dir, entries);
            } else if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "vrma" {
                        if let Some(manifest_entry) = process_vrma_file(&path, base_dir) {
                            entries.push(manifest_entry);
                        }
                    }
                }
            }
        }
    }
}

fn process_vrma_file(file_path: &Path, base_dir: &Path) -> Option<AnimationManifestEntry> {
    let relative_path = match file_path.strip_prefix(base_dir) {
        Ok(p) => p,
        Err(_) => return None,
    };
    
    // Convert to string and ensure forward slashes
    let file_str = relative_path.to_string_lossy().replace("\\", "/");
    let file_name = file_path.file_stem()?.to_string_lossy().to_string();
    
    // Get parent folder name for classification
    let parent_folder = file_path.parent()?.file_name()?.to_string_lossy().to_lowercase();
    
    // Anchor Point 1: Map folder to state & priority
    // Note: Can refactor with Offline Utility AI config later
    let (states, priority, loop_anim) = map_folder_to_state_priority(&parent_folder, &file_name);
    
    let base_pose = extract_base_pose(&file_name);
    
    let mut tags = vec![parent_folder.clone()];
    tags.push(file_name.clone());
    
    Some(AnimationManifestEntry {
        id: file_name.clone(),
        file: file_str,
        states,
        priority,
        loop_anim,
        crossfade_ms: 300.0,
        sections: None,
        tags: Some(tags),
        base_pose,
    })
}

fn map_folder_to_state_priority(folder: &str, file_name: &str) -> (Vec<AnimationState>, u8, bool) {
    let mut states = Vec::new();
    let priority;
    let mut loop_anim = true;
    
    let file_lower = file_name.to_lowercase();
    
    match folder {
        "idles" => {
            states.push(AnimationState::Idle);
            priority = 10;
        },
        "emotions" => {
            priority = 50;
            if file_lower.contains("joy") || file_lower.contains("happy") || file_lower.contains("amusement") || file_lower.contains("excitement") || file_lower.contains("love") || file_lower.contains("admiration") || file_lower.contains("approval") || file_lower.contains("gratitude") || file_lower.contains("caring") {
                states.push(AnimationState::Happy);
            } else if file_lower.contains("anger") || file_lower.contains("annoyance") || file_lower.contains("disapproval") || file_lower.contains("disgust") {
                states.push(AnimationState::Annoyed);
            } else if file_lower.contains("sad") || file_lower.contains("grief") || file_lower.contains("disappointment") {
                states.push(AnimationState::Sad);
            } else if file_lower.contains("surprise") {
                states.push(AnimationState::Surprised);
            } else if file_lower.contains("fear") || file_lower.contains("embarrassment") {
                states.push(AnimationState::Shy);
            } else if file_lower.contains("curiosity") || file_lower.contains("desire") || file_lower.contains("confusion") {
                states.push(AnimationState::Thinking);
            } else {
                states.push(AnimationState::Happy);
            }
        },
        "hitareas" => {
            states.push(AnimationState::Petted);
            priority = 95;
            loop_anim = false;
        },
        "dances" => {
            states.push(AnimationState::Dancing);
            priority = 40;
        },
        "exercises" => {
            states.push(AnimationState::Exercising);
            priority = 40;
        },
        "actions" => {
            priority = 60;
            loop_anim = false;
            states.push(AnimationState::OneShotAction(file_name.to_string()));
        },
        _ => {
            states.push(AnimationState::Idle);
            priority = 10;
        }
    }
    
    (states, priority, loop_anim)
}

fn extract_base_pose(file_name: &str) -> String {
    let lower = file_name.to_lowercase();
    if lower.contains("sit") {
        "Sit".to_string()
    } else if lower.contains("lay") {
        "Laying".to_string()
    } else if lower.contains("kneel") {
        "Kneel".to_string()
    } else if lower.contains("crouch") {
        "Crouch".to_string()
    } else {
        "Stand".to_string()
    }
}
