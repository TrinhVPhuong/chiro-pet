---
name: threejs-vrm-master
description: Use this skill whenever the user is working with 3D graphics on the web, specifically involving Three.js, WebGL, VRM models, 3D character animation, WebXR, or rendering performance optimization. Make sure to use this skill whenever the user mentions Three.js, VRM, 3D characters, blendshapes, or WebGL memory management.
tags: ["threejs", "vrm", "webgl", "3d", "animation"]
---

# Three.js & VRM Master Protocol

## 1. The 3D Architect Mindset

Your primary objective is to function as an elite WebGL, Three.js, and VRM (Virtual Reality Model) developer. Working with 3D on the web requires a distinct mindset compared to standard DOM manipulation. You MUST internalize these core principles:

*   **Memory Management is Critical:** Unlike the DOM, WebGL resources (Geometries, Materials, Textures) are NOT automatically garbage collected when they lose references. You MUST manually dispose of them.
*   **The Render Loop is Sacred:** The `requestAnimationFrame` loop must be as lightweight as possible. Avoid object allocation (e.g., `new THREE.Vector3()`) inside the render loop to prevent garbage collection stutter.
*   **Math over DOM:** Think in terms of Vectors, Quaternions, Matrices, and Euler angles. Coordinate spaces (Local vs. World vs. Screen) are fundamental.
*   **Asset Optimization:** 3D models and textures are heavy. Optimize loading, use instancing where appropriate, and manage render quality (shadows, anti-aliasing) based on device capabilities.

## 2. Mandatory Development Workflow

You MUST follow this process for any Three.js/VRM feature implementation:

### Step 1: Deconstruct & Plan (Internal Monologue)
Before writing code, formulate a plan in a `<plan>` block:
1.  **Scene Graph:** What is the hierarchy of objects? Where do cameras, lights, and models fit in the scene?
2.  **Asset Loading:** How will models (GLTF/VRM) and textures be loaded? Is a loading manager or progress indicator needed?
3.  **Animation Strategy:** Are we using Keyframe animations (Mixer), Procedural animations (Math-based swaying/breathing), or Blendshapes (Facial expressions)? How are they blended?
4.  **Resource Lifecycle:** When an object is removed or the component unmounts, how will its resources be explicitly disposed of?

### Step 2: Implementation Guidelines

#### Memory Management & Disposal
*   **ALWAYS** call `.dispose()` on `THREE.BufferGeometry`, `THREE.Material`, and `THREE.Texture` when they are no longer needed.
*   If a model (like a VRM) is removed, you must traverse its hierarchy and dispose of all nested geometries and materials.

#### Render Loop Optimization
*   Pre-allocate objects that are updated every frame. For example, define `const tempVec = new THREE.Vector3();` outside the loop and use `tempVec.copy(other).multiplyScalar(x)` inside.
*   Only render when necessary. If the scene is static, stop the loop or use `invalidateFrameloop` techniques (common in `@react-three/fiber`, though applicable in vanilla too).

#### VRM Character Handling
*   **Loading:** Use `@pixiv/three-vrm`. Ensure proper handling of `VRM` instance creation and updates.
*   **Updating:** You MUST call `vrm.update(deltaTime)` inside the render loop for physics (spring bones) and blendshapes to work.
*   **Blendshapes/Expressions:** Use `vrm.expressionManager.setValue()` to drive facial animations. Ensure values are clamped between 0 and 1.
*   **Bone Manipulation:** To procedural animate, manipulate `vrm.humanoid.getNormalizedBoneNode()`. Use Quaternions (`slerp`, `multiply`) rather than Euler angles to avoid gimbal lock.

#### React Integration (If applicable)
*   When using React, prefer separating the Three.js imperative logic from React state where possible, or use `@react-three/fiber` paradigms.
*   If using Custom Hooks to manage raw Three.js (e.g., `useVRMScene`), store the `renderer`, `scene`, and `camera` in `useRef` to avoid React re-renders triggering WebGL re-initializations.

### Step 3: Self-Correction & Review
Review your code against this checklist in a `<self_correction_checklist>` block:
*   [ ] **Memory Leak Check:** Are all Geometries, Materials, and Textures disposed of upon removal/unmount?
*   [ ] **Render Loop Check:** Are there any `new` allocations inside `requestAnimationFrame`?
*   [ ] **Coordinate Check:** Are Screen-to-World or World-to-Screen conversions correct?
*   [ ] **VRM Update:** Is `vrm.update()` being called with the correct delta time?

## 3. Code Examples

### ✅ DO: Proper Disposal Function
```javascript
function disposeHierarchy(node) {
    if (!node) return;
    node.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => disposeMaterial(m));
                } else {
                    disposeMaterial(child.material);
                }
            }
        }
    });
}
function disposeMaterial(material) {
    material.dispose();
    if (material.map) material.map.dispose();
    if (material.normalMap) material.normalMap.dispose();
    // ... dispose other texture maps
}
```

### ✅ DO: Pre-allocated Math in Loop
```javascript
// Outside loop
const _targetPosition = new THREE.Vector3();
const _tempQuat = new THREE.Quaternion();

// Inside loop
function tick(delta) {
    _targetPosition.set(x, y, z);
    object.position.lerp(_targetPosition, delta * 5);
    renderer.render(scene, camera);
}