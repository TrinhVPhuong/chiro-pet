Desktop Companion App - Technical Specification

# 1. Tổng quan dự án

Desktop Companion App là ứng dụng cá nhân chạy trên Windows, cung cấp nhân vật ảo (VRM) tương tác trên desktop. Ứng dụng tập trung vào trải nghiệm overlay, AI chat, cá nhân hóa và bảo mật dữ liệu cục bộ. Toàn bộ hệ thống hoạt động offline (trừ AI endpoint), không yêu cầu backend server, không đồng bộ cloud.

# 2. Kiến trúc tổng thể

Ứng dụng sử dụng kiến trúc client-side hoàn toàn, gồm các thành phần chính:

- Overlay Window: Cửa sổ trong suốt, topmost, click-through, hiển thị nhân vật và UI.  
- Frontend: React + Three.js + VRM, quản lý UI, rendering, animation.  
- Backend: Rust (Tauri), xử lý logic, AI client, quản lý trạng thái, SQLite local.  
- Data Layer: Lưu trữ SQLite, JSON config, VRM/VRMA, secrets mã hóa.  
- Windows Platform Layer: Tương tác Win32 API (window, process, hotkey, taskbar).

# 3. Stack công nghệ

• Tauri 2.x (Rust shell + WebView)  
• Frontend: React 18, TypeScript, Vite, Three.js r160+, @pixiv/three-vrm, Tailwind CSS, Framer Motion, Zustand  
• Backend: Rust (tokio, sqlx + SQLite, reqwest, windows-rs, serde, aes-gcm, argon2)  
• Data: %APPDATA%/CompanionApp/ (companion.db, settings.json, secrets.enc, assets/)

# 4. Cấu trúc thư mục project

companion-app/  
├── src-tauri/ # Rust backend  
│ ├── src/  
│ │ ├── main.rs  
│ │ ├── core/  
│ │ │ ├── behavior/  
│ │ │ ├── ai/  
│ │ │ ├── state/  
│ │ │ ├── memory/  
│ │ │ ├── asset/  
│ │ │ └── privacy/  
│ │ ├── platform/  
│ │ │ ├── traits.rs  
│ │ │ └── windows/  
│ │ ├── ipc/  
│ │ └── db/  
│ ├── Cargo.toml  
│ └── tauri.conf.json  
├── src/ # Frontend  
│ ├── overlay/  
│ ├── settings/  
│ ├── shared/  
│ ├── overlay.html  
│ ├── settings.html  
│ └── main.ts  
├── assets/  
│ ├── default_model/  
│ ├── default_animations/  
│ └── templates.json  
├── package.json  
├── tsconfig.json  
├── vite.config.ts  
└── README.md

# 5. Mô tả module chính

## 5.1. Overlay Window

• Cửa sổ trong suốt, topmost, click-through, không có border.  
• Hiển thị nhân vật 3D (VRM), radial menu, speech bubble, drag handler, state indicator.  
• Vị trí mặc định: taskbar hoặc góc màn hình, có thể kéo thả.

## 5.2. Frontend (React + Three.js)

• React quản lý UI, trạng thái, các component overlay.  
• Three.js + @pixiv/three-vrm render nhân vật VRM, procedural animation (idle, blink, look-at).  
• Radial menu cho các action (Talk, Hide, Settings, ...).  
• Speech bubble hiển thị phản hồi AI hoặc template.

## 5.3. Backend (Rust Core)

• Behavior Orchestrator: Quản lý mode, proactivity, event scheduler, animation director.  
• AI Client: Giao tiếp OpenAI-compatible endpoint, validate schema, kiểm soát chi phí.  
• State Manager: Quản lý trạng thái nhân vật (mood, energy, affinity).  
• Memory Manager: Lưu, truy xuất, xóa memory cá nhân hóa.  
• Privacy Manager: Điều khiển quyền truy cập context, private mode.  
• Asset Manager: Quản lý model, animation, validate, hot reload.

## 5.4. Data Layer

• companion.db: SQLite lưu trạng thái, memory, usage.  
• settings.json: Cấu hình UI, AI endpoint, model, budget.  
• secrets.enc: API key mã hóa AES-GCM + Argon2.  
• assets/: VRM, VRMA, templates.

## 5.5. Windows Platform Layer

• Tương tác Win32 API: window, process, taskbar, hotkey, autostart.  
• Phát hiện foreground app, mode, idle, fullscreen.

# 6. AI Client & Schema

• Sử dụng 1 endpoint OpenAI-compatible (OpenAI, OpenRouter, LiteLLM, ...).  
• Cấu hình endpoint, API key, model, budget trong Settings.  
• Schema phản hồi chuẩn hóa, ví dụ:  
- message: string (max 180 ký tự)  
- emotion: enum (neutral, happy, shy, ...)  
- mood_delta, affinity_delta, energy_delta: số  
- should_notify: bool  
- interruption_level: 0-4  
- priority: enum  
- suggested_animation, suggested_expression: string  
- memory_to_save: object  
- next_action: object

# 7. Cost Control & Caching

• Theo dõi số lần gọi, token, chi phí AI mỗi ngày.  
• Giới hạn mặc định: $0.50/ngày, user chỉnh được.  
• Cache phản hồi cho các pattern lặp để giảm chi phí.  
• Khi hết budget hoặc lỗi API, fallback sang template local.

# 8. Settings Window

• Các tab: General, Character, Animations, Behavior, AI, Privacy, Memory, Hotkeys, About.  
• Cho phép cấu hình overlay, model, animation, AI endpoint, budget, quyền riêng tư, hotkey, xuất/xóa dữ liệu.

# 9. Lộ trình triển khai

• Phase 1: Foundation - Overlay window, VRM render, drag, radial menu.  
• Phase 2: Context Awareness - Phát hiện app, mode, animation theo trạng thái.  
• Phase 3: AI Integration - AI client, schema, chat action.  
• Phase 4: Memory & Polish - Memory CRUD, proactivity, event scheduler.  
• Phase 5: Privacy & Settings UI - UI settings, private mode, hotkey, mã hóa key.  
• Phase 6: Quality - Shader, import flow, multi-monitor, tối ưu hiệu năng.

# 10. Hiệu năng mục tiêu

| Metric         | Target   | Hard limit |
| -------------- | -------- | ---------- |
| Idle RAM       | < 250 MB | < 400 MB   |
| Idle CPU       | < 1.5%   | < 3%       |
| GPU idle       | < 4%     | < 8%       |
| Cold start     | < 3s     | < 5s       |
| Model load     | < 2s     | < 4s       |
| AI latency p50 | < 2s     | < 5s       |
| AI daily cost  | < $0.20 | < $0.50   |

# 11. Quy trình khởi tạo project

1. Tạo Tauri project:  
cargo install create-tauri-app  
cargo create-tauri-app companion-app --template react-ts --manager pnpm  
2. Cài dependencies frontend:  
pnpm add three @pixiv/three-vrm @pixiv/three-vrm-animation  
pnpm add zustand framer-motion  
pnpm add -D @types/three tailwindcss postcss autoprefixer  
pnpm dlx tailwindcss init -p  
3. Cài dependencies Rust (Cargo.toml):  
tokio, sqlx, reqwest, windows, serde, serde_json, aes-gcm, argon2, uuid, chrono, anyhow, thiserror, tracing  
4. Run dev mode:  
pnpm tauri dev

# 12. Tóm tắt đặc điểm hệ thống

• Windows-only (giai đoạn đầu)  
• Personal use, free, không server backend  
• OpenAI-compatible duy nhất  
• 1 active character  
• Full local, không sync online  
• Cost control tích hợp  
• Privacy by default  
• Hot-swappable VRM/VRMA  
• Modular cho future expansion