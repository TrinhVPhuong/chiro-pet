import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import type { AnimationCommand } from '../types/animation';

/**
 * Listen to animation commands emitted from the Rust backend.
 * Returns an unlisten function to clean up the listener.
 */
export function listenAnimationCommand(
    callback: (command: AnimationCommand) => void
): Promise<UnlistenFn> {
    return listen<AnimationCommand>('animation_command', (event) => {
        callback(event.payload);
    });
}

/**
 * Request an animation play from the frontend
 */
export async function playAnimation(command: AnimationCommand): Promise<void> {
    await invoke('anim_play', { command });
}

/**
 * Stop an animation context
 */
export async function stopAnimationContext(contextId: string): Promise<void> {
    await invoke('anim_stop_context', { contextId });
}

/**
 * Force character back to idle
 */
export async function forceIdleAnimation(): Promise<void> {
    await invoke('anim_force_idle');
}

/**
 * List available animations (mock for now)
 */
export async function listAvailableAnimations(): Promise<string[]> {
    return await invoke<string[]>('anim_list_available');
}
