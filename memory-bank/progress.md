# Progress: Chiro-Pet

## What Works
- **Base Architecture:** React/Vite + Tauri v2 integration is stable.
- **Transparent Overlay:** Windows `WS_EX_LAYERED` setup and transparent WebGL canvas rendering.
- **3D Rendering:** Loading and displaying VRM models using Three.js via `useVRMScene` hook.
- **Animation Runtime:** 4-Layer Blending (Base, Action, Procedural Blinking/Breathing, Expression). Rust-driven state via `AnimationDirector`.
- **Dynamic Asset Loading:** Uses `tauri-plugin-fs` to securely load `.vrma` and configurations from the OS `AppData` directory.
- **Input Tracking:** Global ALT key detection and cross-process communication (Rust -> React).
- **Interactions:** Basic Drag & Drop mapping screen space to 3D world space. Context menu (`RadialMenu`) with smooth animations and click-outside handling.
- **Optimizations:** Reduced Tokio footprint and clean module separation.

## What's Left to Build
- **AI & Interaction:**
  - OpenAI-compatible API integration for chat.
  - Proactivity engine (calculating `proactivity_score`).
  - Dynamic states (Mood, Energy, Affinity).
- **Asset System:**
  - SQLite registry for dynamic assets and memory.
- **Cross-Platform:**
  - Implement Linux/macOS input tracking (e.g., `rdev`).

## Current Status
Phase 2 (Animation Runtime) has been refactored for smoother transitions, advanced capabilities (Random/Sequence/Weighted playback), liveliness features (Head/Eye tracking, micro-movements), and robust raycast-based dragging. We have recently structured the asset pipeline by automatically categorizing 80+ `.vrma` files into organized subfolders and drafted a comprehensive AAA-grade architectural plan for the future Transition Engine and Offline Utility AI to simulate life-like behaviors. The project is preparing to move towards implementing these offline AI systems alongside the OpenAI Chat integration and SQLite memory management.

## Known Issues
- macOS and Linux currently use dummy stubs for global input tracking; full functionality is Windows-only at this moment.