# **Chiro-Pet Behavior Orchestrator System**

> Tài liệu thiết kế chính thức cho **Behavior Orchestrator System** của **Chiro-Pet**.  
> Hệ thống này là lớp **điều phối hành vi cấp cao**: nhận tín hiệu từ State, Desktop Awareness, AI, Memory, Overlay và Settings, sau đó quyết định **khi nào character nên phản ứng, chủ động nói, im lặng, đổi animation, hiện bubble hoặc lên lịch check-in**.
>
> **Nguyên tắc lõi:** Behavior Orchestrator **không tự tạo nội dung AI, không tự ghi state, không tự play animation trực tiếp**. Nó chỉ quyết định **intent hành vi**, kiểm tra policy, budget, cooldown, privacy, rồi route request đến subsystem phù hợp.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Vai trò của Behavior Orchestrator](#3-vai-trò-của-behavior-orchestrator)
4. [Kiến trúc tổng thể](#4-kiến-trúc-tổng-thể)
5. [Behavior Inputs](#5-behavior-inputs)
6. [Behavior Outputs](#6-behavior-outputs)
7. [Behavior Lifecycle](#7-behavior-lifecycle)
8. [Mode Manager](#8-mode-manager)
9. [Proactivity Controller](#9-proactivity-controller)
10. [Event Scheduler](#10-event-scheduler)
11. [Cooldown System](#11-cooldown-system)
12. [Interaction Budget System](#12-interaction-budget-system)
13. [User Rules Engine](#13-user-rules-engine)
14. [Behavior Policy Engine](#14-behavior-policy-engine)
15. [Trigger System](#15-trigger-system)
16. [Decision Pipeline](#16-decision-pipeline)
17. [Behavior Action Routing](#17-behavior-action-routing)
18. [Integration với AI Interaction](#18-integration-với-ai-interaction)
19. [Integration với State System](#19-integration-với-state-system)
20. [Integration với Desktop Awareness](#20-integration-với-desktop-awareness)
21. [Integration với Overlay Window](#21-integration-với-overlay-window)
22. [Integration với Privacy System](#22-integration-với-privacy-system)
23. [Backend: BehaviorOrchestrator](#23-backend-behaviororchestrator)
24. [IPC Contract](#24-ipc-contract)
25. [Frontend Behavior UI](#25-frontend-behavior-ui)
26. [Logging & Audit](#26-logging--audit)
27. [Error Handling](#27-error-handling)
28. [Performance Considerations](#28-performance-considerations)
29. [File Structure](#29-file-structure)
30. [Implementation Checklist](#30-implementation-checklist)
31. [Glossary](#31-glossary)
32. [Phụ lục A: Flow proactive focus milestone](#phụ-lục-a-flow-proactive-focus-milestone)
33. [Phụ lục B: Flow mode transition reaction](#phụ-lục-b-flow-mode-transition-reaction)
34. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Behavior Orchestrator System của **Chiro-Pet** phải:

- Điều phối hành vi chủ động và phản ứng của character.
- Nhận event từ:
  - **Desktop Awareness**
  - **State System**
  - **AI Interaction**
  - **Overlay Window**
  - **Privacy System**
  - **User input**
- Quyết định khi nào character nên:
  - im lặng
  - nhìn theo cursor
  - đổi idle animation
  - hiện bubble local
  - gọi AI proactive
  - nhắc nghỉ
  - chào buổi sáng
  - phản ứng khi user click/pet/drag
- Kiểm soát **proactivity** bằng:
  - mode policy
  - cooldown
  - daily budget
  - privacy mode
  - user rules
  - character personality
  - current state
- Lên lịch event nhẹ:
  - daily greeting
  - focus milestone
  - idle return
  - periodic check-in
- Không làm phiền user trong các mode:
  - Focus
  - Gaming
  - Meeting
  - Watching
  - Private
  - Quiet
  - Streamer
- Cung cấp một nơi duy nhất để debug hành vi.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Mode Manager.
- Proactivity Controller.
- Event Scheduler.
- Cooldown System.
- Interaction Budget.
- User Rules Engine.
- Behavior Policy.
- Trigger evaluation.
- Action routing.
- Integration matrix với subsystem khác.
- IPC và UI debug.

Tài liệu này **không** mô tả chi tiết:

- AI prompt và response schema.
- State mutation guard.
- Desktop context detection.
- Overlay transparency/click-through.
- Asset import.
- Memory schema.

Các phần đó thuộc subsystem riêng.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Policy trước action** | Mọi hành vi phải đi qua behavior policy trước khi route. |
| **2** | **Không spam user** | Proactive luôn bị kiểm soát bởi cooldown và daily budget. |
| **3** | **Mode-aware** | Focus/Gaming/Meeting/Watching/Private/Quiet thay đổi toàn bộ mức can thiệp. |
| **4** | **Privacy overrides all** | Private/Restricted/Streamer có quyền chặn mọi hành vi chủ động. |
| **5** | **AI là optional** | Nếu AI bị block, dùng template hoặc silent. |
| **6** | **User input ưu tiên cao nhất** | User chủ động chat/click/menu có quyền cao hơn proactive. |
| **7** | **Character personality modifies behavior** | Nhân vật nhút nhát ít proactive hơn, caring nhiều check-in hơn. |
| **8** | **State-aware** | Mood/energy/affinity ảnh hưởng tần suất và tone hành vi. |
| **9** | **Explainable decision** | Mỗi quyết định quan trọng phải có debug reason. |
| **10** | **Fail silent** | Nếu lỗi policy/scheduler, không làm phiền user. |

### **2.2. Anti-pattern cần tránh**

- ❌ Gọi AI proactive mỗi khi có event.
- ❌ Nhắc nghỉ trong fullscreen game.
- ❌ Hiện bubble trong meeting.
- ❌ Bỏ qua Quiet Mode.
- ❌ Hardcode behavior trong UI component.
- ❌ Cho AI tự quyết định notification cuối.
- ❌ Không có cooldown per behavior type.
- ❌ Không log lý do bị block.
- ❌ Scheduler chạy task trùng lặp sau resume/sleep.
- ❌ Một event tạo nhiều hành vi cạnh tranh nhau.

---

## **3. Vai trò của Behavior Orchestrator**

### **3.1. Behavior Orchestrator được phép làm gì**

Behavior Orchestrator được phép:

- Nhận và phân loại trigger.
- Đánh giá policy.
- Kiểm tra cooldown.
- Kiểm tra budget.
- Kiểm tra privacy/mode.
- Quyết định action type.
- Gửi request đến AIOrchestrator.
- Gửi local template bubble đến Overlay.
- Yêu cầu AnimationDirector đổi idle/reaction.
- Lên lịch next behavior event.
- Ghi audit/debug decision.

### **3.2. Behavior Orchestrator không được phép làm gì**

Behavior Orchestrator không được phép:

- Ghi state trực tiếp.
- Ghi memory trực tiếp.
- Play animation trực tiếp nếu AnimationDirector có policy riêng.
- Gửi AI request bỏ qua AIPrivacyGuard.
- Hiện notification bỏ qua Privacy/Notification permission.
- Đọc raw desktop window title/path.
- Tự sửa character profile.
- Tự sửa settings.
- Tự bypass user rules.

### **3.3. Bảng phân quyền**

| **Hành động** | **Behavior Orchestrator** | **Subsystem quyết định cuối** |
|---|---|---|
| Phân loại trigger | Được | BehaviorPolicy |
| Quyết định proactive candidate | Được | ProactivityController |
| Gọi AI proactive | Đề xuất | AIOrchestrator + PrivacyGuard |
| Hiện bubble local | Đề xuất | OverlayWindowManager |
| Notification | Đề xuất | Privacy + OS Notification layer |
| Đổi idle animation | Đề xuất | AnimationDirector |
| Patch state | Không | StateManager |
| Save memory | Không | MemoryManager |
| Đọc desktop raw data | Không | DesktopAwareness |

---

## **4. Kiến trúc tổng thể**

```text
┌──────────────────────────────────────────────────────────────┐
│                         EVENT SOURCES                         │
│                                                              │
│  - User input: chat/click/pet/drag/menu                       │
│  - Desktop Awareness: mode change, milestone, idle            │
│  - State System: mood/energy/milestone                        │
│  - Privacy System: mode toggled                               │
│  - Scheduler: daily greeting, check-in                        │
│  - Overlay: shown/hidden/dragged                              │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                  BEHAVIOR ORCHESTRATOR                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Trigger Router                                          │  │
│  │ - classify trigger                                      │  │
│  │ - assign priority                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Behavior Context Composer                               │  │
│  │ - app mode                                              │  │
│  │ - privacy settings                                      │  │
│  │ - character state                                       │  │
│  │ - personality                                           │  │
│  │ - cooldown snapshot                                     │  │
│  │ - budget snapshot                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Policy Engine                                           │  │
│  │ - mode policy                                           │  │
│  │ - privacy policy                                        │  │
│  │ - user rules                                            │  │
│  │ - cooldown                                              │  │
│  │ - daily budget                                          │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Decision Engine                                         │  │
│  │ - silent / local / AI / animation / schedule            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Action Router                                           │  │
│  │ - AIOrchestrator                                        │  │
│  │ - OverlayWindowManager                                  │  │
│  │ - AnimationDirector                                     │  │
│  │ - StateManager                                          │  │
│  │ - EventScheduler                                        │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                         SUBSYSTEMS                            │
│  AI / Animation / Overlay / State / Memory / Privacy          │
└──────────────────────────────────────────────────────────────┘
```

---

## **5. Behavior Inputs**

### **5.1. BehaviorTrigger**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorTrigger {
    pub trigger_id: String,
    pub trigger_type: BehaviorTriggerType,
    pub source: BehaviorTriggerSource,
    pub priority: BehaviorPriority,
    pub payload: serde_json::Value,
    pub created_at: DateTime<utc>,
}
```

### **5.2. BehaviorTriggerType**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum BehaviorTriggerType {
    UserChat,
    UserClick,
    UserPet,
    UserDragStart,
    UserDragEnd,
    QuickAction,

    ModeChanged,
    AppCategoryChanged,
    FocusMilestone,
    IdleStarted,
    IdleEnded,
    FullscreenEntered,
    FullscreenExited,

    DailyGreeting,
    PeriodicCheckIn,
    ScheduledReminder,

    StateChanged,
    RelationshipMilestone,

    PrivacyModeChanged,
    OverlayShown,
    OverlayHidden,

    ErrorRecovery,
}
```

### **5.3. BehaviorTriggerSource**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum BehaviorTriggerSource {
    User,
    Awareness,
    State,
    Privacy,
    Scheduler,
    Overlay,
    Ai,
    System,
}
```

### **5.4. BehaviorPriority**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum BehaviorPriority {
    Silent = 0,
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4,
}
```

### **5.5. Input examples**

```json
{
  "trigger_id": "trig_focus_45",
  "trigger_type": "focus_milestone",
  "source": "awareness",
  "priority": "low",
  "payload": {
    "category": "developer_tool",
    "duration_minutes": 45
  },
  "created_at": "2026-05-27T00:10:00Z"
}
```

---

## **6. Behavior Outputs**

### **6.1. BehaviorDecision**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorDecision {
    pub decision_id: String,
    pub trigger_id: String,
    pub action: BehaviorAction,
    pub allowed: bool,
    pub block_reason: Option<string>,
    pub debug_reason: String,
    pub created_at: DateTime<utc>,
}
```

### **6.2. BehaviorAction**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum BehaviorAction {
    Silent,

    LocalBubble {
        message_template_id: String,
        emotion: String,
        duration_ms: u32,
    },

    AiInteraction {
        interaction_type: String,
        user_message: Option<string>,
        trigger_context: serde_json::Value,
    },

    AnimationReaction {
        animation_id: String,
        expression: Option<string>,
        priority: u8,
    },

    ScheduleNext {
        event_type: BehaviorTriggerType,
        delay_seconds: u64,
        reason: String,
    },

    Notification {
        title_template_id: String,
        body_template_id: String,
        level: u8,
    },

    Composite {
        actions: Vec<behavioraction>,
    },
}
```

### **6.3. BehaviorResult**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorResult {
    pub decision: BehaviorDecision,
    pub routed_actions: Vec<routedactionresult>,
    pub warnings: Vec<string>,
}
```

### **6.4. RoutedActionResult**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutedActionResult {
    pub action_type: String,
    pub status: RoutedActionStatus,
    pub reason: Option<string>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RoutedActionStatus {
    Applied,
    Skipped,
    Blocked,
    Failed,
}
```

---

## **7. Behavior Lifecycle**

### **7.1. Lifecycle chuẩn**

```text
TriggerReceived
  ↓
ClassifyTrigger
  ↓
ComposeBehaviorContext
  ↓
EvaluatePolicy
  ↓
CheckCooldown
  ↓
CheckBudget
  ↓
BuildDecision
  ↓
RouteAction
  ↓
RecordCooldownAndBudget
  ↓
AuditDecision
  ↓
Idle
```

### **7.2. State machine**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BehaviorLifecycleState {
    Idle,
    ReceivingTrigger,
    ComposingContext,
    EvaluatingPolicy,
    Deciding,
    RoutingAction,
    RecordingResult,
    Failed,
}
```

### **7.3. Transition rules**

```text
Idle → ReceivingTrigger
  Khi event bus nhận trigger.

ReceivingTrigger → ComposingContext
  Sau khi trigger hợp lệ.

ComposingContext → EvaluatingPolicy
  Sau khi lấy mode/privacy/state/cooldown.

EvaluatingPolicy → Deciding
  Nếu policy không block.

EvaluatingPolicy → RecordingResult
  Nếu policy block.

Deciding → RoutingAction
  Khi action được chọn.

RoutingAction → RecordingResult
  Sau khi route xong hoặc fail.

RecordingResult → Idle
  Sau audit/log.

Any → Failed
  Nếu lỗi không recover được.

Failed → Idle
  Fail silent.
```

---

## **8. Mode Manager**

### **8.1. Trách nhiệm**

Mode Manager gom và chuẩn hóa mode từ nhiều nguồn.

Nguồn mode:

```text
- DesktopAwareness AppMode
- Privacy modes
- User manual mode override
- Overlay hidden state
- Scheduler quiet window
```

### **8.2. EffectiveBehaviorMode**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EffectiveBehaviorMode {
    Normal,
    Focus,
    Gaming,
    Meeting,
    Watching,
    Idle,
    Quiet,
    Private,
    Streamer,
    Restricted,
}
```

### **8.3. Mode priority**

Priority từ cao xuống thấp:

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

### **8.4. Mode resolver**

```rust
pub struct ModeManager;

impl ModeManager {
    pub fn resolve(
        awareness_mode: AppMode,
        privacy: &PrivacySettings,
        manual_override: Option<effectivebehaviormode>,
    ) -> EffectiveBehaviorMode {
        if privacy.restricted_mode {
            return EffectiveBehaviorMode::Restricted;
        }

        if privacy.private_mode {
            return EffectiveBehaviorMode::Private;
        }

        if privacy.streamer_mode {
            return EffectiveBehaviorMode::Streamer;
        }

        if privacy.quiet_mode {
            return EffectiveBehaviorMode::Quiet;
        }

        if let Some(mode) = manual_override {
            return mode;
        }

        match awareness_mode {
            AppMode::Normal => EffectiveBehaviorMode::Normal,
            AppMode::Focus => EffectiveBehaviorMode::Focus,
            AppMode::Gaming => EffectiveBehaviorMode::Gaming,
            AppMode::Meeting => EffectiveBehaviorMode::Meeting,
            AppMode::Watching => EffectiveBehaviorMode::Watching,
            AppMode::Idle => EffectiveBehaviorMode::Idle,
            AppMode::Private => EffectiveBehaviorMode::Private,
        }
    }
}
```

### **8.5. Mode behavior matrix**

| **Effective Mode** | **Direct chat** | **Proactive** | **Bubble** | **Notification** | **Animation** |
|---|---|---|---|---|---|
| **Normal** | Có | Có | Có | Có nếu allowed | Có |
| **Focus** | Có | Hạn chế | Low only | Không | Calm |
| **Gaming** | Có nếu overlay visible | Không | Không | Không | Minimal |
| **Meeting** | Có nếu user mở chat | Không | Không | Không | Minimal |
| **Watching** | Có | Rất hạn chế | Low only | Không | Minimal |
| **Idle** | Không proactive trừ return | Không | Không | Không | Sleep |
| **Quiet** | Có | Không | User only | Không | Calm |
| **Private** | Theo setting | Không | User only | Không | Local only |
| **Streamer** | Có | Không | Masked | Không | Safe |
| **Restricted** | Không AI | Không | Local only | Không | Local only |

---

## **9. Proactivity Controller**

### **9.1. Trách nhiệm**

Proactivity Controller quyết định một trigger có được biến thành hành vi chủ động không.

Input:

```text
- trigger
- effective mode
- state
- personality
- cooldown
- daily budget
- user rules
```

Output:

```text
Allow / Block / Downgrade / Delay
```

### **9.2. ProactivityDecision**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProactivityDecision {
    Allow {
        level: ProactivityLevel,
        reason: String,
    },
    Downgrade {
        from: ProactivityLevel,
        to: ProactivityLevel,
        reason: String,
    },
    Delay {
        delay_seconds: u64,
        reason: String,
    },
    Block {
        reason: String,
    },
}
```

### **9.3. ProactivityLevel**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ProactivityLevel {
    Silent = 0,
    Ambient = 1,
    Bubble = 2,
    Notification = 3,
}
```

### **9.4. Default proactivity rules**

| **Trigger** | **Normal** | **Focus** | **Gaming** | **Meeting** | **Quiet/Private** |
|---|---|---|---|---|---|
| **DailyGreeting** | Bubble | Ambient | Block | Block | Block |
| **FocusMilestone** | Bubble | Ambient | Block | Block | Block |
| **PeriodicCheckIn** | Bubble | Block | Block | Block | Block |
| **IdleEnded** | Ambient | Ambient | Block | Block | Block |
| **RelationshipMilestone** | Bubble | Ambient | Block | Block | Block |
| **ErrorRecovery** | Ambient | Ambient | Block | Block | Block |

### **9.5. Evaluation pseudocode**

```rust
pub struct ProactivityController {
    cooldown: Arc<cooldownmanager>,
    budget: Arc<interactionbudgetmanager>,
    rules: Arc<userrulesengine>,
}

impl ProactivityController {
    pub async fn evaluate(
        &self,
        trigger: &BehaviorTrigger,
        ctx: &BehaviorContext,
    ) -> ProactivityDecision {
        if !trigger.is_proactive() {
            return ProactivityDecision::Allow {
                level: ProactivityLevel::Bubble,
                reason: "user_initiated".into(),
            };
        }

        if matches!(
            ctx.mode,
            EffectiveBehaviorMode::Restricted
                | EffectiveBehaviorMode::Private
                | EffectiveBehaviorMode::Quiet
                | EffectiveBehaviorMode::Streamer
                | EffectiveBehaviorMode::Gaming
                | EffectiveBehaviorMode::Meeting
        ) {
            return ProactivityDecision::Block {
                reason: format!("mode_blocks_proactive:{:?}", ctx.mode),
            };
        }

        if !self.cooldown.allows(trigger.trigger_type).await {
            return ProactivityDecision::Block {
                reason: "cooldown_active".into(),
            };
        }

        if !self.budget.allows(trigger.trigger_type).await {
            return ProactivityDecision::Block {
                reason: "daily_budget_exceeded".into(),
            };
        }

        if let Some(rule_decision) = self.rules.evaluate(trigger, ctx).await {
            return rule_decision.into();
        }

        match ctx.mode {
            EffectiveBehaviorMode::Focus => ProactivityDecision::Downgrade {
                from: ProactivityLevel::Bubble,
                to: ProactivityLevel::Ambient,
                reason: "focus_mode_downgrade".into(),
            },
            EffectiveBehaviorMode::Watching => ProactivityDecision::Downgrade {
                from: ProactivityLevel::Bubble,
                to: ProactivityLevel::Ambient,
                reason: "watching_mode_downgrade".into(),
            },
            _ => ProactivityDecision::Allow {
                level: ProactivityLevel::Bubble,
                reason: "policy_allows".into(),
            },
        }
    }
}
```

---

## **10. Event Scheduler**

### **10.1. Trách nhiệm**

Event Scheduler quản lý các trigger theo thời gian.

Loại event:

```text
- Daily greeting
- Periodic check-in
- Focus milestone follow-up
- Idle return check
- Delayed retry
- Local reminder
```

### **10.2. ScheduledBehaviorEvent**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledBehaviorEvent {
    pub event_id: String,
    pub trigger_type: BehaviorTriggerType,
    pub payload: serde_json::Value,
    pub scheduled_at: DateTime<utc>,
    pub run_at: DateTime<utc>,
    pub repeat: Option<repeatpolicy>,
    pub status: ScheduledEventStatus,
}
```

### **10.3. RepeatPolicy**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RepeatPolicy {
    None,
    EveryMinutes { minutes: u32 },
    DailyAt { hour: u8, minute: u8 },
    CronLike { expression: String },
}
```

### **10.4. ScheduledEventStatus**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduledEventStatus {
    Pending,
    Running,
    Completed,
    Cancelled,
    Failed,
}
```

### **10.5. Scheduler loop**

```rust
pub struct BehaviorEventScheduler {
    store: Arc<schedulerstore>,
    event_tx: mpsc::Sender<behaviortrigger>,
}

impl BehaviorEventScheduler {
    pub async fn run(&self) {
        let mut interval = tokio::time::interval(Duration::from_secs(30));

        loop {
            interval.tick().await;

            let due_events = match self.store.list_due(Utc::now()).await {
                Ok(v) => v,
                Err(e) => {
                    tracing::warn!("scheduler list_due failed: {}", e);
                    continue;
                }
            };

            for event in due_events {
                if let Err(e) = self.dispatch(event).await {
                    tracing::warn!("scheduler dispatch failed: {}", e);
                }
            }
        }
    }

    async fn dispatch(&self, event: ScheduledBehaviorEvent) -> Result<()> {
        self.store.mark_running(&event.event_id).await?;

        let trigger = BehaviorTrigger {
            trigger_id: Uuid::new_v4().to_string(),
            trigger_type: event.trigger_type,
            source: BehaviorTriggerSource::Scheduler,
            priority: BehaviorPriority::Low,
            payload: event.payload.clone(),
            created_at: Utc::now(),
        };

        self.event_tx.send(trigger).await?;

        self.store.complete_or_reschedule(event).await?;

        Ok(())
    }
}
```

### **10.6. Sleep/resume handling**

```text
On system resume:
  1. Query due events.
  2. Drop stale low-priority events older than 30 minutes.
  3. Run important events once.
  4. Reschedule repeating events from current time.
```

---

## **11. Cooldown System**

### **11.1. Trách nhiệm**

Cooldown ngăn hành vi lặp quá dày.

Cooldown theo:

```text
- behavior type
- trigger type
- global proactive
- per character
- per mode
```

### **11.2. CooldownKey**

```rust
#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub struct CooldownKey {
    pub character_id: String,
    pub trigger_type: BehaviorTriggerType,
    pub scope: CooldownScope,
}
```

### **11.3. CooldownScope**

```rust
#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CooldownScope {
    Global,
    PerTrigger,
    PerCharacter,
    PerMode,
}
```

### **11.4. Default cooldowns**

| **Trigger** | **Cooldown** |
|---|---|
| **DailyGreeting** | 20h |
| **FocusMilestone** | 45m |
| **PeriodicCheckIn** | 60m |
| **IdleEnded** | 10m |
| **RelationshipMilestone** | 5m |
| **ErrorRecovery** | 10m |
| **UserClick** | 1s |
| **UserPet** | 3s |
| **QuickAction** | 2s |
| **Global proactive** | 15m |

### **11.5. CooldownManager**

```rust
pub struct CooldownManager {
    store: Arc<cooldownstore>,
    config: CooldownConfig,
}

impl CooldownManager {
    pub async fn allows(&self, trigger_type: BehaviorTriggerType) -> bool {
        let key = self.key_for(trigger_type);
        let now = Utc::now();

        match self.store.get_last_fired(&key).await {
            Ok(Some(last)) => {
                let duration = self.config.duration_for(trigger_type);
                now - last >= duration
            }
            _ => true,
        }
    }

    pub async fn record(&self, trigger_type: BehaviorTriggerType) -> Result<()> {
        let key = self.key_for(trigger_type);
        self.store.set_last_fired(&key, Utc::now()).await
    }
}
```

---

## **12. Interaction Budget System**

### **12.1. Trách nhiệm**

Budget giới hạn số lần character chủ động mỗi ngày.

Không trùng với AI cost budget. Đây là **behavior budget**.

### **12.2. Budget types**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorDailyBudget {
    pub date: NaiveDate,
    pub proactive_used: u32,
    pub focus_reminders_used: u32,
    pub greetings_used: u32,
    pub notifications_used: u32,
    pub max_proactive_per_day: u32,
    pub max_focus_reminders_per_day: u32,
    pub max_greetings_per_day: u32,
    pub max_notifications_per_day: u32,
}
```

### **12.3. Defaults**

```text
max_proactive_per_day = 8
max_focus_reminders_per_day = 4
max_greetings_per_day = 2
max_notifications_per_day = 1
```

### **12.4. BudgetManager**

```rust
pub struct InteractionBudgetManager {
    store: Arc<behaviorbudgetstore>,
}

impl InteractionBudgetManager {
    pub async fn allows(&self, trigger_type: BehaviorTriggerType) -> bool {
        let budget = match self.store.get_today().await {
            Ok(b) => b,
            Err(_) => return false,
        };

        match trigger_type {
            BehaviorTriggerType::FocusMilestone => {
                budget.focus_reminders_used < budget.max_focus_reminders_per_day
            }
            BehaviorTriggerType::DailyGreeting => {
                budget.greetings_used < budget.max_greetings_per_day
            }
            _ => {
                budget.proactive_used < budget.max_proactive_per_day
            }
        }
    }

    pub async fn record(&self, trigger_type: BehaviorTriggerType) -> Result<()> {
        self.store.increment_today(trigger_type).await
    }
}
```

---

## **13. User Rules Engine**

### **13.1. Mục tiêu**

User Rules Engine cho phép user tùy chỉnh hành vi mà không sửa code.

Ví dụ:

```text
- Không nhắc nghỉ khi đang gaming.
- Không nói gì sau 23:00.
- Chỉ chào buổi sáng sau 08:00.
- Nếu đang focus thì chỉ hiện ambient bubble.
- Không proactive quá 3 lần mỗi ngày.
```

### **13.2. UserRule**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRule {
    pub rule_id: String,
    pub name: String,
    pub enabled: bool,
    pub priority: u32,
    pub condition: RuleCondition,
    pub action: RuleAction,
    pub created_at: DateTime<utc>,
    pub updated_at: DateTime<utc>,
}
```

### **13.3. RuleCondition**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RuleCondition {
    Always,
    ModeIs { mode: EffectiveBehaviorMode },
    TriggerIs { trigger_type: BehaviorTriggerType },
    TimeBetween { start_hour: u8, end_hour: u8 },
    AppCategoryIs { category: AppCategory },
    StateMoodBelow { value: i8 },
    CompositeAll { conditions: Vec<rulecondition> },
    CompositeAny { conditions: Vec<rulecondition> },
}
```

### **13.4. RuleAction**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RuleAction {
    Allow,
    Block { reason: String },
    Downgrade { to: ProactivityLevel },
    Delay { seconds: u64 },
    ForceLocalTemplate { template_id: String },
}
```

### **13.5. Rule evaluation**

```rust
pub struct UserRulesEngine {
    store: Arc<userrulestore>,
}

impl UserRulesEngine {
    pub async fn evaluate(
        &self,
        trigger: &BehaviorTrigger,
        ctx: &BehaviorContext,
    ) -> Option<ruleaction> {
        let mut rules = self.store.list_enabled().await.ok()?;
        rules.sort_by_key(|r| r.priority);

        for rule in rules {
            if self.matches(&rule.condition, trigger, ctx) {
                return Some(rule.action);
            }
        }

        None
    }
}
```

### **13.6. Default rules**

```json
[
  {
    "name": "Block proactive in Gaming",
    "condition": {
      "type": "mode_is",
      "mode": "gaming"
    },
    "action": {
      "type": "block",
      "reason": "gaming_mode"
    }
  },
  {
    "name": "No proactive at night",
    "condition": {
      "type": "time_between",
      "start_hour": 23,
      "end_hour": 7
    },
    "action": {
      "type": "downgrade",
      "to": "silent"
    }
  }
]
```

---

## **14. Behavior Policy Engine**

### **14.1. Trách nhiệm**

Behavior Policy Engine là lớp quyết định cuối trước khi chọn action.

Nó kiểm tra:

```text
- trigger validity
- effective mode
- privacy settings
- user rules
- cooldown
- budget
- overlay visibility
- character availability
```

### **14.2. BehaviorContext**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorContext {
    pub active_character_id: String,
    pub mode: EffectiveBehaviorMode,
    pub awareness_mode: AppMode,
    pub privacy_settings: PrivacySettings,
    pub character_state: CharacterState,
    pub personality: PersonalityTraits,
    pub overlay_visible: bool,
    pub cooldown_snapshot: CooldownSnapshot,
    pub budget_snapshot: BehaviorDailyBudget,
    pub now: DateTime<utc>,
}
```

### **14.3. PolicyDecision**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PolicyDecision {
    Allow {
        reason: String,
    },
    Block {
        reason: String,
    },
    Downgrade {
        reason: String,
        max_level: ProactivityLevel,
    },
    Delay {
        reason: String,
        delay_seconds: u64,
    },
}
```

### **14.4. Policy engine pseudocode**

```rust
pub struct BehaviorPolicyEngine {
    proactivity: Arc<proactivitycontroller>,
    rules: Arc<userrulesengine>,
}

impl BehaviorPolicyEngine {
    pub async fn evaluate(
        &self,
        trigger: &BehaviorTrigger,
        ctx: &BehaviorContext,
    ) -> PolicyDecision {
        if matches!(ctx.mode, EffectiveBehaviorMode::Restricted) {
            return PolicyDecision::Block {
                reason: "restricted_mode".into(),
            };
        }

        if trigger.is_user_initiated() {
            return PolicyDecision::Allow {
                reason: "user_initiated".into(),
            };
        }

        if let Some(rule_action) = self.rules.evaluate(trigger, ctx).await {
            return rule_action_to_policy(rule_action);
        }

        match self.proactivity.evaluate(trigger, ctx).await {
            ProactivityDecision::Allow { reason, .. } => {
                PolicyDecision::Allow { reason }
            }
            ProactivityDecision::Downgrade { reason, to, .. } => {
                PolicyDecision::Downgrade {
                    reason,
                    max_level: to,
                }
            }
            ProactivityDecision::Delay {
                delay_seconds,
                reason,
            } => {
                PolicyDecision::Delay {
                    reason,
                    delay_seconds,
                }
            }
            ProactivityDecision::Block { reason } => {
                PolicyDecision::Block { reason }
            }
        }
    }
}
```

---

## **15. Trigger System**

### **15.1. Trigger categories**

| **Category** | **Examples** | **Default handling** |
|---|---|---|
| **User-initiated** | chat, click, pet, quick action | Allow unless Restricted |
| **Awareness** | mode change, focus milestone | Policy controlled |
| **State** | mood low, milestone | Policy controlled |
| **Scheduled** | greeting, check-in | Policy controlled |
| **System** | error recovery | Local fallback |
| **Privacy** | private mode toggle | Silent/local |

### **15.2. User trigger mapping**

| **Input** | **Trigger** | **Default action** |
|---|---|---|
| Chat message | UserChat | AIInteraction |
| Right click menu | QuickAction | AI or local |
| Click character | UserClick | AnimationReaction |
| Pet gesture | UserPet | LocalBubble + Animation |
| Drag start | UserDragStart | Drag animation |
| Drag end | UserDragEnd | Reaction animation |

### **15.3. Awareness trigger mapping**

| **Awareness event** | **BehaviorTrigger** |
|---|---|
| `ModeChanged` | ModeChanged |
| `SessionMilestone(45)` | FocusMilestone |
| `IdleStarted` | IdleStarted |
| `IdleEnded` | IdleEnded |
| `FullscreenEntered` | FullscreenEntered |
| `FullscreenExited` | FullscreenExited |

### **15.4. Trigger helper**

```rust
impl BehaviorTrigger {
    pub fn is_user_initiated(&self) -> bool {
        matches!(self.source, BehaviorTriggerSource::User)
    }

    pub fn is_proactive(&self) -> bool {
        matches!(
            self.trigger_type,
            BehaviorTriggerType::DailyGreeting
                | BehaviorTriggerType::PeriodicCheckIn
                | BehaviorTriggerType::FocusMilestone
                | BehaviorTriggerType::IdleEnded
                | BehaviorTriggerType::RelationshipMilestone
        )
    }
}
```

---

## **16. Decision Pipeline**

### **16.1. Pipeline tổng thể**

```text
BehaviorTrigger
  ↓
Validate trigger
  ↓
Compose BehaviorContext
  ↓
Resolve EffectiveBehaviorMode
  ↓
Evaluate UserRules
  ↓
Evaluate Mode + Privacy Policy
  ↓
Evaluate Cooldown
  ↓
Evaluate Daily Budget
  ↓
Select BehaviorAction
  ↓
Route Action
  ↓
Record cooldown/budget
  ↓
Audit
```

### **16.2. Action selection**

```rust
pub struct BehaviorDecisionEngine;

impl BehaviorDecisionEngine {
    pub fn select_action(
        &self,
        trigger: &BehaviorTrigger,
        ctx: &BehaviorContext,
        policy: PolicyDecision,
    ) -> BehaviorAction {
        match policy {
            PolicyDecision::Block { .. } => BehaviorAction::Silent,

            PolicyDecision::Delay {
                delay_seconds,
                reason,
            } => BehaviorAction::ScheduleNext {
                event_type: trigger.trigger_type,
                delay_seconds,
                reason,
            },

            PolicyDecision::Downgrade { max_level, .. } => {
                self.select_downgraded_action(trigger, ctx, max_level)
            }

            PolicyDecision::Allow { .. } => {
                self.select_default_action(trigger, ctx)
            }
        }
    }

    fn select_default_action(
        &self,
        trigger: &BehaviorTrigger,
        ctx: &BehaviorContext,
    ) -> BehaviorAction {
        match trigger.trigger_type {
            BehaviorTriggerType::UserChat => BehaviorAction::AiInteraction {
                interaction_type: "direct_chat".into(),
                user_message: trigger.payload
                    .get("message")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                trigger_context: trigger.payload.clone(),
            },

            BehaviorTriggerType::FocusMilestone => BehaviorAction::AiInteraction {
                interaction_type: "focus_milestone".into(),
                user_message: None,
                trigger_context: trigger.payload.clone(),
            },

            BehaviorTriggerType::DailyGreeting => BehaviorAction::AiInteraction {
                interaction_type: "daily_greeting".into(),
                user_message: None,
                trigger_context: trigger.payload.clone(),
            },

            BehaviorTriggerType::UserClick => BehaviorAction::AnimationReaction {
                animation_id: "reaction_attention".into(),
                expression: Some("surprised".into()),
                priority: 50,
            },

            BehaviorTriggerType::UserPet => BehaviorAction::Composite {
                actions: vec![
                    BehaviorAction::AnimationReaction {
                        animation_id: "reaction_happy".into(),
                        expression: Some("happy".into()),
                        priority: 60,
                    },
                    BehaviorAction::LocalBubble {
                        message_template_id: "pet_reaction_happy".into(),
                        emotion: "happy".into(),
                        duration_ms: 3000,
                    },
                ],
            },

            _ => BehaviorAction::Silent,
        }
    }
}
```

### **16.3. Downgraded action**

```rust
fn select_downgraded_action(
    &self,
    trigger: &BehaviorTrigger,
    _ctx: &BehaviorContext,
    max_level: ProactivityLevel,
) -> BehaviorAction {
    match max_level {
        ProactivityLevel::Silent => BehaviorAction::Silent,

        ProactivityLevel::Ambient => BehaviorAction::AnimationReaction {
            animation_id: "ambient_attention".into(),
            expression: Some("caring".into()),
            priority: 20,
        },

        ProactivityLevel::Bubble => BehaviorAction::LocalBubble {
            message_template_id: template_for_trigger(trigger.trigger_type),
            emotion: "caring".into(),
            duration_ms: 5000,
        },

        ProactivityLevel::Notification => BehaviorAction::Notification {
            title_template_id: "default_title".into(),
            body_template_id: template_for_trigger(trigger.trigger_type),
            level: 3,
        },
    }
}
```

---

## **17. Behavior Action Routing**

### **17.1. Action router**

```rust
pub struct BehaviorActionRouter {
    ai: Arc<aiorchestrator>,
    overlay: Arc<overlaywindowmanager>,
    animation: Arc<animationdirector>,
    scheduler: Arc<behavioreventscheduler>,
    privacy: Arc<privacymanager>,
}

impl BehaviorActionRouter {
    pub async fn route(
        &self,
        action: BehaviorAction,
        ctx: &BehaviorContext,
    ) -> Result<vec<routedactionresult>> {
        match action {
            BehaviorAction::Silent => Ok(vec![RoutedActionResult {
                action_type: "silent".into(),
                status: RoutedActionStatus::Skipped,
                reason: Some("silent_action".into()),
            }]),

            BehaviorAction::LocalBubble {
                message_template_id,
                emotion,
                duration_ms,
            } => {
                self.route_local_bubble(message_template_id, emotion, duration_ms, ctx).await
            }

            BehaviorAction::AiInteraction {
                interaction_type,
                user_message,
                trigger_context,
            } => {
                self.route_ai(interaction_type, user_message, trigger_context, ctx).await
            }

            BehaviorAction::AnimationReaction {
                animation_id,
                expression,
                priority,
            } => {
                self.route_animation(animation_id, expression, priority).await
            }

            BehaviorAction::ScheduleNext {
                event_type,
                delay_seconds,
                reason,
            } => {
                self.route_schedule(event_type, delay_seconds, reason).await
            }

            BehaviorAction::Notification { .. } => {
                self.route_notification(action, ctx).await
            }

            BehaviorAction::Composite { actions } => {
                let mut results = Vec::new();
                for child in actions {
                    results.extend(self.route(child, ctx).await?);
                }
                Ok(results)
            }
        }
    }
}
```

### **17.2. Local bubble routing**

```rust
async fn route_local_bubble(
    &self,
    template_id: String,
    emotion: String,
    duration_ms: u32,
    ctx: &BehaviorContext,
) -> Result<vec<routedactionresult>> {
    if matches!(
        ctx.mode,
        EffectiveBehaviorMode::Meeting
            | EffectiveBehaviorMode::Gaming
            | EffectiveBehaviorMode::Private
            | EffectiveBehaviorMode::Restricted
    ) {
        return Ok(vec![RoutedActionResult {
            action_type: "local_bubble".into(),
            status: RoutedActionStatus::Blocked,
            reason: Some("mode_blocks_bubble".into()),
        }]);
    }

    let message = resolve_behavior_template(&template_id, ctx);

    self.overlay.show_bubble(BubbleContent {
        message,
        duration_ms,
        emotion: Some(emotion),
    }).await?;

    Ok(vec![RoutedActionResult {
        action_type: "local_bubble".into(),
        status: RoutedActionStatus::Applied,
        reason: None,
    }])
}
```

### **17.3. AI routing**

```rust
async fn route_ai(
    &self,
    interaction_type: String,
    user_message: Option<string>,
    trigger_context: serde_json::Value,
    ctx: &BehaviorContext,
) -> Result<vec<routedactionresult>> {
    let req = AIInteractionRequest {
        request_id: Uuid::new_v4().to_string(),
        interaction_id: Uuid::new_v4().to_string(),
        interaction_type: parse_ai_interaction_type(&interaction_type)?,
        active_character_id: ctx.active_character_id.clone(),
        user_message,
        quick_action_id: None,
        trigger_context: Some(trigger_context),
        created_at_ms: now_ms(),
    };

    let result = self.ai.handle_interaction(req).await;

    match result {
        Ok(_) => Ok(vec![RoutedActionResult {
            action_type: "ai_interaction".into(),
            status: RoutedActionStatus::Applied,
            reason: None,
        }]),
        Err(e) => Ok(vec![RoutedActionResult {
            action_type: "ai_interaction".into(),
            status: RoutedActionStatus::Failed,
            reason: Some(e.to_string()),
        }]),
    }
}
```

---

## **18. Integration với AI Interaction**

### **18.1. AI trigger types**

Behavior Orchestrator gọi AI cho:

```text
- direct_chat
- quick_action nếu cần cá nhân hóa
- daily_greeting
- focus_milestone
- periodic_checkin
- idle_return
- emotional_support proactive nếu policy cho phép
```

### **18.2. Behavior không bypass AI guards**

```text
Behavior → AIOrchestrator → AIPrivacyGuard → CostTracker → Provider
```

Behavior không gọi provider trực tiếp.

### **18.3. AI next_action feedback**

AI response có thể đề xuất:

```json
{
  "next_action": {
    "type": "schedule_checkin",
    "delay_minutes": 45,
    "reason": "Check again after another focus interval."
  }
}
```

Behavior Orchestrator nhận qua OperationRouter hoặc event:

```text
AI response completed
  ↓
If next_action schedule_checkin
  ↓
BehaviorEventScheduler.schedule(...)
```

### **18.4. AI proactive guard**

Proactive AI chỉ được gọi khi:

```text
- Trigger proactive được policy allow.
- Cooldown OK.
- Budget OK.
- Privacy allows AI.
- Mode allows proactive.
- Overlay behavior allows visible response.
```

---

## **19. Integration với State System**

### **19.1. State đọc vào behavior context**

Behavior dùng state để quyết định:

```text
- energy thấp → ít proactive hơn
- mood thấp → dùng tone caring hơn
- affinity cao → greeting thân mật hơn
- patience thấp → tránh trêu/chọc
```

### **19.2. Behavior không mutate state trực tiếp**

Nếu behavior cần ảnh hưởng state, gửi mutation request:

```rust
StateMutationRequest {
    source: MutationSource::UserAction,
    proposed_delta: StateDelta { mood: 1, ..Default::default() },
    reason: Some("user_pet_reaction".into()),
    ...
}
```

### **19.3. State milestone trigger**

```text
StateEvent::MilestoneReached
  ↓
BehaviorTrigger::RelationshipMilestone
  ↓
Policy check
  ↓
Maybe local bubble or AI response
```

### **19.4. Mood-aware template**

```rust
pub fn select_template_for_state(
    trigger: BehaviorTriggerType,
    state: &CharacterState,
) -> String {
    if state.emotional.energy < 0 {
        return format!("{:?}_sleepy", trigger).to_lowercase();
    }

    if state.emotional.mood > 1 {
        return format!("{:?}_happy", trigger).to_lowercase();
    }

    format!("{:?}_neutral", trigger).to_lowercase()
}
```

---

## **20. Integration với Desktop Awareness**

### **20.1. Awareness events consumed**

| **Awareness event** | **Behavior reaction** |
|---|---|
| **ModeChanged** | Update effective mode, maybe animation switch |
| **SessionMilestone** | Maybe focus reminder |
| **IdleStarted** | Maybe sleep animation |
| **IdleEnded** | Maybe welcome back |
| **FullscreenEntered** | Suppress proactive |
| **FullscreenExited** | Restore normal behavior |
| **AppCategoryChanged** | Reset/adjust session behavior |

### **20.2. Focus milestone**

```text
Awareness emits SessionMilestone(45, developer_tool)
  ↓
Behavior trigger FocusMilestone
  ↓
Policy allows Ambient in Focus
  ↓
Either:
  - Local ambient animation
  - AI focus reminder if allowed
```

### **20.3. Mode transition animation**

Mode changes may route animation without bubble:

```text
Normal → Focus
  - switch idle to calm/focused
  - no bubble by default

Focus → Idle
  - sleep/relax idle

Any → Gaming/Meeting
  - hide or minimal animation
```

---

## **21. Integration với Overlay Window**

### **21.1. Overlay visibility matters**

Nếu overlay hidden:

```text
- Không show bubble.
- Không play visible animation.
- Có thể schedule retry.
- Direct chat still possible if chat panel open.
```

### **21.2. Overlay events consumed**

| **Overlay event** | **Behavior reaction** |
|---|---|
| **Shown** | Maybe greeting if recently hidden long |
| **Hidden** | Stop proactive visible actions |
| **Moved** | No behavior |
| **BubbleHidden** | Can schedule next bubble |
| **ChatPanelOpened** | Direct chat mode |
| **ChatPanelClosed** | Return idle behavior |

### **21.3. Bubble policy**

```text
Bubble allowed only if:
- overlay visible
- mode allows bubble
- privacy allows content display
- not in cooldown
- not fullscreen blocking
```

---

## **22. Integration với Privacy System**

### **22.1. Privacy modes override behavior**

| **Privacy mode** | **Behavior effect** |
|---|---|
| **Private** | Block proactive, memory/state relationship changes indirectly blocked |
| **Quiet** | Block proactive and notifications |
| **Streamer** | Block sensitive bubble, block proactive |
| **Restricted** | Block AI, memory, proactive, notification |
| **Normal** | Use standard policy |

### **22.2. Privacy event handling**

```text
PrivacyEvent::ModeChanged(private=true)
  ↓
Behavior clears pending proactive events
  ↓
Scheduler pauses proactive events
  ↓
Overlay hides sensitive UI
```

### **22.3. Fail-closed**

Nếu không đọc được privacy settings:

```text
- Block proactive.
- Allow only local user-initiated animation.
- Do not call AI.
```

---

## **23. Backend: BehaviorOrchestrator**

### **23.1. Module trách nhiệm**

```rust
pub struct BehaviorOrchestrator {
    trigger_rx: Mutex<mpsc::receiver<behaviortrigger>>,
    trigger_tx: mpsc::Sender<behaviortrigger>,

    mode_manager: Arc<modemanager>,
    context_composer: Arc<behaviorcontextcomposer>,
    policy: Arc<behaviorpolicyengine>,
    decision_engine: Arc<behaviordecisionengine>,
    action_router: Arc<behavioractionrouter>,

    scheduler: Arc<behavioreventscheduler>,
    cooldown: Arc<cooldownmanager>,
    budget: Arc<interactionbudgetmanager>,
    rules: Arc<userrulesengine>,

    audit: Arc<behaviorauditlogger>,
    event_bus: Arc<behavioreventbus>,
}
```

### **23.2. Public methods**

```rust
impl BehaviorOrchestrator {
    pub async fn init(config: BehaviorConfig) -> Result<self>;

    pub async fn start(&self) -> Result<()>;
    pub async fn stop(&self) -> Result<()>;

    pub async fn submit_trigger(&self, trigger: BehaviorTrigger) -> Result<behaviorresult>;

    pub async fn handle_user_chat(&self, message: String) -> Result<behaviorresult>;
    pub async fn handle_quick_action(&self, action_id: String) -> Result<behaviorresult>;
    pub async fn handle_user_pet(&self) -> Result<behaviorresult>;

    pub async fn schedule_event(&self, event: ScheduledBehaviorEvent) -> Result<()>;
    pub async fn cancel_event(&self, event_id: String) -> Result<()>;

    pub async fn get_status(&self) -> Result<behaviorstatus>;
    pub async fn get_budget_today(&self) -> Result<behaviordailybudget>;
    pub async fn get_cooldowns(&self) -> Result<vec<cooldownsnapshot>>;

    pub async fn list_user_rules(&self) -> Result<vec<userrule>>;
    pub async fn upsert_user_rule(&self, rule: UserRule) -> Result<()>;
    pub async fn delete_user_rule(&self, rule_id: String) -> Result<()>;

    pub fn subscribe_events(&self) -> broadcast::Receiver<behaviorevent>;
}
```

### **23.3. Main handle flow**

```rust
pub async fn submit_trigger(
    &self,
    trigger: BehaviorTrigger,
) -> Result<behaviorresult> {
    self.audit.log_trigger_received(&trigger).await?;

    let ctx = self.context_composer.compose(&trigger).await?;

    let policy_decision = self.policy.evaluate(&trigger, &ctx).await;

    let action = self.decision_engine.select_action(
        &trigger,
        &ctx,
        policy_decision.clone(),
    );

    let decision = BehaviorDecision {
        decision_id: Uuid::new_v4().to_string(),
        trigger_id: trigger.trigger_id.clone(),
        action: action.clone(),
        allowed: !matches!(policy_decision, PolicyDecision::Block { .. }),
        block_reason: match &policy_decision {
            PolicyDecision::Block { reason } => Some(reason.clone()),
            _ => None,
        },
        debug_reason: policy_debug_reason(&policy_decision),
        created_at: Utc::now(),
    };

    let routed = self.action_router.route(action, &ctx).await?;

    if decision.allowed && trigger.is_proactive() {
        self.cooldown.record(trigger.trigger_type).await?;
        self.budget.record(trigger.trigger_type).await?;
    }

    let result = BehaviorResult {
        decision: decision.clone(),
        routed_actions: routed,
        warnings: vec![],
    };

    self.audit.log_decision(&result).await?;
    self.event_bus.emit(BehaviorEvent::DecisionMade {
        decision,
    });

    Ok(result)
}
```

### **23.4. Behavior loop**

```rust
pub async fn run_loop(self: Arc<self>) {
    loop {
        let trigger = {
            let mut rx = self.trigger_rx.lock().await;
            rx.recv().await
        };

        let Some(trigger) = trigger else {
            break;
        };

        if let Err(e) = self.submit_trigger(trigger).await {
            tracing::warn!("behavior trigger failed: {}", e);
        }
    }
}
```

---

## **24. IPC Contract**

### **24.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `behavior_submit_trigger` | `BehaviorTrigger` | `BehaviorResult` |
| `behavior_user_chat` | `{ message: string }` | `BehaviorResult` |
| `behavior_quick_action` | `{ action_id: string }` | `BehaviorResult` |
| `behavior_user_pet` | `{}` | `BehaviorResult` |
| `behavior_get_status` | `{}` | `BehaviorStatus` |
| `behavior_get_budget_today` | `{}` | `BehaviorDailyBudget` |
| `behavior_get_cooldowns` | `{}` | `CooldownSnapshot[]` |
| `behavior_schedule_event` | `ScheduledBehaviorEvent` | `void` |
| `behavior_cancel_event` | `{ event_id: string }` | `void` |
| `behavior_list_rules` | `{}` | `UserRule[]` |
| `behavior_upsert_rule` | `UserRule` | `void` |
| `behavior_delete_rule` | `{ rule_id: string }` | `void` |
| `behavior_debug_last_decisions` | `{ limit: number }` | `BehaviorDecision[]` |

### **24.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `behavior_trigger_received` | `BehaviorTrigger` | Debug panel |
| `behavior_decision_made` | `BehaviorDecision` | Debug panel |
| `behavior_action_routed` | `RoutedActionResult` | Debug panel |
| `behavior_blocked` | `{ trigger_id, reason }` | Debug panel |
| `behavior_budget_updated` | `BehaviorDailyBudget` | Settings UI |
| `behavior_cooldown_updated` | `CooldownSnapshot` | Settings UI |
| `behavior_rule_changed` | `{ rule_id }` | Settings UI refresh |

### **24.3. TypeScript types**

```typescript
export type BehaviorTriggerType =
  | "user_chat"
  | "user_click"
  | "user_pet"
  | "user_drag_start"
  | "user_drag_end"
  | "quick_action"
  | "mode_changed"
  | "app_category_changed"
  | "focus_milestone"
  | "idle_started"
  | "idle_ended"
  | "fullscreen_entered"
  | "fullscreen_exited"
  | "daily_greeting"
  | "periodic_check_in"
  | "scheduled_reminder"
  | "state_changed"
  | "relationship_milestone"
  | "privacy_mode_changed"
  | "overlay_shown"
  | "overlay_hidden"
  | "error_recovery";

export type EffectiveBehaviorMode =
  | "normal"
  | "focus"
  | "gaming"
  | "meeting"
  | "watching"
  | "idle"
  | "quiet"
  | "private"
  | "streamer"
  | "restricted";

export interface BehaviorTrigger {
  trigger_id: string;
  trigger_type: BehaviorTriggerType;
  source: string;
  priority: "silent" | "low" | "normal" | "high" | "critical";
  payload: unknown;
  created_at: string;
}

export interface BehaviorDecision {
  decision_id: string;
  trigger_id: string;
  action: unknown;
  allowed: boolean;
  block_reason?: string | null;
  debug_reason: string;
  created_at: string;
}
```

---

## **25. Frontend Behavior UI**

### **25.1. Settings sections**

```text
Behavior Settings
├─ Proactivity
│  ├─ Enable proactive behavior
│  ├─ Max proactive per day
│  ├─ Min cooldown between proactive
│  └─ Focus reminder frequency
│
├─ Modes
│  ├─ Focus behavior
│  ├─ Gaming behavior
│  ├─ Meeting behavior
│  └─ Watching behavior
│
├─ User Rules
│  ├─ Rule list
│  ├─ Add rule
│  └─ Rule priority
│
├─ Scheduler
│  ├─ Daily greeting time
│  ├─ Check-in interval
│  └─ Enabled events
│
└─ Debug
   ├─ Last decisions
   ├─ Block reasons
   ├─ Cooldowns
   └─ Budget usage
```

### **25.2. Behavior store**

```typescript
interface BehaviorStore {
  status: BehaviorStatus | null;
  budget: BehaviorDailyBudget | null;
  lastDecisions: BehaviorDecision[];

  refreshStatus: () => Promise<void>;
  refreshBudget: () => Promise<void>;
  sendUserPet: () => Promise<void>;
  quickAction: (actionId: string) => Promise<void>;
}

export const useBehaviorStore = create<behaviorstore>((set, get) => ({
  status: null,
  budget: null,
  lastDecisions: [],

  refreshStatus: async () => {
    const status = await invoke<behaviorstatus>("behavior_get_status");
    set({ status });
  },

  refreshBudget: async () => {
    const budget = await invoke<behaviordailybudget>("behavior_get_budget_today");
    set({ budget });
  },

  sendUserPet: async () => {
    await invoke("behavior_user_pet");
  },

  quickAction: async (actionId) => {
    await invoke("behavior_quick_action", { action_id: actionId });
  },
}));
```

### **25.3. Debug panel**

```text
Behavior Debug Panel
┌─────────────────────────────────────────────┐
│ Trigger: focus_milestone                     │
│ Mode: focus                                  │
│ Decision: downgraded to ambient              │
│ Reason: focus_mode_downgrade                 │
│ Cooldown: recorded                           │
│ Budget: focus_reminders 1/4                  │
└─────────────────────────────────────────────┘
```

---

## **26. Logging & Audit**

### **26.1. Behavior audit schema**

```sql
CREATE TABLE behavior_audit_log (
    id TEXT PRIMARY KEY,
    trigger_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    source TEXT NOT NULL,
    priority TEXT NOT NULL,

    decision_id TEXT,
    action_type TEXT,
    allowed INTEGER NOT NULL,
    block_reason TEXT,
    debug_reason TEXT,

    mode TEXT,
    character_id TEXT,

    created_at DATETIME NOT NULL
);

CREATE INDEX idx_behavior_audit_created ON behavior_audit_log(created_at);
CREATE INDEX idx_behavior_audit_trigger ON behavior_audit_log(trigger_type);
```

### **26.2. Cooldown table**

```sql
CREATE TABLE behavior_cooldown (
    key TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    scope TEXT NOT NULL,
    last_fired_at DATETIME NOT NULL
);
```

### **26.3. Budget table**

```sql
CREATE TABLE behavior_daily_budget (
    date TEXT PRIMARY KEY,
    proactive_used INTEGER NOT NULL DEFAULT 0,
    focus_reminders_used INTEGER NOT NULL DEFAULT 0,
    greetings_used INTEGER NOT NULL DEFAULT 0,
    notifications_used INTEGER NOT NULL DEFAULT 0,

    max_proactive_per_day INTEGER NOT NULL DEFAULT 8,
    max_focus_reminders_per_day INTEGER NOT NULL DEFAULT 4,
    max_greetings_per_day INTEGER NOT NULL DEFAULT 2,
    max_notifications_per_day INTEGER NOT NULL DEFAULT 1
);
```

### **26.4. Scheduled events table**

```sql
CREATE TABLE behavior_scheduled_event (
    event_id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    scheduled_at DATETIME NOT NULL,
    run_at DATETIME NOT NULL,
    repeat_json TEXT,
    status TEXT NOT NULL
);

CREATE INDEX idx_behavior_scheduled_run_at ON behavior_scheduled_event(run_at);
```

### **26.5. User rules table**

```sql
CREATE TABLE behavior_user_rule (
    rule_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    priority INTEGER NOT NULL,
    condition_json TEXT NOT NULL,
    action_json TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

---

## **27. Error Handling**

### **27.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum BehaviorError {
    #[error("Invalid trigger: {0}")]
    InvalidTrigger(String),

    #[error("Context compose failed: {0}")]
    ContextComposeFailed(String),

    #[error("Policy evaluation failed: {0}")]
    PolicyFailed(String),

    #[error("Action routing failed: {0}")]
    ActionRoutingFailed(String),

    #[error("Scheduler failed: {0}")]
    SchedulerFailed(String),

    #[error("Cooldown store failed: {0}")]
    CooldownStoreFailed(String),

    #[error("Budget store failed: {0}")]
    BudgetStoreFailed(String),

    #[error("User rule invalid: {0}")]
    InvalidUserRule(String),
}
```

### **27.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Invalid trigger | Drop trigger, log warning |
| Context compose fail | Fail silent |
| Privacy unavailable | Block proactive, allow local user action only |
| Cooldown store fail | Conservative block proactive |
| Budget store fail | Conservative block proactive |
| AI routing fail | Fallback local template if safe |
| Overlay hidden | Skip bubble, maybe schedule retry |
| Scheduler fail | Log, no crash |
| Rule parse fail | Disable invalid rule |

### **27.3. Fail silent policy**

```text
Nếu lỗi xảy ra với proactive:
- Không hiện bubble.
- Không notification.
- Không gọi AI.
- Ghi debug log nếu enabled.

Nếu lỗi xảy ra với user action:
- Dùng local fallback nếu có.
- Không làm app crash.
```

---

## **28. Performance Considerations**

### **28.1. CPU budget**

```text
Behavior Orchestrator không chạy mỗi frame.
Chỉ chạy khi:
- có trigger event
- scheduler tick mỗi 30s
- mode/state/privacy event

Target:
- submit_trigger < 5ms nếu không gọi AI
- policy evaluation < 1ms
- rule evaluation < 2ms với < 100 rules
```

### **28.2. Memory footprint**

```text
- User rules: < 100KB
- Cooldown map: < 10KB
- Budget snapshot: < 1KB
- Recent decisions debug cache: 100 items, < 100KB
```

### **28.3. Concurrency**

```text
- User-initiated triggers có priority cao hơn proactive.
- Chỉ xử lý một proactive visible action tại một thời điểm.
- Direct chat có thể cancel pending proactive.
- Scheduler không dispatch duplicate same event_id.
```

### **28.4. Trigger queue policy**

```rust
pub struct TriggerQueuePolicy {
    pub max_queue_size: usize,
    pub drop_low_priority_when_full: bool,
}

impl Default for TriggerQueuePolicy {
    fn default() -> Self {
        Self {
            max_queue_size: 128,
            drop_low_priority_when_full: true,
        }
    }
}
```

---

## **29. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── behavior/
│               ├── mod.rs
│               ├── types.rs
│               ├── orchestrator.rs
│               ├── trigger_router.rs
│               ├── context_composer.rs
│               ├── mode_manager.rs
│               ├── proactivity.rs
│               ├── policy.rs
│               ├── decision.rs
│               ├── action_router.rs
│               ├── scheduler.rs
│               ├── cooldown.rs
│               ├── budget.rs
│               ├── user_rules.rs
│               ├── templates.rs
│               ├── events.rs
│               ├── audit.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── behavior_commands.rs
│
├── src/
│   ├── settings/
│   │   └── pages/
│   │       └── Behavior.tsx
│   │
│   ├── behavior/
│   │   ├── components/
│   │   │   ├── BehaviorDebugPanel.tsx
│   │   │   ├── UserRulesEditor.tsx
│   │   │   ├── BudgetPanel.tsx
│   │   │   └── CooldownPanel.tsx
│   │   └── stores/
│   │       └── behaviorStore.ts
│   │
│   └── shared/
│       └── types/
│           └── behavior.ts
│
├── assets/
│   └── behavior/
│       ├── behavior_templates.json
│       ├── default_rules.json
│       └── cooldown_defaults.json
│
└── docs/
    └── behavior-orchestrator-system.md
```

---

## **30. Implementation Checklist**

### **30.1. P0 Core**

- [ ] Define `BehaviorTrigger`.
- [ ] Define `BehaviorAction`.
- [ ] Define `BehaviorDecision`.
- [ ] Implement `BehaviorOrchestrator`.
- [ ] Implement trigger queue.
- [ ] Implement `BehaviorContextComposer`.
- [ ] Implement `ModeManager`.
- [ ] Implement `BehaviorPolicyEngine`.
- [ ] Implement `BehaviorDecisionEngine`.
- [ ] Implement `BehaviorActionRouter`.

### **30.2. P0 Proactivity**

- [ ] Implement `ProactivityController`.
- [ ] Block proactive in Gaming/Meeting/Private/Quiet/Streamer/Restricted.
- [ ] Downgrade proactive in Focus/Watching.
- [ ] Implement global proactive cooldown.
- [ ] Implement daily proactive budget.
- [ ] Implement focus milestone behavior.

### **30.3. P0 Scheduler**

- [ ] Implement scheduled event table.
- [ ] Scheduler tick every 30s.
- [ ] Daily greeting schedule.
- [ ] Focus milestone follow-up.
- [ ] Sleep/resume stale event handling.

### **30.4. P0 Integration**

- [ ] Subscribe Desktop Awareness events.
- [ ] Subscribe Privacy events.
- [ ] Subscribe State milestone events.
- [ ] Subscribe Overlay events.
- [ ] Route AI interactions through AIOrchestrator.
- [ ] Route local bubble through OverlayWindowManager.
- [ ] Route reaction animation through AnimationDirector.

### **30.5. P1 User Rules**

- [ ] Define `UserRule`.
- [ ] Implement rule condition evaluator.
- [ ] Implement rule action conversion.
- [ ] Load default rules.
- [ ] Settings UI for rules.

### **30.6. P1 UI**

- [ ] Behavior settings page.
- [ ] Budget panel.
- [ ] Cooldown panel.
- [ ] Debug decision viewer.
- [ ] Rule editor.

### **30.7. P2 Polish**

- [ ] Personality-adjusted proactive frequency.
- [ ] Mood-aware template selection.
- [ ] Advanced scheduler UI.
- [ ] Rule import/export.
- [ ] Behavior simulation/test mode.
- [ ] Adaptive proactive tuning from user feedback.

---

## **31. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Behavior Orchestrator** | Module điều phối hành vi cấp cao của character. |
| **Trigger** | Event đầu vào làm phát sinh hành vi. |
| **Behavior Action** | Action đã được chọn sau policy: AI, bubble, animation, silent. |
| **Proactivity** | Hành vi character chủ động khi user không yêu cầu trực tiếp. |
| **Cooldown** | Khoảng chặn để hành vi không lặp quá dày. |
| **Behavior Budget** | Giới hạn số lần proactive mỗi ngày. |
| **EffectiveBehaviorMode** | Mode hành vi cuối cùng sau khi gộp Awareness + Privacy + override. |
| **User Rule** | Quy tắc user cấu hình để override behavior policy. |
| **Policy Engine** | Lớp kiểm tra mode/privacy/cooldown/budget trước action. |
| **Scheduler** | Bộ lên lịch behavior trigger theo thời gian. |
| **Downgrade** | Giảm mức can thiệp, ví dụ bubble thành ambient animation. |
| **Fail silent** | Khi lỗi, không làm phiền user. |

---

# **Phụ lục A: Flow proactive focus milestone**

```text
DesktopAwareness detects session milestone:
  category = developer_tool
  duration = 45 minutes
       ↓
Emit AwarenessEvent::SessionMilestone
       ↓
BehaviorOrchestrator maps to:
  BehaviorTriggerType::FocusMilestone
       ↓
Compose BehaviorContext:
  mode = Focus
  privacy = Normal
  overlay_visible = true
  state.energy = normal
  budget.focus_reminders_used = 0/4
  cooldown.focus_milestone = expired
       ↓
Policy evaluation:
  - Not private
  - Not quiet
  - Not gaming/meeting
  - Cooldown OK
  - Budget OK
  - Focus mode requires downgrade
       ↓
Decision:
  Downgrade Bubble → Ambient
       ↓
Action:
  AnimationReaction {
    animation_id: "ambient_attention",
    expression: "caring"
  }
       ↓
Record:
  cooldown FocusMilestone
  budget focus_reminders_used += 1
       ↓
Audit:
  reason = focus_mode_downgrade
```

---

# **Phụ lục B: Flow mode transition reaction**

```text
DesktopAwareness emits:
  ModeChanged { from: Normal, to: Gaming }
       ↓
Behavior trigger:
  type = ModeChanged
  source = Awareness
       ↓
Compose context:
  effective_mode = Gaming
       ↓
Policy:
  proactive blocked
       ↓
Action:
  Composite:
    - Silent
    - Optional AnimationReaction minimal if overlay visible
       ↓
Overlay system separately handles fullscreen:
  hide overlay for fullscreen game
       ↓
Behavior records:
  mode_blocks_proactive: gaming
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. BehaviorTrigger mẫu**

```json
{
  "trigger_id": "trig_focus_45",
  "trigger_type": "focus_milestone",
  "source": "awareness",
  "priority": "low",
  "payload": {
    "category": "developer_tool",
    "duration_minutes": 45
  },
  "created_at": "2026-05-27T00:10:00Z"
}
```

## **C.2. BehaviorDecision mẫu**

```json
{
  "decision_id": "dec_001",
  "trigger_id": "trig_focus_45",
  "action": {
    "type": "animation_reaction",
    "animation_id": "ambient_attention",
    "expression": "caring",
    "priority": 20
  },
  "allowed": true,
  "block_reason": null,
  "debug_reason": "focus_mode_downgrade",
  "created_at": "2026-05-27T00:10:02Z"
}
```

## **C.3. BehaviorDailyBudget mẫu**

```json
{
  "date": "2026-05-27",
  "proactive_used": 2,
  "focus_reminders_used": 1,
  "greetings_used": 1,
  "notifications_used": 0,
  "max_proactive_per_day": 8,
  "max_focus_reminders_per_day": 4,
  "max_greetings_per_day": 2,
  "max_notifications_per_day": 1
}
```

## **C.4. ScheduledBehaviorEvent mẫu**

```json
{
  "event_id": "sched_daily_greeting",
  "trigger_type": "daily_greeting",
  "payload": {
    "time_bucket": "morning"
  },
  "scheduled_at": "2026-05-27T00:00:00Z",
  "run_at": "2026-05-27T08:30:00Z",
  "repeat": {
    "type": "daily_at",
    "hour": 8,
    "minute": 30
  },
  "status": "pending"
}
```

## **C.5. UserRule mẫu**

```json
{
  "rule_id": "rule_no_proactive_night",
  "name": "No proactive at night",
  "enabled": true,
  "priority": 10,
  "condition": {
    "type": "time_between",
    "start_hour": 23,
    "end_hour": 7
  },
  "action": {
    "type": "block",
    "reason": "night_quiet_hours"
  },
  "created_at": "2026-05-27T00:10:00Z",
  "updated_at": "2026-05-27T00:10:00Z"
}
```

## **C.6. RoutedActionResult mẫu**

```json
{
  "action_type": "animation_reaction",
  "status": "applied",
  "reason": null
}
```

---

**Tài liệu này là source of truth cho Behavior Orchestrator System. Mọi hành vi chủ động hoặc phản ứng cấp cao phải đi qua BehaviorOrchestrator. Không subsystem nào được tự proactive với user mà bỏ qua mode policy, privacy guard, cooldown và daily budget.**