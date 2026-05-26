# Progress: Chiro-Pet

## What Works
- **Base Architecture:** React/Vite + Tauri v2 integration is stable.
- **Transparent Overlay:** Windows `WS_EX_LAYERED` setup and transparent WebGL canvas rendering.
- **3D Rendering:** Loading and displaying VRM models using Three.js via `useVRMScene` hook.
- **Input Tracking:** Global ALT key detection and cross-process communication (Rust -> React).
- **Interactions:** Basic Drag & Drop mapping screen space to 3D world space. Context menu (`RadialMenu`) with smooth animations and click-outside handling.
- **Optimizations:** Reduced Tokio footprint and clean module separation.

## What's Left to Build
- **Animation Runtime:**
  - Rust Animation Director & Context Registry.
  - 4-Layer Blending implementation on the Frontend.
  - Procedural breathing and blinking logic.
- **AI & Interaction:**
  - OpenAI-compatible API integration for chat.
  - Proactivity engine (calculating `proactivity_score`).
  - Dynamic states (Mood, Energy, Affinity).
- **Asset System:**
  - Dynamic loading of `.vrma` files.
  - SQLite registry for assets.
- **Cross-Platform:**
  - Implement Linux/macOS input tracking (e.g., `rdev`).

## Current Status
Transitioning from Phase 1 (Architectural Refactor & Stability) to Phase 2 (Animation & AI Systems). The Golden Master Base is established.

## Known Issues
- macOS and Linux currently use dummy stubs for global input tracking; full functionality is Windows-only at this moment.