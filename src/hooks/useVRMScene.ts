import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { info, error as logError } from '@tauri-apps/plugin-log';

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
        setModelLoaded(true);
        info('VRM Model loaded successfully');
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

    // --- Animation Loop ---
    // Blink state is tracked via deltaTime instead of setTimeout to avoid
    // memory leaks and ensure cleanup works correctly on unmount.
    const clock = new THREE.Clock();
    let blinkTimer = 3.0 + Math.random() * 3.0;
    let isBlinking = false;
    let blinkElapsed = 0;
    const BLINK_DURATION = 0.15; // seconds
    let animationFrameId: number;

    const animate = () => {
      const deltaTime = clock.getDelta();

      if (vrmRef.current) {
        const vrm = vrmRef.current;
        const elapsedTime = clock.getElapsedTime();

        try {
          // Breathing: subtle spine rotation
          const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
          if (spine) {
            spine.rotation.x = Math.sin(elapsedTime * 2) * 0.02;
          }

          // Blinking: frame-based state machine (no setTimeout)
          if (isBlinking) {
            blinkElapsed += deltaTime;
            if (blinkElapsed >= BLINK_DURATION) {
              vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, 0.0);
              isBlinking = false;
              blinkTimer = 3.0 + Math.random() * 3.0;
            }
          } else {
            blinkTimer -= deltaTime;
            if (blinkTimer <= 0) {
              vrm.expressionManager?.setValue(VRMExpressionPresetName.Blink, 1.0);
              isBlinking = true;
              blinkElapsed = 0;
            }
          }
        } catch (err) {
          console.error('Animation error:', err);
        }

        vrm.update(deltaTime);
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);

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
