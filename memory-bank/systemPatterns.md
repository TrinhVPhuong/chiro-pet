# System Patterns: Chiro-Pet

## Architecture Map
The application follows a **Decoupled Component & Custom Hooks** model on the Frontend and a **Modular Command-Service** model on the Backend.

```mermaid
graph TD
    %% Backend
    subgraph Rust Backend (Tauri)
        A[spawn_input_tracker] -->|Background loop 20fps| B[platform::is_alt_pressed]
        B -->|State changed| C[Emit 'alt-key-state']
        C -->|Toggle| D[set_ignore_cursor_events]
    end

    %% Event bridge
    C -.->|Tauri Event Bridge| E[listenAltKeyState]

    %% Frontend Hook
    subgraph React Frontend (Hooks & Services)
        E --> F[useAltKeyTracking]
        F -->|isEnabled| G[DragOverlay Component]
        F -->|visible| H[StatusIndicator Component]
        
        I[useVRMScene] -->|Loads .vrm| J[vrmRef & cameraRef]
        I -->|Tick update| K[Breathing & Blinking]
        
        J -->|Inject Refs| G
        G -->|useDrag Hook| L[Calculate screen-to-world movement]
        L -->|Update| M[vrmRef.scene.position]
    end
```

## Frontend (React + TypeScript)
Avoids "God Components" (like `App.tsx`) via clear Separation of Concerns.

### 1. Custom Hooks
- `useVRMScene`: Encapsulates Three.js lifecycle, VRM loading, animation loops (independent of HMR), and aggressive memory leak disposal (GPU manual `.dispose()`).
- `useAltKeyTracking`: Dedicated to listening for global ALT key states via Tauri IPC.
- `useDrag`: Converts Screen Space coordinates to World Space for OrthographicCamera accurately.

### 2. Presentational Components
- `CharacterCanvas`: Mounts WebGLRenderer, `pointer-events-none` allows click-through to the desktop.
- `DragOverlay`: Full-screen overlay. Toggled via CSS `pointerEvents` instead of unmounting to prevent race conditions during drag drops.
- `RadialMenu`: Features auto-close on Escape/Click-outside and CSS smooth animations.

## Backend (Rust + Tauri v2)
Modularized from a monolithic structure:

### 1. Modules
- `commands.rs`: Exposes IPC commands (`invoke`) for the frontend.
- `input_tracking.rs`: Background task for global input tracking. Uses Platform Abstraction (`#[cfg(windows)]`) to allow smooth compilation on macOS/Linux with dummy stubs.
- `lib.rs`: A thin Composition Root for setting up the Tauri builder, plugins, and background tasks.

## Build Optimization
- NPM: Moved dev tools (Tailwind, Three.js types) to `devDependencies` to reduce production bundle. Start script uses `tauri dev` directly.
- Cargo: `tokio` features minimized to `["time", "rt"]` instead of `["full"]` to speed up compile times and reduce `.exe` size.

## Animation Runtime Architecture (Backend-driven State)
- **Animation Director (Rust):** Orchestrator deciding which animation plays based on multiple sources.
- **Context Registry (Rust):** Manages a priority queue (e.g., Dragging priority 95 interrupts Talking priority 60).
- **IPC Command:** Communicates via `AnimationCommand` struct.
- **Client Blending (Three.js):** 4-Layer Blend mechanism:
  1. Base (Idle)
  2. Action (Gestures, Crossfade)
  3. Procedural (Breathing, Swaying)
  4. Expression (Blendshapes/Facial)