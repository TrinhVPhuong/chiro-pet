pub mod mood;
pub mod energy;
pub mod small_scale;
pub mod large_scale;
pub mod character_state;

pub use mood::Mood;
pub use energy::Energy;
pub use small_scale::{Curiosity, Patience, Confidence, Loneliness};
pub use large_scale::{Affinity, Trust, Familiarity};
pub use character_state::CharacterState;

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, NaiveDate};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppMode {
    Normal,
    Focus,
    Gaming,
    Meeting,
    Watching,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AILifecycleState {
    Idle,
    Thinking,
    Speaking,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeAppState {
    pub active_character_id: String,
    pub app_mode: AppMode,
    pub private_mode: bool,
    pub quiet_mode: bool,
    pub ai_lifecycle_state: AILifecycleState,
    pub last_interaction_at: Option<DateTime<Utc>>,
    pub last_proactive_at: Option<DateTime<Utc>>,
}

impl Default for RuntimeAppState {
    fn default() -> Self {
        Self {
            active_character_id: String::new(),
            app_mode: AppMode::Normal,
            private_mode: false,
            quiet_mode: false,
            ai_lifecycle_state: AILifecycleState::Idle,
            last_interaction_at: None,
            last_proactive_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCounters {
    pub character_id: String,
    pub date: NaiveDate,
    pub affinity_gained_today: u32,
    pub proactive_count_today: u32,
    pub ai_calls_today: u32,
    pub ai_cost_cents_today: u32,
    pub interaction_count_today: u32,
}

impl DailyCounters {
    pub fn new(character_id: String, date: NaiveDate) -> Self {
        Self {
            character_id,
            date,
            affinity_gained_today: 0,
            proactive_count_today: 0,
            ai_calls_today: 0,
            ai_cost_cents_today: 0,
            interaction_count_today: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct CharacterStateDelta {
    pub mood: i8,
    pub energy: i8,
    pub affinity: i8,
    pub trust: i8,
    pub familiarity: i8,
    pub curiosity: i8,
    pub patience: i8,
    pub confidence: i8,
}

impl CharacterStateDelta {
    #[allow(dead_code)]
    pub fn zero() -> Self {
        Self {
            mood: 0, energy: 0, affinity: 0, trust: 0,
            familiarity: 0, curiosity: 0, patience: 0, confidence: 0,
        }
    }

    #[allow(dead_code)]
    pub fn is_zero(&self) -> bool {
        self.mood == 0 && self.energy == 0 && self.affinity == 0 && 
        self.trust == 0 && self.familiarity == 0 && self.curiosity == 0 && 
        self.patience == 0 && self.confidence == 0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MutationSource {
    Ai,
    UserAction,
    Decay,
    DailyReset,
    Migration,
    Manual,
    OfflineAI, // Added for Phase 4
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationResult {
    pub character_id: String,
    pub applied_delta: CharacterStateDelta,
    pub original_delta: CharacterStateDelta,
    pub new_state: CharacterState,
    pub modified_by_guards: Vec<String>,
    pub warnings: Vec<String>,
}
