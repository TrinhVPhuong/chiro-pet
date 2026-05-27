use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AnimationState {
    Idle,
    Listening,
    Thinking,
    Talking,
    Happy,
    Shy,
    Sad,
    Annoyed,
    Surprised,
    Proud,
    Sleepy,
    Focus,
    Gaming,
    Meeting,
    Private,
    Dragging,
    MenuOpen,
    Petted,
    Dancing,
    Exercising,
    OneShotAction(String),
}
