import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import "./App.css";
import RadialMenu from "./components/RadialMenu";

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    // Setup Scene
    const scene = new THREE.Scene();

    // Setup Camera
    const camera = new THREE.PerspectiveCamera(
      35,
      window.innerWidth / window.innerHeight,
      0.1,
      20.0
    );
    camera.position.set(0.0, 1.0, 5.0);

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

    // Setup GLTF Loader with VRM Plugin
    const loader = new GLTFLoader();
    
    loader.register((parser) => {
      return new VRMLoaderPlugin(parser);
    });

    // Load the Cartethyia VRM model
    let currentVrm: any = null;
    loader.load(
      "/models/Cartethyia.vrm",
      (gltf) => {
        const vrm = gltf.userData.vrm;
        scene.add(vrm.scene);
        vrm.scene.rotation.y = Math.PI; // Face the camera
        
        // Adjust camera to fit the model properly
        // Typically VRM models are around 1.5 - 1.7 units tall, origin at feet
        camera.position.set(0.0, 1.2, 3.0); 

        currentVrm = vrm;
        setModelLoaded(true);
      },
      (progress) => console.log("Loading model...", 100.0 * (progress.loaded / progress.total), "%"),
      (error) => console.error(error)
    );


    // Handle Resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Animation Loop
    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      const deltaTime = clock.getDelta();
      
      if (currentVrm) {
        currentVrm.update(deltaTime);
      }

      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
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
        className="w-full h-full"
        style={{ pointerEvents: 'auto' }} 
        data-tauri-drag-region 
      />
      
      {menuOpen && (
        <RadialMenu 
          x={menuPosition.x} 
          y={menuPosition.y} 
          onClose={() => setMenuOpen(false)} 
        />
      )}

      {!modelLoaded && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white bg-black/50 p-4 rounded-lg select-none pointer-events-none">
          Loading Character...
        </div>
      )}
    </div>
  );
}

export default App;