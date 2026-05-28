use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

use super::mood::Mood;
use super::energy::Energy;
use super::small_scale::{Curiosity, Patience, Confidence, Loneliness};
use super::large_scale::{Affinity, Trust, Familiarity};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterState {
    pub character_id: String,

    // Short-term affective
    pub mood: Mood,
    pub energy: Energy,

    // Personality-driven (slow change)
    pub curiosity: Curiosity,
    pub patience: Patience,
    pub confidence: Confidence,
    pub loneliness: Loneliness,

    // Relationship (slow build)
    pub affinity: Affinity,
    pub trust: Trust,
    pub familiarity: Familiarity,

    pub updated_at: DateTime<Utc>,
    pub schema_version: u32,
}

impl Default for CharacterState {
    fn default() -> Self {
        Self {
            character_id: String::new(),
            mood: Mood::default(),
            energy: Energy::default(),
            affinity: Affinity::default(),
            trust: Trust::default(),
            familiarity: Familiarity::default(),
            curiosity: Curiosity::default(),
            patience: Patience::default(),
            confidence: Confidence::default(),
            loneliness: Loneliness::default(),
            updated_at: Utc::now(),
            schema_version: 2,
        }
    }
}
