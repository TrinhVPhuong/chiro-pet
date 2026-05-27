import React, { useEffect, useState } from 'react';
import { listenShowBubble, SpeechBubblePayload } from '../services/tauriEvents';

const SpeechBubble: React.FC = () => {
  const [bubble, setBubble] = useState<SpeechBubblePayload | null>(null);

  useEffect(() => {
    let timeoutId: number;

    const setupListener = async () => {
      const unlisten = await listenShowBubble((payload) => {
        setBubble(payload);
        
        // Auto hide after some time
        const duration = Math.max(3000, payload.message.length * 50);
        clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          setBubble(null);
        }, duration) as unknown as number;
      });

      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;
    setupListener().then(fn => { unlistenFn = fn; });

    return () => {
      if (unlistenFn) unlistenFn();
      clearTimeout(timeoutId);
    };
  }, []);

  if (!bubble) return null;

  return (
    <div className="absolute top-10 left-1/2 -translate-x-1/2 max-w-sm bg-white border-2 border-gray-300 rounded-xl p-4 shadow-lg pointer-events-auto">
      <div className="text-gray-800 font-medium text-center">
        {bubble.message}
      </div>
      {/* Small arrow pointing down */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-b-2 border-r-2 border-gray-300 transform rotate-45"></div>
    </div>
  );
};

export default SpeechBubble;
