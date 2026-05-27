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
- **Phase 5: High-Level Orchestrator & AI Integration:**
  - OpenAI-compatible API integration (`ai-interaction-system.md`).
  - Handling Suspend/Resume of the Offline Utility AI during prompts.
  - Pushing `suggested_animation` from LLM into the Transition Engine.
  - Refactoring and synchronizing the hardcoded parts from Phases 1-4 into a cohesive system.
- **State System Technical Debt (Deferred from Phase 4):**
  - SQLite persistence using `sqlx`.
  - Full `GuardChain` (DailyCap, PrivacyMode, PersonalityModifier, GameLogic).
  - `DecayEngine` and `DailyResetScheduler`.
- **Asset System:**
  - SQLite registry for long-term memory and asset state persistence.
- **Cross-Platform:**
  - Implement Linux/macOS input tracking (e.g., `rdev`).

## Current Status
The project is executing a 5-Phase Refactor for Transition and Behavior Implementation. 
- **Phase 1 (Dynamic Asset Pipeline)** is complete.
- **Phase 2 (Procedural Layers & Liveliness)** is complete.
- **Phase 3 (Core Transition Engine)** is complete.
- **Phase 4 (Offline Utility AI)** is complete: Developed the autonomous behavior system. Built `ScoringCurve`s, `Consideration`s, and `UtilityAction`s. Created a Tokio `ProactivityTicker` that selects actions based on utility scores and Action Inertia, then requests poses via `TransitionEngine`. Built a P0 in-memory `StateManager` with basic `RangeGuard`.

We are now preparing to initiate **Phase 5: High-Level Orchestrator & AI Integration** to wrap up the codebase and synchronize all systems with OpenAI.

## Known Issues
- macOS and Linux currently use dummy stubs for global input tracking; full functionality is Windows-only at this moment.