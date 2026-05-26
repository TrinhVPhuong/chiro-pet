export type AnimationState =
    | 'Idle'
    | 'Listening'
    | 'Thinking'
    | 'Talking'
    | 'Happy'
    | 'Shy'
    | 'Sad'
    | 'Annoyed'
    | 'Surprised'
    | 'Proud'
    | 'Sleepy'
    | 'Focus'
    | 'Gaming'
    | 'Meeting'
    | 'Private'
    | 'Dragging'
    | 'MenuOpen'
    | 'Petted'
    | { OneShotAction: string };

export interface AnimationCommand {
    command_id: string;
    source: string;
    timestamp_ms: number;
    state: AnimationState;
    animation_id: string | null;
    expression: string | null;
    loop_anim: boolean;
    play_once: boolean;
    crossfade_ms: number;
    duration_ms: number | null;
    priority: number;
    context_id: string | null;
    interrupt_policy: string;
    fallback: AnimationState | null;
    section: string | null;
}

export interface AnimationSection {
    start_time: number;
    end_time: number;
}

export interface AnimationManifestEntry {
    id: string;
    file?: string;
    files?: string[];
    playback_type?: 'single' | 'random' | 'sequence';
    states: AnimationState[];
    priority: number;
    loop_anim: boolean;
    crossfade_ms: number;
    sections?: Record<string, AnimationSection>;
    tags?: string[];
}

export interface AnimationManifest {
    version: string;
    default_crossfade_ms: number;
    animations: AnimationManifestEntry[];
}
