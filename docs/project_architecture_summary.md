# Tài Liệu Tổng Hợp Kiến Trúc & Cơ Sở Codebase Chuẩn (Chiro-Pet)

Tài liệu này cung cấp cái nhìn tổng quan về kiến trúc đã refactor, các giải pháp kỹ thuật cốt lõi và tiêu chuẩn công nghệ thực sự đang được áp dụng trong dự án **Chiro-Pet** hiện tại. Đây là cơ sở dữ liệu và mã nguồn chuẩn (Golden Master Base) để tiếp tục triển khai các tính năng AI và tương tác nâng cao về sau.

---

## 🗺️ Bản Đồ Kiến Trúc Hệ Thống (Architecture Map)

Sau khi tiến hành tái cấu trúc (refactor) toàn diện, ứng dụng đã được tổ chức theo mô hình **Decoupled Component & Custom Hooks** ở Frontend và **Modular Command-Service** ở Backend.

### Sơ đồ luồng dữ liệu (Data & Event Flow)
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

---

## 💻 1. Frontend (React 19 + TypeScript + Vite 7)

Kiến trúc React đã được loại bỏ hoàn toàn mô hình "God Component" (`App.tsx`). Từng chức năng được tách biệt rõ ràng (Separation of Concerns):

### 1.1 Custom Hooks quản lý trạng thái và hành vi
- **[`useVRMScene`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/hooks/useVRMScene.ts)**: 
  - Đóng gói toàn bộ vòng đời Three.js (Scene, Camera, Renderer, Light).
  - Tự động hóa quá trình load model VRM.
  - Quản lý **Animation Loop** độc lập. Breathing và Blinking được điều phối hoàn toàn qua biến thời gian `deltaTime` của frame rendering thay vì sử dụng `setTimeout` hay `setInterval`, tránh tuyệt đối tình trạng block thread hay memory leaks khi React HMR hoạt động.
  - **Memory Leak Disposal**: Giải phóng GPU memory triệt để khi unmount bằng cách duyệt qua toàn bộ mesh, geometry, material và texture để `.dispose()` thủ công.
- **[`useAltKeyTracking`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/hooks/useAltKeyTracking.ts)**: Hook chuyên biệt lắng nghe và cập nhật trạng thái phím ALT thông qua Event API của Tauri.
- **[`useDrag`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/hooks/useDrag.ts)**: Chuyển đổi tọa độ dịch chuyển của chuột (Screen Space) sang tọa độ thế giới 3D (World Space) của OrthographicCamera một cách chính xác.

### 1.2 Layout & Presentational Components
- **[`CharacterCanvas`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/components/CharacterCanvas.tsx)**: Nơi mount canvas của WebGLRenderer. Được set `pointer-events-none` để người dùng click xuyên qua khu vực trong suốt của nhân vật xuống màn hình desktop.
- **[`DragOverlay`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/components/DragOverlay.tsx)**: Một overlay bao phủ toàn bộ cửa sổ. 
  > [!NOTE]
  > **Giải pháp tối ưu**: Component này luôn được mount trong DOM, chỉ bật/tắt khả năng nhận tương tác (`pointerEvents`) và thay đổi con trỏ chuột (`cursor-grab`) thông qua CSS. Điều này giải quyết hoàn toàn lỗi kẹt chuột (race condition) xảy ra khi thả ALT giữa chừng làm overlay bị unmount đột ngột khiến sự kiện `pointerup` không được kích hoạt.
- **[`RadialMenu`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/components/RadialMenu.tsx)**: Context menu chuột phải được nâng cấp các tính năng UX cao cấp:
  - Tự động đóng khi nhấn phím **Escape**.
  - Tự động đóng khi **Click-outside** (click ra ngoài menu).
  - Smooth animation lúc xuất hiện bằng CSS `@keyframes fadeIn`.
- **[`StatusIndicator`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/components/StatusIndicator.tsx)** & **[`LoadingIndicator`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src/components/LoadingIndicator.tsx)**: Các UI bổ trợ hiển thị trạng thái kéo thả và tiến trình load nhân vật.

---

## 🦀 2. Backend (Rust + Tauri v2)

Được chia nhỏ cấu trúc từ file monolith `lib.rs` ban đầu sang các mô-đun chuyên biệt:

- **[`commands.rs`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src-tauri/src/commands.rs)**: Chứa các lệnh IPC (Inter-Process Communication) phơi bày cho Frontend gọi qua `invoke`. Lệnh `greet` thừa của template ban đầu đã bị loại bỏ.
- **[`input_tracking.rs`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src-tauri/src/input_tracking.rs)**: Trình theo dõi trạng thái phím ALT và chuột ở mức toàn cục (Global) bằng tiến trình nền (background task).
  - **Trừu tượng hóa nền tảng (Platform Abstraction)**: Code sử dụng Win32 API (`windows` crate) được đóng gói chặt chẽ trong khối `#[cfg(windows)]`. Các hệ điều hành khác (`#[cfg(not(windows))]`) được cung cấp các hàm stub giả lập. Điều này giúp dự án biên dịch mượt mà trên Linux/macOS mà không bị lỗi thiếu thư viện Win32.
  - **Dọn dẹp mã dư thừa**: Đã loại bỏ hoàn toàn việc gửi tọa độ chuột `global-mouse-move` ở tần suất 20fps do Frontend không sử dụng, tiết kiệm đáng kể CPU và tài nguyên bus truyền tin của Tauri.
- **[`lib.rs`](file:///home/tvphuong1/Documents/Repository/chiro-pet/src-tauri/src/lib.rs)**: Đóng vai trò là Composition Root cực kỳ mỏng, chỉ thực hiện setup Tauri builder, plugin và chạy task tracking.

---

## 📦 3. Cấu Hình & Tối Ưu Hóa Tài Nguyên (Build Optimization)

### 3.1 Gói npm (`package.json`)
- Đổi tên dự án từ template chung `"tauri-app"` thành `"chiro-pet"`.
- Chuyển các dev-tools/types bao gồm `@types/three`, `@tailwindcss/vite` và `tailwindcss` sang mục `devDependencies`. Giúp giảm kích thước node_modules khi triển khai môi trường production.
- Sửa lại câu lệnh start thành `"tauri dev"` độc lập hệ điều hành thay vì bị kẹt ký tự set PATH của Windows.

### 3.2 Cargo & Rust Dependencies (`Cargo.toml`)
- Tối ưu hóa tính năng (features) của crate `tokio`:
  ```toml
  tokio = { version = "1", features = ["time", "rt"] }
  ```
  Thay vì import toàn bộ thư viện qua `features = ["full"]`, cấu hình mới chỉ kéo vào module `time` và `rt` (runtime). Giúp **giảm thiểu đáng kể thời gian biên dịch** và **thu nhỏ dung lượng file thực thi `.exe/.app`**.

---

## 🔮 4. Định Hướng Phát Triển Tiếp Theo (AI & Interaction)

Codebase hiện tại là nền tảng vững chắc để xây dựng các tính năng nâng cao tiếp theo đã được vạch ra trong tài liệu thiết kế:

1. **AI Chat & Voice System**: Dễ dàng tích hợp các service gọi LLM APIs mà không làm ảnh hưởng đến luồng rendering 3D. Trạng thái phản hồi của AI có thể dễ dàng map trực tiếp vào VRM qua `vrmRef.current.expressionManager`.
2. **Dynamic Animations**: Tận dụng structure của `useVRMScene` để tạo thêm các hoạt ảnh cử chỉ (gestures) hoặc tracking hướng mắt nhìn theo chuột của nhân vật.
3. **Cross-platform Input**: Phát triển mô-đun `input_tracking.rs` cho Linux/macOS bằng cách tích hợp crate `rdev` hoặc `device_query` thay thế cho stub trống hiện tại.

## Animation Runtime System

### Mục tiêu
Hệ thống animation phải biến nhân vật VRM thành một companion có trạng thái sống, không chỉ là model đứng yên.

### Nguyên tắc
- Backend quyết định logical animation state.
- Frontend chỉ render và thực thi animation command.
- Mọi animation phải có fallback.
- Không cho nhiều animation giẫm nhau.
- AI chỉ được đề xuất animation, AnimationDirector quyết định.
- Runtime ưu tiên VRMA.
- FBX/BVH/VMD là source format, nên convert offline sang VRMA.