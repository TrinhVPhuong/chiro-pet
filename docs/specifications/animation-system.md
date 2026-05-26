# Chiro-Pet Animation Runtime System

&gt; Tài liệu thiết kế chính thức cho hệ thống Animation Runtime của Chiro-Pet — desktop companion app sử dụng VRM avatar.
&gt;
&gt; Tài liệu này là **single source of truth** cho mọi AI agent / developer khi triển khai hoặc mở rộng phần animation. Mọi quyết định kỹ thuật phải tuân thủ nguyên tắc và contract định nghĩa ở đây.

---

## Mục lục

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Kiến trúc tổng thể](#3-kiến-trúc-tổng-thể)
4. [Animation State Model](#4-animation-state-model)
5. [Animation Manifest](#5-animation-manifest)
6. [Animation Command Contract](#6-animation-command-contract)
7. [Priority & Interrupt Policy](#7-priority--interrupt-policy)
8. [Context ID & Concurrency](#8-context-id--concurrency)
9. [Intro / Loop / Outro Sectioning](#9-intro--loop--outro-sectioning)
10. [Layering System](#10-layering-system)
11. [Backend: AnimationDirector (Rust)](#11-backend-animationdirector-rust)
12. [Frontend: AnimationController (TypeScript)](#12-frontend-animationcontroller-typescript)
13. [IPC Contract](#13-ipc-contract)
14. [AI Integration](#14-ai-integration)
15. [Talking Duration Estimation](#15-talking-duration-estimation)
16. [Fallback & Recovery](#16-fallback--recovery)
17. [Format & Asset Pipeline](#17-format--asset-pipeline)
18. [File Structure](#18-file-structure)
19. [Implementation Checklist](#19-implementation-checklist)
20. [Glossary](#20-glossary)

---

## 1. Mục tiêu & Phạm vi

### 1.1. Mục tiêu

Hệ thống Animation Runtime của **Chiro-Pet** phải:

- Biến VRM model thành một **companion sống động**, không chỉ là model tĩnh.
- Phản ánh **trạng thái nội tại** của nhân vật (mood, energy, activity).
- Đồng bộ với **vòng đời AI** (idle → thinking → talking → idle).
- Phản hồi với **tương tác người dùng** (drag, click, hover, menu).
- Phản ánh **ngữ cảnh desktop** (focus, gaming, meeting, private).
- Chạy mượt với chi phí CPU/GPU thấp trên overlay window.
- Cho phép **hot-swap** model và animation mà không cần rebuild.

### 1.2. Phạm vi

Tài liệu này bao quát:

- Thiết kế state machine animation.
- Contract giữa backend (Rust) và frontend (TypeScript + Three.js).
- Cách AI tương tác với animation system.
- Cấu trúc manifest và asset.
- Pipeline import và convert animation.

Tài liệu này **KHÔNG bao quát**:

- Custom shader (xem `docs/shader-system.md`).
- AI orchestration tổng thể (xem `docs/ai-system.md`).
- Memory & state persistence (xem `docs/state-system.md`).

---

## 2. Nguyên tắc thiết kế

### 2.1. Bảy nguyên tắc bất biến

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Backend là source of truth** | Mọi quyết định animation state đều ở Rust. Frontend chỉ thực thi command. |
| **2** | **AI chỉ đề xuất, không quyết định** | AI gửi `suggested_animation` / `suggested_expression`. AnimationDirector quyết định cuối cùng. |
| **3** | **Mọi animation đều có fallback** | Không animation nào được phép kết thúc ở trạng thái treo. Luôn có đường về `idle`. |
| **4** | **Priority + Context, không phải FIFO** | Animation mới chỉ override nếu thỏa interrupt policy. Tránh giẫm đè vô tổ chức. |
| **5** | **Layered, không monolithic** | Base idle + action clip + procedural overlay + expression chạy song song, blend với nhau. |
| **6** | **VRMA là runtime format chính** | Mọi format khác (FBX, BVH, VMD, glTF) đều convert offline sang VRMA. |
| **7** | **Declarative qua manifest** | Animation được khai báo trong JSON manifest, không hardcode trong code. |

### 2.2. Anti-patterns cần tránh

- ❌ Frontend tự quyết định animation dựa trên trạng thái nội bộ.
- ❌ AI trực tiếp gọi `playClip()` không qua AnimationDirector.
- ❌ Hardcode animation file path trong component.
- ❌ Animation không có duration limit (trừ idle loop chính).
- ❌ Chạy nhiều action clip cùng layer mà không blend.
- ❌ Convert FBX/BVH runtime trong app.
- ❌ Bỏ qua interrupt policy để "force" animation.

---

## 3. Kiến trúc tổng thể

### 3.1. Sơ đồ kiến trúc

```text
┌──────────────────────────────────────────────────────────────┐
│                    AI ORCHESTRATOR (Rust)                     │
│  - Sinh response                                              │
│  - Đề xuất: suggested_animation, suggested_expression         │
│  - KHÔNG quyết định animation cuối cùng                       │
└──────────────────────┬───────────────────────────────────────┘
                       │ suggest
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              BEHAVIOR ORCHESTRATOR (Rust)                     │
│  ┌────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ ModeManager    │  │ ProactivityCtrl │  │ EventScheduler│  │
│  └────────┬───────┘  └────────┬────────┘  └───────┬───────┘  │
│           │                   │                    │           │
│           └───────────────────┼────────────────────┘           │
│                               ▼                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │           ANIMATION DIRECTOR (Rust)                   │    │
│  │  - Nhận đề xuất từ AI, Mode, User, Scheduler          │    │
│  │  - Áp dụng priority + interrupt policy                │    │
│  │  - Quản lý context active                             │    │
│  │  - Emit AnimationCommand qua IPC                      │    │
│  │  - Quản lý fallback                                   │    │
│  └──────────────────────┬───────────────────────────────┘    │
└─────────────────────────┼─────────────────────────────────────┘
                          │ emit "animation_command"
                          ▼
┌──────────────────────────────────────────────────────────────┐
│           ANIMATION CONTROLLER (TypeScript)                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Layer 4: Expression (blendshape)                      │  │
│  │  Layer 3: Procedural (breathing, blink, look-at, sway) │  │
│  │  Layer 2: Action Clip (wave, sit, jump...)             │  │
│  │  Layer 1: Base Idle Loop                               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                                │
│  - THREE.AnimationMixer                                       │
│  - Crossfade blending                                         │
│  - Section playback (intro/loop/outro)                        │
│  - Procedural runtime                                         │
│  - VRM spring bones (auto)                                    │
└──────────────────────┬───────────────────────────────────────┘
                       │ renders
                       ▼
              VRM Model on Overlay Window
```

### 3.2. Flow điển hình

**Ví dụ: User chat với companion**

```text
1. User mở chat, gõ tin nhắn
   → Frontend invoke `send_chat_message(text)`

2. Rust AI Orchestrator nhận
   → AnimationDirector.play(thinking_command)
   → emit "animation_command" { state: "thinking", contextId: "ai_session_42" }
   → Frontend: crossfade vào thinking animation

3. AI sinh xong response
   → AI Orchestrator có suggested_animation: "talking_happy"
   → AnimationDirector.stop_context("ai_session_42_thinking")
   → AnimationDirector.play(talking_command)
   → emit "animation_command" { state: "talking", duration: estimateDuration(text) }
   → Frontend: crossfade vào talking, tự fallback sau duration

4. Talking xong
   → AnimationDirector.play(idle_command)
   → emit "animation_command" { state: "idle" }
   → Frontend: crossfade về idle
```

---

## 4. Animation State Model

### 4.1. Logical state enum

Animation state là **trừu tượng**, không gắn với file cụ thể. AnimationDirector resolve state → animation_id thông qua manifest.

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimationState {
    // Base states
    Idle,

    // AI lifecycle
    Listening,
    Thinking,
    Talking,

    // Emotional reactions
    Happy,
    Shy,
    Sad,
    Annoyed,
    Surprised,
    Proud,
    Sleepy,

    // Desktop mode reflections
    Focus,
    Gaming,
    Meeting,
    Private,

    // User interaction
    Dragging,
    MenuOpen,
    Petted,

    // Generic one-shot
    OneShotAction,
}
```

### 4.2. State category

| **Category** | **States** | **Đặc tính** |
|---|---|---|
| **Base** | Idle | Luôn loop, lowest priority |
| **AI lifecycle** | Listening, Thinking, Talking | Context-bound, có duration ước lượng |
| **Emotional** | Happy, Shy, Sad, Annoyed, Surprised, Proud, Sleepy | Thường one-shot hoặc short loop |
| **Mode** | Focus, Gaming, Meeting, Private | Long-loop, gắn với ModeManager |
| **Interaction** | Dragging, MenuOpen, Petted | High priority, gắn user input |
| **Generic** | OneShotAction | Wildcard cho animation đặc biệt |

### 4.3. State transition rules

```text
Idle ↔ bất kỳ state nào (tự do)

Thinking → Talking         : Cho phép (AI lifecycle)
Thinking → Idle            : Cho phép (AI fail / cancel)
Talking → Idle             : Bắt buộc khi hết duration
Talking → Thinking         : KHÔNG cho phép (phải về Idle trước)

Dragging → bất kỳ          : Chỉ khi user thả chuột
MenuOpen → bất kỳ          : Chỉ khi menu đóng
Private → bất kỳ           : Chỉ khi user toggle off

Mode states (Focus/Gaming/Meeting):
- Chỉ chuyển khi ModeManager báo
- Có thể bị interrupt tạm thời bởi Talking/Thinking
- Sau interrupt phải quay về mode state
```

---

## 5. Animation Manifest

### 5.1. Format manifest

File: `assets/animations/manifest.json`

```json
{
  "version": "1.0",
  "default_idle": "idle_normal",
  "default_crossfade_ms": 300,
  "animations": [
    {
      "id": "idle_normal",
      "file": "idle/idle_normal.vrma",
      "type": "loop",
      "state": "idle",
      "priority": 10,
      "interruptible": true,
      "crossfade_ms": 500,
      "tags": ["idle", "default", "base"]
    },
    {
      "id": "idle_breathing",
      "file": "idle/idle_breathing.vrma",
      "type": "loop",
      "state": "idle",
      "priority": 10,
      "interruptible": true,
      "crossfade_ms": 500,
      "tags": ["idle", "subtle"]
    },
    {
      "id": "thinking_standard",
      "file": "ai/thinking_standard.vrma",
      "type": "sectioned",
      "state": "thinking",
      "priority": 50,
      "interruptible": true,
      "crossfade_ms": 300,
      "sections": {
        "intro": { "start": 0.0, "end": 0.6 },
        "loop":  { "start": 0.6, "end": 2.8 },
        "outro": { "start": 2.8, "end": 3.4 }
      },
      "fallback": "idle_normal",
      "tags": ["ai", "thinking"]
    },
    {
      "id": "talking_neutral",
      "file": "ai/talking_neutral.vrma",
      "type": "sectioned",
      "state": "talking",
      "priority": 60,
      "interruptible": true,
      "crossfade_ms": 200,
      "sections": {
        "intro": { "start": 0.0, "end": 0.3 },
        "loop":  { "start": 0.3, "end": 1.6 },
        "outro": { "start": 1.6, "end": 2.0 }
      },
      "fallback": "idle_normal",
      "tags": ["ai", "talking"]
    },
    {
      "id": "talking_happy",
      "file": "ai/talking_happy.vrma",
      "type": "sectioned",
      "state": "talking",
      "priority": 60,
      "interruptible": true,
      "crossfade_ms": 200,
      "sections": {
        "intro": { "start": 0.0, "end": 0.3 },
        "loop":  { "start": 0.3, "end": 1.8 },
        "outro": { "start": 1.8, "end": 2.2 }
      },
      "fallback": "idle_normal",
      "tags": ["ai", "talking", "happy"]
    },
    {
      "id": "wave",
      "file": "interaction/wave.vrma",
      "type": "one_shot",
      "state": "one_shot_action",
      "priority": 70,
      "interruptible": false,
      "crossfade_ms": 250,
      "fallback": "previous",
      "tags": ["interaction", "greeting"]
    },
    {
      "id": "surprised",
      "file": "emotion/surprised.vrma",
      "type": "one_shot",
      "state": "surprised",
      "priority": 75,
      "interruptible": false,
      "crossfade_ms": 150,
      "fallback": "idle_normal",
      "tags": ["emotion", "reaction"]
    },
    {
      "id": "sit_taskbar",
      "file": "context/sit_taskbar.vrma",
      "type": "sectioned",
      "state": "focus",
      "priority": 40,
      "interruptible": true,
      "crossfade_ms": 600,
      "sections": {
        "intro": { "start": 0.0, "end": 1.2 },
        "loop":  { "start": 1.2, "end": 5.5 },
        "outro": { "start": 5.5, "end": 6.5 }
      },
      "fallback": "idle_normal",
      "tags": ["context", "focus", "taskbar"]
    },
    {
      "id": "dragging",
      "file": "interaction/dragging.vrma",
      "type": "loop",
      "state": "dragging",
      "priority": 95,
      "interruptible": false,
      "crossfade_ms": 100,
      "fallback": "idle_normal",
      "tags": ["interaction", "drag"]
    }
  ]
}
```

### 5.2. Field reference

| **Field** | **Type** | **Required** | **Mô tả** |
|---|---|---|---|
| **id** | `string` | ✓ | Unique identifier. Dùng để reference từ command. |
| **file** | `string` | ✓ | Đường dẫn relative tới file VRMA. |
| **type** | `"loop" \| "one_shot" \| "sectioned"` | ✓ | Loại animation. |
| **state** | `AnimationState` | ✓ | Logical state mà animation này thuộc về. |
| **priority** | `0-100` | ✓ | Priority cho interrupt logic. |
| **interruptible** | `bool` | ✓ | Có thể bị animation khác override không. |
| **crossfade_ms** | `number` | ✗ | Thời gian crossfade. Default từ manifest. |
| **sections** | `object` | Chỉ với `sectioned` | Định nghĩa intro/loop/outro. |
| **fallback** | `"idle" \| "previous" \| string \| null` | ✗ | Animation chạy sau khi kết thúc. |
| **tags** | `string[]` | ✗ | Metadata để search/filter. |

### 5.3. Resolution logic

Khi AnimationDirector nhận state `Talking` với mood `happy`:

```text
1. Filter animations: state == Talking
2. Filter thêm theo tags từ AI suggestion (nếu có): tags contains "happy"
3. Nếu có nhiều match: chọn random hoặc theo last-used (anti-repeat)
4. Nếu không có match: fallback về animation đầu tiên match state
5. Nếu vẫn không có: error log + chạy default_idle
```

---

## 6. Animation Command Contract

### 6.1. TypeScript type

```typescript
export type AnimationSource =
  | "ai"
  | "user"
  | "mode"
  | "scheduler"
  | "system";

export type FallbackMode =
  | "idle"
  | "previous"
  | "none";

export type InterruptPolicy =
  | "allow_higher"
  | "allow_equal_or_higher"
  | "same_context_only"
  | "deny";

export interface AnimationCommand {
  // Identity
  command_id: string;              // UUID
  source: AnimationSource;
  timestamp_ms: number;

  // Target
  state: AnimationState;
  animation_id?: string;           // Nếu null, resolve từ state
  expression?: string;             // Blendshape name

  // Playback
  loop?: boolean;
  play_once?: boolean;
  crossfade_ms?: number;
  duration_ms?: number;            // Tự fallback sau duration

  // Control
  priority: number;                // 0-100
  context_id?: string;             // Cho concurrency
  interrupt_policy?: InterruptPolicy;
  fallback?: FallbackMode;

  // Section override (tùy chọn)
  section?: "intro" | "loop" | "outro" | "full";
}
```

### 6.2. Rust type

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimationSource {
    Ai,
    User,
    Mode,
    Scheduler,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FallbackMode {
    Idle,
    Previous,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterruptPolicy {
    AllowHigher,
    AllowEqualOrHigher,
    SameContextOnly,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationCommand {
    pub command_id: String,
    pub source: AnimationSource,
    pub timestamp_ms: u64,

    pub state: AnimationState,
    pub animation_id: Option<string>,
    pub expression: Option<string>,

    pub loop_anim: Option<bool>,
    pub play_once: Option<bool>,
    pub crossfade_ms: Option<u32>,
    pub duration_ms: Option<u32>,

    pub priority: u8,
    pub context_id: Option<string>,
    pub interrupt_policy: Option<interruptpolicy>,
    pub fallback: Option<fallbackmode>,

    pub section: Option<animationsection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimationSection {
    Intro,
    Loop,
    Outro,
    Full,
}
```

### 6.3. Builder helpers

```rust
impl AnimationCommand {
    pub fn idle() -&gt; Self {
        Self {
            command_id: Uuid::new_v4().to_string(),
            source: AnimationSource::System,
            timestamp_ms: now_ms(),
            state: AnimationState::Idle,
            animation_id: None,
            expression: None,
            loop_anim: Some(true),
            play_once: None,
            crossfade_ms: Some(500),
            duration_ms: None,
            priority: 10,
            context_id: None,
            interrupt_policy: Some(InterruptPolicy::AllowHigher),
            fallback: Some(FallbackMode::None),
            section: None,
        }
    }

    pub fn thinking(context_id: String) -&gt; Self { /* ... */ }
    pub fn talking(text: &str, mood: Mood) -&gt; Self { /* ... */ }
    pub fn drag_start() -&gt; Self { /* ... */ }
    pub fn one_shot(animation_id: &str) -&gt; Self { /* ... */ }
}
```

---

## 7. Priority & Interrupt Policy

### 7.1. Priority scale

```text
100 ─┬─ Critical / System override
     │
 95  ├─ Dragging (user holding)
 90  ├─ Private mode lock
 85  ├─ Menu interaction
 80  ├─ Direct user action (click button)
 75  ├─ Emotional reaction (surprised, hurt)
 70  ├─ One-shot interaction (wave, nod)
 65  │
 60  ├─ Talking (AI response)
 55  │
 50  ├─ Thinking (AI processing)
 45  │
 40  ├─ Mode-driven state (Focus, Gaming, Meeting)
 35  │
 30  ├─ Scheduled ambient (random idle action)
 25  │
 20  │
 15  │
 10  ├─ Base idle
  5  │
  0  └─ No animation (transitional)
```

### 7.2. Interrupt logic

```rust
pub fn can_interrupt(current: &ActiveAnimation, next: &AnimationCommand) -&gt; bool {
    // 1. Cùng context → luôn cho phép (replace trong context)
    if let Some(next_ctx) = &next.context_id {
        if current.context_id.as_ref() == Some(next_ctx) {
            return true;
        }
    }

    // 2. Current không interruptible → deny (trừ override hệ thống)
    if !current.interruptible && next.source != AnimationSource::System {
        return false;
    }

    // 3. Áp dụng interrupt policy
    match next.interrupt_policy.unwrap_or(InterruptPolicy::AllowHigher) {
        InterruptPolicy::Deny =&gt; false,
        InterruptPolicy::SameContextOnly =&gt; false, // đã check ở (1)
        InterruptPolicy::AllowHigher =&gt; next.priority &gt; current.priority,
        InterruptPolicy::AllowEqualOrHigher =&gt; next.priority &gt;= current.priority,
    }
}
```

### 7.3. Ví dụ thực tế

| **Tình huống** | **Current** | **Next** | **Kết quả** |
|---|---|---|---|
| Idle → AI thinking | Idle (10) | Thinking (50) | ✓ Accept |
| Thinking → Talking (cùng context) | Thinking (50, ctx=A) | Talking (60, ctx=A) | ✓ Accept |
| Talking → User drag | Talking (60) | Dragging (95) | ✓ Accept |
| Dragging → AI thinking | Dragging (95, non-interruptible) | Thinking (50) | ✗ Deny |
| Focus mode → Talking | Focus (40) | Talking (60) | ✓ Accept, ghi nhớ Focus để recover |
| Talking → Focus mode | Talking (60) | Focus (40) | ✗ Deny, đợi Talking xong |

---

## 8. Context ID & Concurrency

### 8.1. Vai trò context_id

Context_id giải quyết bài toán: **nhiều nguồn cùng yêu cầu animation, làm sao quản lý lifecycle?**

```text
Ví dụ AI session:
1. AI bắt đầu xử lý
   → play(thinking, context_id="ai_session_42")
   → AnimationDirector mark ai_session_42 active

2. AI trả lời xong
   → play(talking, context_id="ai_session_42")
   → AnimationDirector replace trong context (cùng id)

3. Talking xong
   → stop_context("ai_session_42")
   → Nếu không còn context nào active → idle
   → Nếu còn mode_focus context → recover về Focus
```

### 8.2. Context registry

```rust
pub struct ContextRegistry {
    active: HashMap<string, activecontext="">,
}

pub struct ActiveContext {
    pub context_id: String,
    pub source: AnimationSource,
    pub current_command: AnimationCommand,
    pub started_at: Instant,
    pub priority: u8,
}

impl ContextRegistry {
    pub fn upsert(&mut self, cmd: &AnimationCommand) {
        if let Some(ctx_id) = &cmd.context_id {
            self.active.insert(ctx_id.clone(), ActiveContext::from(cmd));
        }
    }

    pub fn remove(&mut self, ctx_id: &str) -&gt; Option<activecontext> {
        self.active.remove(ctx_id)
    }

    pub fn highest_priority(&self) -&gt; Option&lt;&ActiveContext&gt; {
        self.active.values().max_by_key(|c| c.priority)
    }

    pub fn is_empty(&self) -&gt; bool {
        self.active.is_empty()
    }
}
```

### 8.3. Recovery flow

```text
stop_context("ai_session_42")
  ↓
ContextRegistry.remove("ai_session_42")
  ↓
Nếu registry empty:
  → play(idle_command)
Ngược lại:
  → highest = registry.highest_priority()
  → play(command tương ứng với highest context)
```

---

## 9. Intro / Loop / Outro Sectioning

### 9.1. Lý do cần sectioning

Một số animation có **thời lượng không xác định trước**:

- **Thinking**: Không biết AI mất bao lâu.
- **Talking**: Phụ thuộc độ dài text.
- **Sleeping**: Có thể ngủ rất lâu.
- **Sit taskbar**: Ngồi cho đến khi mode thay đổi.

Giải pháp: chia animation thành 3 phần.

```text
[ Intro ] → [ Loop (repeat N lần) ] → [ Outro ]
   0.6s         2.2s × N                 0.6s
```

### 9.2. Playback logic

```typescript
class SectionedPlayback {
  private clip: THREE.AnimationClip;
  private action: THREE.AnimationAction;
  private sections: AnimationSections;
  private phase: "intro" | "loop" | "outro" | "done" = "intro";

  start() {
    this.phase = "intro";
    this.action.time = this.sections.intro.start;
    this.action.play();
    this.scheduleNext(this.sections.intro.end);
  }

  private scheduleNext(targetTime: number) {
    const remaining = targetTime - this.action.time;
    setTimeout(() =&gt; this.advance(), remaining * 1000);
  }

  private advance() {
    if (this.phase === "intro") {
      this.phase = "loop";
      this.action.time = this.sections.loop.start;
      this.scheduleLoop();
    } else if (this.phase === "loop") {
      // Tiếp tục loop hoặc transition sang outro
      if (this.shouldExit) {
        this.phase = "outro";
        this.action.time = this.sections.outro.start;
        this.scheduleNext(this.sections.outro.end);
      } else {
        this.action.time = this.sections.loop.start; // restart loop
        this.scheduleLoop();
      }
    } else if (this.phase === "outro") {
      this.phase = "done";
      this.onComplete?.();
    }
  }

  requestExit() {
    this.shouldExit = true;
  }
}
```

### 9.3. Exit triggers

| **Trigger** | **Hành động** |
|---|---|
| `duration_ms` đạt | `requestExit()` → vào outro |
| `stop_context()` được gọi | `requestExit()` → vào outro |
| Higher priority interrupt | Skip outro, crossfade trực tiếp |
| Manual `stop()` | Skip outro |

---

## 10. Layering System

### 10.1. Bốn layer cùng lúc

```text
┌──────────────────────────────────────────────────────┐
│ Layer 4: EXPRESSION                                   │
│   - VRM blendshape (smile, blink, pout, surprised)   │
│   - Weight 0.0 - 1.0                                  │
│   - Tween khi thay đổi                                │
│   - Trigger: AI suggested_expression, mood change     │
├──────────────────────────────────────────────────────┤
│ Layer 3: PROCEDURAL OVERLAY                           │
│   - Breathing (sin wave trên spine)                   │
│   - Auto-blink (random 3-6s)                          │
│   - Look-at (head + eye tracking cursor)              │
│   - Subtle sway (shoulder, hair via spring bones)     │
│   - Always-on, low intensity                          │
├──────────────────────────────────────────────────────┤
│ Layer 2: ACTION CLIP                                  │
│   - One-shot: wave, nod, point, jump                  │
│   - Sectioned: thinking, talking, sit                 │
│   - Crossfade với Layer 1                             │
│   - Có thể stack 1 clip duy nhất                      │
├──────────────────────────────────────────────────────┤
│ Layer 1: BASE IDLE                                    │
│   - Always loop                                       │
│   - Lowest priority                                   │
│   - Fallback cuối cùng                                │
└──────────────────────────────────────────────────────┘
```

### 10.2. Blend rules

| **Combination** | **Strategy** |
|---|---|
| **Layer 1 + Layer 2** | Crossfade, Layer 2 dần weight 1.0, Layer 1 về 0.0 |
| **Layer 2 + Layer 3** | Additive, procedural có intensity giảm khi Layer 2 active |
| **Layer 4** | Standalone, không xung đột bone (chỉ blendshape) |

### 10.3. Procedural intensity scaling

```typescript
function computeProceduralIntensity(actionWeight: number): number {
  // Khi action clip mạnh, giảm procedural để tránh "rung lắc"
  if (actionWeight &gt; 0.7) return 0.2;
  if (actionWeight &gt; 0.3) return 0.5;
  return 1.0; // full intensity khi chỉ có idle
}
```

---

## 11. Backend: AnimationDirector (Rust)

### 11.1. Cấu trúc

```rust
// src-tauri/src/core/behavior/animation_director.rs

use tauri::{AppHandle, Emitter};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AnimationDirector {
    manifest: Arc<animationmanifest>,
    current: Mutex<option<activeanimation>&gt;,
    context_registry: Mutex<contextregistry>,
    history: Mutex<ringbuffer<animationevent>&gt;,
}

pub struct ActiveAnimation {
    pub command: AnimationCommand,
    pub started_at: Instant,
    pub fallback_timer: Option<joinhandle<()>&gt;,
}

impl AnimationDirector {
    pub fn new(manifest: AnimationManifest) -&gt; Self {
        Self {
            manifest: Arc::new(manifest),
            current: Mutex::new(None),
            context_registry: Mutex::new(ContextRegistry::new()),
            history: Mutex::new(RingBuffer::new(100)),
        }
    }

    pub async fn play(&self, app: &AppHandle, cmd: AnimationCommand) -&gt; Result<playresult> {
        let mut current = self.current.lock().await;

        // 1. Validate manifest
        let resolved_id = self.resolve_animation_id(&cmd)?;

        // 2. Check interrupt
        if let Some(active) = current.as_ref() {
            if !self.can_interrupt(active, &cmd) {
                self.log_event(AnimationEvent::Rejected(cmd.clone())).await;
                return Ok(PlayResult::Rejected);
            }

            // Cancel fallback timer cũ
            if let Some(handle) = active.fallback_timer.take() {
                handle.abort();
            }
        }

        // 3. Update context registry
        let mut registry = self.context_registry.lock().await;
        registry.upsert(&cmd);
        drop(registry);

        // 4. Emit command
        let mut final_cmd = cmd.clone();
        final_cmd.animation_id = Some(resolved_id);

        app.emit("animation_command", &final_cmd)
            .map_err(|e| AnimationError::EmitFailed(e.to_string()))?;

        // 5. Schedule fallback nếu có duration_ms
        let fallback_timer = if let Some(duration) = cmd.duration_ms {
            let app_clone = app.clone();
            let ctx_id = cmd.context_id.clone();
            Some(tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(duration as u64)).await;
                // Tự stop context khi hết duration
                if let Some(id) = ctx_id {
                    let _ = app_clone.emit("animation_context_expired", id);
                }
            }))
        } else {
            None
        };

        *current = Some(ActiveAnimation {
            command: final_cmd.clone(),
            started_at: Instant::now(),
            fallback_timer,
        });

        self.log_event(AnimationEvent::Played(final_cmd)).await;

        Ok(PlayResult::Accepted)
    }

    pub async fn stop_context(&self, app: &AppHandle, context_id: &str) -&gt; Result&lt;()&gt; {
        let mut registry = self.context_registry.lock().await;
        registry.remove(context_id);

        // Quyết định animation tiếp theo
        let next_cmd = if let Some(highest) = registry.highest_priority() {
            highest.current_command.clone()
        } else {
            AnimationCommand::idle()
        };
        drop(registry);

        self.play(app, next_cmd).await?;
        Ok(())
    }

    pub async fn force_idle(&self, app: &AppHandle) -&gt; Result&lt;()&gt; {
        let mut registry = self.context_registry.lock().await;
        registry.clear();
        drop(registry);

        self.play(app, AnimationCommand::idle()).await?;
        Ok(())
    }

    fn resolve_animation_id(&self, cmd: &AnimationCommand) -&gt; Result<string> {
        // Nếu có animation_id explicit
        if let Some(id) = &cmd.animation_id {
            if self.manifest.has(id) {
                return Ok(id.clone());
            }
            return Err(AnimationError::AnimationNotFound(id.clone()));
        }

        // Resolve từ state
        let candidates = self.manifest.find_by_state(&cmd.state);
        if candidates.is_empty() {
            return Err(AnimationError::NoAnimationForState(cmd.state.clone()));
        }

        // Pick (anti-repeat logic ở đây)
        Ok(candidates[0].id.clone())
    }

    fn can_interrupt(&self, current: &ActiveAnimation, next: &AnimationCommand) -&gt; bool {
        // Logic ở section 7.2
        // ...
    }
}
```

### 11.2. Public API (Tauri commands)

```rust
#[tauri::command]
pub async fn anim_play(
    cmd: AnimationCommand,
    director: tauri::State&lt;'_, AnimationDirector&gt;,
    app: tauri::AppHandle,
) -&gt; Result<playresult, string=""> {
    director.play(&app, cmd).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn anim_stop_context(
    context_id: String,
    director: tauri::State&lt;'_, AnimationDirector&gt;,
    app: tauri::AppHandle,
) -&gt; Result&lt;(), String&gt; {
    director.stop_context(&app, &context_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn anim_force_idle(
    director: tauri::State&lt;'_, AnimationDirector&gt;,
    app: tauri::AppHandle,
) -&gt; Result&lt;(), String&gt; {
    director.force_idle(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn anim_list_available(
    director: tauri::State&lt;'_, AnimationDirector&gt;,
) -&gt; Result<vec<animationmanifestentry>, String&gt; {
    Ok(director.manifest.list_all())
}
```

---

## 12. Frontend: AnimationController (TypeScript)

### 12.1. Cấu trúc

```typescript
// src/overlay/three/AnimationController.ts

import * as THREE from "three";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { listen } from "@tauri-apps/api/event";

export class AnimationController {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;
  private clips = new Map<string, three.animationclip="">();
  private actions = new Map<string, three.animationaction="">();

  private currentAction?: THREE.AnimationAction;
  private currentAnimationId?: string;
  private currentSection?: SectionedPlayback;

  private proceduralIntensity = 1.0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    this.bindIPC();
  }

  async loadFromManifest(manifest: AnimationManifest) {
    for (const entry of manifest.animations) {
      const clip = await this.loadVRMAClip(entry.file);
      this.clips.set(entry.id, clip);
      const action = this.mixer.clipAction(clip);
      this.actions.set(entry.id, action);
    }
  }

  private bindIPC() {
    listen<animationcommand>("animation_command", (event) =&gt; {
      this.execute(event.payload);
    });

    listen<string>("animation_context_expired", (event) =&gt; {
      // Trigger outro nếu đang trong sectioned
      if (this.currentSection) {
        this.currentSection.requestExit();
      }
    });
  }

  execute(cmd: AnimationCommand) {
    const animationId = cmd.animation_id;
    if (!animationId) {
      console.error("AnimationCommand thiếu animation_id (chưa resolve)");
      return;
    }

    const action = this.actions.get(animationId);
    if (!action) {
      console.error(`Animation không tồn tại: ${animationId}`);
      return;
    }

    const manifestEntry = this.getManifestEntry(animationId);
    if (!manifestEntry) return;

    // 1. Stop section playback cũ nếu có
    if (this.currentSection) {
      this.currentSection.dispose();
      this.currentSection = undefined;
    }

    // 2. Crossfade
    const fadeSec = (cmd.crossfade_ms ?? manifestEntry.crossfade_ms ?? 300) / 1000;

    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(1.0);

    if (cmd.play_once || manifestEntry.type === "one_shot") {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else if (cmd.loop ?? true) {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }

    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.fadeOut(fadeSec);
      action.fadeIn(fadeSec);
    }

    action.play();

    // 3. Section logic nếu sectioned
    if (manifestEntry.type === "sectioned" && manifestEntry.sections) {
      this.currentSection = new SectionedPlayback(
        action,
        manifestEntry.sections,
        () =&gt; this.onSectionComplete(cmd)
      );
      this.currentSection.start();
    }

    // 4. Apply expression
    if (cmd.expression) {
      this.applyExpression(cmd.expression);
    }

    // 5. Update procedural intensity
    this.proceduralIntensity = manifestEntry.priority &gt; 30 ? 0.4 : 1.0;

    this.currentAction = action;
    this.currentAnimationId = animationId;
  }

  private onSectionComplete(cmd: AnimationCommand) {
    // Báo backend rằng animation hoàn thành để stop_context
    if (cmd.context_id) {
      invoke("anim_stop_context", { contextId: cmd.context_id });
    }
  }

  private applyExpression(name: string) {
    const manager = this.vrm.expressionManager;
    if (!manager) return;

    // Reset tất cả expression khác
    for (const key of manager.expressions.keys()) {
      manager.setValue(key, 0);
    }
    manager.setValue(name, 1.0);
  }

  update(delta: number) {
    this.mixer.update(delta);
    this.currentSection?.update(delta);

    // Procedural animations (gọi từ module riêng)
    // proceduralAnims.update(this.vrm, delta, this.proceduralIntensity);

    this.vrm.update(delta);
  }

  private async loadVRMAClip(filePath: string): Promise<three.animationclip> {
    // Implement loader VRMA → AnimationClip
    // ...
  }

  private getManifestEntry(id: string): AnimationManifestEntry | undefined {
    // ...
  }
}
```

### 12.2. SectionedPlayback class

```typescript
export class SectionedPlayback {
  private phase: "intro" | "loop" | "outro" | "done" = "intro";
  private elapsedInPhase = 0;
  private shouldExit = false;

  constructor(
    private action: THREE.AnimationAction,
    private sections: AnimationSections,
    private onComplete: () =&gt; void
  ) {}

  start() {
    this.phase = "intro";
    this.action.time = this.sections.intro.start;
    this.elapsedInPhase = 0;
  }

  update(delta: number) {
    if (this.phase === "done") return;

    this.elapsedInPhase += delta;
    const section = this.sections[this.phase as "intro" | "loop" | "outro"];
    const duration = section.end - section.start;

    if (this.elapsedInPhase &gt;= duration) {
      this.advance();
    }
  }

  private advance() {
    if (this.phase === "intro") {
      this.phase = "loop";
      this.action.time = this.sections.loop.start;
      this.elapsedInPhase = 0;
    } else if (this.phase === "loop") {
      if (this.shouldExit) {
        this.phase = "outro";
        this.action.time = this.sections.outro.start;
        this.elapsedInPhase = 0;
      } else {
        this.action.time = this.sections.loop.start;
        this.elapsedInPhase = 0;
      }
    } else if (this.phase === "outro") {
      this.phase = "done";
      this.onComplete();
    }
  }

  requestExit() {
    this.shouldExit = true;
  }

  dispose() {
    this.phase = "done";
  }
}
```

---

## 13. IPC Contract

### 13.1. Commands (Frontend → Rust)

| **Command** | **Payload** | **Mô tả** |
|---|---|---|
| `anim_play` | `AnimationCommand` | Yêu cầu play animation. |
| `anim_stop_context` | `{ contextId: string }` | Kết thúc context, trigger fallback. |
| `anim_force_idle` | — | Force về idle, clear mọi context. |
| `anim_list_available` | — | Lấy danh sách animation từ manifest. |
| `anim_reload_manifest` | — | Reload manifest từ disk. |

### 13.2. Events (Rust → Frontend)

| **Event** | **Payload** | **Mô tả** |
|---|---|---|
| `animation_command` | `AnimationCommand` | Lệnh thực thi animation. |
| `animation_context_expired` | `string` (context_id) | Báo context hết duration. |
| `animation_manifest_updated` | `AnimationManifest` | Manifest thay đổi (sau import). |
| `animation_error` | `{ code, message }` | Lỗi cần báo UI. |

### 13.3. Ví dụ payload

```json
// animation_command
{
  "command_id": "cmd_a8f3...",
  "source": "ai",
  "timestamp_ms": 1735000000000,
  "state": "talking",
  "animation_id": "talking_happy",
  "expression": "happy",
  "loop_anim": false,
  "play_once": false,
  "crossfade_ms": 200,
  "duration_ms": 4500,
  "priority": 60,
  "context_id": "ai_session_42",
  "interrupt_policy": "allow_higher",
  "fallback": "idle",
  "section": null
}
```

---

## 14. AI Integration

### 14.1. AI có thể đề xuất gì

Trong response JSON của AI:

```json
{
  "message": "Anh code lâu rồi đấy, nghỉ chút đi.",
  "emotion": "caring",
  "suggested_animation": "talking_gentle",
  "suggested_expression": "caring",
  "mood_delta": 1,
  "affinity_delta": 0,
  "energy_delta": 0,
  "should_notify": false,
  "interruption_level": 1,
  "priority": "low",
  "memory_to_save": null,
  "next_action": { "type": "wait", "delay_minutes": 30 }
}
```

### 14.2. AI Orchestrator → AnimationDirector

```rust
pub async fn handle_ai_response(
    response: AIResponse,
    director: &AnimationDirector,
    app: &AppHandle,
) -&gt; Result&lt;()&gt; {
    // 1. Validate suggested_animation tồn tại trong manifest
    let animation_id = response.suggested_animation
        .as_ref()
        .filter(|id| director.manifest.has(id))
        .cloned();

    // 2. Build command
    let cmd = AnimationCommand {
        command_id: Uuid::new_v4().to_string(),
        source: AnimationSource::Ai,
        timestamp_ms: now_ms(),
        state: AnimationState::Talking,
        animation_id, // AI suggest, có thể None → director tự resolve
        expression: response.suggested_expression.clone(),
        loop_anim: Some(false),
        play_once: Some(false),
        crossfade_ms: Some(200),
        duration_ms: Some(estimate_talking_duration_ms(&response.message)),
        priority: 60,
        context_id: Some(format!("ai_session_{}", response.session_id)),
        interrupt_policy: Some(InterruptPolicy::AllowHigher),
        fallback: Some(FallbackMode::Idle),
        section: None,
    };

    // 3. AnimationDirector quyết định
    director.play(app, cmd).await?;

    Ok(())
}
```

### 14.3. AI không được phép

- ❌ Trực tiếp set animation file path.
- ❌ Override priority hệ thống.
- ❌ Tạo animation mới.
- ❌ Bỏ qua interrupt policy.

AI **chỉ đề xuất qua trường `suggested_animation` (animation_id)** trong manifest.

### 14.4. Validation AI suggestion

```rust
fn validate_ai_animation_suggestion(
    suggestion: Option&lt;&str&gt;,
    manifest: &AnimationManifest,
    expected_state: AnimationState,
) -&gt; Option<string> {
    let id = suggestion?;
    let entry = manifest.get(id)?;

    // AI chỉ được suggest animation match expected_state
    if entry.state != expected_state {
        tracing::warn!(
            "AI suggested '{}' (state={:?}) nhưng expected={:?}",
            id, entry.state, expected_state
        );
        return None;
    }

    Some(id.to_string())
}
```

---

## 15. Talking Duration Estimation

### 15.1. Công thức

```rust
pub fn estimate_talking_duration_ms(text: &str) -&gt; u32 {
    let word_count = text.split_whitespace().count() as u32;

    // Tiếng Việt ~ 180 từ/phút (đọc thầm 200, đọc to 150-180)
    const WPM: f32 = 180.0;
    let seconds = (word_count as f32 / WPM) * 60.0;
    let ms = (seconds * 1000.0) as u32;

    // Clamp: tối thiểu 1.2s, tối đa 12s
    ms.clamp(1200, 12000)
}
```

### 15.2. Bảng tham chiếu

| **Word count** | **Estimated duration** | **Use case** |
|---|---|---|
| 1-3 | 1.2s | "Chào anh." |
| 4-8 | 1.5-2.5s | "Anh ngủ ngon chứ?" |
| 9-20 | 3-6s | Câu thông thường |
| 21-50 | 6-12s | Câu dài (sẽ clamp) |
| 50+ | 12s | Cần chia thành nhiều bubble |

### 15.3. Bubble chunking

Với câu dài, không nên giữ một animation talking suốt. Chia bubble:

```rust
pub fn split_long_message(message: &str, max_chunk_words: usize) -&gt; Vec<string> {
    let sentences: Vec&lt;&str&gt; = message.split(['.', '!', '?']).filter(|s| !s.trim().is_empty()).collect();
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut word_count = 0;

    for sentence in sentences {
        let sw = sentence.split_whitespace().count();
        if word_count + sw &gt; max_chunk_words && !current.is_empty() {
            chunks.push(current.trim().to_string());
            current = String::new();
            word_count = 0;
        }
        current.push_str(sentence);
        current.push('.');
        word_count += sw;
    }

    if !current.is_empty() {
        chunks.push(current.trim().to_string());
    }

    chunks
}
```

---

## 16. Fallback & Recovery

### 16.1. Khi nào fallback trigger

| **Trigger** | **Hành vi** |
|---|---|
| `duration_ms` hết hạn | Vào outro section (nếu sectioned) → fallback |
| `stop_context()` được gọi | Outro → fallback |
| One-shot kết thúc | Crossfade về fallback |
| Animation file lỗi load | Log error → fallback ngay |
| AI response invalid | Fallback về idle |
| Director crash recovery | Force idle |

### 16.2. Fallback resolution

```rust
pub fn resolve_fallback(
    mode: FallbackMode,
    previous: Option&lt;&AnimationCommand&gt;,
    context_registry: &ContextRegistry,
) -&gt; AnimationCommand {
    match mode {
        FallbackMode::None =&gt; AnimationCommand::no_op(),
        FallbackMode::Previous =&gt; {
            previous.cloned().unwrap_or_else(AnimationCommand::idle)
        }
        FallbackMode::Idle =&gt; {
            // Check còn context nào active không
            if let Some(active) = context_registry.highest_priority() {
                active.current_command.clone()
            } else {
                AnimationCommand::idle()
            }
        }
    }
}
```

### 16.3. Recovery state machine

```text
[Active animation]
       │
       ▼
   Hết duration / stop_context
       │
       ▼
[Outro section]  ← skip nếu interrupt mạnh
       │
       ▼
[Resolve fallback]
       │
       ├── Còn context active? ──► Recover context cao nhất
       │
       └── Empty? ──► Idle
```

---

## 17. Format & Asset Pipeline

### 17.1. Runtime format

**VRMA** là format duy nhất được load runtime.

| **Lý do** | **Giải thích** |
|---|---|
| **Tương thích VRM** | Sinh ra cho VRM, không cần retarget |
| **Standardized** | Có spec chính thức từ VRM Consortium |
| **Lightweight** | Chỉ chứa animation tracks, không mesh |
| **Tooling** | three-vrm-animation hỗ trợ trực tiếp |
| **Future-proof** | Format chuẩn cho VRM ecosystem |

### 17.2. Source formats (offline only)

| **Source** | **Nguồn** | **Convert tool** |
|---|---|---|
| **FBX** | Mixamo, Adobe Mocap, ActorCore | Blender + VRM Addon |
| **BVH** | CMU Mocap, Rokoko Free, custom mocap | Blender + Rokoko addon |
| **VMD** | MikuMikuDance community | MMD → Blender → VRMA |
| **glTF** | Custom rigs | Direct convert |

### 17.3. Conversion pipeline

```text
Source (FBX/BVH/VMD/glTF)
         │
         ▼
   Blender Import
         │
         ▼
   VRM Addon (Load VRM model)
         │
         ▼
   Retarget skeleton
   (Rokoko Studio / Auto-Rig Pro / manual)
         │
         ▼
   Polish (timing, foot IK, fingers)
         │
         ▼
   VRM Animation Addon Export
         │
         ▼
      .vrma file
         │
         ▼
   Drop vào assets/animations/
         │
         ▼
   Update manifest.json
         │
         ▼
   anim_reload_manifest
```

### 17.4. Animation requirements

| **Tiêu chí** | **Yêu cầu** |
|---|---|
| **Framerate** | 30 hoặc 60 fps |
| **Root motion** | Không (trừ animation có ý đồ di chuyển) |
| **Skeleton** | VRM humanoid chuẩn |
| **File size** | &lt; 500 KB / clip |
| **Duration** | One-shot: 1-4s. Loop: 2-6s. Sectioned: 5-12s total |
| **Naming** | snake_case, descriptive: `talking_happy`, `sit_taskbar` |

---

## 18. File Structure

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── behavior/
│               ├── animation_director.rs
│               ├── animation_command.rs
│               ├── animation_manifest.rs
│               ├── animation_state.rs
│               ├── context_registry.rs
│               └── mod.rs
├── src/
│   └── overlay/
│       └── three/
│           ├── AnimationController.ts
│           ├── SectionedPlayback.ts
│           ├── VRMAClipLoader.ts
│           ├── ProceduralAnims.ts
│           ├── ExpressionController.ts
│           └── LookAtController.ts
├── assets/
│   └── animations/
│       ├── manifest.json
│       ├── idle/
│       │   ├── idle_normal.vrma
│       │   ├── idle_breathing.vrma
│       │   └── idle_look_around.vrma
│       ├── ai/
│       │   ├── thinking_standard.vrma
│       │   ├── talking_neutral.vrma
│       │   ├── talking_happy.vrma
│       │   └── talking_gentle.vrma
│       ├── interaction/
│       │   ├── wave.vrma
│       │   ├── nod.vrma
│       │   ├── dragging.vrma
│       │   └── pet_react.vrma
│       ├── emotion/
│       │   ├── surprised.vrma
│       │   ├── shy.vrma
│       │   ├── happy_jump.vrma
│       │   └── sleepy.vrma
│       └── context/
│           ├── sit_taskbar.vrma
│           ├── focus_quiet.vrma
│           ├── gaming_hide.vrma
│           └── private_minimal.vrma
└── docs/
    └── animation-system.md   ← Tài liệu này
```

---

## 19. Implementation Checklist

### 19.1. Core (P0)

- [ ] Định nghĩa `AnimationState` enum đầy đủ.
- [ ] Định nghĩa `AnimationCommand` struct với serde.
- [ ] Implement `AnimationManifest` loader từ JSON.
- [ ] Implement `AnimationDirector` với play / stop_context / force_idle.
- [ ] Implement `ContextRegistry` với upsert / remove / highest_priority.
- [ ] Implement interrupt policy logic.
- [ ] Implement Tauri commands: `anim_play`, `anim_stop_context`, `anim_force_idle`.
- [ ] Implement Tauri events: `animation_command`, `animation_context_expired`.

### 19.2. Frontend (P0)

- [ ] Implement `AnimationController` class.
- [ ] Load VRMA clips từ manifest.
- [ ] Implement crossfade logic.
- [ ] Implement `SectionedPlayback` cho intro/loop/outro.
- [ ] Bind IPC listener cho `animation_command`.
- [ ] Implement expression apply qua `VRMExpressionManager`.

### 19.3. Procedural (P1)

- [ ] Breathing (sin wave on spine).
- [ ] Auto-blink (random interval).
- [ ] Look-at (cursor tracking với damping).
- [ ] Subtle sway (shoulder, hair via spring bones).
- [ ] Procedural intensity scaling theo action weight.

### 19.4. AI integration (P1)

- [ ] AI response schema có `suggested_animation` + `suggested_expression`.
- [ ] Validator cho AI suggestion (check manifest).
- [ ] Talking duration estimation.
- [ ] Long message bubble chunking.

### 19.5. Manifest & Assets (P1)

- [ ] Soạn manifest đầy đủ cho 20+ animation core.
- [ ] Convert hoặc tải về VRMA cho mỗi animation.
- [ ] Test load tất cả clips.
- [ ] Validate manifest schema khi load.

### 19.6. Recovery & Edge cases (P2)

- [ ] Fallback resolution đầy đủ 3 mode.
- [ ] Handle animation file missing → fallback idle + error event.
- [ ] Handle multiple concurrent context.
- [ ] Anti-repeat logic (không chạy cùng idle 2 lần liên tiếp).
- [ ] Hot-reload manifest qua `anim_reload_manifest`.

### 19.7. Tooling (P2)

- [ ] Settings UI: list animations available.
- [ ] Settings UI: preview animation button.
- [ ] Settings UI: import VRMA flow.
- [ ] Animation history viewer (debug).

---

## 20. Glossary

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **VRM** | Format 3D avatar humanoid chuẩn, gốc từ Nhật Bản. |
| **VRMA** | VRM Animation, format animation cho VRM. |
| **AnimationState** | Logical state trừu tượng, không gắn file cụ thể. |
| **AnimationCommand** | Mệnh lệnh từ backend tới frontend để thực thi animation. |
| **Context ID** | Identifier dùng để gom nhiều command thuộc cùng một lifecycle. |
| **AnimationDirector** | Component Rust quản lý mọi quyết định animation. |
| **AnimationController** | Component TypeScript thực thi command trên Three.js. |
| **Interrupt Policy** | Quy tắc xác định khi nào animation mới được override animation hiện tại. |
| **Sectioned animation** | Animation chia intro/loop/outro để chạy linh hoạt. |
| **Procedural animation** | Animation sinh runtime bằng code, không phải clip. |
| **Crossfade** | Blend giữa 2 animation bằng cách giảm weight cái cũ, tăng cái mới. |
| **Expression** | Blendshape biểu cảm khuôn mặt (smile, blink, pout...). |
| **Spring bones** | Hệ thống physics tự động cho tóc, váy, dây buộc trong VRM. |
| **Fallback** | Animation default chạy sau khi animation hiện tại kết thúc. |
| **Manifest** | File JSON khai báo tất cả animation và metadata. |

---

## Phụ lục A: Quick Reference

### A.1. Khi cần animation cho AI talking

```rust
let cmd = AnimationCommand {
    state: AnimationState::Talking,
    animation_id: ai_response.suggested_animation,
    expression: ai_response.suggested_expression,
    duration_ms: Some(estimate_talking_duration_ms(&message)),
    priority: 60,
    context_id: Some(format!("ai_session_{}", session_id)),
    fallback: Some(FallbackMode::Idle),
    source: AnimationSource::Ai,
    ..Default::default()
};
director.play(app, cmd).await?;
```

### A.2. Khi user bắt đầu drag

```rust
let cmd = AnimationCommand {
    state: AnimationState::Dragging,
    priority: 95,
    interrupt_policy: Some(InterruptPolicy::AllowEqualOrHigher),
    context_id: Some("drag_session".to_string()),
    source: AnimationSource::User,
    ..Default::default()
};
director.play(app, cmd).await?;

// Khi thả chuột:
director.stop_context(app, "drag_session").await?;
```

### A.3. Khi mode thay đổi sang Focus

```rust
let cmd = AnimationCommand {
    state: AnimationState::Focus,
    animation_id: Some("sit_taskbar".to_string()),
    priority: 40,
    context_id: Some("mode_focus".to_string()),
    source: AnimationSource::Mode,
    fallback: Some(FallbackMode::Idle),
    ..Default::default()
};
director.play(app, cmd).await?;
```

---

**Tài liệu này là source of truth. Mọi thay đổi animation system phải cập nhật ở đây trước khi triển khai code.**