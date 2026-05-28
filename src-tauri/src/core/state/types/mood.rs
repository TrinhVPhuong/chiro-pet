use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Mood(i8);

impl Mood {
    pub const MIN: i8 = -3;
    pub const MAX: i8 = 3;
    pub const DEFAULT: i8 = 0;

    pub fn new(value: i8) -> Self {
        Self(value.clamp(Self::MIN, Self::MAX))
    }

    pub fn value(&self) -> i8 {
        self.0
    }

    pub fn normalized(&self) -> f32 {
        (self.0 as f32 - Self::MIN as f32) / (Self::MAX - Self::MIN) as f32
    }

    pub fn apply_delta(self, delta: i8) -> Self {
        let raw = (self.0 as i16) + (delta as i16);
        Self::new(raw.clamp(Self::MIN as i16, Self::MAX as i16) as i8)
    }
}

impl Default for Mood {
    fn default() -> Self {
        Self(Self::DEFAULT)
    }
}
