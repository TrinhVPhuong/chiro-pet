use serde::{Deserialize, Serialize};

macro_rules! small_scale_newtype {
    ($name:ident, $default:expr) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(u8);

        impl $name {
            pub const MIN: u8 = 0;
            pub const MAX: u8 = 5;
            pub const DEFAULT: u8 = $default;

            pub fn new(value: u8) -> Self {
                Self(value.min(Self::MAX))
            }

            pub fn value(&self) -> u8 { self.0 }

            pub fn normalized(&self) -> f32 {
                self.0 as f32 / Self::MAX as f32
            }

            pub fn apply_delta(self, delta: i16) -> Self {
                let raw = (self.0 as i16) + delta;
                Self::new(raw.clamp(0, Self::MAX as i16) as u8)
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self(Self::DEFAULT)
            }
        }
    };
}

small_scale_newtype!(Curiosity, 2);
small_scale_newtype!(Patience, 3);
small_scale_newtype!(Confidence, 2);
small_scale_newtype!(Loneliness, 0);
