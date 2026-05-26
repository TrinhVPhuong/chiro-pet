# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Initiated Memory Bank system (`projectBrief`, `productContext`, `systemPatterns`, `techContext`, `activeContext`, `progress`, `changelog`) for persistent AI context.
- Designed 4-Layer Blending Animation Runtime architecture.

### Changed
- Refactored monolithic `App.tsx` into modular Custom Hooks (`useVRMScene`, `useAltKeyTracking`, `useDrag`) and Presentational Components.
- Refactored monolithic Rust `lib.rs` into `commands.rs` and `input_tracking.rs`.
- Optimized `tokio` dependencies to reduce build time and binary size.
- Moved dev tools from `dependencies` to `devDependencies` in `package.json`.

### Fixed
- Addressed React HMR memory leaks by implementing aggressive manual `.dispose()` for Three.js assets.
- Fixed race condition causing sticky mouse cursor by toggling `pointerEvents` on `DragOverlay` instead of unmounting the component.
- Reduced Tauri IPC bus overhead by stripping out 20fps mouse movement spam from the backend.