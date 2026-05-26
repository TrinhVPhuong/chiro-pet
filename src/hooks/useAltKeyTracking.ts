import { useEffect, useState } from 'react';
import { listenAltKeyState } from '../services/tauriEvents';

/**
 * Hook that tracks the ALT key state via Tauri events from the Rust backend.
 * Returns true when ALT is currently held down.
 */
export function useAltKeyTracking(): boolean {
  const [isAltPressed, setIsAltPressed] = useState(false);

  useEffect(() => {
    const unlistenPromise = listenAltKeyState(setIsAltPressed);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return isAltPressed;
}
