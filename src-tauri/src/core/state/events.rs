use serde::{Deserialize, Serialize};
use chrono::NaiveDate;

use super::types::{AppMode, AILifecycleState, CharacterState, CharacterStateDelta, MutationSource};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StateEvent {
    CharacterStateChanged {
        character_id: String,
        new_state: CharacterState,
        delta: CharacterStateDelta,
        source: MutationSource,
    },
    AppModeChanged {
        old: AppMode,
        new: AppMode,
    },
    ActiveCharacterChanged {
        old: Option<String>,
        new: String,
    },
    PrivateModeToggled { enabled: bool },
    QuietModeToggled { enabled: bool },
    AILifecycleChanged { state: AILifecycleState },
    DailyResetDone { date: NaiveDate },
}
