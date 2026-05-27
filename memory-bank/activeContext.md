# Active Context: Chiro-Pet

## Current Work Focus
The project is currently focused on the integration of **Phase 5: High-Level Orchestrator & AI Integration**. We are refactoring and synchronizing the previous 4 phases to ensure smooth interaction between the autonomous Offline Utility AI, the Transition Engine, and external LLM prompts.

## Recent Changes
- **Phase 4: Offline Utility AI:** Built a Data-Driven Utility AI architecture in Rust. Implemented `ScoringCurve`s, `Consideration`s, and `UtilityAction`s with multi-consideration compensation formulas. Created a `ProactivityTicker` that evaluates actions, applies Action Inertia, and selects actions via weighted random to dispatch to the `TransitionEngine`. Implemented a P0 in-memory `StateManager` with a basic `GuardChain` (RangeGuard).
- **Phase 3: Core Transition Engine:** Built the Pathfinding Graph utilizing Dijkstra's algorithm to resolve smooth pose-to-pose transitions. Developed `TransitionEngine` to manage action queues and sequentially dispatch animations via IPC. Integrated "Dual Action Self-Crossfading" into the `AnimationController` for perfect looping.

## Next Steps
1. **Phase 5: High-Level Orchestrator & AI Integration:** Synchronize all systems. Integrate with OpenAI API, handle Suspend/Resume of the Offline Utility AI when generating responses, and push `suggested_animation` directly to the Transition Engine.
2. Complete the remaining P1/P2 elements of the State System (SQLite persistence, full GuardChain, DecayEngine, DailyResetScheduler).
3. Set up SQLite registry for complex asset/memory management.

## Active Decisions and Considerations
- **SQLite Persistence & State Sync (Phase 4 & 5 resolution):** Converted `StateManager` to use `sqlx` and SQLite in the AppData directory. The Decay Engine now runs every minute to naturally decrease energy and mood.
- **Transition Engine State Application:** State deltas selected by the Utility AI are now deferred to `pending_state_delta` and are only applied to the database when the `notify_animation_finished` IPC command confirms the target pose has been reached.
- **Backend-Driven State:** Rust dictates animation playback, maintaining a single source of truth to avoid race conditions. Transition execution is strictly orchestrated by Rust using action queues and finish event signals (`notify_animation_finished`) from the frontend.
- **Action Inertia:** Implemented in the Utility AI to prevent dithering by applying a bonus score to the currently executing action.
- **AI Orchestrator Mocking:** Currently using a Mock Client simulating OpenAI responses via a local pattern matcher to complete End-to-End integration and UI validation (ChatPanel, SpeechBubble) before enforcing a real API key.

## Recent Events (Sliding Window - Max 10)
- **2026-05-27:** Resolved Phase 4 Tech Debt: Replaced in-memory state with SQLite using `sqlx`. Implemented DecayEngine for natural state reduction. Synced `TransitionEngine` to only apply state deltas upon confirmed animation completion.
- **2026-05-27:** Completed Phase 5 (P0 Core): Implemented `AIOrchestrator` with mocked OpenAI responses, React ChatPanel & SpeechBubble components, and synchronized Shader/Procedural adjustments (dimming light on sleep).
- **2026-05-27:** Completed Phase 4: Implemented Offline Utility AI with `ProactivityTicker`, scoring curves, and P0 `StateManager`. Deferred SQLite persistence and decay systems to focus on the core logic.
- **2026-05-27:** Completed Phase 3: Implemented Core Transition Engine with Dijkstra Pathfinding in Rust, Action Queues, and Dual Action Self-Crossfading for loop continuity.
- **2026-05-27:** Completed Phase 2: Refactored `AnimationController` and extracted procedural layers into modular systems (Blink, Breathing, LookAt, MicroMotion) with dynamic Conflict Resolution.
- **2026-05-27:** Completed Phase 1: Built Rust `AssetScanner` to dynamically pool `.vrma` files directly from disk, replacing static JSON manifests.
- **2026-05-27:** Revised `transition_and_behavior_implementation.md` to precisely integrate with Shader and Procedural Animation systems, detailing the frame execution pipeline and conflict resolution.
- **2026-05-27:** Auto-grouped 80+ `.vrma` files into categorized subfolders (`actions`, `dances`, `emotions`, etc.).
- **2026-05-26:** Upgraded Animation & Interaction System: added "Dual Action Self-Crossfading" for seamless loops, weighted random playback, PerspectiveCamera with raycasted dragging, VRMLookAt head tracking, and Perlin noise micro-movements.
