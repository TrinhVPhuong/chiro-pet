import React from 'react';
import type * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { useDrag } from '../hooks/useDrag';

interface DragOverlayProps {
  isEnabled: boolean;
  vrmRef: React.RefObject<VRM | null>;
  cameraRef: React.RefObject<THREE.OrthographicCamera | null>;
}

/**
 * Invisible overlay that captures drag events when ALT is held.
 * Always mounted in the DOM — toggles pointer-events via CSS instead of
 * conditional rendering. This prevents the race condition where unmounting
 * during an active drag would leave isDraggingRef stuck at true.
 */
const DragOverlay: React.FC<DragOverlayProps> = ({ isEnabled, vrmRef, cameraRef }) => {
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useDrag({ vrmRef, cameraRef, isEnabled });

  return (
    <div
      className={`absolute inset-0 z-40 ${isEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ pointerEvents: isEnabled ? 'auto' : 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
};

export default DragOverlay;
