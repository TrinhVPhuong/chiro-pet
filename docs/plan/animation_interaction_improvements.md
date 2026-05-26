# Animation & Interaction Improvements Plan (Revised)

## 1. Animation Looping & "Jerky" Mismatch Issue
### Problem Analysis
When an animation loops, if the starting pose (frame 0) and the ending pose (last frame) are drastically different, the loop "snaps" back to frame 0, causing a jerky, unnatural visual reset. Since modifying `.vrma` assets is difficult for end-users, we need a code-based solution that feels natural, without the "rewind" effect of PingPong.

### Final Proposed Solution: "Dual Action Self-Crossfading"
Instead of relying on Three.js's native `THREE.LoopRepeat` (which just snaps back to 0), we will manage the loop manually using two alternating `AnimationAction` instances of the same clip.
- **How it works:** 
  1. Play `Action A`.
  2. Calculate a trigger point: `Clip Duration - Crossfade Time`.
  3. When `Action A` reaches the trigger point, start playing `Action B` (the exact same clip) from frame 0 with weight 0, and crossfade `Action A` to `Action B`.
  4. When `Action B` reaches its trigger point, crossfade back to `Action A`.
- **Pros:** Completely eliminates the snap by blending the end pose into the start pose smoothly. No backward playback. No need to edit `.vrma` files.
- **Cons:** Requires more complex logic in `AnimationController`'s `update` method to track progress and swap actions.

---

## 2. Radial Menu Modifications
### Plan
Update `src/components/RadialMenu.tsx` to feature 4 generic buttons representing animation groups, validating our random/sequence logic.

- **Button 1: "Idle Group"** (Triggers `idle_neutral_1` -> random).
- **Button 2: "Talk Group"** (Triggers `talk_happy` -> sequence).
- **Button 3: "Think Group"** (Triggers `think_neutral`).
- **Button 4: "Drag/Interaction"** (Triggers `drag_surprised`).

---

## 3. Camera Movement & Dragging
### Problem Analysis
`OrthographicCamera` severely limits 3D depth and dynamic camera animations. However, switching to `PerspectiveCamera` breaks our current screen-to-world pixel mapping in `useDrag.ts`.

### Final Proposed Solution: "Raycast-to-Plane Dragging"
1. **Switch to `PerspectiveCamera`** in `useVRMScene.ts` to allow realistic depth, FOV, and future camera animations (zooming, panning).
2. **Implement Raycasting in `useDrag.ts`:**
   - Create an invisible infinite mathematical plane (`THREE.Plane`) that faces the camera and intersects the character's current 3D position.
   - On `pointerdown`, cast a ray from the mouse cursor to the plane to find the exact 3D start point.
   - On `pointermove`, cast a new ray to find the new 3D point.
   - Move the character by the 3D difference between the current and previous raycast intersections.
   - **Pros:** 100% accurate dragging regardless of camera angle, distance, or FOV.

---

## 4. Liveliness & Interaction Features
To make the character feel alive without feeling robotic:

1.  **Look-At (Head/Eye Tracking):**
    - Intercept mouse moves over the window. Convert coordinates to NDC (Normalized Device Coordinates).
    - Map NDC to a 3D target point in front of the character.
    - Feed this target point into the `vrm.lookAt.target` (requires setting up a `THREE.Object3D` as the target). The character will track the user's mouse smoothly.
2.  **Micro-movements (Perlin Noise):**
    - Apply continuous, smooth noise to the spine, neck, and head bones in the `update` loop. This simulates breathing and subtle postural shifts that prevent the character from looking "frozen" even when an animation finishes or pauses.
3.  **Physics Verification (SpringBone):**
    - Ensure `vrm.springBoneManager.update(deltaTime)` runs correctly. When Raycast Dragging moves the character rapidly, the physics engine should automatically make hair and clothing sway realistically.
4.  **Idle Breakers:**
    - Add a timer in `AnimationController` or a higher-level state manager. If no commands are received for X seconds, dispatch a random subtle animation (stretch, look around) to break the monotony.