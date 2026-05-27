# Progress: Chiro-Pet

## What Works
- **Base Architecture:** React/Vite + Tauri v2 integration is stable.
- **Transparent Overlay:** Windows `WS_EX_LAYERED` setup and transparent WebGL canvas rendering.
- **3D Rendering:** Loading and displaying VRM models using Three.js via `useVRMScene` hook.
- **Animation Runtime:** 4-Layer Blending (Base, Action, Procedural Blinking/Breathing, Expression). Rust-driven state via `AnimationDirector`.
- **Dynamic Asset Loading:** Uses `tauri-plugin-fs` to securely load `.vrma` and configurations from the OS `AppData` directory.
- **Input Tracking:** Global ALT key detection and cross-process communication (Rust -> React).
- **Interactions:** Basic Drag & Drop mapping screen space to 3D world space. Context menu (`RadialMenu`) with smooth animations and click-outside handling.
- **Utility AI:** Autonomous action selection via a Background Ticker, scoring curves, and a P0 `StateManager`.
- **Optimizations:** Reduced Tokio footprint and clean module separation.

## What's Left to Build
- **GuardChain Perfection:**
  - Full `GuardChain` execution (DailyCap, PrivacyMode, PersonalityModifier, GameLogic) within `StateManager`.
  - `DailyResetScheduler` to wipe counters at midnight.
- **Asset System:**
  - SQLite registry for long-term memory and asset state persistence.
- **Cross-Platform:**
  - Implement Linux/macOS input tracking (e.g., `rdev`).
- **OpenAI Client:**
  - Replace the current mock pattern-matching client in `AIOrchestrator` with a real `reqwest`-based implementation hooked up to a user-provided API key.

## Current Status
The project has successfully completed the 5-Phase Refactor for Transition and Behavior Implementation.
- **Phase 1 (Dynamic Asset Pipeline)** is complete.
- **Phase 2 (Procedural Layers & Liveliness)** is complete.
- **Phase 3 (Core Transition Engine)** is complete.
- **Phase 4 (Offline Utility AI)** is complete: Developed autonomous behavior, `ScoringCurve`s, `ProactivityTicker`, and SQLite `StateManager` with `DecayEngine`.
- **Phase 5 (High-Level Orchestrator)** is complete: Synchronized all systems. Implemented `AIOrchestrator`, Suspend/Resume of the Offline Utility AI, and pushed `suggested_animation` directly into `AnimationDirector`. Frontend is equipped with `ChatPanel` and `SpeechBubble`.

## Known Issues
- macOS and Linux currently use dummy stubs for global input tracking; full functionality is Windows-only at this moment.