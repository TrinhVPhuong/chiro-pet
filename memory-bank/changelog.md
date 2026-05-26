# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Implemented full End-to-End Animation Runtime linking Rust `AnimationDirector` to React `AnimationController`.
- Added support for `.vrma` files using `@pixiv/three-vrm-animation`.
- Added Procedural Blinking logic alongside Breathing in the 3rd Animation Layer.
- Implemented OS-standard AppData directory generation (`animations`, `models`, `memory`) for dynamic asset storage.
- Added `tauri-plugin-fs` to securely read assets from the AppData directory and bypass CORS restrictions.
- Initiated Memory Bank system (`projectBrief`, `productContext`, `systemPatterns`, `techContext`, `activeContext`, `progress`, `changelog`) for persistent AI context.

### Changed
- Converted animation `manifest.json` to reference new `.vrma` files instead of legacy `.bvh` files.
- `AnimationController` now prioritizes loading assets from the AppData directory, falling back to bundled public assets only if necessary.
- Rewrote Crossfade/Weight Blending logic in `AnimationController` for smoother animation transitions (`crossFadeFrom`).
- Refactored `manifest.json` schema to support `playback_type` (`single`, `random`, `sequence`) using an array of `files`.
- Prevented animation resets when interacting (dragging/menu) if the triggered animation ID matches the currently playing one.

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