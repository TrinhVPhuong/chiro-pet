# [2026-05-26] - Triển khai Hệ thống Animation Runtime 

### Added
- **Core Backend**: Thêm module `AnimationDirector` và `ContextRegistry` tại `src-tauri/src/core/behavior/` để quản lý quyền ưu tiên, trạng thái và vòng đời (context) của các animation.
- **IPC Commands**: Mở rộng `commands.rs` với các lệnh `anim_play`, `anim_stop_context`, `anim_force_idle` cho phép Frontend và Backend giao tiếp mượt mà.
- **Frontend Layer**: 
  - Thêm `src/types/animation.ts` và `src/services/animation.ts` đồng bộ API contract giữa Rust và TS.
  - Implement `AnimationController` hỗ trợ **4-Layer Blend**: Idle Base, Action Clip, Procedural Breathing, và Expression.
  - Thêm `VRMAClipLoader` để load file `.vrma` với fallback mock animation cho `.bvh`.
  - Thêm `SectionedPlayback` quản lý vòng lặp animation linh hoạt (intro, loop, outro).
- **Configuration**: Tạo tệp `public/animation/manifest.json` chuẩn hóa mô tả các clip, trạng thái tương ứng, ưu tiên và cơ chế crossfade.
- **Drag & Drop Integration**: Gắn kết luồng Drag của chuột vào `AnimationController` với độ ưu tiên cao nhất (95), nhân vật tự động phản hồi lại tương tác kéo thả của người dùng.

### Changed
- Cập nhật `useVRMScene.ts` loại bỏ procedural nháy mắt/thở cũ, tích hợp `AnimationController` làm trung tâm quản lý chuyển động.
- Nâng cấp `Cargo.toml` với các thư viện `uuid` và `rand` hỗ trợ logic behavior.

### Fixed
- Vá luồng sự kiện unmount ở chế độ kéo chuột (`useDrag`), đảm bảo gửi tín hiệu dọn dẹp context ("dragging") cho backend khi thả chuột.