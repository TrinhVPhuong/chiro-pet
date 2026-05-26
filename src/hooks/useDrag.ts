import { useRef, useCallback, useEffect } from 'react';
import type * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { Position } from '../types';
import { playAnimation, stopAnimationContext } from '../services/animation';

interface UseDragOptions {
  vrmRef: React.RefObject<VRM | null>;
  cameraRef: React.RefObject<THREE.OrthographicCamera | null>;
  isEnabled: boolean;
}

/**
 * Hook that manages drag behavior for the VRM character.
 * Converts screen-space mouse deltas to world-space movement.
 * 
 * Key fix: resets drag state when `isEnabled` becomes false,
 * preventing the stuck-drag bug when ALT is released mid-drag.
 */
export function useDrag({ vrmRef, cameraRef, isEnabled }: UseDragOptions) {
  const isDraggingRef = useRef(false);
  const previousPositionRef = useRef<Position>({ x: 0, y: 0 });

  // Fix race condition: reset drag state when drag mode is disabled
  useEffect(() => {
    if (!isEnabled) {
      isDraggingRef.current = false;
    }
  }, [isEnabled]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    previousPositionRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Trigger dragging animation
    playAnimation({
      command_id: crypto.randomUUID(),
      source: 'user',
      timestamp_ms: 0,
      state: 'Dragging',
      animation_id: null,
      expression: 'surprised',
      loop_anim: true,
      play_once: false,
      crossfade_ms: 100,
      duration_ms: null,
      priority: 95,
      context_id: 'dragging',
      interrupt_policy: 'higher_priority',
      fallback: 'Idle',
      section: null
    }).catch(console.error);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !vrmRef.current || !cameraRef.current) return;

    const deltaX = e.clientX - previousPositionRef.current.x;
    const deltaY = e.clientY - previousPositionRef.current.y;

    const camera = cameraRef.current;
    const worldWidth = camera.right - camera.left;
    const worldHeight = camera.top - camera.bottom;

    // Map pixel deltas to orthographic world units
    const moveX = (deltaX / window.innerWidth) * worldWidth;
    const moveY = (deltaY / window.innerHeight) * worldHeight;

    vrmRef.current.scene.position.x += moveX;
    vrmRef.current.scene.position.y -= moveY; // Y is inverted in 3D vs screen

    previousPositionRef.current = { x: e.clientX, y: e.clientY };
  }, [vrmRef, cameraRef]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Stop dragging animation context
    stopAnimationContext('dragging').catch(console.error);
  }, []);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    // Stop dragging animation context
    stopAnimationContext('dragging').catch(console.error);
  }, []);

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
