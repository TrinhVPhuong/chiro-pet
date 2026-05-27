import { useState } from 'react';
import { useVRMScene } from './hooks/useVRMScene';
import { useAltKeyTracking } from './hooks/useAltKeyTracking';
import CharacterCanvas from './components/CharacterCanvas';
import DragOverlay from './components/DragOverlay';
import RadialMenu from './components/RadialMenu';
import StatusIndicator from './components/StatusIndicator';
import LoadingIndicator from './components/LoadingIndicator';
import ChatPanel from './components/ChatPanel';
import SpeechBubble from './components/SpeechBubble';
import type { Position } from './types';
import './App.css';

const MODEL_PATH = '/models/Cartethyia.vrm';

/**
 * Root application component — thin composition layer.
 * All logic is delegated to hooks and child components.
 */
function App() {
  const { containerRef, vrmRef, cameraRef, modelLoaded } = useVRMScene({
    modelPath: MODEL_PATH,
  });
  const isAltPressed = useAltKeyTracking();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<Position>({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  return (
    <div
      className="relative w-full h-full bg-transparent overflow-hidden select-none"
      onContextMenu={handleContextMenu}
    >
      <CharacterCanvas containerRef={containerRef} />

      <DragOverlay
        isEnabled={isAltPressed}
        vrmRef={vrmRef}
        cameraRef={cameraRef}
      />

      {menuOpen && (
        <RadialMenu
          x={menuPosition.x}
          y={menuPosition.y}
          onClose={() => setMenuOpen(false)}
        />
      )}

      <SpeechBubble />
      <ChatPanel />

      <LoadingIndicator visible={!modelLoaded} />
      <StatusIndicator visible={isAltPressed} label="Drag Mode Active" />
    </div>
  );
}

export default App;
