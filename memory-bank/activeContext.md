# Active Context: Chiro-Pet

## Current Work Focus
The project is currently focused on consolidating its architectural foundation and preparing for the implementation of the **Animation Runtime** and **AI Chat & Voice System**. The structural refactor (decoupling React components and modularizing Rust backend) is complete.

## Recent Changes
- Extracted and analyzed documentation to build the Memory Bank.
- Refactored `App.tsx` into decoupled components and hooks (`useVRMScene`, `useAltKeyTracking`, `useDrag`).
- Modularized `lib.rs` into `commands.rs` and `input_tracking.rs`.
- Optimized Cargo dependencies (limited `tokio` features) and NPM dependencies (moved dev tools).
- Designed the new backend-driven Animation Runtime architecture.

## Next Steps
1. Implement the **Animation Director** in Rust.
2. Build the **Context Registry** for priority-based animation queuing.
3. Integrate the 4-Layer Blend mechanism into the Three.js client (`AnimationController`).
4. Develop the AI Chat & Voice System integration.

## Active Decisions and Considerations
- **Backend-Driven State:** Rust dictates animation playback, maintaining a single source of truth to avoid race conditions.
- **VRM Memory Management:** Strict manual garbage collection (`.dispose()`) for Three.js resources on component unmount is mandatory due to HMR behavior.
- **Cross-Platform Readiness:** Maintain the `#[cfg(windows)]` abstraction layer in `input_tracking.rs` so the project can build on macOS/Linux without breaking.

## Recent Events (Sliding Window - Max 10)
- **2026-05-26:** Memory Bank initialized to ensure persistent context across Cline sessions.
- **2026-05-26:** Extracted Golden Master architecture from docs.