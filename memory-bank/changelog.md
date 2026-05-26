# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Revised `transition_and_behavior_implementation.md` to precisely integrate with Shader and Procedural Animation systems, detailing the frame execution pipeline and conflict resolution logic.
- Authored deep AAA-grade technical specification for the Transition Engine and Offline Utility AI (`docs/plan/transition_and_behavior_implementation.md`).
- Implemented full End-to-End Animation Runtime linking Rust `AnimationDirector` to React `AnimationController`.
- Added support for `.vrma` files using `@pixiv/three-vrm-animation`.
- Added Procedural Blinking logic alongside Breathing in the 3rd Animation Layer.
- Implemented OS-standard AppData directory generation (`animations`, `models`, `memory`) for dynamic asset storage.
- Added `tauri-plugin-fs` to securely read assets from the AppData directory and bypass CORS restrictions.
- Initiated Memory Bank system (`projectBrief`, `productContext`, `systemPatterns`, `techContext`, `activeContext`, `progress`, `changelog`) for persistent AI context.
- Added "Dual Action Self-Crossfading" to solve jerky animation loops seamlessly.
- Implemented `VRMLookAt` for Head/Eye tracking towards the mouse cursor.
- Introduced Perlin noise-based micro-movements to spine and neck for increased liveliness.

### Changed
- Auto-grouped 80+ `.vrma` files into categorized subfolders (`actions/`, `dances/`, `emotions/`, etc.) to improve project asset organization.
- Updated `manifest.json` paths to reflect the new categorized `.vrma` file locations.
- Converted animation `manifest.json` to reference new `.vrma` files instead of legacy `.bvh` files.
- `AnimationController` now prioritizes loading assets from the AppData directory, falling back to bundled public assets only if necessary.
- Rewrote Crossfade/Weight Blending logic in `AnimationController` for smoother animation transitions (`crossFadeFrom`).
- Refactored `manifest.json` schema to support `playback_type` (`single`, `random`, `sequence`) using an array of `files`, including weighted random support.
- Prevented animation resets when interacting (dragging/menu) if the triggered animation ID matches the currently playing one.
- Migrated 3D scene from `OrthographicCamera` to `PerspectiveCamera` for realistic depth.
- Refactored dragging logic in `useDrag` to use Raycasting on a mathematical plane for 100% accurate dragging regardless of camera perspective.

### Removed
- Removed procedural breathing and blinking logic from `AnimationController` as real `.vrma` animations now handle this seamlessly.

### Changed
- Refactored monolithic `App.tsx` into modular Custom Hooks (`useVRMScene`, `useAltKeyTracking`, `useDrag`) and Presentational Components.
- Refactored monolithic Rust `lib.rs` into `commands.rs` and `input_tracking.rs`.
- Optimized `tokio` dependencies to reduce build time and binary size.
- Moved dev tools from `dependencies` to `devDependencies` in `package.json`.

### Fixed
- Addressed React HMR memory leaks by implementing aggressive manual `.dispose()` for Three.js assets.
- Fixed race condition causing sticky mouse cursor by toggling `pointerEvents` on `DragOverlay` instead of unmounting the component.
- Reduced Tauri IPC bus overhead by stripping out 20fps mouse movement spam from the backend.