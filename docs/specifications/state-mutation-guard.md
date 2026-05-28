# State Mutation Guard System

> Tài liệu thiết kế chính thức cho **State Mutation Guard** của **Chiro-Pet**.
> Hệ thống này là **lớp bảo vệ bắt buộc** giữa bất kỳ subsystem nào (Utility AI, LLM, User Interaction, Behavior Orchestrator) và `StateStore`. Mọi mutation phải đi qua Guard, không có ngoại lệ.
>
> **Nguyên tắc lõi:** Guard là **single point of write** cho `CharacterState`. Nó enforce range, daily cap, personality modifier, mode policy và privacy policy trước khi commit. Nếu Guard bị bypass, toàn bộ tính ổn định của state system sẽ sụp đổ.

---

## 1. Mục tiêu & Phạm vi

### 1.1. Mục tiêu

StateMutationGuard phải:

- Là **single point of write** cho `CharacterState`.
- Enforce **range** theo newtype pattern.
- Enforce **daily cap** mỗi field per character per day.
- Apply **personality modifier** theo `CharacterProfile`.
- Apply **mode policy** theo `EffectiveBehaviorMode`.
- Apply **privacy policy** theo Private/Quiet/Restricted modes.
- Emit `state_changed` event sau commit.
- Ghi audit log cho mỗi mutation (in-memory ring buffer + optional persist).
- Reject invalid mutation với error rõ ràng.
- Reset daily counters mỗi 0:00 local time.
- Thread-safe (multiple subsystems có thể đồng thời request).

### 1.2. Phạm vi

Tài liệu này bao quát:
- Mutation pipeline.
- Range enforcement.
- Daily cap logic.
- Personality/mode/privacy hooks.
- Event emission.
- Audit log.
- Unit test plan.
- Migration cho legacy state range.

Tài liệu này **không** mô tả chi tiết:
- StateStore persistence.
- DecayEngine logic (chỉ tương tác qua Guard).
- CharacterProfile schema (xem `character-profile.md`).
- Behavior Orchestrator flow.

---

## 2. Nguyên tắc thiết kế

### 2.1. Nguyên tắc bất biến

| # | Nguyên tắc | Ý nghĩa |
|---|---|---|
| **1** | **Single point of write** | Mọi mutation phải qua Guard. Không có ngoại lệ. |
| **2** | **Source attribution** | Mọi mutation phải có `source` rõ ràng (AI/UI/Behavior/Decay/System). |
| **3** | **Fail-safe default** | Nếu stage nào fail, mutation bị reject, state không đổi. |
| **4** | **Idempotent commit** | Same request 2 lần phải có kết quả deterministic. |
| **5** | **Auditable** | Mỗi mutation ghi audit log với reason. |
| **6** | **No silent drop** | Reject phải emit error event để debugger thấy. |
| **7** | **Personality-aware** | Modifier phải áp dụng trước khi clamp final. |
| **8** | **Privacy-respecting** | Private/Restricted mode chặn relationship mutation. |
| **9** | **Thread-safe** | Dùng Mutex/RwLock, không race condition. |
| **10** | **Testable** | Mỗi stage là pure function khi có thể. |

### 2.2. Anti-pattern cần tránh

- ❌ Subsystem ghi state trực tiếp qua `StateStore::patch()`.
- ❌ Guard tự gọi AI hoặc Behavior Orchestrator (đảo ngược dependency).
- ❌ Áp dụng personality modifier sau khi clamp (sẽ mất range).
- ❌ Reset daily counter giữa session.
- ❌ Bỏ qua audit log để "tối ưu performance".
- ❌ Emit event trước khi commit thành công.
- ❌ Hardcode daily cap trong code, không cấu hình được.
- ❌ Cho phép mutation với delta = NaN hoặc Inf.

---

## 3. Vị trí trong kiến trúc

### 3.1. Mutation flow tổng quan

```text
┌─────────────────────────────────────────────────────────┐
│                  MUTATION SOURCES                        │
│  - Utility AI Action result                              │
│  - LLM state_delta proposal                              │
│  - User interaction (click/pet/chat)                     │
│  - DecayEngine tick                                      │
│  - Behavior Orchestrator command                         │
│  - Manual debug command                                  │
└────────────────────────────┬────────────────────────────┘
                             ↓
                  StateMutationRequest
                             ↓
┌─────────────────────────────────────────────────────────┐
│              STATE MUTATION GUARD                        │
│                                                         │
│  Stage 1: Schema Validator                              │
│  Stage 2: Range Clamper                                 │
│  Stage 3: Daily Cap Enforcer                            │
│  Stage 4: Personality Modifier                          │
│  Stage 5: Mode Policy                                   │
│  Stage 6: Privacy Policy                                │
│  Stage 7: Commit & Event Emit                           │
│                                                         │
└────────────────────────────┬────────────────────────────┘
                             ↓
                       StateStore
                             ↓
                  state_changed event
                             ↓
              Frontend / Behavior / Animation
```

### 3.2. Guard không được phép làm gì

- ❌ Gọi LLM.
- ❌ Đọc desktop context.
- ❌ Trigger animation.
- ❌ Mở overlay window.
- ❌ Tự ý mutate mà không có request.
- ❌ Persist state (đó là việc của StateStore).

---

## 4. State Range chuẩn hóa

### 4.1. Range chuẩn theo spec

| Field | Type | Range | Default | Unit |
|---|---|---|---|---|
| **mood** | `i8` | `-3..=3` | `0` | Tâm trạng ngắn hạn |
| **energy** | `i8` | `-3..=3` | `0` | Mức năng lượng |
| **curiosity** | `u8` | `0..=5` | `2` | Mức tò mò |
| **patience** | `u8` | `0..=5` | `3` | Mức kiên nhẫn |
| **confidence** | `u8` | `0..=5` | `2` | Mức tự tin |
| **affinity** | `u8` | `0..=100` | `0` | Mức yêu mến |
| **trust** | `u8` | `0..=100` | `0` | Mức tin tưởng |
| **familiarity** | `u8` | `0..=100` | `0` | Mức thân thuộc |
| **loneliness** | `u8` | `0..=5` | `0` | Mức cô đơn (ẩn) |

### 4.2. Tại sao không dùng range rộng

| Range | Vấn đề |
|---|---|
| **i8 full (-128..127)** | LLM dễ propose delta quá lớn, khó cân bằng |
| **i32/i64** | Overkill, type không enforce gì |
| **f32/f64** | Floating point error, khó persist chính xác |
| **-100..100 cho mood** | Quá rộng, decay khó tự nhiên, mỗi đơn vị không có ý nghĩa rõ |

### 4.3. Daily cap chuẩn

| Field | Daily Cap (delta tuyệt đối) | Lý do |
|---|---|---|
| **mood** | `6` | Đủ swing 1 ngày, không drift quá nhanh |
| **energy** | `6` | Tương tự mood |
| **curiosity** | `3` | Slow change, đặc trưng |
| **patience** | `3` | Slow change |
| **confidence** | `3` | Slow change |
| **affinity** | `5` | Quan hệ build chậm, không cho phép 1 ngày skyrocket |
| **trust** | `3` | Trust build chậm hơn affinity |
| **familiarity** | `5` | Có thể tăng theo thời gian sử dụng |
| **loneliness** | `5` | Có thể tăng nếu bỏ rơi lâu |

---

## 5. Newtype Pattern cho State Fields

### 5.1. Lý do dùng newtype

```rust
// BAD: Type cho phép invalid value
pub struct CharacterState {
    pub mood: i8,        // -128..127 allowed
    pub energy: u8,      // 0..255 allowed
    pub affinity: u8,    // 0..255 allowed
}

// GOOD: Newtype enforce range tại compile time + runtime
pub struct CharacterState {
    pub mood: Mood,
    pub energy: Energy,
    pub affinity: Affinity,
}
```

### 5.2. Mood newtype

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Mood(i8);

impl Mood {
    pub const MIN: i8 = -3;
    pub const MAX: i8 = 3;
    pub const DEFAULT: i8 = 0;

    pub fn new(value: i8) -> Self {
        Self(value.clamp(Self::MIN, Self::MAX))
    }

    pub fn value(&self) -> i8 {
        self.0
    }

    /// Normalize về 0..1 cho Utility AI scoring
    pub fn normalized(&self) -> f32 {
        (self.0 as f32 - Self::MIN as f32) / (Self::MAX - Self::MIN) as f32
    }

    pub fn apply_delta(self, delta: i8) -> Self {
        let raw = (self.0 as i16) + (delta as i16);
        Self::new(raw.clamp(Self::MIN as i16, Self::MAX as i16) as i8)
    }
}

impl Default for Mood {
    fn default() -> Self {
        Self(Self::DEFAULT)
    }
}
```

### 5.3. Energy newtype

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Energy(i8);

impl Energy {
    pub const MIN: i8 = -3;
    pub const MAX: i8 = 3;
    pub const DEFAULT: i8 = 0;

    pub fn new(value: i8) -> Self {
        Self(value.clamp(Self::MIN, Self::MAX))
    }

    pub fn value(&self) -> i8 { self.0 }

    pub fn normalized(&self) -> f32 {
        (self.0 as f32 - Self::MIN as f32) / (Self::MAX - Self::MIN) as f32
    }

    pub fn apply_delta(self, delta: i8) -> Self {
        let raw = (self.0 as i16) + (delta as i16);
        Self::new(raw.clamp(Self::MIN as i16, Self::MAX as i16) as i8)
    }
}
```

### 5.4. Affinity newtype

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Affinity(u8);

impl Affinity {
    pub const MIN: u8 = 0;
    pub const MAX: u8 = 100;
    pub const DEFAULT: u8 = 0;

    pub fn new(value: u8) -> Self {
        Self(value.min(Self::MAX))
    }

    pub fn value(&self) -> u8 { self.0 }

    pub fn normalized(&self) -> f32 {
        self.0 as f32 / Self::MAX as f32
    }

    pub fn apply_delta(self, delta: i16) -> Self {
        let raw = (self.0 as i16) + delta;
        Self::new(raw.clamp(0, Self::MAX as i16) as u8)
    }
}
```

### 5.5. SmallScale (0..5) newtype

Dùng cho `curiosity`, `patience`, `confidence`, `loneliness`:

```rust
macro_rules! small_scale_newtype {
    ($name:ident, $default:expr) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(u8);

        impl $name {
            pub const MIN: u8 = 0;
            pub const MAX: u8 = 5;
            pub const DEFAULT: u8 = $default;

            pub fn new(value: u8) -> Self {
                Self(value.min(Self::MAX))
            }

            pub fn value(&self) -> u8 { self.0 }

            pub fn normalized(&self) -> f32 {
                self.0 as f32 / Self::MAX as f32
            }

            pub fn apply_delta(self, delta: i16) -> Self {
                let raw = (self.0 as i16) + delta;
                Self::new(raw.clamp(0, Self::MAX as i16) as u8)
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self(Self::DEFAULT)
            }
        }
    };
}

small_scale_newtype!(Curiosity, 2);
small_scale_newtype!(Patience, 3);
small_scale_newtype!(Confidence, 2);
small_scale_newtype!(Loneliness, 0);
```

### 5.6. LargeScale (0..100) newtype

Dùng cho `trust`, `familiarity` (cùng pattern với `Affinity`):

```rust
macro_rules! large_scale_newtype {
    ($name:ident, $default:expr) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(u8);

        impl $name {
            pub const MIN: u8 = 0;
            pub const MAX: u8 = 100;
            pub const DEFAULT: u8 = $default;

            pub fn new(value: u8) -> Self {
                Self(value.min(Self::MAX))
            }

            pub fn value(&self) -> u8 { self.0 }

            pub fn normalized(&self) -> f32 {
                self.0 as f32 / Self::MAX as f32
            }

            pub fn apply_delta(self, delta: i16) -> Self {
                let raw = (self.0 as i16) + delta;
                Self::new(raw.clamp(0, Self::MAX as i16) as u8)
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self(Self::DEFAULT)
            }
        }
    };
}

large_scale_newtype!(Trust, 0);
large_scale_newtype!(Familiarity, 0);
```

---

## 6. Data Model

### 6.1. CharacterState refactored

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CharacterState {
    pub character_id: String,

    // Short-term affective
    pub mood: Mood,
    pub energy: Energy,

    // Personality-driven (slow change)
    pub curiosity: Curiosity,
    pub patience: Patience,
    pub confidence: Confidence,
    pub loneliness: Loneliness,

    // Relationship (slow build)
    pub affinity: Affinity,
    pub trust: Trust,
    pub familiarity: Familiarity,

    pub updated_at: DateTime<Utc>,
}
```

### 6.2. StateField enum

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StateField {
    Mood,
    Energy,
    Curiosity,
    Patience,
    Confidence,
    Loneliness,
    Affinity,
    Trust,
    Familiarity,
}

impl StateField {
    pub fn all() -> &'static [StateField] {
        &[
            StateField::Mood,
            StateField::Energy,
            StateField::Curiosity,
            StateField::Patience,
            StateField::Confidence,
            StateField::Loneliness,
            StateField::Affinity,
            StateField::Trust,
            StateField::Familiarity,
        ]
    }
}
```

### 6.3. MutationSource

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MutationSource {
    UtilityAi { action_id: String },
    Llm { request_id: String },
    UserInteraction { interaction_type: String },
    Decay,
    BehaviorOrchestrator { trigger: String },
    DebugCommand,
    Migration,
    System,
}
```

### 6.4. StateMutationRequest

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateMutationRequest {
    pub character_id: String,
    pub deltas: Vec<FieldDelta>,
    pub source: MutationSource,
    pub reason: String,
    pub bypass_personality: bool,  // Chỉ true cho Migration/Debug
    pub bypass_daily_cap: bool,    // Chỉ true cho Decay
    pub requested_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDelta {
    pub field: StateField,
    pub delta: i16,  // Đủ rộng cho cả i8 và u8 range
}
```

### 6.5. MutationResult

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationResult {
    pub character_id: String,
    pub applied_deltas: Vec<AppliedDelta>,
    pub rejected_deltas: Vec<RejectedDelta>,
    pub before_state: CharacterState,
    pub after_state: CharacterState,
    pub source: MutationSource,
    pub stages_executed: Vec<String>,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppliedDelta {
    pub field: StateField,
    pub requested_delta: i16,
    pub modified_delta: i16,
    pub before_value: i16,
    pub after_value: i16,
    pub modifier_chain: Vec<ModifierStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifierStep {
    pub stage: String,
    pub before: i16,
    pub after: i16,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RejectedDelta {
    pub field: StateField,
    pub requested_delta: i16,
    pub reason: RejectionReason,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RejectionReason {
    InvalidValue,
    DailyCapExceeded { remaining: i16 },
    PrivacyBlocked { mode: String },
    ModeBlocked { mode: String },
    PolicyForbidden { policy: String },
    UnknownCharacter,
    SchemaError { detail: String },
}
```

### 6.6. DailyCapTracker

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCapTracker {
    pub character_id: String,
    pub date: NaiveDate,
    pub used: HashMap<StateField, i16>,
}

impl DailyCapTracker {
    pub fn new(character_id: String, date: NaiveDate) -> Self {
        Self {
            character_id,
            date,
            used: HashMap::new(),
        }
    }

    pub fn remaining(&self, field: StateField, cap: i16) -> i16 {
        cap - self.used.get(&field).copied().unwrap_or(0).abs()
    }

    pub fn consume(&mut self, field: StateField, delta: i16) {
        *self.used.entry(field).or_insert(0) += delta.abs();
    }
}
```

### 6.7. GuardConfig

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardConfig {
    pub daily_caps: HashMap<StateField, i16>,
    pub personality_enabled: bool,
    pub mode_policy_enabled: bool,
    pub privacy_policy_enabled: bool,
    pub audit_log_size: usize,
    pub audit_persist: bool,
}

impl Default for GuardConfig {
    fn default() -> Self {
        let mut caps = HashMap::new();
        caps.insert(StateField::Mood, 6);
        caps.insert(StateField::Energy, 6);
        caps.insert(StateField::Curiosity, 3);
        caps.insert(StateField::Patience, 3);
        caps.insert(StateField::Confidence, 3);
        caps.insert(StateField::Loneliness, 5);
        caps.insert(StateField::Affinity, 5);
        caps.insert(StateField::Trust, 3);
        caps.insert(StateField::Familiarity, 5);

        Self {
            daily_caps: caps,
            personality_enabled: true,
            mode_policy_enabled: true,
            privacy_policy_enabled: true,
            audit_log_size: 500,
            audit_persist: false,
        }
    }
}
```

---

## 7. Mutation Pipeline

### 7.1. Pipeline tổng quan

```text
StateMutationRequest
       ↓
[Stage 1] Schema Validator
       ↓ (reject if invalid)
[Stage 2] Range Clamper (preview clamp)
       ↓
[Stage 3] Daily Cap Enforcer
       ↓ (reduce delta if cap close)
[Stage 4] Personality Modifier
       ↓ (apply trait modifiers)
[Stage 5] Mode Policy
       ↓ (block/reduce by mode)
[Stage 6] Privacy Policy
       ↓ (block by Private/Restricted)
[Stage 7] Commit & Event Emit
       ↓
StateStore.patch + state_changed event + audit log
```

### 7.2. Guard interface

```rust
pub struct StateMutationGuard {
    config: Arc<RwLock<GuardConfig>>,
    state_store: Arc<StateStore>,
    profile_provider: Arc<dyn CharacterProfileProvider>,
    mode_provider: Arc<dyn EffectiveModeProvider>,
    privacy_provider: Arc<dyn PrivacyPolicyProvider>,
    daily_trackers: Arc<RwLock<HashMap<String, DailyCapTracker>>>,
    audit_log: Arc<RwLock<VecDeque<MutationResult>>>,
    event_emitter: Arc<dyn StateEventEmitter>,
}

impl StateMutationGuard {
    pub fn apply(
        &self,
        request: StateMutationRequest,
    ) -> Result<MutationResult, GuardError> {
        // 1. Validate
        self.stage_schema_validate(&request)?;

        // 2. Load current state
        let before_state = self.state_store.get(&request.character_id)
            .ok_or(GuardError::UnknownCharacter)?;

        // 3. Process each delta through pipeline
        let mut applied = Vec::new();
        let mut rejected = Vec::new();
        let mut working_state = before_state.clone();

        for delta in &request.deltas {
            match self.process_delta(delta, &working_state, &request) {
                Ok(applied_delta) => {
                    working_state = self.apply_to_state(working_state, &applied_delta);
                    applied.push(applied_delta);
                }
                Err(reason) => {
                    rejected.push(RejectedDelta {
                        field: delta.field,
                        requested_delta: delta.delta,
                        reason,
                    });
                }
            }
        }

        // 4. Commit
        working_state.updated_at = Utc::now();
        self.state_store.patch(working_state.clone())?;

        // 5. Update daily tracker
        self.update_daily_tracker(&request.character_id, &applied);

        // 6. Build result
        let result = MutationResult {
            character_id: request.character_id.clone(),
            applied_deltas: applied,
            rejected_deltas: rejected,
            before_state,
            after_state: working_state,
            source: request.source.clone(),
            stages_executed: vec![
                "schema".into(),
                "range".into(),
                "daily_cap".into(),
                "personality".into(),
                "mode".into(),
                "privacy".into(),
                "commit".into(),
            ],
            committed_at: Utc::now(),
        };

        // 7. Audit log + event
        self.append_audit(&result);
        self.event_emitter.emit_state_changed(&result);

        Ok(result)
    }
}
```

---

## 8. Stage 1: Schema Validator

### 8.1. Validate rules

```text
- character_id non-empty
- deltas non-empty
- deltas.len() <= 16 (anti-abuse từ LLM)
- mỗi delta.delta phải trong i16 range, không NaN/Inf (i16 đã ko thể NaN)
- source phải valid enum variant
- reason length <= 200 chars
- requested_at không trong tương lai > 5s (chống clock skew)
- Không có duplicate field trong cùng request
```

### 8.2. Implementation

```rust
impl StateMutationGuard {
    fn stage_schema_validate(
        &self,
        request: &StateMutationRequest,
    ) -> Result<(), GuardError> {
        if request.character_id.is_empty() {
            return Err(GuardError::SchemaError("empty character_id".into()));
        }

        if request.deltas.is_empty() {
            return Err(GuardError::SchemaError("empty deltas".into()));
        }

        if request.deltas.len() > 16 {
            return Err(GuardError::SchemaError(
                format!("too many deltas: {}", request.deltas.len())
            ));
        }

        if request.reason.len() > 200 {
            return Err(GuardError::SchemaError("reason too long".into()));
        }

        let now = Utc::now();
        let skew = (request.requested_at - now).num_seconds();
        if skew > 5 {
            return Err(GuardError::SchemaError(
                format!("requested_at in future: {}s", skew)
            ));
        }

        let mut seen = HashSet::new();
        for delta in &request.deltas {
            if !seen.insert(delta.field) {
                return Err(GuardError::SchemaError(
                    format!("duplicate field: {:?}", delta.field)
                ));
            }
        }

        Ok(())
    }
}
```

---

## 9. Stage 2: Range Clamper

### 9.1. Vai trò

Stage này **không clamp final** — đó là việc của newtype `apply_delta`. Stage này:

- **Preview** giá trị sau khi áp delta.
- Tính `effective_delta` = delta đã được giảm nếu sẽ vượt range.

```rust
fn stage_range_preview(
    &self,
    state: &CharacterState,
    field: StateField,
    requested_delta: i16,
) -> i16 {
    let (current, min, max) = self.get_field_bounds(state, field);
    let target = current + requested_delta;
    let clamped_target = target.clamp(min, max);
    clamped_target - current
}

fn get_field_bounds(
    &self,
    state: &CharacterState,
    field: StateField,
) -> (i16, i16, i16) {
    match field {
        StateField::Mood => (state.mood.value() as i16, Mood::MIN as i16, Mood::MAX as i16),
        StateField::Energy => (state.energy.value() as i16, Energy::MIN as i16, Energy::MAX as i16),
        StateField::Curiosity => (state.curiosity.value() as i16, 0, Curiosity::MAX as i16),
        StateField::Patience => (state.patience.value() as i16, 0, Patience::MAX as i16),
        StateField::Confidence => (state.confidence.value() as i16, 0, Confidence::MAX as i16),
        StateField::Loneliness => (state.loneliness.value() as i16, 0, Loneliness::MAX as i16),
        StateField::Affinity => (state.affinity.value() as i16, 0, Affinity::MAX as i16),
        StateField::Trust => (state.trust.value() as i16, 0, Trust::MAX as i16),
        StateField::Familiarity => (state.familiarity.value() as i16, 0, Familiarity::MAX as i16),
    }
}
```

---

## 10. Stage 3: Daily Cap Enforcer

### 10.1. Logic

```text
For each delta:
  remaining = cap - used_today
  if remaining <= 0:
    reject với DailyCapExceeded
  else if abs(delta) > remaining:
    reduce delta to ±remaining (giữ dấu)
  else:
    pass through
```

### 10.2. Bypass

`DecayEngine` được set `bypass_daily_cap = true` vì decay là natural flow.

### 10.3. Implementation

```rust
fn stage_daily_cap(
    &self,
    request: &StateMutationRequest,
    field: StateField,
    delta: i16,
) -> Result<i16, RejectionReason> {
    if request.bypass_daily_cap {
        return Ok(delta);
    }

    let cap = self.config.read().unwrap()
        .daily_caps.get(&field).copied().unwrap_or(i16::MAX);

    let tracker = self.get_or_create_tracker(&request.character_id);
    let remaining = tracker.read().unwrap().remaining(field, cap);

    if remaining <= 0 {
        return Err(RejectionReason::DailyCapExceeded { remaining: 0 });
    }

    let abs_delta = delta.abs();
    if abs_delta > remaining {
        let sign = delta.signum();
        Ok(sign * remaining)
    } else {
        Ok(delta)
    }
}
```

---

## 11. Stage 4: Personality Modifier

### 11.1. Lý do áp dụng trước final clamp

```text
- Shy character → affinity grow chậm hơn 30%
- Warm character → mood recover nhanh hơn 20%
- Patient character → patience không giảm khi bị làm phiền
```

### 11.2. Modifier formula

```rust
fn apply_personality_modifier(
    profile: &CharacterProfile,
    field: StateField,
    delta: i16,
) -> i16 {
    let modifier = match field {
        StateField::Affinity => {
            // Shy → giảm tốc độ tăng affinity, nhưng không ảnh hưởng decrease
            if delta > 0 {
                1.0 - profile.personality.shyness * 0.3
            } else {
                1.0
            }
        }
        StateField::Mood => {
            if delta > 0 {
                0.8 + profile.personality.warmth * 0.4  // 0.8..1.2
            } else {
                1.0 - profile.personality.warmth * 0.2  // Warm giảm mood chậm
            }
        }
        StateField::Trust => {
            if delta > 0 {
                0.7 + profile.personality.patience * 0.3  // Patient build trust tốt hơn
            } else {
                1.0
            }
        }
        StateField::Curiosity => {
            // Curiosity trait giữ curiosity ổn định cao
            if delta < 0 {
                1.0 - profile.personality.curiosity * 0.3
            } else {
                1.0
            }
        }
        _ => 1.0,
    };

    (delta as f32 * modifier).round() as i16
}
```

### 11.3. Bypass

`Migration` và `DebugCommand` set `bypass_personality = true`.

---

## 12. Stage 5: Mode Policy

### 12.1. Mode-based modifier

```rust
fn apply_mode_modifier(
    mode: EffectiveBehaviorMode,
    field: StateField,
    delta: i16,
    source: &MutationSource,
) -> Result<i16, RejectionReason> {
    use EffectiveBehaviorMode::*;

    match mode {
        Restricted | Private => {
            // Chặn mutation relationship từ AI/Behavior
            if matches!(field, StateField::Affinity | StateField::Trust | StateField::Familiarity) {
                if matches!(source, MutationSource::Llm { .. } | MutationSource::UtilityAi { .. }) {
                    return Err(RejectionReason::ModeBlocked {
                        mode: format!("{:?}", mode),
                    });
                }
            }
            Ok(delta)
        }
        Meeting | Gaming => {
            // Giảm magnitude vì user đang busy
            Ok((delta as f32 * 0.5).round() as i16)
        }
        Focus => {
            Ok((delta as f32 * 0.7).round() as i16)
        }
        _ => Ok(delta),
    }
}
```

### 12.2. Bypass

`Decay`, `System`, `Migration`, `DebugCommand` bypass mode policy.

---

## 13. Stage 6: Privacy Policy

### 13.1. Privacy enforcement

```rust
fn apply_privacy_policy(
    privacy: &PrivacySnapshot,
    field: StateField,
    delta: i16,
    source: &MutationSource,
) -> Result<i16, RejectionReason> {
    // Private mode: chặn relationship mutation từ AI
    if privacy.private_mode_enabled {
        if matches!(field, StateField::Affinity | StateField::Trust | StateField::Familiarity) {
            if matches!(source, MutationSource::Llm { .. }) {
                return Err(RejectionReason::PrivacyBlocked {
                    mode: "private".into(),
                });
            }
        }
    }

    // Restricted mode: chặn mọi mutation từ AI
    if privacy.restricted_mode_enabled {
        if matches!(source, MutationSource::Llm { .. }) {
            return Err(RejectionReason::PrivacyBlocked {
                mode: "restricted".into(),
            });
        }
    }

    Ok(delta)
}
```

### 13.2. Privacy snapshot

```rust
#[derive(Debug, Clone)]
pub struct PrivacySnapshot {
    pub private_mode_enabled: bool,
    pub quiet_mode_enabled: bool,
    pub restricted_mode_enabled: bool,
    pub streamer_mode_enabled: bool,
}
```

---

## 14. Stage 7: Commit & Event Emit

### 14.1. Commit logic

```rust
fn commit(
    &self,
    character_id: &str,
    new_state: CharacterState,
) -> Result<(), GuardError> {
    self.state_store.patch(new_state.clone())
        .map_err(|e| GuardError::CommitFailed(e.to_string()))?;
    Ok(())
}
```

### 14.2. Event payload

```rust
#[derive(Debug, Clone, Serialize)]
pub struct StateChangedEvent {
    pub character_id: String,
    pub before_state: CharacterState,
    pub after_state: CharacterState,
    pub applied_deltas: Vec<AppliedDelta>,
    pub source: MutationSource,
    pub committed_at: DateTime<Utc>,
}
```

### 14.3. Event emit rule

```text
- Emit chỉ khi có ít nhất 1 applied_delta thật sự đổi value
- Không emit nếu tất cả deltas bị reject
- Throttle: max 10 events/sec/character (gộp nếu vượt)
```

---

## 15. Source Attribution

### 15.1. Tại sao quan trọng

```text
- Debug: biết AI hay Utility AI đang patch state
- Privacy audit: chứng minh không có raw context leak
- Daily cap fairness: AI và User có thể có cap riêng (tương lai)
- Telemetry: phân tích nguồn mutation chiếm tỷ lệ bao nhiêu
```

### 15.2. Source-specific rules

| Source | bypass_personality | bypass_daily_cap | Mode check | Privacy check |
|---|---|---|---|---|
| **UtilityAi** | false | false | Yes | Yes |
| **Llm** | false | false | Yes | Yes |
| **UserInteraction** | false | false | No | Yes |
| **Decay** | true | true | No | No |
| **BehaviorOrchestrator** | false | false | Yes | Yes |
| **DebugCommand** | true | true | No | No |
| **Migration** | true | true | No | No |
| **System** | false | true | No | No |

---

## 16. Error Handling

### 16.1. GuardError taxonomy

```rust
#[derive(Debug, thiserror::Error)]
pub enum GuardError {
    #[error("schema error: {0}")]
    SchemaError(String),

    #[error("unknown character")]
    UnknownCharacter,

    #[error("profile provider error: {0}")]
    ProfileProviderError(String),

    #[error("state store error: {0}")]
    StateStoreError(String),

    #[error("commit failed: {0}")]
    CommitFailed(String),

    #[error("lock poisoned")]
    LockPoisoned,
}
```

### 16.2. Recovery policy

| Error | Action |
|---|---|
| `SchemaError` | Reject request, log warning, emit `mutation_rejected` |
| `UnknownCharacter` | Reject request, log error |
| `ProfileProviderError` | Skip personality stage, log warning, continue |
| `StateStoreError` | Reject request, emit `state_commit_failed` |
| `LockPoisoned` | Panic-recover via `clear_poison`, emit critical alert |

---

## 17. Daily Reset Mechanism

### 17.1. Reset trigger

```text
- At local midnight 00:00:00
- Detected lazily: nếu tracker.date != today thì reset
- Không cần background task riêng
```

### 17.2. Implementation

```rust
fn get_or_create_tracker(&self, character_id: &str) -> Arc<RwLock<DailyCapTracker>> {
    let today = Local::now().date_naive();
    let mut trackers = self.daily_trackers.write().unwrap();

    let needs_reset = trackers.get(character_id)
        .map(|t| t.read().unwrap().date != today)
        .unwrap_or(true);

    if needs_reset {
        trackers.insert(
            character_id.to_string(),
            Arc::new(RwLock::new(DailyCapTracker::new(
                character_id.to_string(),
                today,
            ))),
        );
    }

    trackers.get(character_id).cloned().unwrap()
}
```

### 17.3. Clock change handling

```text
- Nếu system clock nhảy ngược (NTP sync), giữ tracker hiện tại
- Nếu nhảy tới (timezone change), tạo tracker mới
- Không persist daily_used cross-restart trong MVP
```

---

## 18. Telemetry & Audit Log

### 18.1. Audit log ring buffer

```rust
pub struct AuditLog {
    buffer: VecDeque<MutationResult>,
    capacity: usize,
}

impl AuditLog {
    pub fn append(&mut self, result: MutationResult) {
        if self.buffer.len() >= self.capacity {
            self.buffer.pop_front();
        }
        self.buffer.push_back(result);
    }

    pub fn recent(&self, n: usize) -> Vec<MutationResult> {
        self.buffer.iter().rev().take(n).cloned().collect()
    }
}
```

### 18.2. Metrics

```text
state_guard.mutations_total{source="ai|utility|user|decay"}
state_guard.mutations_rejected{reason="cap|privacy|mode|schema"}
state_guard.daily_cap_hit_count{field}
state_guard.avg_pipeline_duration_ms
state_guard.commit_failure_count
```

---

## 19. IPC Contract

### 19.1. Frontend → Rust commands

| Command | Payload | Return |
|---|---|---|
| `state_request_mutation` | `StateMutationRequest` | `MutationResult` |
| `state_get_current` | `{ character_id }` | `CharacterState` |
| `state_get_daily_caps` | `{}` | `HashMap<StateField, i16>` |
| `state_get_daily_usage` | `{ character_id }` | `HashMap<StateField, i16>` |
| `state_get_audit_log` | `{ limit }` | `Vec<MutationResult>` |
| `state_force_decay_tick` | `{ character_id }` | `MutationResult` |

### 19.2. Rust → Frontend events

| Event | Payload |
|---|---|
| `state_changed` | `StateChangedEvent` |
| `state_mutation_rejected` | `{ request, rejection_reasons }` |
| `state_daily_reset` | `{ character_id, date }` |
| `state_commit_failed` | `{ character_id, error }` |

### 19.3. IPC rules

```text
- Không emit per-frame.
- Throttle state_changed max 10/sec/character.
- mutation_rejected luôn emit (không throttle, debug-critical).
- Audit log không emit qua event, chỉ qua command query.
```

---

## 20. File Structure

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── state/
│               ├── mod.rs
│               ├── types/
│               │   ├── mod.rs
│               │   ├── mood.rs
│               │   ├── energy.rs
│               │   ├── small_scale.rs
│               │   ├── large_scale.rs
│               │   └── character_state.rs
│               ├── guard/
│               │   ├── mod.rs
│               │   ├── pipeline.rs
│               │   ├── stages/
│               │   │   ├── mod.rs
│               │   │   ├── schema.rs
│               │   │   ├── range.rs
│               │   │   ├── daily_cap.rs
│               │   │   ├── personality.rs
│               │   │   ├── mode.rs
│               │   │   ├── privacy.rs
│               │   │   └── commit.rs
│               │   ├── tracker.rs
│               │   ├── audit.rs
│               │   ├── events.rs
│               │   └── errors.rs
│               ├── providers/
│               │   ├── mod.rs
│               │   ├── profile.rs
│               │   ├── mode.rs
│               │   └── privacy.rs
│               ├── store.rs
│               └── decay.rs
│
├── src/
│   └── state/
│       ├── types.ts
│       ├── stateApi.ts
│       └── useStateStore.ts
│
└── docs/
    └── specifications/
        └── state-mutation-guard.md
```

---

## 21. Unit Test Specification

### 21.1. Test categories

```text
1. Newtype boundary tests
2. Schema validator tests
3. Range clamper preview tests
4. Daily cap enforcer tests
5. Personality modifier tests
6. Mode policy tests
7. Privacy policy tests
8. End-to-end pipeline tests
9. Daily reset tests
10. Concurrency tests
```

### 21.2. Newtype tests

```rust
#[cfg(test)]
mod newtype_tests {
    use super::*;

    #[test]
    fn mood_clamps_above_max() {
        let m = Mood::new(10);
        assert_eq!(m.value(), Mood::MAX);
    }

    #[test]
    fn mood_clamps_below_min() {
        let m = Mood::new(-10);
        assert_eq!(m.value(), Mood::MIN);
    }

    #[test]
    fn mood_normalized_at_min_is_zero() {
        assert_eq!(Mood::new(-3).normalized(), 0.0);
    }

    #[test]
    fn mood_normalized_at_max_is_one() {
        assert_eq!(Mood::new(3).normalized(), 1.0);
    }

    #[test]
    fn mood_normalized_at_zero_is_half() {
        assert_eq!(Mood::new(0).normalized(), 0.5);
    }

    #[test]
    fn mood_apply_delta_clamps() {
        let m = Mood::new(2);
        assert_eq!(m.apply_delta(5).value(), Mood::MAX);
    }

    #[test]
    fn affinity_apply_delta_clamps_at_max() {
        let a = Affinity::new(95);
        assert_eq!(a.apply_delta(20).value(), Affinity::MAX);
    }

    #[test]
    fn affinity_apply_delta_clamps_at_zero() {
        let a = Affinity::new(5);
        assert_eq!(a.apply_delta(-20).value(), 0);
    }
}
```

### 21.3. Daily cap tests

```rust
#[cfg(test)]
mod daily_cap_tests {
    #[test]
    fn cap_reduces_delta_when_close_to_limit() {
        let mut tracker = DailyCapTracker::new("c1".into(), today());
        tracker.consume(StateField::Affinity, 4);  // cap=5, used=4

        let guard = test_guard();
        let result = guard.stage_daily_cap_test(
            "c1",
            StateField::Affinity,
            3,  // want +3, but only 1 remaining
        );

        assert_eq!(result, Ok(1));
    }

    #[test]
    fn cap_rejects_when_exhausted() {
        let mut tracker = DailyCapTracker::new("c1".into(), today());
        tracker.consume(StateField::Affinity, 5);

        let guard = test_guard();
        let result = guard.stage_daily_cap_test(
            "c1",
            StateField::Affinity,
            1,
        );

        assert!(matches!(result, Err(RejectionReason::DailyCapExceeded { .. })));
    }

    #[test]
    fn negative_delta_uses_abs_for_cap() {
        let mut tracker = DailyCapTracker::new("c1".into(), today());
        tracker.consume(StateField::Affinity, 0);

        let guard = test_guard();
        let result = guard.stage_daily_cap_test("c1", StateField::Affinity, -3);
        assert_eq!(result, Ok(-3));
    }

    #[test]
    fn decay_bypass_skips_cap() {
        let mut tracker = DailyCapTracker::new("c1".into(), today());
        tracker.consume(StateField::Mood, 6);  // exhausted

        let guard = test_guard();
        let request = decay_request("c1", StateField::Mood, -1);
        let result = guard.apply(request).unwrap();

        assert_eq!(result.applied_deltas.len(), 1);
    }
}
```

### 21.4. Personality modifier tests

```rust
#[cfg(test)]
mod personality_tests {
    #[test]
    fn shy_character_gains_affinity_slower() {
        let shy_profile = profile_with_shyness(1.0);
        let modified = apply_personality_modifier(&shy_profile, StateField::Affinity, 10);
        assert_eq!(modified, 7);  // 10 * (1 - 1.0 * 0.3)
    }

    #[test]
    fn warm_character_recovers_mood_faster() {
        let warm = profile_with_warmth(1.0);
        let modified = apply_personality_modifier(&warm, StateField::Mood, 2);
        assert_eq!(modified, 2);  // 2 * 1.2 = 2.4 → round to 2
    }

    #[test]
    fn negative_affinity_not_modified_by_shyness() {
        let shy = profile_with_shyness(1.0);
        let modified = apply_personality_modifier(&shy_profile, StateField::Affinity, -5);
        assert_eq!(modified, -5);
    }
}
```

### 21.5. Mode policy tests

```rust
#[cfg(test)]
mod mode_tests {
    #[test]
    fn private_mode_blocks_ai_affinity_mutation() {
        let result = apply_mode_modifier(
            EffectiveBehaviorMode::Private,
            StateField::Affinity,
            3,
            &MutationSource::Llm { request_id: "r1".into() },
        );
        assert!(matches!(result, Err(RejectionReason::ModeBlocked { .. })));
    }

    #[test]
    fn private_mode_allows_user_interaction_mutation() {
        let result = apply_mode_modifier(
            EffectiveBehaviorMode::Private,
            StateField::Affinity,
            3,
            &MutationSource::UserInteraction { interaction_type: "pet".into() },
        );
        assert_eq!(result, Ok(3));
    }

    #[test]
    fn meeting_mode_reduces_delta_by_half() {
        let result = apply_mode_modifier(
            EffectiveBehaviorMode::Meeting,
            StateField::Mood,
            2,
            &MutationSource::UtilityAi { action_id: "a1".into() },
        );
        assert_eq!(result, Ok(1));
    }
}
```

### 21.6. End-to-end pipeline tests

```rust
#[cfg(test)]
mod e2e_tests {
    #[test]
    fn ai_request_passes_through_full_pipeline() {
        let guard = test_guard_with_profile(profile_default());
        let request = StateMutationRequest {
            character_id: "mira".into(),
            deltas: vec![
                FieldDelta { field: StateField::Mood, delta: 1 },
                FieldDelta { field: StateField::Affinity, delta: 2 },
            ],
            source: MutationSource::Llm { request_id: "r1".into() },
            reason: "user said hello warmly".into(),
            bypass_personality: false,
            bypass_daily_cap: false,
            requested_at: Utc::now(),
        };

        let result = guard.apply(request).unwrap();
        assert_eq!(result.applied_deltas.len(), 2);
        assert_eq!(result.rejected_deltas.len(), 0);
        assert!(result.stages_executed.contains(&"personality".to_string()));
    }

    #[test]
    fn partial_mutation_with_some_rejected() {
        let guard = test_guard_in_private_mode();
        let request = StateMutationRequest {
            character_id: "mira".into(),
            deltas: vec![
                FieldDelta { field: StateField::Mood, delta: 1 },
                FieldDelta { field: StateField::Affinity, delta: 2 },  // will be blocked
            ],
            source: MutationSource::Llm { request_id: "r1".into() },
            reason: "test".into(),
            bypass_personality: false,
            bypass_daily_cap: false,
            requested_at: Utc::now(),
        };

        let result = guard.apply(request).unwrap();
        assert_eq!(result.applied_deltas.len(), 1);
        assert_eq!(result.rejected_deltas.len(), 1);
        assert_eq!(result.rejected_deltas[0].field, StateField::Affinity);
    }
}
```

### 21.7. Concurrency tests

```rust
#[cfg(test)]
mod concurrency_tests {
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn concurrent_mutations_respect_daily_cap() {
        let guard = Arc::new(test_guard());
        let mut handles = vec![];

        // 10 threads cùng request +1 affinity, cap=5
        for i in 0..10 {
            let g = guard.clone();
            handles.push(thread::spawn(move || {
                g.apply(StateMutationRequest {
                    character_id: "mira".into(),
                    deltas: vec![FieldDelta {
                        field: StateField::Affinity,
                        delta: 1,
                    }],
                    source: MutationSource::UtilityAi {
                        action_id: format!("a{}", i),
                    },
                    reason: "concurrent test".into(),
                    bypass_personality: false,
                    bypass_daily_cap: false,
                    requested_at: Utc::now(),
                })
            }));
        }

        for h in handles {
            let _ = h.join();
        }

        let state = guard.state_store.get("mira").unwrap();
        assert!(state.affinity.value() <= 5);
    }
}
```

### 21.8. Coverage target

```text
- Newtype: 100%
- Each stage function: 100%
- Pipeline: 95%
- Concurrency: smoke test only
- Daily reset: time-mocked test
```

---

## 22. Migration Strategy

### 22.1. Legacy state detection

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyCharacterState {
    pub character_id: String,
    pub mood: i8,         // -10..10 hoặc -128..127
    pub energy: u8,       // 0..255
    pub affinity: u8,
    pub trust: u8,
    pub familiarity: u8,
    pub curiosity: u8,
    pub patience: u8,
    pub confidence: u8,
}

pub fn detect_legacy_state(json: &Value) -> bool {
    json.get("mood").and_then(|v| v.as_i64())
        .map(|m| m.abs() > 3)
        .unwrap_or(false)
}
```

### 22.2. Migration function

```rust
pub fn migrate_legacy_to_v2(legacy: LegacyCharacterState) -> CharacterState {
    CharacterState {
        character_id: legacy.character_id,
        mood: Mood::new(scale_mood(legacy.mood)),
        energy: Energy::new(scale_energy(legacy.energy as i8)),
        curiosity: Curiosity::new(scale_to_5(legacy.curiosity, 100)),
        patience: Patience::new(scale_to_5(legacy.patience, 100)),
        confidence: Confidence::new(scale_to_5(legacy.confidence, 100)),
        loneliness: Loneliness::default(),
        affinity: Affinity::new(legacy.affinity.min(100)),
        trust: Trust::new(legacy.trust.min(100)),
        familiarity: Familiarity::new(legacy.familiarity.min(100)),
        updated_at: Utc::now(),
    }
}

fn scale_mood(old: i8) -> i8 {
    // Old range -10..10 → new -3..3
    ((old as f32) * 0.3).round() as i8
}

fn scale_energy(old: i8) -> i8 {
    // Old 0..100 (interpreted) → -3..3 centered
    let normalized = (old as f32 / 100.0).clamp(0.0, 1.0);
    ((normalized - 0.5) * 6.0).round() as i8
}

fn scale_to_5(old: u8, max: u8) -> u8 {
    ((old as f32 / max as f32) * 5.0).round() as u8
}
```

### 22.3. Migration trigger

```text
- On state load at app start
- Detect schema version field (add "schema_version": 2 to new state)
- If missing or = 1: run migration
- Persist migrated state immediately
- Emit migration_completed event
```

---

## 23. Implementation Checklist

### 23.1. P0 Core

- [ ] Define newtype: `Mood`, `Energy`, `Affinity`, `Trust`, `Familiarity`, `Curiosity`, `Patience`, `Confidence`, `Loneliness`.
- [ ] Refactor `CharacterState` dùng newtype.
- [ ] Define `StateMutationRequest`, `MutationResult`, `MutationSource`, `RejectionReason`.
- [ ] Implement `DailyCapTracker`.
- [ ] Implement `GuardConfig` với default caps.

### 23.2. P0 Pipeline

- [ ] Stage 1: Schema validator.
- [ ] Stage 2: Range preview clamper.
- [ ] Stage 3: Daily cap enforcer.
- [ ] Stage 4: Personality modifier (skip if no profile).
- [ ] Stage 5: Mode policy (skip if no mode provider).
- [ ] Stage 6: Privacy policy (skip if no privacy provider).
- [ ] Stage 7: Commit + event emit.

### 23.3. P0 Provider interfaces

- [ ] `CharacterProfileProvider` trait.
- [ ] `EffectiveModeProvider` trait.
- [ ] `PrivacyPolicyProvider` trait.
- [ ] Default impl (NoOp) cho mỗi trait — dùng khi subsystem chưa sẵn sàng.

### 23.4. P1 Audit & Telemetry

- [ ] Audit log ring buffer.
- [ ] `state_get_audit_log` IPC command.
- [ ] Metrics emit.
- [ ] `state_mutation_rejected` event emit.

### 23.5. P1 Daily Reset

- [ ] Lazy reset detection.
- [ ] `state_daily_reset` event emit.
- [ ] Clock skew handling.

### 23.6. P1 Migration

- [ ] Legacy state detector.
- [ ] Migration function.
- [ ] Persist post-migration.
- [ ] Migration test cases.

### 23.7. P2 Integration

- [ ] Refactor `Utility AI` dùng `normalized()` từ newtype.
- [ ] Refactor `DecayEngine` request qua Guard với `bypass_daily_cap=true`.
- [ ] Remove direct `StateStore::patch()` call ở mọi nơi khác.
- [ ] Wire `BehaviorOrchestrator` → Guard.

### 23.8. P2 Tests

- [ ] Newtype tests (100% coverage).
- [ ] Each stage tests.
- [ ] E2E pipeline tests.
- [ ] Concurrency smoke tests.
- [ ] Migration tests với fixture legacy state.

---

## 24. Glossary

| Thuật ngữ | Định nghĩa |
|---|---|
| **Guard** | StateMutationGuard, lớp bảo vệ duy nhất giữa request và StateStore. |
| **Pipeline** | Chuỗi 7 stages mà mỗi mutation phải đi qua. |
| **Stage** | Một bước xử lý trong pipeline (validator, clamper, etc). |
| **Newtype** | Pattern Rust wrap primitive type để enforce constraint. |
| **Delta** | Lượng thay đổi cho một field (có dấu). |
| **Daily Cap** | Giới hạn tổng abs(delta) trong 1 ngày cho 1 field. |
| **Personality Modifier** | Hệ số nhân delta theo personality traits. |
| **Mode Policy** | Quy tắc filter mutation theo EffectiveBehaviorMode. |
| **Privacy Policy** | Quy tắc block mutation khi Private/Restricted mode bật. |
| **Source Attribution** | Ghi nhận nguồn của mỗi mutation (AI/User/Decay...). |
| **Audit Log** | Ring buffer ghi nhận mọi MutationResult gần nhất. |
| **Bypass** | Flag cho phép skip một số stage (chỉ Decay/Migration/Debug). |

---

# Phụ lục A: Flow tổng quan

```text
[Utility AI Tick]
       ↓
   build StateMutationRequest {
     source: UtilityAi { action_id: "take_a_nap" },
     deltas: [
       { field: Energy, delta: +2 },
       { field: Mood, delta: +1 },
     ],
   }
       ↓
[Guard.apply()]
       ↓
[Stage 1: Schema OK]
       ↓
[Stage 2: Range preview]
       Energy: current=0, +2 → target=2, in range, effective=+2
       Mood: current=2, +1 → target=3, in range, effective=+1
       ↓
[Stage 3: Daily Cap]
       Energy: cap=6, used=3, remaining=3, +2 OK
       Mood: cap=6, used=5, remaining=1, request +1, OK
       ↓
[Stage 4: Personality]
       warm=0.7 → Mood +1 * 1.08 = round(1.08) = +1
       Energy unchanged
       ↓
[Stage 5: Mode = Normal]
       Pass through
       ↓
[Stage 6: Privacy = OFF]
       Pass through
       ↓
[Stage 7: Commit]
       state.energy = Energy::new(0).apply_delta(2) = Energy(2)
       state.mood = Mood::new(2).apply_delta(1) = Mood(3)
       state.updated_at = now
       StateStore.patch(state)
       ↓
[Update DailyCapTracker]
       used.Energy += 2 → 5
       used.Mood += 1 → 6
       ↓
[Append AuditLog]
       ↓
[Emit state_changed event]
       ↓
Frontend receives → re-render UI
Behavior Orchestrator receives → check milestones
```

---

# Phụ lục B: JSON mẫu

## B.1. StateMutationRequest mẫu

```json
{
  "character_id": "mira",
  "deltas": [
    { "field": "mood", "delta": 1 },
    { "field": "affinity", "delta": 2 }
  ],
  "source": {
    "llm": { "request_id": "req_abc123" }
  },
  "reason": "user greeted character warmly",
  "bypass_personality": false,
  "bypass_daily_cap": false,
  "requested_at": "2026-05-28T10:00:00Z"
}
```

## B.2. MutationResult mẫu

```json
{
  "character_id": "mira",
  "applied_deltas": [
    {
      "field": "mood",
      "requested_delta": 1,
      "modified_delta": 1,
      "before_value": 0,
      "after_value": 1,
      "modifier_chain": [
        { "stage": "range", "before": 1, "after": 1, "note": "in range" },
        { "stage": "daily_cap", "before": 1, "after": 1, "note": "remaining=5" },
        { "stage": "personality", "before": 1, "after": 1, "note": "warm=0.5, factor=1.0" },
        { "stage": "mode", "before": 1, "after": 1, "note": "Normal" },
        { "stage": "privacy", "before": 1, "after": 1, "note": "OK" }
      ]
    }
  ],
  "rejected_deltas": [
    {
      "field": "affinity",
      "requested_delta": 2,
      "reason": {
        "privacy_blocked": { "mode": "private" }
      }
    }
  ],
  "before_state": {
    "character_id": "mira",
    "mood": 0,
    "energy": 0,
    "affinity": 10,
    "trust": 5,
    "familiarity": 8,
    "curiosity": 2,
    "patience": 3,
    "confidence": 2,
    "loneliness": 0,
    "updated_at": "2026-05-28T09:55:00Z"
  },
  "after_state": {
    "character_id": "mira",
    "mood": 1,
    "energy": 0,
    "affinity": 10,
    "trust": 5,
    "familiarity": 8,
    "curiosity": 2,
    "patience": 3,
    "confidence": 2,
    "loneliness": 0,
    "updated_at": "2026-05-28T10:00:00Z"
  },
  "source": {
    "llm": { "request_id": "req_abc123" }
  },
  "stages_executed": ["schema", "range", "daily_cap", "personality", "mode", "privacy", "commit"],
  "committed_at": "2026-05-28T10:00:00Z"
}
```

## B.3. GuardConfig mẫu

```json
{
  "daily_caps": {
    "mood": 6,
    "energy": 6,
    "curiosity": 3,
    "patience": 3,
    "confidence": 3,
    "loneliness": 5,
    "affinity": 5,
    "trust": 3,
    "familiarity": 5
  },
  "personality_enabled": true,
  "mode_policy_enabled": true,
  "privacy_policy_enabled": true,
  "audit_log_size": 500,
  "audit_persist": false
}
```

## B.4. DailyCapTracker mẫu

```json
{
  "character_id": "mira",
  "date": "2026-05-28",
  "used": {
    "mood": 3,
    "affinity": 2,
    "energy": 0
  }
}
```

---

**Tài liệu này là spec chính thức cho State Mutation Guard. Khi có mâu thuẫn với code hiện tại, ưu tiên spec này. Khi có mâu thuẫn với subsystem khác, áp dụng thứ tự: Privacy → Recovery → Guard → AI/Behavior/Renderer.**