# Kế hoạch Triển khai Transition Engine & Utility AI (AAA-Grade)

Tài liệu này đặc tả kiến trúc kỹ thuật chi tiết mức độ thiết kế hệ thống (System Design) để nâng cấp hệ thống Animation của Chiro-Pet. Mục tiêu là chuyển đổi từ việc play/crossfade animation đơn thuần thành một hệ thống **Transition Engine** cấp độ Engine và **Offline Utility AI** mô phỏng sự sống (như The Sims), giúp nhân vật tự ra quyết định và chuyển động mượt mà không cần can thiệp từ OpenAI, tối ưu chi phí và tăng tính sống động.

---

## 1. Animation Transition Engine (Graph-based State Machine)

### 1.1. Vấn đề của Crossfade Đơn Thuần
Hiện tại, khi chuyển từ tư thế `laying_idle` sang `walk`, việc chỉ dùng cơ chế crossfade (trộn weight) sẽ tạo ra tình trạng trượt chân (foot sliding), giật lag, hoặc gãy xương (clipping) do sự khác biệt quá lớn về transform root và cấu trúc pose.

### 1.2. Giải pháp: Transition Graph & Pathfinding
Hệ thống (Rust Backend đóng vai trò Controller) sẽ xây dựng một đồ thị có hướng (Directed Graph) để quản lý các tư thế (Pose) và các đường đi hợp lệ giữa chúng.

- **Node (Trạng thái Pose):** Đại diện cho một tư thế vật lý cốt lõi. Ví dụ: `Stand`, `Sit`, `Laying`, `Kneel`.
- **Edge (Chuyển tiếp):** Đại diện cho một animation chuyển tiếp. Ví dụ: `SitToStand` (animation: `action_standup.vrma`).

**Cơ chế hoạt động (Dijkstra / A* Pathfinding):**
Khi hệ thống có yêu cầu chuyển sang một animation thuộc Node B, trong khi nhân vật đang ở Node A:
1. Đánh giá tính hợp lệ: Nếu Node A == Node B, chỉ cần crossfade.
2. Tìm đường (Pathfinding): Thuật toán Dijkstra tìm đường đi ngắn nhất từ A -> B dựa trên cost của các Edge (có thể là thời lượng của animation chuyển tiếp).
3. Hàng đợi thực thi (Action Queue):
   Ví dụ tìm đường: `Laying` -> (play `laydown_to_sit`) -> `Sit` -> (play `action_standup`) -> `Stand` -> (play animation đích).
4. Thực thi tuần tự: Backend báo cho Frontend play từng đoạn, chờ IPC event `animation_finished` từ Frontend để pop queue và play đoạn tiếp theo.

### 1.3. Cấu trúc Dữ liệu Transition Graph (Rust Core)
```rust
// Đại diện cho một tư thế vật lý cơ bản
pub struct PoseNode {
    pub id: String, // "Stand", "Sit", "Laying", "Kneel"
    pub tag: String, // Dùng để map với animation
}

// Đại diện cho hành động chuyển đổi giữa 2 tư thế
pub struct TransitionEdge {
    pub from_node: String,
    pub to_node: String,
    pub transition_animation: String, // Tên file, vd: "action_standup.vrma"
    pub cost: f32, // Trọng số tìm đường (vd: thời gian tính bằng giây)
    pub can_interrupt: bool, // Có thể bị gián đoạn giữa chừng không
}

pub struct TransitionGraph {
    pub nodes: HashMap<String, PoseNode>,
    pub edges: Vec<TransitionEdge>,
}

impl TransitionGraph {
    // Thuật toán Dijkstra để tìm list animation cần play
    pub fn find_path(&self, start: &str, target: &str) -> Option<Vec<String>> { ... }
}
```

### 1.4. Dual Action Self-Crossfading (Xử lý giật Loop)
Khi chạy một file animation lặp lại (Loop) bị giật ở điểm nối (frame cuối lệch frame đầu):
- Controller trên Three.js tạo 2 Action Track cho cùng 1 file `.vrma`.
- **Track A** chạy bình thường. Khi thời gian tiến trình đạt 90% (tùy config), **Track B** bắt đầu phát từ frame 0.
- `crossFadeFrom` được gọi để mượt mà chuyển từ A sang B trong 10% thời lượng cuối, che lấp sự đứt gãy vật lý.
- Quá trình này đảo ngược lại giữa B và A cho các vòng lặp tiếp theo.

---

## 2. Offline Utility AI (Mô phỏng sự sống)

Để mô phỏng một companion thực thụ, hệ thống cần tự quyết định hành động khi nhàn rỗi (Idle) thông qua **Utility AI Architecture** (Kiến trúc tương tự The Sims, RimWorld).

### 2.1. Đồng bộ với State System (Needs & Drives)
Thay vì tạo ra một hệ thống Needs riêng biệt, Offline Utility AI sẽ đọc trực tiếp từ **CharacterState** (được định nghĩa trong `state-system.md`). Các chỉ số này sẽ đóng vai trò là "Needs" (Nhu cầu/Động lực) đầu vào cho Utility AI:
- **Energy (0..100):** Giảm theo thời gian qua Decay System. Mức thấp khiến nhân vật mệt mỏi, tạo động lực cao cho các hành động `Sleep`, `Sit`.
- **Mood (-10..10):** (Tương đương với Fun). Khi nhân vật chán (Mood thấp), động lực để thực hiện `Dance`, `Play`, `Exercise` sẽ tăng lên để tự cải thiện tâm trạng.
- **Curiosity (0..100):** Tò mò. Kích thích nhân vật thực hiện các hành vi tương tác với môi trường hoặc thu hút sự chú ý (`action_attention_seeking`).
- **Physical Comfort (Runtime Only):** Một chỉ số tạm thời (không lưu DB) tính bằng thời gian giữ một tư thế. Đứng quá lâu sẽ giảm Comfort, buộc phải chuyển sang `Sit` hoặc `Laying`.

### 2.2. Considerations & Scoring Curves (Hàm tính điểm)
Mỗi **UtilityAction** (vd: "Ngủ", "Nhảy múa") bao gồm nhiều **Considerations** (Yếu tố cân nhắc). Mỗi Consideration sử dụng một **Scoring Curve** (Đường cong) để map giá trị State hiện tại thành Utility Score (0.0 -> 1.0).

**Các loại Curves:**
- **Linear:** Điểm thay đổi tuyến tính theo State.
- **Inverse Quadratic:** Điểm tăng vọt khi State rớt xuống mức nguy hiểm (mô phỏng sự khẩn cấp, vd: thiếu ngủ).
- **Logistic (S-Curve):** Giữ mức ổn định ở giữa, đột ngột thay đổi ở các biên.

*Ví dụ:* Action "Đi ngủ" có Consideration dựa trên `Energy`.
- Nếu `Energy` = 80 (Cao): Score = 0.01 (Không buồn ngủ).
- Nếu `Energy` = 20 (Thấp): Inverse Quadratic Curve tính ra Score = 0.95 (Cực kỳ buồn ngủ).

### 2.3. The Action Selection Pipeline (Luồng chọn Hành động)
Backend (Rust) sẽ chạy một vòng lặp `Tick` mỗi 15-30 giây thông qua ProactivityController (khi ở chế độ Idle).

1. **Evaluate Actions:** Quét tất cả `UtilityAction` khả dụng từ Dynamic Pool.
2. **Calculate Utility:** 
   - Đọc `CharacterState` hiện tại từ `StateManager`.
   - Với mỗi Action, duyệt qua các `Considerations`, tính Score và nhân lại với nhau để ra `Final Utility Score`.
3. **Filter & Rank:** Lọc bỏ Action có Score < 0.2 và sắp xếp giảm dần.
4. **Weighted Random Selection:** Áp dụng Weight Random cho top 3 Action để tránh lặp lại hành vi dự đoán được.
5. **Execution & State Mutation:** 
   - Gọi Transition Engine tìm đường từ tư thế hiện tại đến `target_pose` của Action được chọn.
   - Gửi Event xuống Frontend thực thi animation.
   - Khi hoàn thành, tạo một `CharacterStateDelta` (vd: `energy: +10`, `mood: +2`) và gửi đến `StateManager.patch_character_state(..., MutationSource::OfflineAI)` để cập nhật trạng thái an toàn qua Guard Chain.

```rust
// Cấu trúc Utility Action nâng cao đồng bộ với StateSystem
pub struct Consideration {
    pub state_field: String, // "energy", "mood", "curiosity"
    pub curve_type: CurveType,
    pub weight: f32,
}

pub struct UtilityAction {
    pub id: String, // "take_a_nap"
    pub target_pose: String, // "Laying"
    pub animation_files: Vec<String>, // Random pick từ pool ["laying_idle", "laying_idle2"]
    pub considerations: Vec<Consideration>,
    pub state_effects: CharacterStateDelta, // Tác động qua StateManager sau khi hoàn thành
    pub cooldown_ms: u64,
}
```

---

## 3. Hệ thống Layering & Procedural Liveliness (Frontend Three.js)

Để khắc phục giới hạn của file `.vrma` chỉ chứa chuyển động xương (Skeletal) mà thiếu biểu cảm khuôn mặt (Morph Targets / Blendshapes) và tương tác với môi trường, ta sử dụng **AnimationMixer Layering**.

### 3.1. Phân tầng Layer và Pipeline Thực thi (Animation vs Procedural)
Kiến trúc này được đồng bộ chặt chẽ với `procedural-animation-system.md` để đảm bảo chuyển động không bị xung đột (conflict). Pipeline thực thi mỗi frame trên Frontend (Three.js) bắt buộc phải tuân theo thứ tự sau:

1. **Layer 0 - 1 (AnimationMixer Update):** Đọc dữ liệu từ file `.vrma` hiện tại (quản lý bởi Transition Engine) và áp dụng Base Pose lên các xương (Bones).
2. **Layer 2 (Expression System):** Kích hoạt/Ghi đè tuyệt đối các Blendshape khuôn mặt (Joy, Angry, Sorrow) dựa trên trạng thái (từ Utility AI hoặc ChatGPT).
3. **Layer 3 (Procedural Controller Update):** 
   - **LookAt, Blink, Breathing, Micro-motion:** Được tính toán và cộng dồn (Additive) vào Pose gốc.
   - **Xử lý xung đột (Conflict Resolution):** Procedural Controller sẽ đọc `Global Weight` và `Animation State` để tự giảm cường độ. Ví dụ: Nếu Transition Engine đang play một Reaction Animation giật mạnh, Procedural Controller sẽ tạm thời giảm weight của `LookAt` và `Breathing` về 0.3 để tránh làm gãy cổ hoặc méo model.
4. **Layer 4 (VRM/SpringBone Update):** Tính toán vật lý cho tóc và quần áo dựa trên sự thay đổi vị trí xương từ các bước trước.
5. **Layer 5 (Shader/Renderer):** Thực hiện render cuối cùng lên màn hình.

### 3.1.1. Tương tác với Shader System
Trong quá trình xử lý Layer 5, Transition Engine và Utility AI có thể trực tiếp gửi lệnh để tinh chỉnh `shader-system.md`:
- Khi Utility AI đổi sang Action `Sleep` (Energy thấp): Controller sẽ gửi lệnh giảm `rim.intensity` và áp dụng `face_shadow` tối hơn để phù hợp với hoàn cảnh.
- Khi AI chuyển sang trạng thái tập trung (Focus Mode): Chuyển shader sang chế độ `soft_anime` để giảm sự phân tâm cho User.

### 3.2. Lifecycle của một Expression
Khi nhận được chỉ định `emotion` (thuộc enum `AIEmotion` như `happy`, `sad`, `surprised` được định nghĩa trong `ai-interaction-system.md`) từ AI Orchestrator hoặc từ Offline Utility AI:
1. Expression Controller nhận lệnh, map `AIEmotion::happy` sang chuẩn VRM Blendshape (ví dụ `Joy`), sau đó fade-in blendshape này lên 1.0 trong 0.5s.
2. Cảm xúc này được giữ (Hold) cho đến khi có lệnh thay đổi state cảm xúc khác, hoặc bị ghi đè tạm thời bởi một "Reaction" (vd: bị click trúng hitarea -> "Surprise" trong 2s, sau đó tự động trả về "Joy").

---

## 4. Tự động Gom nhóm (Auto-Grouping) và Dynamic Manifest

Để quản lý kho dữ liệu linh hoạt mà không cần hardcode, Backend sẽ chịu trách nhiệm quyét và phân tích thư mục chứa file `.vrma` vào bộ nhớ.

### 4.1. Cấu trúc vật lý của Asset Pipeline
Tất cả `.vrma` phải được đặt vào đúng subfolder theo phân loại vật lý:
- `actions/`: Hành động chủ động, di chuyển (walk, jog, crawl).
- `dances/`: Hành động giải trí, nhảy múa.
- `exercises/`: Hành động thể dục.
- `hitareas/`: Phản ứng khi bị click/tương tác.
- `emotions/`: Animations diễn tả cảm xúc mạnh.
- `idles/`: Các tư thế nghỉ (standing idle, sitting idle).
- `misc/`: Các file chưa phân loại hoặc default.

### 4.2. Khởi tạo Dynamic Pool (Rust Scanner)
Khi khởi động ứng dụng:
1. Rust duyệt qua các thư mục con trong `public/animation/vrma/`.
2. Extract metadata dựa trên tên file và thư mục. 
   - Ví dụ: `idles/sit_idle2.vrma` -> Được gắn tag `[idle, sit]`, map vào PoseNode `Sit`.
3. Tạo ra các Pool động trong RAM.
4. Khi Utility AI quyết định thực thi hành động "Ngồi nhàn rỗi", nó không gọi đích danh một file nào, mà yêu cầu Pool `[idle, sit]` trả về một file random (có weight).

Điều này giúp việc thêm animation mới trong tương lai chỉ đơn giản là thả file vào đúng thư mục, hệ thống sẽ tự động sử dụng mà không cần sửa code hay config.

---

## 5. Lộ trình Triển khai (Implementation Phases)

Để đảm bảo an toàn, hệ thống sẽ được xây dựng theo từng Phase, test kỹ trước khi qua bước tiếp theo:

* **Phase 1: Dynamic Asset Pipeline & Auto-Grouping.** 
  - (Xong) Tổ chức thư mục vật lý.
  - Viết module Rust `AssetScanner` tự động load các file vào Memory Pool khi startup.
* **Phase 2: Procedural Layers & Liveliness (Three.js).** 
  - Xây dựng `LayerController` tách biệt Base Body, Blendshapes (Blink, Emotion) và VRMLookAt. Đảm bảo không bị conflict.
* **Phase 3: Core Transition Engine (Rust).** 
  - Define `PoseNodes` và `TransitionEdges`. 
  - Viết thuật toán Dijkstra tìm đường. Viết IPC command để gửi chuỗi animation xuống Frontend.
* **Phase 4: Offline Utility AI (Rust).** 
  - Tích hợp `CharacterState` (từ `state-system.md`) làm đầu vào cho `Considerations` và `Curve Scorers`.
  - Khởi tạo Background Ticker loop (mỗi 15-30s) trong `ProactivityController` để tính điểm và chọn Action rảnh rỗi.
  - Xử lý output `CharacterStateDelta` thông qua `StateManager.patch_character_state`.
* **Phase 5: High-Level Orchestrator & AI Integration.** 
  - Kết nối AI/Chat system (`ai-interaction-system.md`).
  - Phân định rõ quyền điều khiển: AI trả về `suggested_animation` và `state_delta` thông qua OpenAI API, trong khi Offline Utility AI chiếm quyền điều khiển khi hệ thống rơi vào trạng thái Idle (không có prompt) để giữ nhân vật luôn "sống".
