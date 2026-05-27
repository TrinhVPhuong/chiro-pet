import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AltKeyPayload } from '../types';

/**
 * Listen to ALT key state changes emitted from the Rust backend.
 * Returns an unlisten function to clean up the listener.
 */
export function listenAltKeyState(
  callback: (pressed: boolean) => void
): Promise<UnlistenFn> {
  return listen<AltKeyPayload>('alt-key-state', (event) => {
    callback(event.payload.pressed);
  });
}

export function notifyAnimationFinished(): Promise<void> {
  import('@tauri-apps/api/core').then(({ invoke }) => {
    invoke('notify_animation_finished').catch((e) => {
      console.error('Failed to notify animation finished:', e);
    });
  });
  return Promise.resolve();
}

export interface SpeechBubblePayload {
  message: string;
  emotion: string;
}

export function listenShowBubble(
  callback: (payload: SpeechBubblePayload) => void
): Promise<UnlistenFn> {
  return listen<SpeechBubblePayload>('show_bubble', (event) => {
    callback(event.payload);
  });
}

export function sendChatMessage(message: string): Promise<void> {
  return import('@tauri-apps/api/core').then(({ invoke }) => {
    return invoke('ai_send_chat', { message });
  });
}
