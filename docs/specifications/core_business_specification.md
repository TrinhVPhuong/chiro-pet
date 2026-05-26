# **Chiro-Pet Docs Index**

> Tài liệu gốc cho toàn bộ hệ thống **Chiro-Pet Desktop Companion AI**.  
> File này đóng vai trò là **root specification**, **mục lục tổng quan**, **dependency map** và **hướng dẫn thứ tự đọc** cho developer hoặc AI agent khi triển khai app.
>
> **Nguyên tắc lõi:** Mọi subsystem của Chiro-Pet phải tuân thủ kiến trúc chung: **local-first**, **privacy-first**, **AI chỉ đề xuất**, **subsystem quyết định**, **state/memory/assets/settings có source of truth riêng**, và mọi hành vi chủ động phải đi qua **Behavior Orchestrator**.

---

## **Mục lục**

1. [Tổng quan sản phẩm](#1-tổng-quan-sản-phẩm)
2. [Bốn trụ cột trải nghiệm](#2-bốn-trụ-cột-trải-nghiệm)
3. [Nguyên tắc kiến trúc toàn cục](#3-nguyên-tắc-kiến-trúc-toàn-cục)
4. [Nghiệp vụ nhân vật](#4-nghiệp-vụ-nhân-vật)
5. [State, relationship và memory](#5-state-relationship-và-memory)
6. [Hành vi và tương tác](#6-hành-vi-và-tương-tác)
7. [Desktop awareness và modes](#7-desktop-awareness-và-modes)
8. [Overlay và Windows integration](#8-overlay-và-windows-integration)
9. [AI Interaction principles](#9-ai-interaction-principles)
10. [Visual, animation và runtime presence](#10-visual-animation-và-runtime-presence)
11. [Privacy, recovery và debug](#11-privacy-recovery-và-debug)
12. [Danh sách tài liệu hệ thống](#12-danh-sách-tài-liệu-hệ-thống)
13. [Thứ tự đọc khuyến nghị](#13-thứ-tự-đọc-khuyến-nghị)
14. [Subsystem dependency map](#14-subsystem-dependency-map)
15. [Implementation phases](#15-implementation-phases)
16. [Quy tắc dành cho AI agent khi implement](#16-quy-tắc-dành-cho-ai-agent-khi-implement)
17. [Trạng thái tài liệu](#17-trạng-thái-tài-liệu)
18. [Glossary](#18-glossary)

---

## **1. Tổng quan sản phẩm**

**Chiro-Pet** là một ứng dụng **Desktop Companion AI** cá nhân chạy trên **Windows**, hiển thị một nhân vật ảo **3D VRM** trên desktop.

Ứng dụng hoạt động như một **transparent overlay window** luôn hiện diện trên màn hình, có khả năng:

- Hiển thị nhân vật 3D sống động.
- Cho phép click-through ở vùng trong suốt.
- Nhận biết ngữ cảnh desktop đã được sanitize.
- Trò chuyện với user thông qua AI OpenAI-compatible.
- Ghi nhớ sở thích và thói quen của user dưới sự kiểm soát privacy.
- Chủ động phản ứng hoặc nhắc nhở đúng lúc.
- Hỗ trợ nhiều character, nhưng chỉ **một active character** tại một thời điểm.

### **1.1. Tính chất sản phẩm**

| **Thuộc tính** | **Quyết định thiết kế** |
|---|---|
| **Nền tảng chính** | Windows |
| **Framework app** | Tauri 2.x + Rust backend + React/Svelte frontend |
| **Renderer** | Three.js + three-vrm |
| **Model format** | VRM, ưu tiên VRM 1.0 |
| **Animation format** | VRMA, glTF/GLB, BVH qua retargeting |
| **AI provider** | OpenAI-compatible API |
| **Data model** | Local-first |
| **Cloud sync** | Không có trong MVP |
| **Backend server riêng** | Không |
| **Use case** | Personal use |

### **1.2. Mô hình hoạt động**

```text
User desktop
  ↓
Transparent overlay window
  ↓
3D VRM character runtime
  ↓
Local systems:
  - Character
  - State
  - Memory
  - Asset
  - Behavior
  - Privacy
  - Settings
  ↓
Optional external AI provider:
  - only when needed
  - through privacy guard
  - with sanitized context only
```

---

## **2. Bốn trụ cột trải nghiệm**

### **2.1. Presence**

Nhân vật phải có cảm giác **luôn hiện diện**, nhưng không phiền.

Bao gồm:

- Idle animation.
- Blink.
- Breathing.
- Look-at cursor.
- Expression theo mood.
- Bong bóng thoại nhẹ.
- Không chiếm focus.
- Không che workflow chính.

Tài liệu liên quan:

- `animation-system.md`
- `procedural-animation-system.md`
- `overlay-window-system.md`
- `shader-system.md`

---

### **2.2. Context**

Nhân vật phải hiểu user đang ở ngữ cảnh nào, nhưng không xâm phạm riêng tư.

Context chỉ được dùng sau khi sanitize:

```text
Allowed:
- app_category
- session_duration_minutes rounded
- is_fullscreen
- mode
- time_of_day
- privacy_level

Forbidden:
- raw window title
- PID
- process path
- file path
- clipboard
- screenshot
- command line
```

Tài liệu liên quan:

- `desktop-awareness-system.md`
- `privacy-system.md`
- `ai-interaction-system.md`

---

### **2.3. Proactivity**

Nhân vật có thể chủ động, nhưng phải đúng lúc.

Mọi proactive behavior phải qua:

```text
BehaviorTrigger
  ↓
Behavior Orchestrator
  ↓
Mode policy
  ↓
Privacy policy
  ↓
Cooldown
  ↓
Daily budget
  ↓
User rules
  ↓
Action routing
```

Tài liệu liên quan:

- `behavior-orchestrator-system.md`
- `state-system.md`
- `desktop-awareness-system.md`
- `privacy-system.md`

---

### **2.4. Trust**

User phải kiểm soát dữ liệu.

Các nguyên tắc bắt buộc:

- Không lưu secret.
- Không gửi raw desktop context cho AI.
- API key phải mã hóa.
- Memory nhạy cảm cần approval.
- Private Mode override toàn bộ.
- User có thể export/delete data.
- Debug logs phải redact.

Tài liệu liên quan:

- `privacy-system.md`
- `memory-system.md`
- `settings-system.md`
- `telemetry-debug-system.md`
- `error-recovery-system.md`

---

## **3. Nguyên tắc kiến trúc toàn cục**

### **3.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Local-first** | State, memory, settings, assets lưu local. |
| **2** | **Privacy-first** | Nếu không chắc có được gửi dữ liệu không, không gửi. |
| **3** | **AI proposes, app decides** | AI chỉ đề xuất message, state delta, memory op, animation. |
| **4** | **Subsystem source of truth** | Mỗi miền có manager riêng làm source of truth. |
| **5** | **No direct write** | Không subsystem nào ghi DB/state/memory/assets trực tiếp nếu không qua manager. |
| **6** | **Validated IO** | Mọi input/output quan trọng phải validate. |
| **7** | **Event-driven sync** | Subsystem emit event, frontend hydrate bằng command query. |
| **8** | **Fail safe** | Lỗi thì fallback, degraded mode hoặc safe mode. |
| **9** | **Recoverable** | Có backup, diagnostics, repair flow. |
| **10** | **Debuggable** | Có telemetry, inspector, logs, debug panels. |

### **3.2. Source of truth theo subsystem**

| **Domain** | **Source of truth** |
|---|---|
| Character profile | `CharacterManager` |
| Character state | `StateManager` |
| Memory | `MemoryManager` |
| Assets | `AssetManager` |
| AI request lifecycle | `AIOrchestrator` |
| Behavior decisions | `BehaviorOrchestrator` |
| Desktop context | `AwarenessManager` |
| Privacy policy | `PrivacyManager` |
| Overlay window | `OverlayWindowManager` |
| Settings | `SettingsManager` |
| Hotkeys | `HotkeyManager` |
| Recovery | `ErrorRecoveryManager` |
| Telemetry/debug | `TelemetryDebugManager` |

---

## **4. Nghiệp vụ nhân vật**

Nhân vật trong Chiro-Pet không chỉ là avatar 3D. Mỗi character là một thực thể gồm:

```text
Character = Identity + Personality + Model + State + Memories + Behavior Rules
```

---

### **4.1. Static Identity**

Được định nghĩa trong `character-system.md`.

Bao gồm:

- `name`
- `display_name`
- `pronoun_self`
- `pronoun_user`
- `speaking_style`
- `backstory_summary`
- `personality traits`
- `model_asset_id`
- `default animation set`

Ví dụ:

```json
{
  "name": "mira",
  "display_name": "Mira",
  "identity": {
    "pronoun_self": "em",
    "pronoun_user": "anh",
    "speaking_style": "ngắn, ấm áp, không vòng vo",
    "backstory_summary": "Một companion nhỏ sống trên desktop."
  },
  "personality": {
    "warmth": 0.8,
    "playfulness": 0.5,
    "shyness": 0.3,
    "curiosity": 0.7,
    "patience": 0.6
  }
}
```

---

### **4.2. Dynamic State**

State đã được chuẩn hóa trong `state-system.md`.

Khác với bản nháp cũ dùng range lớn như `Mood -100..100`, hệ thống hiện tại dùng range nhỏ, dễ clamp và dễ kiểm soát hơn.

| **Field** | **Range hiện tại** | **Ý nghĩa** |
|---|---|---|
| **mood** | `-3..3` | Tâm trạng ngắn hạn |
| **energy** | `-3..3` | Mức năng lượng |
| **curiosity** | `0..5` | Mức tò mò |
| **patience** | `0..5` | Mức kiên nhẫn |
| **confidence** | `0..5` | Mức tự tin |
| **affinity** | `0..100` | Mức yêu mến |
| **trust** | `0..100` | Mức tin tưởng |
| **familiarity** | `0..100` | Mức thân thuộc |

Lý do không dùng `-100..100` cho mood/energy:

- Khó cân bằng.
- Dễ bị AI đề xuất delta quá lớn.
- Khó decay tự nhiên.
- Không cần độ phân giải cao cho animation và behavior.

---

### **4.3. Relationship tiers**

Relationship tier được derive từ `affinity`, không chỉ dựa trên số ngày.

| **Tier** | **Affinity** | **Ý nghĩa** |
|---|---|---|
| **Stranger** | `0..10` | Lịch sự, giữ khoảng cách |
| **Acquaintance** | `11..30` | Bắt đầu quen |
| **Friend** | `31..60` | Thân thiện, biết sở thích |
| **CloseFriend** | `61..85` | Gần gũi |
| **Beloved** | `86..100` | Rất thân thiết |

Thời gian sử dụng app có thể ảnh hưởng đến `familiarity`, nhưng không tự động quyết định tier nếu không có tương tác thực.

---

## **5. State, relationship và memory**

### **5.1. State System**

`state-system.md` định nghĩa:

- State schema.
- Mutation guard.
- Daily cap.
- Decay.
- Daily reset.
- Persistence.
- Event emission.
- Per-character state binding.

Mọi thay đổi state phải qua:

```text
StateMutationRequest
  ↓
StateMutationGuard
  ↓
Range clamp
  ↓
Daily cap
  ↓
Personality modifier
  ↓
Mode/privacy policy
  ↓
StateStore patch
  ↓
state_changed event
```

Không subsystem nào được tự ghi state trực tiếp.

---

### **5.2. Memory System**

`memory-system.md` định nghĩa:

- Shared memory.
- Character-scoped memory.
- Memory proposal.
- Memory approval.
- Memory merge.
- Memory privacy.
- Memory retrieval cho AI context.

AI chỉ được **đề xuất** memory operation:

```json
{
  "operation": "create",
  "scope": "shared",
  "type": "communication_style",
  "content": "User thích câu trả lời ngắn, rõ ý.",
  "importance": 4,
  "confidence": 0.95
}
```

MemoryManager mới là nơi quyết định:

```text
Save
Pending approval
Merge
Reject
Delete request
```

---

### **5.3. State vs Memory**

| **Khía cạnh** | **State** | **Memory** |
|---|---|---|
| **Tính chất** | Numeric, dynamic | Semantic, textual |
| **Ví dụ** | mood = 1, affinity = 45 | User thích câu trả lời ngắn |
| **Decay** | Có | Có thể có decay/reinforce |
| **AI access** | Tóm tắt trong context | Top relevant memories |
| **Mutation** | Qua StateManager | Qua MemoryManager |
| **Privacy** | Private Mode chặn relationship mutation | Sensitive memory cần approval |

---

## **6. Hành vi và tương tác**

### **6.1. Behavior Orchestrator**

`behavior-orchestrator-system.md` là nơi điều phối hành vi cấp cao.

Nó nhận trigger từ:

- User chat.
- Click/pet/drag.
- Desktop awareness.
- State milestone.
- Scheduler.
- Privacy mode change.
- Overlay events.
- Recovery events.

Sau đó quyết định:

```text
Silent
LocalBubble
AiInteraction
AnimationReaction
ScheduleNext
Notification
Composite
```

---

### **6.2. Proactivity**

Bản nháp cũ đề xuất `proactivity_score` chạy mỗi phút. Thiết kế hiện tại chọn cách **event-driven + policy-based** thay vì scoring liên tục.

Lý do:

- Ít tốn CPU.
- Dễ debug.
- Dễ enforce privacy/cooldown.
- Tránh nhân vật tự phát sinh hành vi quá thường xuyên.

Proactivity hiện tại dựa trên:

```text
Trigger relevance
  + current mode
  + privacy settings
  + cooldown
  + daily budget
  + user rules
  + state/personality
```

### **6.3. Proactivity budget**

| **Mode** | **Proactive behavior** |
|---|---|
| **Normal** | Cho phép trong daily budget |
| **Focus** | Downgrade xuống ambient/low |
| **Gaming** | Block |
| **Meeting** | Block |
| **Watching** | Rất hạn chế |
| **Quiet** | Block |
| **Private** | Block |
| **Streamer** | Block |
| **Restricted** | Block |

Default behavior budget nằm trong `behavior-orchestrator-system.md` và `settings-system.md`.

---

### **6.4. User reactions**

Các input chính:

| **Input** | **Trigger** | **Default behavior** |
|---|---|---|
| **Chat** | `UserChat` | AIInteraction |
| **Click** | `UserClick` | AnimationReaction |
| **Pet** | `UserPet` | LocalBubble + Animation |
| **DragStart** | `UserDragStart` | Drag animation |
| **DragEnd** | `UserDragEnd` | Drop reaction |
| **QuickAction** | `QuickAction` | AI hoặc local template |

Click spam, double click hoặc hover có thể bổ sung sau bằng User Rules hoặc Behavior Trigger mở rộng.

---

## **7. Desktop awareness và modes**

### **7.1. Desktop Awareness System**

`desktop-awareness-system.md` định nghĩa cách app quan sát desktop một cách thụ động.

Hệ thống này phân thành 3 lớp:

```text
Layer 1: Raw Sensors
  - process name
  - window title
  - pid
  - path
  - last input time
  - fullscreen

Layer 2: Classified Context
  - app_category
  - session_duration
  - idle_seconds
  - is_fullscreen

Layer 3: Sanitized Context
  - app_category
  - rounded duration
  - mode
  - time_of_day
  - privacy_level
```

Raw data không được rời module.

---

### **7.2. App modes**

Mode từ Awareness:

| **Mode** | **Ý nghĩa** |
|---|---|
| **Normal** | Sử dụng bình thường |
| **Focus** | User làm việc tập trung |
| **Gaming** | Fullscreen game |
| **Meeting** | Communication/meeting context |
| **Watching** | Fullscreen media/browser video |
| **Idle** | User không tương tác lâu |
| **Private** | Privacy mode từ user |

---

### **7.3. Effective behavior modes**

Behavior Orchestrator gom Awareness Mode + Privacy Mode thành `EffectiveBehaviorMode`.

Priority:

```text
1. Restricted
2. Private
3. Streamer
4. Quiet
5. Meeting
6. Gaming
7. Watching
8. Focus
9. Idle
10. Normal
```

Tài liệu liên quan:

- `desktop-awareness-system.md`
- `behavior-orchestrator-system.md`
- `privacy-system.md`

---

## **8. Overlay và Windows integration**

### **8.1. Overlay Window System**

`overlay-window-system.md` định nghĩa cửa sổ vật lý của app:

- Transparent window.
- No title bar.
- Always-on-top.
- Skip taskbar.
- Per-pixel click-through.
- Anchor.
- Drag/snap.
- Multi-monitor.
- DPI scaling.
- Auto-hide trong fullscreen/game/meeting.

---

### **8.2. Transparent window**

Sử dụng:

```text
Tauri transparent window
+ WebView2 transparent background
+ Three.js alpha renderer
+ Win32 styles:
  - WS_EX_LAYERED
  - WS_EX_TOOLWINDOW
  - WS_EX_NOACTIVATE
  - WS_EX_TOPMOST
```

---

### **8.3. Click-through**

Bản nháp cũ đề xuất backend cursor polling. Thiết kế hiện tại ưu tiên **frontend hitbox + debounced IPC**.

Lý do:

- Renderer biết alpha/hitbox chính xác hơn.
- Không cần backend polling liên tục.
- Ít CPU hơn.
- Dễ đồng bộ với WebGL canvas.

Flow hiện tại:

```text
Pointer move over overlay
  ↓
Frontend HitboxCache checks alpha/opaque pixel
  ↓
If transparent:
  overlay_set_click_through(true)
  ↓
If character pixel:
  overlay_set_click_through(false)
  ↓
Rust toggles WS_EX_TRANSPARENT
```

Fallback có thể dùng bounding box nếu WebGL alpha read không khả dụng.

---

## **9. AI Interaction principles**

### **9.1. AI role**

`ai-interaction-system.md` định nghĩa AI là lớp:

- Ngôn ngữ.
- Cá nhân hóa.
- Đề xuất behavior.
- Đề xuất memory operation.
- Đề xuất state delta.
- Đề xuất animation/expression.

AI không được:

- Ghi DB.
- Ghi memory trực tiếp.
- Ghi state trực tiếp.
- Đọc raw desktop data.
- Gọi OS action.
- Hiện notification trực tiếp.
- Tự play animation trực tiếp.

---

### **9.2. AI response schema**

AI response phải là JSON có schema rõ ràng:

```json
{
  "message": "string",
  "emotion": "neutral",
  "intent": "small_talk",
  "state_delta": {
    "mood": 0,
    "energy": 0,
    "affinity": 0,
    "trust": 0,
    "familiarity": 0
  },
  "suggested_animation": null,
  "suggested_expression": null,
  "interruption": {
    "should_notify": false,
    "level": 1,
    "priority": "low"
  },
  "memory_operations": [],
  "next_action": {
    "type": "wait",
    "delay_minutes": 30
  }
}
```

Mọi output đi qua:

```text
JSON parser
  ↓
Schema validator
  ↓
Safety validator
  ↓
Privacy validator
  ↓
Memory guard
  ↓
State mutation guard
  ↓
Animation director
  ↓
Behavior/overlay routing
```

---

### **9.3. AI context**

Prompt context gồm:

- Core behavior rules.
- Character identity.
- Character state.
- Shared memories.
- Character memories.
- Sanitized desktop context.
- Recent conversation.
- Current interaction.
- Output schema instruction.

Không gửi:

- raw window title.
- file path.
- process path.
- PID.
- clipboard.
- screenshot.
- secrets.

---

## **10. Visual, animation và runtime presence**

### **10.1. Animation System**

`animation-system.md` định nghĩa:

- Animation runtime.
- AnimationMixer.
- Animation commands.
- Layers.
- Priority.
- Interrupt policy.
- VRMA/glTF/BVH policy.
- AnimationDirector.

---

### **10.2. Procedural Animation System**

`procedural-animation-system.md` bổ sung secondary motion:

- Blink.
- Breathing.
- Look-at cursor.
- Idle sway.
- Micro motion.
- Expression modulation.
- Spring bone tuning.

Chạy sau `AnimationMixer.update()`:

```text
AnimationMixer.update()
  ↓
ExpressionController.update()
  ↓
ProceduralController.update()
  ↓
VRM.update()
  ↓
Render
```

---

### **10.3. Shader System**

`shader-system.md` xử lý visual polish:

- MToon enhanced.
- NPR cel-shading.
- Outline.
- Rim light.
- Face shadow.
- Eye highlight.
- Hair highlight.
- Quality fallback.

Default nên là:

```text
mtoon_enhanced
```

Không nên default `npr_cel` vì dễ phá material VRM phức tạp.

---

## **11. Privacy, recovery và debug**

### **11.1. Privacy System**

`privacy-system.md` là policy trung tâm cho:

- Permissions.
- Private Mode.
- Quiet Mode.
- Streamer Mode.
- Restricted Mode.
- AI privacy guard.
- Memory privacy guard.
- Sensitive data detector.
- Encrypted storage.
- Export/delete data.

Private Mode mặc định:

```text
- Không gửi desktop context.
- Không proactive AI.
- Không ghi memory.
- Không patch relationship state.
- Không notification.
```

---

### **11.2. Error Recovery System**

`error-recovery-system.md` định nghĩa:

- Error taxonomy.
- Severity.
- Recovery policy.
- Crash marker.
- Safe mode.
- Database recovery.
- Settings recovery.
- Asset recovery.
- AI provider recovery.
- Overlay recovery.
- Diagnostic system.

App không được crash chỉ vì một subsystem lỗi.

---

### **11.3. Telemetry Debug System**

`telemetry-debug-system.md` cung cấp:

- Metrics.
- Event monitor.
- IPC monitor.
- AI inspector.
- State inspector.
- Memory inspector.
- Animation inspector.
- Asset debug.
- Recovery timeline.
- Diagnostic export.

Mặc định:

```text
- Local only.
- No server telemetry.
- Prompt logging off.
- Raw response logging off.
- Redaction on.
```

---

## **12. Danh sách tài liệu hệ thống**

### **12.1. Core P0**

| **File** | **Vai trò** |
|---|---|
| `animation-system.md` | Animation runtime, AnimationMixer, animation command, priority, interrupt |
| `character-system.md` | Character profile, identity, personality, active character |
| `memory-system.md` | Shared/character memory, memory proposal, approval, retrieval |
| `ai-interaction-system.md` | AI orchestration, prompt, schema, validator, operation routing |
| `state-system.md` | Mood, energy, relationship, mutation guard, decay, daily reset |
| `desktop-awareness-system.md` | Foreground detection, app category, mode, sanitizer |
| `overlay-window-system.md` | Transparent window, click-through, anchor, DPI, multi-monitor |
| `privacy-system.md` | Permissions, private/quiet/streamer/restricted, encryption, export/delete |
| `asset-system.md` | VRM/animation import, registry, validation, hot-reload |

---

### **12.2. P1**

| **File** | **Vai trò** |
|---|---|
| `behavior-orchestrator-system.md` | High-level behavior, proactive, scheduler, cooldown, user rules |
| `ipc-contract.md` | API reference cho Tauri commands/events |
| `settings-system.md` | Settings schema, validation, migration, UI sections |
| `hotkey-system.md` | Global/scoped hotkeys, conflict detection, action dispatch |

---

### **12.3. P2**

| **File** | **Vai trò** |
|---|---|
| `error-recovery-system.md` | Crash recovery, fallback, diagnostics, safe mode |
| `telemetry-debug-system.md` | Metrics, logs, debug viewer, inspectors, diagnostic export |
| `procedural-animation-system.md` | Blink, breathing, look-at, idle sway, spring tuning |
| `shader-system.md` | NPR/cel-shading, outline, rim, visual polish |
| `core_business_specification.md` | Root spec, dependency map, docs reading order |

---

## **13. Thứ tự đọc khuyến nghị**

### **13.1. Nếu đọc để hiểu tổng thể**

```text
1. core_business_specification.md
2. character-system.md
3. state-system.md
4. memory-system.md
5. ai-interaction-system.md
6. behavior-orchestrator-system.md
7. desktop-awareness-system.md
8. overlay-window-system.md
9. privacy-system.md
10. asset-system.md
11. animation-system.md
12. procedural-animation-system.md
13. shader-system.md
14. settings-system.md
15. ipc-contract.md
16. hotkey-system.md
17. error-recovery-system.md
18. telemetry-debug-system.md
```

---

### **13.2. Nếu implement MVP**

```text
Phase 1:
  1. settings-system.md
  2. ipc-contract.md
  3. asset-system.md
  4. character-system.md
  5. state-system.md

Phase 2:
  6. overlay-window-system.md
  7. animation-system.md
  8. procedural-animation-system.md

Phase 3:
  9. memory-system.md
  10. privacy-system.md
  11. ai-interaction-system.md

Phase 4:
  12. desktop-awareness-system.md
  13. behavior-orchestrator-system.md
  14. hotkey-system.md

Phase 5:
  15. error-recovery-system.md
  16. telemetry-debug-system.md
  17. shader-system.md
```

---

### **13.3. Nếu implement AI-first**

```text
1. privacy-system.md
2. character-system.md
3. state-system.md
4. memory-system.md
5. ai-interaction-system.md
6. behavior-orchestrator-system.md
7. ipc-contract.md
```

---

### **13.4. Nếu implement visual/runtime-first**

```text
1. asset-system.md
2. character-system.md
3. overlay-window-system.md
4. animation-system.md
5. procedural-animation-system.md
6. shader-system.md
7. telemetry-debug-system.md
```

---

## **14. Subsystem dependency map**

### **14.1. High-level dependency graph**

```text
Settings System
  ├─ AI
  ├─ Privacy
  ├─ Overlay
  ├─ Behavior
  ├─ Animation
  ├─ Asset
  ├─ Hotkey
  └─ Telemetry

IPC Contract
  └─ All frontend/backend communication

Asset System
  ├─ Character System
  ├─ Animation System
  ├─ Shader System
  └─ Renderer

Character System
  ├─ State System
  ├─ Memory System
  ├─ AI Interaction
  └─ Behavior Orchestrator

Desktop Awareness
  ├─ Behavior Orchestrator
  ├─ AI Context Composer
  ├─ Overlay Auto-hide
  └─ Privacy Sanitizer

Privacy System
  ├─ AI Guard
  ├─ Memory Guard
  ├─ Awareness Sanitizer
  ├─ Overlay Content Policy
  └─ Telemetry Redaction

Behavior Orchestrator
  ├─ AI Interaction
  ├─ Overlay
  ├─ Animation
  ├─ State
  ├─ Privacy
  └─ Scheduler

Error Recovery
  └─ All subsystems

Telemetry Debug
  └─ All subsystems
```

---

### **14.2. Dependency table**

| **Subsystem** | **Phụ thuộc chính** | **Được dùng bởi** |
|---|---|---|
| **Settings** | File system, Privacy for secrets | All subsystems |
| **IPC** | Tauri | Frontend, all backend managers |
| **Asset** | Settings, Privacy, Recovery | Character, Animation, Renderer |
| **Character** | Asset, Settings | AI, State, Behavior, Renderer |
| **State** | Character, Settings, Privacy | AI, Behavior, Animation |
| **Memory** | Character, Privacy, Settings | AI |
| **AI** | Character, State, Memory, Privacy, Awareness | Behavior, Chat UI |
| **Awareness** | Privacy, Settings | Behavior, AI, Overlay |
| **Overlay** | Settings, Awareness, Hotkey | User interaction, Behavior |
| **Animation** | Asset, State, Behavior | Renderer, Procedural |
| **Procedural** | Animation, State, Settings | Renderer |
| **Shader** | Asset, Settings, Telemetry | Renderer |
| **Behavior** | State, Awareness, Privacy, AI, Overlay | Proactivity |
| **Hotkey** | Settings, Privacy, Overlay, Behavior | User shortcuts |
| **Recovery** | All | Diagnostics, safe mode |
| **Telemetry** | Privacy, Settings | Debug UI, diagnostics |

---

## **15. Implementation phases**

### **15.1. Phase 0: Skeleton app**

Mục tiêu: app chạy được, có settings, IPC, overlay trống.

```text
- Tauri app shell
- IPC base
- SettingsManager
- Overlay window basic
- App diagnostics basic
```

Required docs:

- `settings-system.md`
- `ipc-contract.md`
- `overlay-window-system.md`

---

### **15.2. Phase 1: Character visible**

Mục tiêu: load được VRM, hiển thị nhân vật.

```text
- Asset import/register bundled model
- Character profile
- VRM renderer
- Basic animation idle
- Overlay anchor/click-through basic
```

Required docs:

- `asset-system.md`
- `character-system.md`
- `animation-system.md`
- `overlay-window-system.md`

---

### **15.3. Phase 2: Character feels alive**

Mục tiêu: nhân vật có presence.

```text
- Blink
- Breathing
- Look-at cursor
- Idle sway
- Basic expressions
- State read integration
```

Required docs:

- `procedural-animation-system.md`
- `state-system.md`
- `animation-system.md`

---

### **15.4. Phase 3: AI conversation**

Mục tiêu: chat được với character.

```text
- AI provider config
- AIOrchestrator
- Prompt builder
- JSON schema validation
- Bubble response
- Basic memory proposal
```

Required docs:

- `ai-interaction-system.md`
- `privacy-system.md`
- `memory-system.md`
- `state-system.md`

---

### **15.5. Phase 4: Context and proactivity**

Mục tiêu: companion biết mode và hành xử đúng lúc.

```text
- Desktop awareness
- Mode detection
- Behavior orchestrator
- Scheduler
- Cooldown and budget
- Focus milestone
```

Required docs:

- `desktop-awareness-system.md`
- `behavior-orchestrator-system.md`
- `privacy-system.md`

---

### **15.6. Phase 5: User control and resilience**

Mục tiêu: app dùng lâu dài ổn định.

```text
- Hotkeys
- Recovery
- Telemetry/debug
- Export/delete data
- Safe mode
```

Required docs:

- `hotkey-system.md`
- `error-recovery-system.md`
- `telemetry-debug-system.md`
- `privacy-system.md`

---

### **15.7. Phase 6: Visual polish**

Mục tiêu: model đẹp hơn, phong cách anime rõ hơn.

```text
- MToon enhanced
- Outline
- Rim light
- Eye highlight
- Shader fallback
```

Required docs:

- `shader-system.md`
- `telemetry-debug-system.md`
- `error-recovery-system.md`

---

## **16. Quy tắc dành cho AI agent khi implement**

### **16.1. Quy tắc chung**

AI agent hoặc developer khi triển khai phải:

- Đọc `core_business_specification.md` trước.
- Đọc subsystem doc tương ứng trước khi sửa code.
- Không tự ý thay đổi contract đã định nghĩa.
- Không bypass manager/source of truth.
- Không ghi dữ liệu nhạy cảm vào log.
- Không gọi AI provider nếu chưa qua Privacy Guard.
- Không để frontend load raw asset path trực tiếp.
- Không tạo IPC command mới mà chưa cập nhật `ipc-contract.md`.
- Không tạo settings mới mà chưa cập nhật `settings-system.md`.

---

### **16.2. Khi implement AI**

Phải tuân thủ:

```text
AI chỉ đề xuất.
AI không ghi state.
AI không ghi memory trực tiếp.
AI không gọi OS action.
AI output phải JSON schema.
AI context phải sanitized.
```

Docs bắt buộc đọc:

- `ai-interaction-system.md`
- `privacy-system.md`
- `memory-system.md`
- `state-system.md`
- `behavior-orchestrator-system.md`

---

### **16.3. Khi implement overlay**

Phải tuân thủ:

```text
No focus stealing.
Click-through phải safe.
Không force topmost trong fullscreen game/meeting.
DPI/multi-monitor phải recover được.
Overlay off-screen phải tự kéo về primary monitor.
```

Docs bắt buộc đọc:

- `overlay-window-system.md`
- `desktop-awareness-system.md`
- `error-recovery-system.md`
- `hotkey-system.md`

---

### **16.4. Khi implement renderer**

Phải tuân thủ:

```text
Không crash nếu model/shader/animation lỗi.
Fallback default model/animation/material.
Dispose geometry/material/texture khi unload.
Không IPC per frame.
```

Docs bắt buộc đọc:

- `asset-system.md`
- `animation-system.md`
- `procedural-animation-system.md`
- `shader-system.md`
- `telemetry-debug-system.md`
- `error-recovery-system.md`

---

### **16.5. Khi implement privacy-sensitive feature**

Phải kiểm tra:

```text
Private Mode
Quiet Mode
Streamer Mode
Restricted Mode
PermissionState
SensitiveDataDetector
Redaction
Export/delete policy
```

Docs bắt buộc đọc:

- `privacy-system.md`
- `settings-system.md`
- `telemetry-debug-system.md`
- `error-recovery-system.md`

---