import React from 'react';

interface CharacterCanvasProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Wrapper component for the Three.js canvas.
 * pointer-events-none ensures clicks pass through the 3D scene
 * to the desktop underneath.
 */
const CharacterCanvas: React.FC<CharacterCanvasProps> = ({ containerRef }) => {
  return (
    <div
      ref={containerRef}
      className="w-full h-full pointer-events-none flex items-center justify-center"
    />
  );
};

export default CharacterCanvas;
