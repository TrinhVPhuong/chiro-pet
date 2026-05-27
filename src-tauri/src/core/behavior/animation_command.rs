use serde::{Deserialize, Serialize};
use uuid::Uuid;
use super::animation_state::AnimationState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationCommand {
    pub command_id: String,
    pub source: String,
    pub timestamp_ms: u64,
    pub state: AnimationState,
    pub animation_id: Option<String>,
    pub expression: Option<String>,
    pub loop_anim: bool,
    pub play_once: bool,
    pub crossfade_ms: f32,
    pub duration_ms: Option<u64>,
    pub priority: u8,
    pub context_id: Option<String>,
    pub interrupt_policy: String, // "always", "higher_priority", "never"
    pub fallback: Option<AnimationState>,
    pub section: Option<String>, // "intro", "loop", "outro"
}

impl AnimationCommand {
    pub fn idle() -> Self {
        Self {
            command_id: Uuid::new_v4().to_string(),
            source: "system".to_string(),
            timestamp_ms: 0, // Should be set by caller
            state: AnimationState::Idle,
            animation_id: None,
            expression: Some("neutral".to_string()),
            loop_anim: true,
            play_once: false,
            crossfade_ms: 500.0,
            duration_ms: None,
            priority: 10,
            context_id: None,
            interrupt_policy: "always".to_string(),
            fallback: None,
            section: None,
        }
    }

    #[allow(dead_code)]
    pub fn thinking(context_id: String) -> Self {
        Self {
            command_id: Uuid::new_v4().to_string(),
            source: "ai".to_string(),
            timestamp_ms: 0,
            state: AnimationState::Thinking,
            animation_id: None,
            expression: Some("neutral".to_string()), // Maybe a thinking expression
            loop_anim: true,
            play_once: false,
            crossfade_ms: 300.0,
            duration_ms: None, // Wait until explicitly stopped
            priority: 40,
            context_id: Some(context_id),
            interrupt_policy: "higher_priority".to_string(),
            fallback: Some(AnimationState::Idle),
            section: None,
        }
    }

    #[allow(dead_code)]
    pub fn talking(duration_ms: u64, context_id: String) -> Self {
        Self {
            command_id: Uuid::new_v4().to_string(),
            source: "ai".to_string(),
            timestamp_ms: 0,
            state: AnimationState::Talking,
            animation_id: None,
            expression: Some("joy".to_string()), // Default, can be overridden
            loop_anim: true,
            play_once: false,
            crossfade_ms: 200.0,
            duration_ms: Some(duration_ms),
            priority: 60,
            context_id: Some(context_id),
            interrupt_policy: "higher_priority".to_string(),
            fallback: Some(AnimationState::Idle),
            section: None,
        }
    }

    #[allow(dead_code)]
    pub fn dragging() -> Self {
        Self {
            command_id: Uuid::new_v4().to_string(),
            source: "user".to_string(),
            timestamp_ms: 0,
            state: AnimationState::Dragging,
            animation_id: None,
            expression: Some("surprised".to_string()),
            loop_anim: true,
            play_once: false,
            crossfade_ms: 100.0,
            duration_ms: None,
            priority: 95, // Very high priority
            context_id: Some("dragging".to_string()),
            interrupt_policy: "higher_priority".to_string(), // Only interrupted by system force
            fallback: Some(AnimationState::Idle),
            section: None,
        }
    }
}
