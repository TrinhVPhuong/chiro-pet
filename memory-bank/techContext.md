# Tech Context: Chiro-Pet

## Technologies Used
- **Frontend Framework:** React 19, Vite 7
- **Language:** TypeScript (Frontend), Rust (Backend)
- **Application Framework:** Tauri v2
- **3D Rendering:** Three.js
- **Model Standard:** VRM (Virtual Reality Modeling) Format
- **Styling:** Tailwind CSS

## Development Setup
- **Package Manager:** pnpm
- **CLI Commands:**
  - `pnpm tauri dev` : Starts the development environment (React + Tauri).
- **Workspace:** Mono-repo style structure (Frontend in `src/`, Backend in `src-tauri/`).

## Technical Constraints & Considerations
- **Transparent Window Rendering:** Requires `WS_EX_LAYERED` on Windows and specific Tauri configurations (`alpha: true` on Webview & Three.js renderer) to achieve desktop integration without borders.
- **Platform Specific APIs:** Uses Windows specific APIs (`windows` crate) for global input tracking. Mac/Linux currently use dummy stubs, requiring careful cross-platform consideration `#[cfg(windows)]`.
- **Memory Management:** HMR (Hot Module Replacement) in React can cause severe WebGL memory leaks. Manual `.dispose()` loops are required on all Three.js meshes, materials, and textures during unmounts.
- **Performance:** Minimizing Tauri Event Bridge payloads (e.g., removing 20fps mouse movement spam) is critical to reduce CPU overhead. Tokio crate features are strictly limited to `time` and `rt`.

## Dependencies Structure
- **Frontend Dependencies:** React, Three.js, @pixiv/three-vrm (or similar VRM loaders).
- **Backend Dependencies (Cargo.toml):** Tauri, Tokio, serde, serde_json. (Win32 specific crates conditionally loaded).