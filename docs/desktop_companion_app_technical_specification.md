# **DESKTOP COMPANION APP - TECHNICAL SPECIFICATION & IMPLEMENTATION GUIDE**

## **Mục lục**

- Tổng quan sản phẩm
- Nghiệp vụ nhân vật (Character Business Logic)
- Hệ thống Action & Animation
- Click-through & Transparent Window (giải pháp kỹ thuật)
- Kiến trúc tổng thể
- Module chi tiết
- Data model
- IPC contract
- Lộ trình triển khai
- Checklist hoàn thiện

## **1. TỔNG QUAN SẢN PHẨM**

### **1.1. Định vị**

Desktop Companion App: một ứng dụng chạy nền trên Windows, hiển thị một nhân vật 3D VRM nhỏ trên màn hình, hoạt động như một người bạn ảo:

- Hiện diện liên tục trên desktop nhưng không gây phiền
- Nhận biết ngữ cảnh sử dụng máy (làm việc, chơi game, họp, idle)
- Tương tác qua click, drag, radial menu, chat
- Có cảm xúc, ký ức, thói quen riêng
- Hành động ngẫu nhiên tạo cảm giác "sống"

### **1.2. Stack kỹ thuật**

- Shell: Tauri 2.x
- Backend: Rust + tokio + sqlx + windows-rs
- Frontend: React 18 + TypeScript + Vite
- 3D: Three.js r160+ + @pixiv/three-vrm + @pixiv/three-vrm-animation
- UI: Tailwind CSS + Framer Motion + Zustand
- DB: SQLite local
- AI: OpenAI-compatible HTTP client (reqwest)
- Encryption: aes-gcm + argon2 (API key)

### **1.3. Bốn trụ cột**

- Presence (hiện diện sống động)
- Context (hiểu ngữ cảnh desktop)
- Proactivity (chủ động đúng lúc)
- Trust (riêng tư, kiểm soát được)

## **2. NGHIỆP VỤ NHÂN VẬT (CHARACTER BUSINESS LOGIC)**

### **2.1. Character Identity (Bản sắc nhân vật)**

#### **A. Static Identity (không đổi)**

- name: tên hiển thị
- gender_presentation: nữ/nam/neutral
- age_appearance: tuổi nhìn (vd: 18-22)
- personality_archetype: dịu dàng / tsundere / vui vẻ / điềm tĩnh / tinh nghịch
- speaking_style: cách xưng hô, giọng văn (em-anh / mình-bạn / tôi-cậu)
- backstory: lý lịch ngắn (1-2 đoạn)
- core_values: 3-5 giá trị nhân vật coi trọng
- taboos: 2-3 điều nhân vật không thích nói/làm

#### **B. Dynamic State (thay đổi runtime)**

- mood: -100 đến 100 (tâm trạng ngắn hạn)
- energy: 0-100 (năng lượng)
- affinity: 0-100 (mức gắn bó với user)
- trust: 0-100 (tin tưởng)
- familiarity: 0-100 (quen thuộc)
- loneliness: 0-100 (nhớ user)
- curiosity: 0-100 (xu hướng chủ động)
- patience: 0-100 (khả năng im lặng chờ)
- intimacy_level: 0-5 (mốc thân mật)

#### **C. Relationship Stage (giai đoạn quan hệ)**

Dựa trên familiarity + affinity + trust + days_together:

- Stranger (0-7 ngày): lịch sự, giữ khoảng cách
- Acquaintance (7-30 ngày): cởi mở, bắt đầu trêu nhẹ
- Friend (30-90 ngày): thân thiết, biết sở thích
- Close (90+ ngày): hiểu thói quen sâu, có thể "tỏ ra hờn"
- Bonded (200+ ngày + trust>80): có ritual riêng

### **2.2. Mood System**

Mood chia làm 2 lớp:

- short_mood: thay đổi theo từng tương tác, decay về 0 sau 1-2h
- baseline_mood: trung bình tuần, decay rất chậm

Mood ảnh hưởng:

- Tone câu trả lời AI
- Lựa chọn animation (vui → wave, buồn → ngồi co)
- Tần suất chủ động (mood thấp → ít nói)
- Expression mặc định trên mặt

Mood update sources:

- User petting: +2 mood
- User Talk tích cực: +1 mood
- User ignore lâu: -1 mood/h sau ngưỡng
- Time of day: tối khuya mood neutralize chậm
- Context: meeting → mood "calm" tự áp

### **2.3. Energy System**

Energy giảm theo:

- Mỗi animation lớn (jump, run): -2
- Mỗi câu chat: -1
- Mỗi giờ active: -3

Energy hồi:

- Sleep mode: +5/phút
- Idle ngồi yên: +1/10 phút
- User cho Sleep action: +30 instantly

Energy thấp (<20):

- Animation chậm hơn
- Bubble ít hơn
- Ưu tiên pose ngồi/nằm
- Bubble: "Em hơi mệt rồi đó."

### **2.4. Memory System**

#### **Memory types:**

- preference: "Người dùng thích phản hồi ngắn"
- habit: "Thường code sau 22h"
- boundary: "Không nhắc nghỉ khi gaming"
- event: "Ngày X kỷ niệm Y"
- relationship: "User thích được khen, không thích bị nhắc"
- taboo: "Không đùa về công việc"

#### **Memory lifecycle:**

- AI hoặc rule đề xuất memory_to_save
- Filter check (no sensitive data)
- User confirm (nếu importance >= 4)
- Insert SQLite với importance 1-5
- Retrieval: top 5 relevant theo current context

#### **Memory rules:**

- Không lưu nếu chỉ xuất hiện 1 lần (trừ khi user explicit nói "nhớ giúp")
- Forgetting: importance 1-2 expire sau 30 ngày nếu không used
- User có thể edit/delete trong Settings

### **2.5. Proactivity Behavior**

Mỗi minute, scheduler chạy proactivity_check:

1. Tính proactivity_score: score = relevance + importance + availability + relationship - recent_interrupt_penalty - focus_penalty - mode_penalty 2. Check budget hôm nay (max N bubble/ngày theo mode) 3. Check cooldown (min M phút giữa 2 bubble) 4. Map score → interruption_level (0-4) 5. Nếu >= 2, build prompt → gọi AI hoặc template 6. Validate response → render bubble + animation

Budgets theo mode:

- Normal: 6 bubble/ngày, cooldown 30 phút
- Focus: 2 bubble/ngày, cooldown 60 phút
- Gaming: 1 bubble/ngày khi alt-tab
- Meeting: 0 bubble
- Private: 0 bubble

### **2.6. Idle Behavior (Random Actions)**

Mỗi 45-120 giây (random), nếu không có event khác:

- 60% chance: nhỏ (blink mạnh, nhìn quanh, lắc nhẹ)
- 25% chance: vừa (vẫy tay nếu user gần cursor, ngáp)
- 10% chance: lớn (đổi pose, walk to new anchor)
- 5% chance: trigger AI cho bubble ambient

Random action pool theo context:

- Coding: ngồi đọc sách mini, vẽ note, nhìn screen
- Gaming: cổ vũ im lặng, đeo tai nghe
- Meeting: ngồi yên, cầm bảng Quiet
- Idle (user away): nhìn về cursor cuối, nằm ngủ gật
- Đêm khuya (>22h): ngáp, ôm gối, mặt buồn ngủ

### **2.7. Interaction Reactions**

Mỗi user action có reaction tự nhiên:

- Click character lần đầu: nhìn lên, mỉm cười, mở radial menu
- Click liên tục (>5 lần trong 10s): phồng má, "Đủ rồi đó"
- Drag character: pose bị nhấc, tay chân buông tự nhiên
- Drag mạnh + thả: rơi xuống, hơi xiêu vẹo, làm mặt giận nhẹ
- Hover cursor lâu trên character: má hồng, nhìn cursor
- Cursor di chuyển nhanh quanh character: mắt follow, đầu nghiêng
- User chat tích cực: mood+1, animation happy/shy
- User chat tiêu cực: mood-1, animation worried
- User ignore lâu (4h+): loneliness+, animation buồn

### **2.8. Mode Behaviors**

| **Mode** | **Anchor**       | **Animation**     | **Expression**   | **Bubble**          |
| -------- | ---------------- | ----------------- | ---------------- | ------------------- |
| Normal   | Taskbar/Floating | Idle vivid        | Neutral/Happy    | Allowed             |
| Focus    | Taskbar góc      | Sit reading       | Calm             | Rare                |
| Gaming   | Taskbar tiny     | Sit headphone     | Cheering quiet   | None unless alt-tab |
| Meeting  | Hidden/Taskbar   | Sit with sign     | Calm finger-lips | Forbidden           |
| Watching | Taskbar          | Sit watching      | Relaxed          | Forbidden           |
| Private  | Hidden           | None              | None             | Forbidden           |
| Idle     | Floating/Walk    | Walk around/Sleep | Curious/Sleepy   | Soft                |

### **2.9. Time-based Behavior**

Theo giờ trong ngày:

- 06-09: morning_greeting nếu first interaction
- 11-13: lunch_reminder soft
- 17-19: end_of_workday check-in
- 22-24: night_mode (tone dịu, ngáp animation)
- 00-06: sleep_mode (gần như im lặng, nếu user còn dùng máy thì lo lắng nhẹ)

Theo ngày trong tuần:

- Thứ 2 sáng: "Lại tuần mới rồi nhỉ"
- Thứ 6 tối: "Cuối tuần rồi đó"
- Cuối tuần: animation thư giãn nhiều hơn

### **2.10. Relationship Milestones**

Streak/milestone events:

- Day 1: welcome event đặc biệt
- Day 7: "Mình quen nhau 1 tuần rồi"
- Day 30: bubble đặc biệt, unlock animation
- Day 100: kỷ niệm lớn
- Streak liên tục mở app: bonus mood

## **3. HỆ THỐNG ACTION & ANIMATION**

### **3.1. Animation Layer Architecture**

4 layer blend:

- Layer 1 (Base, weight 1.0): idle clip loop liên tục
- Layer 2 (Action, weight 0-1): clip ngắn trigger (wave, sit)
- Layer 3 (Procedural, additive): breathing, sway, look-at, blink
- Layer 4 (Expression, blendshape weights): mood-driven face

### **3.2. Required Animation Clips (VRMA)**

Bộ animation MVP cần có (15-20 clip):

#### **Idle (4 clips, loop)**

- idle_standing: đứng, hơi lắc người
- idle_sitting: ngồi (dùng khi anchor taskbar)
- idle_floating: lơ lửng (cho fairy mode)
- idle_sleeping: ngủ co người

#### **Interaction (8 clips)**

- wave_hello: vẫy tay chào
- wave_bye: vẫy tay tạm biệt
- nod: gật đầu
- shake_head: lắc đầu
- pet_react: phản ứng khi user "pet" (cười, má hồng)
- poke_react: phản ứng khi user click liên tục (phồng má)
- surprised: giật mình
- thinking: nghiêng đầu suy nghĩ

#### **Movement (4 clips)**

- walk: đi bộ (cho di chuyển anchor)
- jump_up: nhảy lên
- jump_land: đáp xuống
- sit_down: ngồi xuống

#### **Emotion (4 clips)**

- happy_bounce: vui nhảy nhẹ
- shy_cover: ngại che mặt
- pout: phồng má giận
- yawn: ngáp

#### **Context-specific (4 clips)**

- read_book: đọc sách (focus mode)
- hold_quiet_sign: cầm bảng Quiet (meeting)
- cheer_silent: cổ vũ im lặng (gaming)
- stretch: vươn vai (after long session)

### **3.3. Procedural Animations (chạy code, không cần clip)**

#### **Breathing**

- Mỗi frame: chest_bone.rotation.x = sin(time * 1.5) * 0.02
- Active luôn (trừ khi sleeping thì tăng amplitude)

#### **Blinking**

- nextBlink = random(2, 6) seconds
- Khi tới: blendshape "blink" 0→1→0 trong 120ms
- Reset nextBlink

#### **Idle Sway**

- Mỗi frame: hips_bone.rotation.z = sin(time * 0.7) * 0.015
- Disabled khi đang play action clip lớn

#### **Look-at Cursor**

- Tính vị trí cursor screen
- Project vào local space character
- Áp dụng yaw/pitch cho head bone (clamp -45° / +45°)
- Eye bones follow với multiplier 0.4
- Smooth lerp 0.12

#### **Float Bob (cho floating anchor)**

- position.y += sin(time * 1.2) * 0.05
- Disabled khi đứng/ngồi

#### **Hair/Cloth Physics (Spring Bones)**

- VRM Spring Bone tự chạy
- Tuning: stiffness 0.5, drag 0.4, gravity 0.5
- Pause khi off-screen

### **3.4. Action System**

#### **Action definition**

Mỗi action là một composition của:

{ "id": "string", "trigger": "click" | "drag" | "scheduled" | "context_change" | "user_command", "preconditions": { "mode"?: string, "mood_min"?: number, "energy_min"?: number, "cooldown_ms"?: number }, "sequence": [ { "type": "play_clip", "clip_id": string, "blend_in_ms": number, "blend_out_ms": number }, { "type": "set_expression", "name": string, "weight": number, "duration_ms": number }, { "type": "show_bubble", "text_template": string, "duration_ms": number }, { "type": "apply_delta", "mood"?: number, "affinity"?: number, "energy"?: number }, { "type": "wait", "ms": number }, { "type": "set_anchor", "anchor_type": string } ], "cooldown_after_ms": number }

#### **Built-in actions list**

| **Action ID**          | **Trigger**               | **Sequence tóm tắt**                             |
| ---------------------- | ------------------------- | ------------------------------------------------ |
| greet_morning          | scheduled 06-09           | wave + bubble "Chào buổi sáng" + mood+1          |
| greet_return           | user_active sau idle 30m+ | look_up + smile + bubble                         |
| react_pet              | radial Pet                | pet_react + expression shy + mood+2 + affinity+1 |
| react_chat             | radial Talk               | thinking → reply animation theo emotion AI       |
| react_click_spam       | 5+ click trong 10s        | pout + bubble "Đủ rồi đó" + mood-1               |
| react_drag             | drag start                | picked_up_pose                                   |
| react_drop_soft        | drop với vận tốc thấp     | jump_land + smile                                |
| react_drop_rough       | drop với vận tốc cao      | jump_land + pout + bubble "Ơ"                    |
| ambient_lookaround     | random idle               | nhìn quanh nhẹ                                   |
| ambient_yawn           | đêm + energy thấp         | yawn + bubble "Buồn ngủ quá"                     |
| ambient_stretch        | sau 1h ngồi               | stretch + bubble "Anh cũng vươn vai đi"          |
| focus_milestone_45     | sau 45m focus             | gentle_wave + bubble "Anh tập trung ghê"         |
| focus_milestone_90     | sau 90m focus             | concern + bubble "Nghỉ chút nhé?"                |
| context_change_meeting | enter meeting             | walk_to_taskbar + hold_quiet_sign                |
| context_change_gaming  | enter gaming              | walk_to_corner + cheer_silent                    |
| context_change_focus   | enter focus               | sit_down + read_book                             |
| daily_checkin          | first launch hôm nay      | wave + bubble theo time-of-day                   |
| milestone_day7         | streak day 7              | happy_bounce + bubble đặc biệt                   |
| private_mode_on        | toggle private            | fade_out + minimal indicator                     |

### **3.5. Animation Director (orchestrator)**

Rust component quyết định khi nào play action gì:

Tick (60s interval hoặc on event): 1. Lấy current_context (mode, app, time, idle_duration) 2. Lấy current_state (mood, energy, affinity) 3. Lấy queue events từ scheduler 4. Match action candidates qua precondition 5. Check cooldown từng action 6. Sort theo priority + score 7. Pick top 1 action 8. Emit sequence commands → Frontend

#### **Commands gửi frontend:**

- PlayClip { clip_id, blend_in_ms, loop, weight }
- StopClip { clip_id, blend_out_ms }
- SetExpression { name, weight, duration_ms }
- SetProcedural { module, enabled, intensity }
- LookAt { target: Cursor | Point(x,y,z) | None }
- ShowBubble { text, duration_ms, choices? }
- HideBubble
- SetAnchor { type, target_pos? }
- ApplyPose { preset: Standing|Sitting|Hanging|Floating|Sleeping }

### **3.6. Anchor System (vị trí trên desktop)**

Anchor types:

- TaskbarTop: đứng/ngồi trên taskbar
- ScreenCorner: góc màn hình (bottom-right default)
- WindowTopEdge: bám mép cửa sổ active
- FloatingPoint: lơ lửng tự do
- ScreenEdgePeek: thò đầu từ cạnh màn hình
- PinnedSpot: user ghim
- HiddenTray: ẩn vào system tray

Anchor selection logic:

if mode == Meeting: TaskbarTop tiny elif mode == Gaming + fullscreen: HiddenTray hoặc TaskbarTop elif mode == Focus: TaskbarTop corner elif user_pinned: PinnedSpot elif mode == Idle 30m+: FloatingPoint slow drift else: ScreenCorner default

Transition giữa anchor: walk clip nếu khoảng cách nhỏ, jump+land nếu xa, fade nếu rất xa.

### **3.7. Expression System**

Blendshape mapping (VRM standard):

- happy, sad, angry, surprised
- blink, blinkLeft, blinkRight
- aa, ee, ih, oh, ou (visemes cho lip-sync sau này)

Custom mood→expression mapping:

mood > 50: happy 0.6 mood 20-50: happy 0.3 mood -20 to 20: neutral mood -50 to -20: sad 0.3 mood < -50: sad 0.6

Layer expressions:

- Base mood expression (always on, weight thấp)
- Action expression (khi play clip, weight cao, ngắn hạn)
- Manual expression (set qua command, ưu tiên cao nhất)

## **4. CLICK-THROUGH & TRANSPARENT WINDOW**

### **4.1. Vấn đề hiện tại**

- Nền có thể không trong suốt hoàn toàn → có viền/hộp
- Vùng bên ngoài nhân vật không click-through → cản input vào app khác

### **4.2. Giải pháp tổng thể**

Cần kết hợp 3 lớp:

- Lớp 1: Window flags (WS_EX_LAYERED + WS_EX_TRANSPARENT)
- Lớp 2: WebView transparent + Canvas alpha
- Lớp 3: Dynamic per-pixel click-through (hitbox tracking)

### **4.3. Lớp 1: Window Flags (Rust)**

use windows::Win32::UI::WindowsAndMessaging::*; use windows::Win32::Foundation::HWND; pub fn setup_overlay_window(hwnd: HWND) { unsafe { let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE); SetWindowLongPtrW( hwnd, GWL_EXSTYLE, ex_style | WS_EX_LAYERED.0 as isize // layered → có alpha | WS_EX_TOOLWINDOW.0 as isize // không hiện trên Alt+Tab | WS_EX_NOACTIVATE.0 as isize // không steal focus | WS_EX_TOPMOST.0 as isize, // always on top ); } } #[tauri::command] pub fn set_click_through(window: tauri::Window, enabled: bool) -> Result&lt;(), String&gt; { let hwnd = HWND(window.hwnd().unwrap().0 as isize); unsafe { let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE); let new_style = if enabled { ex_style | WS_EX_TRANSPARENT.0 as isize } else { ex_style & !(WS_EX_TRANSPARENT.0 as isize) }; SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style); } Ok(()) }

### **4.4. Lớp 2: WebView + Canvas Transparency**

tauri.conf.json:

{ "windows": [{ "label": "overlay", "transparent": true, "decorations": false, "alwaysOnTop": true, "skipTaskbar": true, "resizable": false }] }

HTML/CSS:

&lt;html style="background: transparent;"&gt; &lt;body style="background: transparent; margin: 0; overflow: hidden;"&gt; &lt;div id="root" style="background: transparent;"&gt;&lt;/div&gt; &lt;/body&gt; &lt;/html&gt;

Three.js renderer:

const renderer = new THREE.WebGLRenderer({ alpha: true, // bật alpha channel antialias: true, premultipliedAlpha: false // QUAN TRỌNG: tránh viền tối }); renderer.setClearColor(0x000000, 0); // clear alpha = 0 renderer.setPixelRatio(window.devicePixelRatio);

Scene KHÔNG có background:

const scene = new THREE.Scene(); // KHÔNG set scene.background

### **4.5. Lớp 3: Dynamic Per-Pixel Click-Through (giải pháp chính)**

Đây là kỹ thuật cốt lõi để giải quyết vấn đề.

#### **Strategy: Hitbox Polling**

Frontend tính bounding rect 2D của nhân vật mỗi 50-100ms, gửi xuống Rust. Rust theo dõi cursor position, toggle WS_EX_TRANSPARENT dựa trên cursor có nằm trong hitbox hay không.

#### **Frontend: Hitbox Calculator**

import * as THREE from 'three'; import { invoke } from '@tauri-apps/api/core'; export class HitboxCalculator { private lastSent: { x: number; y: number; w: number; h: number } | null = null; computeAndSend(vrm: VRM, camera: THREE.Camera, renderer: THREE.WebGLRenderer) { // 1. Tính bounding box 3D của VRM const box3 = new THREE.Box3().setFromObject(vrm.scene); // 2. Project 8 góc của box xuống screen space const corners = this.getBoxCorners(box3); const screenCorners = corners.map(c => this.projectToScreen(c, camera, renderer)); // 3. Tính bounding rect 2D const xs = screenCorners.map(c => c.x); const ys = screenCorners.map(c => c.y); const minX = Math.max(0, Math.min(...xs)); const minY = Math.max(0, Math.min(...ys)); const maxX = Math.min(window.innerWidth, Math.max(...xs)); const maxY = Math.min(window.innerHeight, Math.max(...ys)); // 4. Padding để click dễ hơn const padding = 10; const rect = { x: Math.floor(minX - padding), y: Math.floor(minY - padding), w: Math.ceil(maxX - minX + padding * 2), h: Math.ceil(maxY - minY + padding * 2) }; // 5. Chỉ gửi nếu thay đổi đáng kể if (this.shouldSend(rect)) { invoke('update_hitbox', rect); this.lastSent = rect; } } private projectToScreen(point: THREE.Vector3, camera: THREE.Camera, renderer: THREE.WebGLRenderer) { const v = point.clone().project(camera); const canvas = renderer.domElement; return { x: (v.x + 1) / 2 * canvas.clientWidth, y: (-v.y + 1) / 2 * canvas.clientHeight }; } private getBoxCorners(box: THREE.Box3): THREE.Vector3[] { const { min, max } = box; return [ new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z), new THREE.Vector3(min.x, max.y, min.z), new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z), new THREE.Vector3(min.x, max.y, max.z), new THREE.Vector3(max.x, max.y, max.z), ]; } private shouldSend(rect: any): boolean { if (!this.lastSent) return true; const dx = Math.abs(rect.x - this.lastSent.x); const dy = Math.abs(rect.y - this.lastSent.y); const dw = Math.abs(rect.w - this.lastSent.w); const dh = Math.abs(rect.h - this.lastSent.h); return dx > 5 || dy > 5 || dw > 5 || dh > 5; } }

Gọi trong render loop:

const hitboxCalc = new HitboxCalculator(); let lastHitboxUpdate = 0; function animate() { const now = performance.now(); // ... render code ... if (now - lastHitboxUpdate > 100) { // mỗi 100ms hitboxCalc.computeAndSend(vrm, camera, renderer); lastHitboxUpdate = now; } requestAnimationFrame(animate); }

Bao gồm cả Radial Menu và Bubble vào hitbox:

// Khi radial menu mở, expand hitbox function computeFullHitbox() { const characterRect = hitboxCalc.compute(vrm, camera, renderer); const menuRect = radialMenuOpen ? getMenuRect() : null; const bubbleRect = bubbleVisible ? getBubbleRect() : null; return unionRects([characterRect, menuRect, bubbleRect].filter(Boolean)); }

#### **Backend: Cursor Polling + Toggle**

use windows::Win32::UI::WindowsAndMessaging::*; use windows::Win32::Foundation::POINT; use std::sync::{Arc, Mutex}; use tokio::time::{interval, Duration}; #[derive(Clone, Default)] pub struct HitboxState { rect: Arc&lt;Mutex<Option<HitRect&gt;>>, currently*through: Arc&lt;Mutex<bool&gt;>, forced_interactive: Arc&lt;Mutex<bool&gt;>, // khi drag, radial mở } #[derive(Clone, Copy)] pub struct HitRect { pub x: i32, pub y: i32, pub w: i32, pub h: i32, } impl HitRect { pub fn contains(&self, px: i32, py: i32) -> bool { px >= self.x && px &lt;= self.x + self.w && py &gt;= self.y && py &lt;= self.y + self.h } } #[tauri::command] pub fn update_hitbox( state: tauri::State<HitboxState&gt;, x: i32, y: i32, w: i32, h: i32 ) { *state.rect.lock().unwrap() = Some(HitRect { x, y, w, h }); } #[tauri::command] pub fn force_interactive(state: tauri::State&lt;HitboxState&gt;, enabled: bool) { *state.forced_interactive.lock().unwrap() = enabled; } pub fn spawn_clickthrough_poller( hwnd_raw: isize, state: HitboxState ) { tokio::spawn(async move { let mut tick = interval(Duration::from_millis(16)); // ~60Hz let hwnd = HWND(hwnd_raw); loop { tick.tick().await; let forced = *state.forced_interactive.lock().unwrap(); let rect = *state.rect.lock().unwrap(); let should_be_through = if forced { false // luôn interactive } else if let Some(rect) = rect { let cursor = get_cursor_pos(); let window_pos = get_window_pos(hwnd); let local_x = cursor.x - window_pos.x; let local_y = cursor.y - window_pos.y; !rect.contains(local_x, local_y) } else { true // mặc định through nếu chưa có hitbox }; let mut current = state.currently_through.lock().unwrap(); if *current != should_be_through { set_window_click_through(hwnd, should_be_through); *current = should_be_through; } } }); } fn get_cursor_pos() -> POINT { unsafe { let mut p = POINT::default(); let *= GetCursorPos(&mut p); p } } fn get*window_pos(hwnd: HWND) -> POINT { unsafe { let mut rect = windows::Win32::Foundation::RECT::default(); let* = GetWindowRect(hwnd, &mut rect); POINT { x: rect.left, y: rect.top } } } fn set_window_click_through(hwnd: HWND, through: bool) { unsafe { let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE); let new_style = if through { ex_style | WS_EX_TRANSPARENT.0 as isize } else { ex_style & !(WS_EX_TRANSPARENT.0 as isize) }; SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style); } }

#### **Khởi tạo trong** [main.rs](http://main.rs)**:**

fn main() { tauri::Builder::default() .manage(HitboxState::default()) .setup(|app| { let window = app.get_webview_window("overlay").unwrap(); let hwnd = HWND(window.hwnd()?.0 as isize); // Setup window flags setup_overlay_window(hwnd); // Spawn poller let state = app.state::&lt;HitboxState&gt;().inner().clone(); spawn_clickthrough_poller(hwnd.0, state); Ok(()) }) .invoke_handler(tauri::generate_handler![ update_hitbox, force_interactive, // ... ]) .run(tauri::generate_context!()) .expect("error"); }

### **4.6. Edge cases**

#### **Khi user drag character:**

// On drag start await invoke('force_interactive', { enabled: true }); // On drag end await invoke('force_interactive', { enabled: false });

#### **Khi radial menu mở:**

- Hitbox phải bao gồm cả vùng menu
- Khi đóng menu, hitbox trở lại bình thường

#### **Khi bubble hiện:**

- Hitbox bao gồm vùng bubble + buttons
- Khi bubble ẩn, loại khỏi hitbox

#### **Multi-monitor:**

- get_cursor_pos trả về tọa độ ảo toàn cục
- get_window_pos cũng global
- Tính local_x/local_y luôn đúng

#### **High DPI:**

- Bật DPI awareness trong manifest:

&lt;dpiAwareness&gt;PerMonitorV2&lt;/dpiAwareness&gt;

- Three.js đã handle qua devicePixelRatio

### **4.7. Debug & verify**

Test cases:

- Mở overlay → kéo cửa sổ khác lên giữa màn hình → cursor ngoài character → click vào cửa sổ kia phải work
- Hover lên character → cursor sang interactive mode → click chạm character
- Drag character → input không bị mất giữa chừng
- Radial menu mở → click button menu work
- Multi-monitor: kéo character sang monitor khác → vẫn click-through đúng

## **5. KIẾN TRÚC TỔNG THỂ**

(sơ đồ layered: Presentation / Application Rust / Data / Platform)

Modules:

- Overlay Window (Three.js + VRM)
- Settings Window
- Behavior Orchestrator (ModeManager, ProactivityController, EventScheduler, AnimationDirector)
- Desktop Awareness (process watcher, window detector, idle detector, classifier)
- AI Orchestrator (prompt builder, HTTP client, validator, cache, cost tracker)
- Asset Manager (model registry, animation registry, validator)
- State Manager
- Memory Manager
- Privacy Manager (permission, sanitizer, private mode)
- Platform Layer (Windows: window, process, taskbar, hotkey, autostart)

## **6. MODULE CHI TIẾT**

### **6.1. Overlay Renderer**

Three.js scene setup, VRM loader, animation controller, procedural anims, look-at, hitbox calculator, NPR material.

### **6.2. Behavior Orchestrator**

ModeManager state machine, ProactivityController với score function, EventScheduler tokio tasks, AnimationDirector emitting commands.

### **6.3. Desktop Awareness**

Foreground window polling 500ms, idle polling 1s, app category mapping JSON, context classifier với confidence.

### **6.4. AI Orchestrator**

OpenAI-compatible client, prompt builder layered (system/behavior/state/memory/context/user), JSON schema response, validator chain, LRU cache, daily cost tracker với hard limit.

### **6.5. Asset Manager**

Model registry SQLite, animation registry SQLite, validation (size, format, polygon count), hot reload event-driven.

### **6.6. Privacy Manager**

Granular permissions, context sanitizer (strip raw process/title), private mode (stop trackers + AI), encrypted API key store.

## **7. DATA MODEL**

SQLite tables:

- companion_state (single row state)
- memories (long-term)
- activity_sessions (aggregated)
- event_log
- model_registry
- animation_registry
- user_rules
- character_identity

JSON files:

- settings.json
- app_categories.json
- response_templates.json

Encrypted:

- secrets.enc (API key)

## **8. IPC CONTRACT**

Commands (FE→Rust):

- Asset: loadModel, listModels, importModel, deleteModel, setActiveModel, importAnimation, listAnimations
- Window: setClickThrough, updateHitbox, forceInteractive, anchorTo, setOverlaySize
- Interaction: sendChatMessage, triggerRadialAction
- Mode: setMode, togglePrivateMode, toggleQuietMode
- State: getState, getMemories, deleteMemory, exportData, deleteAllData
- Settings: getSettings, updateSettings, testAIConnection

Events (Rust→FE):

- animation_command (PlayClip, SetExpression, SetProcedural, LookAt, SetAnchor, ApplyPose)
- show_bubble, hide_bubble
- mode_changed, context_updated
- companion_response
- state_updated
- model_imported
- error

## **9. LỘ TRÌNH TRIỂN KHAI**

Phase 1 (Foundation 3-4 tuần): Tauri overlay, transparent + click-through dynamic, VRM render, idle procedural, drag, radial menu cơ bản, hotkey.

Phase 2 (Context 2-3 tuần): Foreground window, app classification, mode state machine, animation triggered by mode.

Phase 3 (AI 2-3 tuần): OpenAI client, settings, prompt builder, validator, Talk action, bubble.

Phase 4 (Memory & Proactivity 2 tuần): SQLite memory, retrieval, proactivity controller, event scheduler, daily check-in.

Phase 5 (Privacy & Settings 2 tuần): Full settings window, privacy mode, encrypted store, hotkeys.

Phase 6 (Polish, optional): Custom NPR shader, model import UI, animation import, multi-monitor, perf.

## **10. CHECKLIST HOÀN THIỆN 3 VẤN ĐỀ HIỆN TẠI**

### **Vấn đề 1: Nghiệp vụ nhân vật**

- [ ] Implement Character Identity schema (static + dynamic)
- [ ] Implement Mood/Energy/Affinity state với decay
- [ ] Implement Memory CRUD + retrieval
- [ ] Implement Proactivity scoring + budget
- [ ] Implement Relationship stages
- [ ] Implement Time-based + context-based behavior profiles

### **Vấn đề 2: Click-through hoàn chỉnh**

- [ ] Window flags WS_EX_LAYERED + WS_EX_TOOLWINDOW + WS_EX_NOACTIVATE
- [ ] WebView transparent: true + CSS background transparent
- [ ] Three.js alpha: true + premultipliedAlpha: false + clearColor alpha 0
- [ ] HitboxCalculator frontend (compute & send 100ms)
- [ ] Click-through poller backend (cursor check 16ms)
- [ ] Force interactive mode khi drag/menu/bubble
- [ ] Include radial menu + bubble vào hitbox khi mở
- [ ] Test multi-monitor + high DPI

### **Vấn đề 3: Action & Animation**

- [ ] Define 15-20 animation clips VRMA cần thiết
- [ ] Implement AnimationController với 4-layer blending
- [ ] Implement 5 procedural animations (breathe, blink, sway, look-at, float)
- [ ] Implement Action definition schema
- [ ] Implement Action library (20+ built-in actions)
- [ ] Implement Animation Director orchestrator
- [ ] Implement Anchor system (7 anchor types + transition)
- [ ] Implement Expression system (mood-driven + action override)
- [ ] Trigger actions từ: click, drag, scheduled, context_change, AI suggestion