import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import { info, error as logError } from '@tauri-apps/plugin-log';
import { AnimationController } from '../overlay/three/AnimationController';

interface UseVRMSceneOptions {
  modelPath: string;
}

/**
 * Properly disposes all Three.js resources in a scene to prevent GPU memory leaks.
 */
function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose();

      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      materials.forEach((material) => {
        if (!material) return;
        // Dispose any textures attached to the material
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) {
            value.dispose();
          }
        }
        material.dispose();
      });
    }
  });
}

/**
 * Hook that manages the entire Three.js scene lifecycle:
 * - Scene, camera, renderer, lighting setup
 * - VRM model loading
 * - Procedural animations (breathing, blinking)
 * - Render loop
 * - Full cleanup on unmount (no memory leaks)
 */
export function useVRMScene({ modelPath }: UseVRMSceneOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const vrmRef = useRef<VRM | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing canvas elements (HMR support)
    containerRef.current.innerHTML = '';

    // --- Scene Setup ---
    const scene = new THREE.Scene();

    const frustumSize = 2.5;
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      20.0
    );
    camera.position.set(0.0, 1.0, 5.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);

    // --- Lighting ---
    const directionalLight = new THREE.DirectionalLight(0xffffff, Math.PI);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Declare controller out here so loader can assign it
    let animController: AnimationController | null = null;

    // --- VRM Model Loading ---
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
      modelPath,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM;
        scene.add(vrm.scene);
        vrm.scene.rotation.y = Math.PI; // Face the camera
        vrm.scene.position.set(0, 0, 0);
        vrm.scene.scale.set(0.6, 0.6, 0.6);

        vrmRef.current = vrm;

        // Initialize Animation Controller
        animController = new AnimationController(vrm);
        animController.initialize().then(() => {
          setModelLoaded(true);
          info('VRM Model & Animation Controller loaded successfully');
        }).catch(e => {
          console.error('Failed to init animation controller', e);
        });

        // Start rendering immediately, animation controller will kick in when ready
        animate();
      },
      undefined,
      (err) => {
        console.error('Failed to load model:', err);
        logError(`Failed to load model: ${err}`);
      }
    );

    // --- Resize Handler ---
    const handleResize = () => {
      const newAspect = window.innerWidth / window.innerHeight;
      camera.left = (frustumSize * newAspect) / -2;
      camera.right = (frustumSize * newAspect) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = frustumSize / -2;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- Controller & Animation Loop ---
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const deltaTime = clock.getDelta();

      if (vrmRef.current) {
        vrmRef.current.update(deltaTime);
      }

      if (animController) {
        animController.update(deltaTime);
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);

      if (animController) {
        animController.dispose();
      }

      // Dispose all Three.js GPU resources
      disposeScene(scene);
      renderer.dispose();

      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }

      vrmRef.current = null;
      cameraRef.current = null;
      setModelLoaded(false);
    };
  }, [modelPath]);

  return { containerRef, vrmRef, cameraRef, modelLoaded };
}
