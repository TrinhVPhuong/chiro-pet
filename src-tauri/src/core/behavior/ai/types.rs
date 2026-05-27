use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AIEmotion {
    Neutral,
    Happy,
    Shy,
    Caring,
    Playful,
    Sleepy,
    Worried,
    Focused,
    Proud,
    Annoyed,
    Surprised,
    Sad,
    Curiosity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AIIntent {
    SmallTalk,
    AnswerQuestion,
    EmotionalSupport,
    Encouragement,
    Reminder,
    Joke,
    Acknowledge,
    BoundaryUpdate,
    PreferenceUpdate,
    Silent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AIPriority {
    Silent,
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIStateDelta {
    pub mood: i8,        // -3..3
    pub energy: i8,      // -3..3
    pub affinity: i8,    // -2..2
    pub trust: i8,       // -1..1
    pub familiarity: i8, // -1..1
}

impl Default for AIStateDelta {
    fn default() -> Self {
        Self {
            mood: 0,
            energy: 0,
            affinity: 0,
            trust: 0,
            familiarity: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIInterruption {
    pub should_notify: bool,
    pub level: u8,       // 0..4
    pub priority: AIPriority,
}

impl Default for AIInterruption {
    fn default() -> Self {
        Self {
            should_notify: false,
            level: 0,
            priority: AIPriority::Silent,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AINextActionType {
    Wait,
    ScheduleCheckin,
    SuggestUserAction,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AINextAction {
    pub r#type: AINextActionType,
    pub delay_minutes: Option<u32>,
    pub reason: Option<String>,
}

impl Default for AINextAction {
    fn default() -> Self {
        Self {
            r#type: AINextActionType::Wait,
            delay_minutes: Some(30),
            reason: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AIMemoryOperationType {
    Create,
    Patch,
    Merge,
    DeleteRequest,
    Verify,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AIMemoryScope {
    Shared,
    Character,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIMemoryOperation {
    pub operation: AIMemoryOperationType,
    pub scope: Option<AIMemoryScope>,
    pub r#type: Option<String>,
    pub content: Option<String>,
    pub memory_id: Option<String>,
    pub patch: Option<serde_json::Value>,
    pub importance: Option<u8>,
    pub confidence: Option<f32>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIInteractionResponse {
    pub message: String,
    pub emotion: AIEmotion,
    pub intent: AIIntent,
    pub state_delta: AIStateDelta,
    pub suggested_animation: Option<String>,
    pub suggested_expression: Option<String>,
    #[serde(default)]
    pub interruption: AIInterruption,
    #[serde(default)]
    pub memory_operations: Vec<AIMemoryOperation>,
    #[serde(default)]
    pub next_action: AINextAction,
    pub debug_reason: Option<String>,
}
