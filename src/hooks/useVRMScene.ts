import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import { info, error as logError } from '@tauri-apps/plugin-log';
import { listen } from '@tauri-apps/api/event';
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
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any existing canvas elements (HMR support)
    containerRef.current.innerHTML = '';

    // --- Scene Setup ---
    const scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 20.0);
    camera.position.set(0.0, 1.0, 3.5);
    camera.lookAt(0.0, 0.8, 0.0); // Look at chest/face level
    cameraRef.current = camera as any;

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
        console.log("useVRMScene: initializing AnimationController...");
        animController = new AnimationController(vrm);
        animController.initialize().then(() => {
          console.log("useVRMScene: AnimationController initialized successfully.");
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
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- Controller & Animation Loop ---
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      const deltaTime = clock.getDelta();

      // Update Orchestrator (4 Layers: Mixer, Expression, Procedural, VRM)
      if (animController) {
        animController.update(deltaTime);
      } else if (vrmRef.current) {
        // Fallback if controller not ready yet
        vrmRef.current.update(deltaTime);
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };


    // --- IPC Listener for Shader Changes ---
    let unlistenShader: (() => void) | undefined;
    listen<{mode: string}>('change_shader_mode', (event) => {
        if (vrmRef.current) {
            // Very simplified: loop through materials to adjust lighting if they are MToon
            vrmRef.current.scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
                    materials.forEach(mat => {
                        // In a real MToon material we'd adjust specific uniforms.
                        // Here we simulate by altering ambient lighting or emissive loosely if possible,
                        // or just rely on a global lighting change.
                        if (mat.name.includes("MToon") || mat.type === "ShaderMaterial") {
                            // Example pseudo-modification:
                            if (event.payload.mode === "sleep") {
                                // Dim material (if applicable API existed here)
                            } else {
                                // Restore
                            }
                        }
                    });
                }
            });
            // Better approach is to adjust the global light
            if (event.payload.mode === "sleep") {
                ambientLight.intensity = 0.2;
                directionalLight.intensity = 0.5;
            } else {
                ambientLight.intensity = 0.6;
                directionalLight.intensity = Math.PI;
            }
        }
    }).then((fn: () => void) => { unlistenShader = fn; });


    // --- Cleanup ---
    return () => {
      if (unlistenShader) unlistenShader();
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
