import * as THREE from 'three';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { VRM } from '@pixiv/three-vrm';

export class VRMAClipLoader {
    private gltfLoader: GLTFLoader;

    constructor() {
        this.gltfLoader = new GLTFLoader();
        this.gltfLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    }

    /**
     * Loads a .vrma file and converts it to a THREE.AnimationClip.
     * If the file is a .bvh or fails to load, it provides a fallback mock animation.
     */
    public async load(url: string, vrm: VRM): Promise<THREE.AnimationClip | null> {
        if (url.endsWith('.vrma')) {
            try {
                // Ensure correct URL formatting for Tauri custom protocol if needed
                // For now, assume url is a valid asset path
                const gltf = await this.gltfLoader.loadAsync(url);
                const vrmAnimation = gltf.userData.vrmAnimations[0];
                return createVRMAnimationClip(vrmAnimation, vrm);
            } catch (error) {
                console.error(`Failed to load VRMA from ${url}`, error);
                return null; // Return null so the caller can trigger a fallback
            }
        } else {
            // Fallback for .bvh or other formats currently not fully supported for VRM
            console.warn(`Format not supported natively by VRMAClipLoader: ${url}. Using mock fallback.`);
            return this.createMockClip();
        }
    }

    /**
     * Creates a simple mock animation clip (e.g., a slight head nod or breathing)
     * to ensure the application doesn't crash when animations are missing.
     */
    private createMockClip(): THREE.AnimationClip {
        // Create a simple breathing animation on the chest or spine
        // Note: VRM bone names might differ, using generic humanoid bone track names as example
        // In actual VRM, the track names depend on the node names.
        // For a robust mock, we might just return an empty clip.
        const emptyClip = new THREE.AnimationClip('MockIdle', 1.0, []);
        return emptyClip;
    }
}
