use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlinkSettings {
    pub min_interval_seconds: f32,
    pub max_interval_seconds: f32,
    pub close_duration_seconds: f32,
    pub hold_duration_seconds: f32,
    pub open_duration_seconds: f32,
    pub double_blink_chance: f32,
    pub sleepy_multiplier: f32,
}

impl Default for BlinkSettings {
    fn default() -> Self {
        Self {
            min_interval_seconds: 2.5,
            max_interval_seconds: 6.5,
            close_duration_seconds: 0.055,
            hold_duration_seconds: 0.035,
            open_duration_seconds: 0.09,
            double_blink_chance: 0.12,
            sleepy_multiplier: 1.6,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BreathingSettings {
    pub frequency_per_minute: f32,
    pub amplitude_chest: f32,
    pub amplitude_spine: f32,
    pub energy_multiplier: f32,
    pub smoothing: f32,
}

impl Default for BreathingSettings {
    fn default() -> Self {
        Self {
            frequency_per_minute: 14.0,
            amplitude_chest: 0.015,
            amplitude_spine: 0.008,
            energy_multiplier: 0.2,
            smoothing: 0.12,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LookAtSettings {
    pub head_weight: f32,
    pub neck_weight: f32,
    pub eye_weight: f32,
    pub max_head_yaw_deg: f32,
    pub max_head_pitch_deg: f32,
    pub max_neck_yaw_deg: f32,
    pub max_neck_pitch_deg: f32,
    pub smoothing: f32,
    pub return_to_center_seconds: f32,
    pub cursor_idle_timeout_seconds: f32,
}

impl Default for LookAtSettings {
    fn default() -> Self {
        Self {
            head_weight: 0.35,
            neck_weight: 0.15,
            eye_weight: 0.8,
            max_head_yaw_deg: 18.0,
            max_head_pitch_deg: 10.0,
            max_neck_yaw_deg: 8.0,
            max_neck_pitch_deg: 5.0,
            smoothing: 0.12,
            return_to_center_seconds: 1.2,
            cursor_idle_timeout_seconds: 4.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MicroMotionSettings {
    pub head_noise_amplitude_deg: f32,
    pub shoulder_amplitude_deg: f32,
    pub frequency: f32,
    pub noise_speed: f32,
}

impl Default for MicroMotionSettings {
    fn default() -> Self {
        Self {
            head_noise_amplitude_deg: 0.35,
            shoulder_amplitude_deg: 0.25,
            frequency: 0.07,
            noise_speed: 0.35,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProceduralAnimationSettings {
    pub enabled: bool,
    pub blink_enabled: bool,
    pub breathing_enabled: bool,
    pub look_at_cursor_enabled: bool,
    pub micro_motion_enabled: bool,
    pub global_intensity: f32,
    pub reduce_motion: bool,
    pub blink: BlinkSettings,
    pub breathing: BreathingSettings,
    pub look_at: LookAtSettings,
    pub micro_motion: MicroMotionSettings,
}

impl Default for ProceduralAnimationSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            blink_enabled: true,
            breathing_enabled: true,
            look_at_cursor_enabled: true,
            micro_motion_enabled: true,
            global_intensity: 1.0,
            reduce_motion: false,
            blink: BlinkSettings::default(),
            breathing: BreathingSettings::default(),
            look_at: LookAtSettings::default(),
            micro_motion: MicroMotionSettings::default(),
        }
    }
}
