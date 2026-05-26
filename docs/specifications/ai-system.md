# Hệ Thống Tương Tác AI (AI Interaction System)

Tài liệu này đặc tả chi tiết kiến trúc, luồng dữ liệu và các quy tắc hoạt động của AI Agent tích hợp trong Desktop Companion App.

## 1. Tổng Quan Kiến Trúc AI

AI trong dự án **KHÔNG** phải là "bộ não" toàn quyền của hệ thống. Nó hoạt động như một **lớp cá nhân hóa ngôn ngữ và đề xuất (Language & Proposal Layer)**. Mọi quyết định thay đổi trạng thái (state) hay kích hoạt hành động vật lý đều phải đi qua bộ lọc (Validator & Game Logic) của Backend.

### 1.1. Sơ đồ Luồng Tương Tác (Interaction Pipeline)
1.  **Trigger Detected:** Từ User Chat, Scheduled Event, hoặc Context Change.
2.  **Context Preparation:** Thu thập State, Local Time, Desktop Context (đã qua Sanitizer).
3.  **Memory Retrieval:** Tìm kiếm top-k Memories liên quan bằng nội dung truy vấn.
4.  **Prompt Building:** Lắp ghép System Prompt, Developer Rules, Memory, State, Context và User Message.
5.  **API Call:** Gửi yêu cầu tới OpenAI-compatible endpoint kèm định nghĩa Tools (Function Calling).
6.  **Response Parsing & Validation:** Parse JSON schema, chạy Validator Chain cho response và các tool calls.
7.  **Mutation & Execution:**
    *   Chạy Tool Calls (Lưu bộ nhớ, cập nhật Profile, ...).
    *   Game Logic tính toán và áp dụng các đề xuất State Deltas (Mood, Energy, Affinity).
    *   Phát sự kiện (Emit events) cho Frontend để hiển thị Speech Bubble và trigger Animation.
8.  **Audit & Cleanup:** Ghi log, cập nhật Cache và Cost Tracker.

### 1.2. Giới Hạn Quyền Hạn Của AI
| AI Được Phép | AI KHÔNG Được Phép |
| :--- | :--- |
| Sinh lời thoại tự nhiên theo ngữ cảnh | Tự ý ghi đè State trực tiếp mà không qua Game Logic |
| Đề xuất thay đổi State (Deltas: mood, energy,...) | Quyết định thời điểm tự động hiển thị (Proactivity Controller lo) |
| Phân loại Intent của người dùng | Quyết định bắt buộc Animation sẽ chạy (Animation Director lo) |
| Đề xuất Animation / Expression phù hợp | Truy cập dữ liệu hệ điều hành / thư mục gốc |
| Gọi Tools có kiểm soát (Memory, Event,...) | Thực thi các lệnh OS (OS Commands) |

## 2. Hệ Thống Prompt Phân Lớp

Hệ thống chia Prompt thành các block rõ ràng để dễ dàng tinh chỉnh:

### 2.1. System Prompt (Character Identity)
Định nghĩa bản sắc gốc của nhân vật:
*   Tên, tính cách (Personality), phong cách nói (Speaking style).
*   Giai đoạn mối quan hệ hiện tại (Relationship stage), mức độ thân thiết.
*   **Hard Constraints:** Ví dụ: "Chỉ là một sinh vật trên desktop, không có thực", "Độ dài phản hồi luôn ≤ 120 ký tự".

### 2.2. Developer Prompt (Behavior Rules)
Luật ứng xử kỹ thuật:
*   Tôn trọng các chế độ Focus/Meeting.
*   Quy định mức độ Delta State cho phép (Mood -3 đến +3).
*   Buộc trả về JSON. Trả lời bằng ngôn ngữ mà user đang sử dụng.

### 2.3. Dynamic Blocks (Memory, State, Context)
*   **Memory Block:** Nội dung các ký ức liên quan vừa truy xuất được. Yêu cầu AI vận dụng tự nhiên nhưng không lạm dụng.
*   **State Block:** `Current Mood`, `Energy`, `Affinity`. Giúp AI điều chỉnh giọng điệu (đang mệt thì nói ngắn, đang vui thì nói dài).
*   **Context Block (Sanitized):** Giờ địa phương, ngày tháng, thông tin ứng dụng đang mở (ví dụ: "app_category: coding", thời gian dùng liên tục).

## 3. Tool Calling & Output Schema

AI giao tiếp với App qua Structured JSON và Function Calling (Tools).

### 3.1. Output Schema Chuẩn
Bất kể dùng Tool hay không, nội dung AI trả về phải tuân thủ JSON Schema chứa:
*   `message`: (string) Lời thoại hiển thị trên Speech Bubble.
*   `emotion`: (enum) Cảm xúc chính để Frontend map với Blendshape mặt.
*   `mood_delta`, `affinity_delta`, `energy_delta`: (integer) Đề xuất thay đổi các chỉ số.
*   `should_notify`, `priority`: Thông số ưu tiên hiển thị.
*   `suggested_animation`, `suggested_expression`: Gợi ý hành động.
*   `internal_reasoning`: (string) Chuỗi suy luận ẩn của AI (Chain of Thought).

### 3.2. Danh Sách Tools (Function Calling)
AI có thể gọi một hoặc nhiều Tool sau trong một lượt phản hồi:
1.  `save_memory(type, content, importance)`: Ghi nhớ sở thích, thói quen mới của user.
2.  `update_memory(id, content, importance)`: Cập nhật thông tin ký ức cũ.
3.  `delete_memory(id, reason)`: Xóa ký ức sai lệch.
4.  `set_relationship_milestone(id)`: Trigger các mốc kỷ niệm đặc biệt.
5.  `schedule_event(type, time, payload)`: Lên lịch nhắc nhở trong tương lai (ví dụ nhắc uống nước).
6.  `update_user_profile(field, value)`: Cập nhật tên gọi, đại từ xưng hô của user.

## 4. Middleware: An Toàn & Chi Phí

### 4.1. Validator Chain
Mọi đầu ra của AI phải lọt qua chuỗi kiểm duyệt (Rust Backend):
1.  **Schema & Length Validator:** Chắc chắn là JSON hợp lệ và độ dài Text phù hợp.
2.  **Range Validator:** Đảm bảo Deltas đề xuất không vượt rào.
3.  **Safety & Privacy Filter:** Đảm bảo không chứa thông tin lộ lọt từ OS.
4.  **Game Logic Check:** Clamp các giá trị thay đổi State (ví dụ giới hạn chỉ được +5 Affinity mỗi ngày).

### 4.2. Context Sanitizer
Dữ liệu từ Desktop trước khi đưa vào Prompt phải được làm sạch:
*   `Tên_Cửa_Sổ_Có_Tên_File.docx` -> `app_category: productivity`
*   Ẩn hoàn toàn File paths, URLs cá nhân.

### 4.3. Cost Control & Fallback
*   **Daily Budget:** Cấu hình mức chi tiêu tối đa (ví dụ $0.5/ngày). Backend track số lượng Tokens.
*   **LRU Cache:** Cache lại các phản hồi cho những Ambient Event phổ biến (như Chào buổi sáng).
*   **Template Fallback:** Nếu gọi API thất bại (Timeout, Lỗi Mạng) hoặc vượt Budget, ứng dụng sẽ tự động chọn một câu thoại tương ứng trong File JSON `templates.json` để nhân vật vẫn tiếp tục hoạt động mà không bị "đứng hình".
