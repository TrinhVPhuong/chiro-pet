# Refactor Utility AI: Chuyển đổi sang kiến trúc Data-Driven (Config-Based)

## 1. Vấn đề hiện tại
Hiện tại, pool danh sách các hành động (actions_pool) của Utility AI đang được **hardcode trực tiếp** trong file `src-tauri/src/lib.rs`. Điều này vi phạm nguyên tắc thiết kế Data-Driven:
- Code bị phình to bởi dữ liệu tĩnh (6 cấu hình action).
- Khó khăn trong việc bảo trì, cân chỉnh lại các chỉ số cân nhắc (Scoring, Cooldown, Target Pose) mà không phải compile lại code.
- Thiếu tính linh hoạt nếu sau này muốn nạp các tệp cấu hình khác nhau cho các nhân vật (Character Profiles) khác nhau.

## 2. Mục tiêu kiến trúc
- **Tách biệt Data và Code:** Di chuyển toàn bộ dữ liệu cấu hình các hành động ra một file JSON.
- **Dễ dàng mở rộng:** Cho phép Designer hoặc quá trình config nhân vật (ví dụ: Chiro thích nhảy múa, nhưng một nhân vật khác lại thích nằm lười) diễn ra hoàn toàn trên Data file mà không cần dev can thiệp vào logic Rust.
- **Dynamic Startup:** Backend chỉ có nhiệm vụ đọc file, parse JSON, và đổ vào `actions_pool`.

## 3. Các bước triển khai

### Bước 1: Tạo file cấu hình JSON
- **Đường dẫn:** `public/behavior/utility_actions.json`
- **Nội dung:** Chứa danh sách mảng JSON serialize từ struct `UtilityAction`. Mỗi action bao gồm `id`, `target_pose`, `target_anim`, `animation_tags`, `base_weight`, mảng `considerations` (với state_field, scoring curve, weight), `state_effects`, `cooldown_seconds` và `can_interrupt`.

### Bước 2: Tạo module Config Loader trong Rust
- **Đường dẫn dự kiến:** `src-tauri/src/core/behavior/utility_ai/config_loader.rs`
- **Chức năng:**
  - Viết hàm `load_utility_actions(path: &Path) -> Result<HashMap<String, UtilityAction>, String>`.
  - Mở file JSON, dùng `serde_json` để parse thành mảng `UtilityAction`.
  - Chuyển mảng thành dạng `HashMap<String, UtilityAction>` (với key là `id` của action) để trả về cho Ticker sử dụng.

### Bước 3: Cập nhật lại `mod.rs` của `utility_ai`
- Import và export public module `config_loader` để `lib.rs` có thể gọi.

### Bước 4: Refactor file `src-tauri/src/lib.rs`
- Xóa toàn bộ đoạn code đang hardcode 6 `UtilityAction` (`idle_stand`, `stretch_and_jog`, v.v...).
- Xác định đường dẫn file cấu hình: sử dụng `app.path().resource_dir()` trỏ vào `public/behavior/utility_actions.json`.
- Khởi tạo `actions_pool` bằng cách gọi hàm loader. Nếu việc load file lỗi (ví dụ file thiếu), fallback về một pool rỗng hoặc log lỗi cảnh báo. 

## 4. Rủi ro & Cách khắc phục
- **Đường dẫn file (Path resolve):** `app.path().resource_dir()` có thể khác nhau giữa lúc dev và lúc build release. Cần đảm bảo file `public/behavior/utility_actions.json` được copy chính xác bằng cách khai báo thêm trong config của tauri nếu cần (nhưng public thường đã được đưa vào resource).
- **Serialization Mismatch:** Dữ liệu JSON cần trùng khớp chính xác tên trường và kiểu dữ liệu với struct Rust (VD: `target_anim` là Option nên có thể là null hoặc chuỗi). Việc sử dụng `#derive(Serialize, Deserialize)` của serde đã bảo vệ chặt chẽ quá trình này. Dùng `cargo check` để bắt lỗi biên dịch sớm.

Tiến trình này sẽ giúp phần AI offline trở nên tiêu chuẩn và sát hơn với kiến trúc Game thực tế, dọn đường cho việc kết hợp với True AI sau này (True AI có thể chỉnh sửa đè lên file Config hoặc nạp đè lên bộ nhớ RAM của actions_pool nếu muốn đổi tính cách nhân vật on-the-fly).