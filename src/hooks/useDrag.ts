import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { Position } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { playAnimation, stopAnimationContext } from '../services/animation';

interface UseDragOptions {
  vrmRef: React.RefObject<VRM | null>;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
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

  const dragPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const raycasterRef = useRef(new THREE.Raycaster());

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!vrmRef.current || !cameraRef.current) return;
    
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Update drag plane to match current Z of character, facing camera
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(
      cameraRef.current.getWorldDirection(new THREE.Vector3()).negate(),
      vrmRef.current.scene.position
    );

    // Initial cast to set previous position in 3D world space
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    
    const intersectPoint = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersectPoint);
    if (intersectPoint) {
       previousPositionRef.current = { x: intersectPoint.x, y: intersectPoint.y };
    }

    // Trigger dragging animation
    playAnimation({
      command_id: uuidv4(),
      source: 'user',
      timestamp_ms: Date.now(),
      state: 'Dragging',
      animation_id: 'drag_surprised',
      expression: 'surprised',
      loop_anim: true,
      play_once: false,
      crossfade_ms: 100.0,
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

    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    
    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    
    const intersectPoint = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersectPoint);
    
    if (intersectPoint) {
      const moveX = intersectPoint.x - previousPositionRef.current.x;
      const moveY = intersectPoint.y - previousPositionRef.current.y;

      vrmRef.current.scene.position.x += moveX;
      vrmRef.current.scene.position.y += moveY;

      previousPositionRef.current = { x: intersectPoint.x, y: intersectPoint.y };
    }
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
