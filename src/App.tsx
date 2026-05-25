import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { listen } from "@tauri-apps/api/event";
import { info, error as logError } from "@tauri-apps/plugin-log";
import "./App.css";
import RadialMenu from "./components/RadialMenu";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isAltPressed, setIsAltPressed] = useState(false);

  // Dragging state
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });

  // Refs for tracking mutable state without triggering re-renders
  const vrmRef = useRef<VRM | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing canvas elements to prevent duplicates during React HMR
    containerRef.current.innerHTML = '';

    // Setup Scene
    const scene = new THREE.Scene();

    // Setup Camera
    const frustumSize = 2.5; // Slightly larger frustum to safely fit scale 0.6
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      20.0
    );
    // Adjusted camera to safely view the entire body
    camera.position.set(0.0, 1.0, 5.0);
    cameraRef.current = camera;

    // Setup Renderer
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparent background
    containerRef.current.appendChild(renderer.domElement);

    // Setup Light
    const light = new THREE.DirectionalLight(0xffffff, Math.PI);
    light.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(light);
    
    // Ambient light for softer shadows
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Setup GLTF Loader with VRM Plugin
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    // Load the Cartethyia VRM model
    loader.load(
      "/models/Cartethyia.vrm",
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        scene.add(vrm.scene);
        vrm.scene.rotation.y = Math.PI; // Face the camera
        
        // Reset position and set scale safely
        vrm.scene.position.set(0, 0, 0);
        vrm.scene.scale.set(0.6, 0.6, 0.6);

        vrmRef.current = vrm;
        setModelLoaded(true);
        info("VRM Model loaded successfully with scale 0.6");
      },
      (progress) => {
        // Optional: log progress
      },
      (error) => {
        console.error("Failed to load model:", error);
        logError(`Failed to load model: ${error}`);
      }
    );

    // Listen to ALT key state from Rust for dragging
    const unlistenAltKey = listen("alt-key-state", (event: any) => {
      const payload = event.payload as { pressed: boolean };
      setIsAltPressed(payload.pressed);
    });

    // Handle Resize
    const handleResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      camera.left = (frustumSize * aspect) / -2;
      camera.right = (frustumSize * aspect) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = frustumSize / -2;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    const clock = new THREE.Clock();
    let blinkTimer = 0;
    let animationFrameId: number;
    
    const animate = () => {
      const deltaTime = clock.getDelta();
      
      if (vrmRef.current) {
        const vrm = vrmRef.current;
        
        try {
          // 1. Breathing Animation (Procedural)
          const time = clock.getElapsedTime();
          if (vrm.humanoid?.getNormalizedBoneNode("spine")) {
            const spine = vrm.humanoid.getNormalizedBoneNode("spine")!;
            // Subtle breathing rotation
            spine.rotation.x = Math.sin(time * 2) * 0.02;
          }

          // 2. Blinking Animation (Procedural)
          blinkTimer -= deltaTime;
          if (blinkTimer <= 0) {
            // Time to blink
            if (vrm.expressionManager) {
              vrm.expressionManager.setValue(VRMExpressionPresetName.Blink, 1.0);
              
              // Unblink after 0.15s
              setTimeout(() => {
                if (vrm.expressionManager) {
                  vrm.expressionManager.setValue(VRMExpressionPresetName.Blink, 0.0);
                }
              }, 150);
            }
            // Next blink in 3-6 seconds
            blinkTimer = 3.0 + Math.random() * 3.0;
          }
        } catch (err) {
          console.error("Animation loop error:", err);
        }

        vrm.update(deltaTime);
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    
    // Start animation loop
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      unlistenAltKey.then(f => f());
      if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

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
      <div 
        ref={containerRef} 
        className="w-full h-full pointer-events-none flex items-center justify-center"
      />
      
      {menuOpen && (
        <RadialMenu 
          x={menuPosition.x} 
          y={menuPosition.y} 
          onClose={() => setMenuOpen(false)} 
        />
      )}

      {isAltPressed && (
        <div 
          className="absolute inset-0 z-40 cursor-grab active:cursor-grabbing" 
          style={{ pointerEvents: 'auto' }}
          onPointerDown={(e) => {
            isDraggingRef.current = true;
            previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!isDraggingRef.current || !vrmRef.current || !cameraRef.current) return;
            
            const deltaX = e.clientX - previousMousePositionRef.current.x;
            const deltaY = e.clientY - previousMousePositionRef.current.y;
            
            // For OrthographicCamera, mapping pixels to world units is exact:
            const worldWidth = cameraRef.current.right - cameraRef.current.left;
            const worldHeight = cameraRef.current.top - cameraRef.current.bottom;
            
            const moveX = (deltaX / window.innerWidth) * worldWidth;
            const moveY = (deltaY / window.innerHeight) * worldHeight;
            
            vrmRef.current.scene.position.x += moveX;
            vrmRef.current.scene.position.y -= moveY; // Y is inverted in 3D vs screen
            
            previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e) => {
            isDraggingRef.current = false;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={(e) => {
            isDraggingRef.current = false;
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          }}
        />
      )}

      {!modelLoaded && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white bg-black/50 p-4 rounded-lg select-none pointer-events-none">
          Loading Character...
        </div>
      )}
      
      {isAltPressed && (
        <div className="absolute top-4 left-4 text-white bg-blue-500/80 px-3 py-1 rounded-full text-sm font-bold shadow-lg flex items-center gap-2 pointer-events-none animate-pulse z-50">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15"></polyline>
            <polyline points="9 5 12 2 15 5"></polyline>
            <polyline points="19 9 22 12 19 15"></polyline>
            <polyline points="9 19 12 22 15 19"></polyline>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="12" y1="2" x2="12" y2="22"></line>
          </svg>
          Drag Mode Active
        </div>
      )}
    </div>
  );
}

export default App;
