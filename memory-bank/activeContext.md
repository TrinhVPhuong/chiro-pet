# Active Context: Chiro-Pet

## Current Work Focus
The project is currently focused on the integration of the **AI Chat & Voice System**, as the **Animation Runtime** (both Rust backend and Three.js frontend) has now been fully implemented and verified.

## Recent Changes
- Implemented `AnimationDirector` and `ContextRegistry` in Rust.
- Built the `AnimationController` on the frontend with 4-Layer Blending (Base, Action, Procedural, Expression).
- Implemented Procedural Breathing and Blinking logic.
- Configured Tauri to automatically generate AppData directories (`animations`, `models`, `memory`, `config`) on startup to comply with OS standards for dynamic assets.
- Integrated `tauri-plugin-fs` to securely read `manifest.json` and `.vrma` files from the AppData directory.

## Next Steps
1. Develop the AI Chat & Voice System integration.
2. Build the Proactivity Engine (calculating `proactivity_score`).
3. Set up SQLite registry for complex asset/memory management.
4. Finalize dynamic states (Mood, Energy, Affinity).

## Active Decisions and Considerations
- **Backend-Driven State:** Rust dictates animation playback, maintaining a single source of truth to avoid race conditions.
- **VRM Memory Management:** Strict manual garbage collection (`.dispose()`) for Three.js resources on component unmount is mandatory due to HMR behavior.
- **Cross-Platform Readiness:** Maintain the `#[cfg(windows)]` abstraction layer in `input_tracking.rs` so the project can build on macOS/Linux without breaking.

## Recent Events (Sliding Window - Max 10)
- **2026-05-27:** Revised `transition_and_behavior_implementation.md` to precisely integrate with Shader and Procedural Animation systems, detailing the frame execution pipeline and conflict resolution.
- **2026-05-27:** Auto-grouped 80+ `.vrma` files into categorized subfolders (`actions`, `dances`, `emotions`, etc.) and updated `manifest.json`.
- **2026-05-27:** Authored deep AAA-grade technical specification for the Transition Engine and Offline Utility AI (`docs/plan/transition_and_behavior_implementation.md`).
- **2026-05-26:** Extracted Golden Master architecture from docs.
- **2026-05-26:** Successfully implemented full End-to-End Animation Runtime (Rust -> React -> Three.js) with 4-Layer Blending and `.vrma` support.
- **2026-05-26:** Transitioned file management to OS-standard AppData directory for dynamic assets.
- **2026-05-26:** Refactored AnimationController for smoother Crossfades (Weight Blending), removed procedural breathing/blinking in favor of actual VRMA clips, and introduced Random/Sequence playback logic in `manifest.json`.
- **2026-05-26:** Upgraded Animation & Interaction System: added "Dual Action Self-Crossfading" for seamless loops, weighted random playback, PerspectiveCamera with raycasted dragging, VRMLookAt head tracking, and Perlin noise micro-movements.
