# Chiro-Pet (Desktop Companion)

Chiro-Pet is a beautiful, lightweight desktop companion application featuring a 3D VRM character with transparent overlay rendering, interactive drag behaviors, and custom UI panels.

Built on **Tauri v2 + React + TypeScript + Three.js**.

## 🚀 Technical Highlights

- **Seamless Transparent Window**: Zero-border, fully transparent webview window that stays on top.
- **Click-through Overlay**: Interacts with the desktop normally, but becomes grabbable when holding the **ALT** key.
- **Optimized 3D Rendering**: High-performance Three.js rendering with complete manual WebGL and resource disposal to avoid GPU/memory leaks.
- **Procedural Animations**: Frame-rate independent breathing and natural blinking cycles without legacy intervals or `setTimeout` leaks.
- **Decoupled Architecture**: Modular custom React Hooks, separate layout/presentational components, and platform-abstracted Rust modules.

## 🛠️ Tech Stack & Dependencies

### Frontend
- **Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS v4 (optimized CSS-first compilation)
- **3D Graphics**: Three.js + `@pixiv/three-vrm`
- **Build Tool**: Vite 7

### Backend
- **Core**: Tauri v2
- **Language**: Rust (2021 Edition)
- **Asynchronous Runtime**: Tokio (tailored features for minimized binary footprint)
- **OS Integration**: Windows Win32 API (`windows-sys` key hook/mouse state) / Abstracted support for Linux/macOS.

## 📁 Repository Structure

```
chiro-pet/
├── src/                    # Frontend source (React + TS)
│   ├── assets/             # Images, static SVG assets
│   ├── components/         # Clean UI components
│   │   ├── CharacterCanvas.tsx
│   │   ├── DragOverlay.tsx
│   │   ├── LoadingIndicator.tsx
│   │   ├── RadialMenu.tsx
│   │   └── StatusIndicator.tsx
│   ├── hooks/              # Custom behavior and logic encapsulation
│   │   ├── useAltKeyTracking.ts
│   │   ├── useDrag.ts
│   │   └── useVRMScene.ts
│   ├── services/           # External API & Tauri Event handlers
│   │   └── tauriEvents.ts
│   ├── types/              # Clean TypeScript interfaces
│   │   └── index.ts
│   ├── App.css             # Main styling rules
│   ├── App.tsx             # Thin composition root
│   └── main.tsx            # App entrypoint
├── src-tauri/              # Backend source (Rust)
│   ├── src/
│   │   ├── commands.rs     # Webview-to-Rust Tauri commands
│   │   ├── input_tracking.rs # Native key and position tracker
│   │   ├── lib.rs          # App builder configuration
│   │   └── main.rs         # Program entry
│   ├── capabilities/       # Security capabilities
│   └── tauri.conf.json     # Tauri runtime and build configuration
└── public/
    └── models/             # 3D VRM Models (.vrm files)
```

## 💻 Development & Execution

Ensure you have Node.js installed.

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

3. **Build production packages**:
   ```bash
   npm run build
   ```
