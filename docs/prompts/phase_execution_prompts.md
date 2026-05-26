# Phase Execution Prompts

Bộ tài liệu này chứa các Prompt chuẩn hóa để sử dụng cho lệnh `/newtask` khi bắt đầu triển khai các Phase của hệ thống **Transition Engine & Utility AI**.

**Nguyên tắc sử dụng:**
- Mỗi khi hoàn thành xong một Phase, hãy sử dụng lệnh `/newtask` kết hợp với copy-paste nội dung của Phase tiếp theo vào khung chat.
- Nhờ cơ chế `01-architectural-enforcement.md`, AI Agent sẽ tự động nạp `core_business_specification.md` trước tiên mà không cần bạn phải nhắc.

---

### Prompt cho Phase 1: Dynamic Asset Pipeline
```text
/newtask 
brainstorming: Bắt đầu triển khai "Phase 1: Dynamic Asset Pipeline & Auto-Grouping" dựa theo checklist trong file `docs/plan/transition_and_behavior_implementation.md`.

Mục tiêu chính: Viết module Rust `AssetScanner` sử dụng `tauri-plugin-fs` để quyét đệ quy thư mục animation. Phân tách tên file, gắn tag và nạp vào DynamicAnimationPool trong RAM.
```

---

### Prompt cho Phase 2: Procedural Layers & Liveliness
```text
/newtask 
brainstorming: Bắt đầu triển khai "Phase 2: Procedural Layers & Liveliness (Three.js)" dựa theo checklist trong file `docs/plan/transition_and_behavior_implementation.md`.

Mục tiêu chính: Refactor `AnimationController` trên Frontend. Áp dụng 4 Layer rõ ràng (Mixer, Expression, Procedural, VRM). Xử lý Conflict Resolver để tự hạ weight của LookAt/Breathing khi có hành động mạnh từ Transition Engine. Vui lòng đọc thêm `docs/specifications/procedural-animation-system.md` trước khi code.
```

---

### Prompt cho Phase 3: Core Transition Engine
```text
/newtask 
brainstorming: Bắt đầu triển khai "Phase 3: Core Transition Engine (Rust)" dựa theo checklist trong file `docs/plan/transition_and_behavior_implementation.md`.

Mục tiêu chính: Xây dựng hệ thống Graph (PoseNode, TransitionEdge) và thuật toán tìm đường Dijkstra/A* trên Rust Backend. Cơ chế gửi IPC event dạng Queue xuống Frontend để play nối tiếp animation. 
```

---

### Prompt cho Phase 4: Offline Utility AI
```text
/newtask 
brainstorming: Bắt đầu triển khai "Phase 4: Offline Utility AI (Rust)" dựa theo checklist trong file `docs/plan/transition_and_behavior_implementation.md`.

Mục tiêu chính: Viết Background Ticker (15-30s). Sử dụng `CharacterState` làm đầu vào, áp dụng Curve Scorers (Linear, Logistic, Inverse Quadratic) để tính điểm Utility. Chọn Action -> Gửi lệnh tìm đường xuống Transition Engine -> Nhận kết quả và tạo `CharacterStateDelta` gửi vào StateManager. Đọc thêm `docs/specifications/state-system.md` nếu cần.
```

---

### Prompt cho Phase 5: High-Level Orchestrator & AI Integration
```text
/newtask 
brainstorming: Bắt đầu triển khai "Phase 5: High-Level Orchestrator & AI Integration" dựa theo checklist trong file `docs/plan/transition_and_behavior_implementation.md`.

Mục tiêu chính: Tích hợp với hệ thống OpenAI (`ai-interaction-system.md`). Xử lý việc Suspend/Resume Offline Utility AI khi có prompt từ OpenAI. Đẩy trực tiếp `suggested_animation` từ LLM vào Transition Engine.