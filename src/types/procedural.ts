export interface BlinkSettings {
    min_interval_seconds: number;
    max_interval_seconds: number;
    close_duration_seconds: number;
    hold_duration_seconds: number;
    open_duration_seconds: number;
    double_blink_chance: number;
    sleepy_multiplier: number;
}

export interface BreathingSettings {
    frequency_per_minute: number;
    amplitude_chest: number;
    amplitude_spine: number;
    energy_multiplier: number;
    smoothing: number;
}

export interface LookAtSettings {
    head_weight: number;
    neck_weight: number;
    eye_weight: number;
    max_head_yaw_deg: number;
    max_head_pitch_deg: number;
    max_neck_yaw_deg: number;
    max_neck_pitch_deg: number;
    smoothing: number;
    return_to_center_seconds: number;
    cursor_idle_timeout_seconds: number;
}

export interface MicroMotionSettings {
    head_noise_amplitude_deg: number;
    shoulder_amplitude_deg: number;
    frequency: number;
    noise_speed: number;
}

export interface ProceduralAnimationSettings {
    enabled: boolean;
    blink_enabled: boolean;
    breathing_enabled: boolean;
    look_at_cursor_enabled: boolean;
    micro_motion_enabled: boolean;
    global_intensity: number;
    reduce_motion: boolean;
    blink: BlinkSettings;
    breathing: BreathingSettings;
    look_at: LookAtSettings;
    micro_motion: MicroMotionSettings;
}
