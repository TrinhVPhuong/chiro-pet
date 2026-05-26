import React, { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { v4 as uuidv4 } from 'uuid';

interface RadialMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * Context menu shown on right-click.
 * Supports:
 * - Click outside to close
 * - Escape key to close
 * - Fade-in animation
 */
const RadialMenu: React.FC<RadialMenuProps> = ({ x, y, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Defer listener to avoid the opening click from immediately closing it
    const timeoutId = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-2xl bg-white/20 backdrop-blur-md shadow-lg flex flex-col gap-2 items-center justify-center p-4 border border-white/30 animate-[fadeIn_0.15s_ease-out]"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    >
      <div className="flex flex-col gap-2 pointer-events-auto">
        <button
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer"
          onClick={async () => {
            await invoke('anim_play', { 
              command: {
                command_id: uuidv4(),
                source: "user",
                timestamp_ms: Date.now(),
                state: "Talking",
                animation_id: "talk_happy",
                expression: "happy",
                loop_anim: true,
                play_once: false,
                crossfade_ms: 200.0,
                duration_ms: null,
                priority: 60,
                context_id: "talking",
                interrupt_policy: "higher_priority",
                fallback: "Idle",
                section: null
              }
            });
            onClose();
          }}
        >
          Test: Talk (Prio 60)
        </button>
        <button
          className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer"
          onClick={async () => {
            await invoke('anim_play', { 
              command: {
                command_id: uuidv4(),
                source: "user",
                timestamp_ms: Date.now(),
                state: "Dragging",
                animation_id: "drag_surprised",
                expression: "surprised",
                loop_anim: true,
                play_once: false,
                crossfade_ms: 100.0,
                duration_ms: null,
                priority: 95,
                context_id: "dragging",
                interrupt_policy: "higher_priority",
                fallback: "Idle",
                section: null
              }
            });
            onClose();
          }}
        >
          Test: Drag (Prio 95)
        </button>
        <button
          className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer"
          onClick={async () => {
            await invoke('anim_force_idle');
            onClose();
          }}
        >
          Test: Force Idle
        </button>
        <button
          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer"
          onClick={async () => {
            await invoke('open_app_data_dir');
            onClose();
          }}
        >
          Open AppData
        </button>
        <button
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer"
          onClick={onClose}
        >
          Close Menu
        </button>
      </div>
    </div>
  );
};

export default RadialMenu;
