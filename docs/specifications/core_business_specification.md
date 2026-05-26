# Tài Liệu Đặc Tả Nghiệp Vụ Cốt Lõi (Core Business Specification)

Tài liệu này định nghĩa các nghiệp vụ cốt lõi, quy tắc ứng xử của nhân vật và kiến trúc ứng dụng cho Desktop Companion App. Tài liệu này đóng vai trò làm gốc rễ (Root Specification), từ đó rẽ nhánh ra các tài liệu hệ thống chuyên sâu.

## 1. Tổng Quan Sản Phẩm

**Desktop Companion App** là một ứng dụng cá nhân chạy trên Windows, hiển thị một nhân vật ảo (3D VRM) tương tác trực tiếp trên màn hình desktop.

*   **Tính chất:** Ứng dụng hoạt động như một lớp overlay trong suốt, topmost (luôn hiển thị trên cùng) nhưng không gây cản trở công việc (hỗ trợ click-through linh hoạt).
*   **Mô hình hoạt động:** Offline-first (toàn bộ logic, state, bộ nhớ, model chạy local), chỉ kết nối internet để gọi API AI (OpenAI-compatible) khi cần trò chuyện phức tạp. Không yêu cầu backend server, không đồng bộ cloud.
*   **Bốn trụ cột trải nghiệm:**
    *   **Presence (Hiện diện):** Sống động, liên tục nhưng không phiền hà.
    *   **Context (Ngữ cảnh):** Nhận biết user đang làm gì (code, game, họp, idle).
    *   **Proactivity (Chủ động):** Lên tiếng hoặc hành động đúng lúc, đúng chỗ.
    *   **Trust (Tin tưởng):** Dữ liệu hoàn toàn riêng tư, kiểm soát được.

## 2. Nghiệp Vụ Nhân Vật (Character Business Logic)

Nhân vật không chỉ là một avatar 3D mà là một thực thể có tính cách, trạng thái và sự phát triển mối quan hệ theo thời gian.

### 2.1. Bản Sắc Nhân Vật (Static Identity)
Các thông số cố định cấu thành nên cá tính của nhân vật:
*   **Personality Archetype:** Tính cách gốc (ví dụ: dịu dàng, năng động, điềm tĩnh).
*   **Speaking Style:** Giọng văn, cách xưng hô (ví dụ: em-anh, mình-bạn).
*   **Core Values & Taboos:** Những điều nhân vật coi trọng và những chủ đề tránh né.

### 2.2. Hệ Thống Trạng Thái Động (Dynamic State)
*   **Mood (-100 đến 100):** Tâm trạng ngắn hạn. Tăng khi được tương tác tích cực, giảm khi bị bỏ lơ lâu. Ảnh hưởng tới nét mặt và sắc thái câu trả lời.
*   **Energy (0 đến 100):** Năng lượng. Giảm khi hoạt động nhiều (chat, animation mạnh), tăng khi ngủ/nghỉ ngơi. Năng lượng thấp sẽ khiến nhân vật ít chủ động hơn và hay ngáp.
*   **Affinity, Trust, Familiarity (0 đến 100):** Các chỉ số đánh giá mức độ thân thiết và tin tưởng.
*   **Loneliness, Curiosity, Patience:** Các chỉ số ẩn điều phối hành vi chủ động.

### 2.3. Giai Đoạn Quan Hệ (Relationship Stages)
Dựa trên thời gian và các chỉ số trạng thái, mối quan hệ tiến triển qua các mốc:
1.  **Stranger (0-7 ngày):** Lịch sự, giữ khoảng cách.
2.  **Acquaintance (7-30 ngày):** Bắt đầu cởi mở.
3.  **Friend (30-90 ngày):** Thân thiết, nắm bắt sở thích.
4.  **Close (90+ ngày):** Hiểu thói quen sâu sắc.
5.  **Bonded (200+ ngày):** Hình thành các thói quen/nghi thức chung.

## 3. Hành Vi & Tương Tác (Behavior & Interaction)

Hệ thống hành vi (Behavior Orchestrator) quyết định nhân vật sẽ làm gì tại một thời điểm.

### 3.1. Hành Vi Chủ Động (Proactivity)
Nhân vật có thể chủ động bắt chuyện hoặc nhắc nhở dựa trên điểm số `proactivity_score` được tính toán mỗi phút:
*   **Score =** Relevance + Importance + Availability + Relationship - Penalties (Interrupt, Focus, Mode).
*   **Budget & Cooldown:** Giới hạn số lần làm phiền mỗi ngày tùy theo Mode (Normal: 6 lần/ngày, Focus: 2 lần/ngày, Meeting/Private: 0 lần).

### 3.2. Hành Vi Nhàn Rỗi (Idle Behavior)
Khi không có sự kiện gì, nhân vật thỉnh thoảng (45-120s) sẽ thực hiện các hành động ngẫu nhiên:
*   **Nhẹ (60%):** Chớp mắt mạnh, nhìn quanh, lắc nhẹ.
*   **Vừa (25%):** Ngáp, vẫy tay nếu chuột ở gần.
*   **Mạnh (10%):** Đổi tư thế, di chuyển vị trí.
*   *Phụ thuộc Context:* Ví dụ đang "Coding" thì có thể lấy sách ra đọc; "Đêm khuya" thì ngáp, ôm gối.

### 3.3. Phản Ứng Tương Tác Của Người Dùng (Reactions)
*   **Click / Double Click / Click Spam:** Phản ứng từ mỉm cười đến phồng má giận dỗi.
*   **Drag & Drop:** Khi bị nhấc lên sẽ có tư thế lơ lửng, khi thả xuống mạnh có thể nhăn mặt.
*   **Hover:** Quay đầu nhìn theo con trỏ chuột, má hồng.
*   **Chat:** Vui vẻ hoặc buồn bã tùy vào sentiment của tin nhắn.

### 3.4. Các Chế Độ Hoạt Động (Modes)
*   **Normal:** Tự do hoạt động, neo ở Taskbar hoặc lơ lửng.
*   **Focus:** Neo góc màn hình, đọc sách, ít làm phiền.
*   **Gaming:** Chế độ thu nhỏ, cổ vũ im lặng.
*   **Meeting:** Cầm bảng "Quiet", tuyệt đối không hiện bong bóng thoại.
*   **Watching:** Thư giãn cùng xem màn hình.
*   **Private:** Ẩn hoàn toàn nhân vật và vô hiệu hóa AI/tracking.
*   **Sleep:** Tự động kích hoạt khi khuya muộn hoặc máy sleep.

## 4. Overlay & Windows Integration

Để tạo ra trải nghiệm Desktop Companion mượt mà, ứng dụng sử dụng các kỹ thuật tích hợp hệ điều hành chuyên sâu:

### 4.1. Nền Trong Suốt (Transparent Window)
*   Sử dụng Tauri/Rust thiết lập cờ `WS_EX_LAYERED`.
*   WebView và Three.js Renderer đều thiết lập nền trong suốt (alpha: true) để nhân vật hòa mình vào desktop mà không có viền đen/trắng.

### 4.2. Hitbox Động & Click-through
Giải quyết bài toán: Người dùng cần click xuyên qua vùng trong suốt của cửa sổ, nhưng vẫn phải click trúng nhân vật hoặc UI.
*   **Tính toán Hitbox (Frontend):** Dựa trên Bounding Box 3D của VRM, quy chiếu xuống tọa độ 2D trên màn hình. Mở rộng hitbox nếu có Speech Bubble hoặc Radial Menu.
*   **Cursor Polling (Backend Rust):** Chạy background loop kiểm tra tọa độ chuột hiện tại có nằm trong Hitbox hay không.
*   **Toggle Style:** Bật/tắt cờ `WS_EX_TRANSPARENT` linh hoạt dựa trên kết quả kiểm tra Hitbox.

## 5. Các Phân Hệ Hệ Thống (System Modules Specification)

Chi tiết triển khai kỹ thuật của từng mảng nghiệp vụ được phân tách ra các tài liệu riêng biệt để dễ dàng quản lý và theo dõi:

1.  **[Hệ Thống Animation (Animation System)](./animation-system.md):** 
    Chi tiết kiến trúc 4-Layer Blending, Procedural Animations, Animation Director và thao tác với định dạng VRMA.
2.  **[Hệ Thống Tương Tác AI (AI Interaction System)](./ai-system.md):** 
    Chi tiết về cấu trúc Prompt (System, Context, State), giới hạn của AI, Tool Calling, Output Schema và các cơ chế Validator.
3.  **Hệ Thống Trí Nhớ (Memory System) - *TBA*:** 
    (Dự kiến) Cơ chế lưu trữ, phân loại (Preference, Habit, Event), vòng đời (Decay, Reinforce), và truy xuất bằng Semantic Search (Vector Embedding).
4.  **Hệ Thống Quản Lý Tài Sản (Asset System) - *TBA*:** 
    (Dự kiến) Cơ chế import/export model VRM, quản lý file animation, cấu trúc SQLite Registry cho assets và Hot-reloading.
