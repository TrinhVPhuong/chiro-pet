use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use super::animation_state::AnimationState;
use rand::Rng;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationSection {
    pub start_time: f32,
    pub end_time: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationManifestEntry {
    pub id: String,
    pub file: String,
    pub states: Vec<AnimationState>,
    pub priority: u8,
    pub loop_anim: bool,
    pub crossfade_ms: f32,
    pub sections: Option<HashMap<String, AnimationSection>>,
    pub tags: Option<Vec<String>>,
    #[serde(default = "default_base_pose")]
    pub base_pose: String,
}

fn default_base_pose() -> String {
    "Stand".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationManifest {
    pub version: String,
    pub default_crossfade_ms: f32,
    pub animations: Vec<AnimationManifestEntry>,
}

impl AnimationManifest {
    #[allow(dead_code)]
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).map_err(|e| e.to_string())
    }

    pub fn get_animation_id_for_state(&self, state: &AnimationState, exclude_id: Option<&str>) -> Option<String> {
        let mut candidates: Vec<&AnimationManifestEntry> = self.animations
            .iter()
            .filter(|a| a.states.contains(state))
            .collect();

        if let Some(exclude) = exclude_id {
            // Only exclude if we have more than one candidate, otherwise we might return None unnecessarily
            if candidates.len() > 1 {
                candidates.retain(|a| a.id != exclude);
            }
        }

        if candidates.is_empty() {
            return None;
        }

        let mut rng = rand::thread_rng();
        let index = rng.gen_range(0..candidates.len());
        Some(candidates[index].id.clone())
    }

    #[allow(dead_code)]
    pub fn get_entry(&self, animation_id: &str) -> Option<AnimationManifestEntry> {
        self.animations.iter().find(|a| a.id == animation_id).cloned()
    }
}
