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
