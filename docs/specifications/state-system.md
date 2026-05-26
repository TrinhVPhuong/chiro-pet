# **Chiro-Pet State System**

&gt; Tài liệu thiết kế chính thức cho **State System** của **Chiro-Pet**.  
&gt; Đây là **foundation layer** mà mọi subsystem khác (Animation, AI, Memory, Behavior, UI) đều phụ thuộc vào.
&gt;
&gt; **Nguyên tắc lõi:** State là **single source of truth** cho trạng thái nội tại của character và app. Mọi mutation phải đi qua **StateManager** với **guard chain**. Không subsystem nào được phép ghi state trực tiếp ngoài StateManager. State được persist định kỳ, decay theo thời gian, reset theo chu kỳ ngày, và emit event cho observer.

---

## **Mục lục**

1. [Mục tiêu &amp; Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Phân loại State](#3-phân-loại-state)
4. [Data Model](#4-data-model)
5. [State Lifecycle](#5-state-lifecycle)
6. [StateManager](#6-statemanager)
7. [State Mutation Flow](#7-state-mutation-flow)
8. [Guard Chain](#8-guard-chain)
9. [Decay System](#9-decay-system)
10. [Daily Reset System](#10-daily-reset-system)
11. [Persistence Layer](#11-persistence-layer)
12. [Observer &amp; Event System](#12-observer--event-system)
13. [Per-Character State Binding](#13-per-character-state-binding)
14. [State Migration](#14-state-migration)
15. [State Export &amp; Import](#15-state-export--import)
16. [IPC Contract](#16-ipc-contract)
17. [Integration với các Subsystem](#17-integration-với-các-subsystem)
18. [Error Handling](#18-error-handling)
19. [Performance Considerations](#19-performance-considerations)
20. [File Structure](#20-file-structure)
21. [Implementation Checklist](#21-implementation-checklist)
22. [Glossary](#22-glossary)
23. [Phụ lục A: Decay timing table](#phụ-lục-a-decay-timing-table)
24. [Phụ lục B: JSON mẫu](#phụ-lục-b-json-mẫu)

---

## **1. Mục tiêu &amp; Phạm vi**

### **1.1. Mục tiêu**

State System của **Chiro-Pet** phải:

- Lưu trữ **trạng thái nội tại** của từng character (mood, energy, affinity, trust, ...).
- Lưu trữ **trạng thái runtime** của app (active character, mode, privacy flags, ...).
- Cho phép subsystem (AI, Animation, Behavior) **đọc state** một cách an toàn.
- Cho phép mutation chỉ qua **StateManager + Guard Chain**.
- **Persist** state xuống SQLite với debouncing.
- **Decay** state theo thời gian (mood về neutral, energy giảm khi không sleep).
- **Reset** chu kỳ ngày (affinity cap, proactive count, daily quota).
- **Emit event** khi state thay đổi để observer phản ứng.
- Hỗ trợ **migration** khi schema thay đổi.
- Hỗ trợ **export/import** state cho backup.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Companion state (per-character emotional/relational state).
- Runtime app state (active character, mode, flags).
- State mutation guard chain.
- Decay và daily reset.
- Persistence và migration.
- Observer pattern và IPC events.

Tài liệu này **không** mô tả:

- Memory schema (xem `memory-system.md`).
- Character identity/personality (xem `character-system.md`).
- Animation state (xem `animation-system.md`, đây là render state, không phải companion state).
- AI response schema (xem `ai-interaction-system.md`).

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Single source of truth** | StateManager là nơi duy nhất giữ state hiện hành. |
| **2** | **No direct write** | Không subsystem nào ghi state trực tiếp, phải qua `patch()`. |
| **3** | **Guard everything** | Mọi mutation đi qua guard chain (range, cap, policy). |
| **4** | **Event-driven** | State thay đổi → emit event → observer phản ứng. |
| **5** | **Debounced persistence** | Không ghi DB mỗi mutation, gom batch theo interval. |
| **6** | **Per-character isolation** | State của character A không leak sang character B. |
| **7** | **Decay-aware** | State tự decay về baseline khi không có tương tác. |
| **8** | **Daily-bounded** | Affinity, proactive count, AI calls reset theo ngày. |
| **9** | **Migration-safe** | Schema version được track, migration auto-apply. |
| **10** | **Recoverable** | Nếu state corrupt, fallback về default + log. |

### **2.2. Anti-pattern cần tránh**

- ❌ Cho subsystem ghi state trực tiếp (vd `state.mood = 5`).
- ❌ Skip guard chain "vì biết là an toàn".
- ❌ Ghi DB sau mỗi mutation (I/O bottleneck).
- ❌ Share state giữa các character (per-character must isolate).
- ❌ Không có decay (state stuck ở giá trị max/min).
- ❌ Không có daily reset (affinity tăng vô hạn).
- ❌ Migration thủ công (dễ quên, dễ sai).
- ❌ Không emit event khi state đổi (UI/animation không update).
- ❌ Hardcode default values rải rác (phải tập trung 1 chỗ).

---

## **3. Phân loại State**

State được chia thành **3 nhóm chính**:

### **3.1. Character State (per-character)**

Trạng thái nội tại của từng character. Mỗi character có 1 record riêng.

| **Field** | **Range** | **Mô tả** |
|---|---|---|
| **mood** | `-10..10` | Tâm trạng (vui/buồn) |
| **energy** | `0..100` | Năng lượng (mệt/tỉnh) |
| **affinity** | `0..100` | Mức độ thân thiết với user |
| **trust** | `0..100` | Độ tin cậy |
| **familiarity** | `0..100` | Mức độ quen thuộc |
| **curiosity** | `0..100` | Tò mò (ảnh hưởng proactive) |
| **patience** | `0..100` | Kiên nhẫn (ảnh hưởng tone) |
| **confidence** | `0..100` | Tự tin (ảnh hưởng phong cách nói) |

### **3.2. Runtime App State (singleton)**

Trạng thái runtime của app, chỉ có 1 instance.

| **Field** | **Type** | **Mô tả** |
|---|---|---|
| **active_character_id** | `String` | Character đang active |
| **app_mode** | `AppMode` | Normal/Focus/Gaming/Meeting/... |
| **private_mode** | `bool` | Bật private mode |
| **quiet_mode** | `bool` | Bật quiet mode |
| **ai_lifecycle_state** | `AILifecycleState` | Idle/Thinking/... |
| **last_interaction_at** | `DateTime` | Lần cuối user tương tác |
| **last_proactive_at** | `DateTime` | Lần cuối character proactive |

### **3.3. Daily Counter State (per-character, per-day)**

Reset mỗi ngày lúc 00:00 local time.

| **Field** | **Type** | **Mô tả** |
|---|---|---|
| **affinity_gained_today** | `u32` | Affinity tăng trong ngày |
| **proactive_count_today** | `u32` | Số lần proactive đã dùng |
| **ai_calls_today** | `u32` | Số lần gọi AI |
| **ai_cost_cents_today** | `u32` | Cost AI trong ngày |
| **interaction_count_today** | `u32` | Số interaction trong ngày |

---

## **4. Data Model**

### **4.1. Rust types**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterState {
    pub character_id: String,
    pub mood: i8,         // -10..10
    pub energy: u8,       // 0..100
    pub affinity: u8,     // 0..100
    pub trust: u8,        // 0..100
    pub familiarity: u8,  // 0..100
    pub curiosity: u8,    // 0..100
    pub patience: u8,     // 0..100
    pub confidence: u8,   // 0..100
    pub updated_at: DateTime<utc>,
    pub schema_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeAppState {
    pub active_character_id: String,
    pub app_mode: AppMode,
    pub private_mode: bool,
    pub quiet_mode: bool,
    pub ai_lifecycle_state: AILifecycleState,
    pub last_interaction_at: Option<datetime<utc>&gt;,
    pub last_proactive_at: Option<datetime<utc>&gt;,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCounters {
    pub character_id: String,
    pub date: NaiveDate,
    pub affinity_gained_today: u32,
    pub proactive_count_today: u32,
    pub ai_calls_today: u32,
    pub ai_cost_cents_today: u32,
    pub interaction_count_today: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppMode {
    Normal,
    Focus,
    Gaming,
    Meeting,
    Watching,
    Idle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterStateDelta {
    pub mood: i8,
    pub energy: i8,
    pub affinity: i8,
    pub trust: i8,
    pub familiarity: i8,
    pub curiosity: i8,
    pub patience: i8,
    pub confidence: i8,
}

impl CharacterStateDelta {
    pub fn zero() -&gt; Self {
        Self {
            mood: 0, energy: 0, affinity: 0, trust: 0,
            familiarity: 0, curiosity: 0, patience: 0, confidence: 0,
        }
    }
}
```

### **4.2. TypeScript types**

```typescript
export interface CharacterState {
  character_id: string;
  mood: number;         // -10..10
  energy: number;       // 0..100
  affinity: number;     // 0..100
  trust: number;        // 0..100
  familiarity: number;  // 0..100
  curiosity: number;    // 0..100
  patience: number;     // 0..100
  confidence: number;   // 0..100
  updated_at: string;
  schema_version: number;
}

export interface RuntimeAppState {
  active_character_id: string;
  app_mode: AppMode;
  private_mode: boolean;
  quiet_mode: boolean;
  ai_lifecycle_state: AILifecycleState;
  last_interaction_at?: string;
  last_proactive_at?: string;
}

export interface DailyCounters {
  character_id: string;
  date: string; // YYYY-MM-DD
  affinity_gained_today: number;
  proactive_count_today: number;
  ai_calls_today: number;
  ai_cost_cents_today: number;
  interaction_count_today: number;
}

export type AppMode =
  | "normal"
  | "focus"
  | "gaming"
  | "meeting"
  | "watching"
  | "idle";
```

### **4.3. Default values**

```rust
impl Default for CharacterState {
    fn default() -&gt; Self {
        Self {
            character_id: String::new(),
            mood: 0,
            energy: 70,
            affinity: 10,
            trust: 20,
            familiarity: 0,
            curiosity: 50,
            patience: 60,
            confidence: 50,
            updated_at: Utc::now(),
            schema_version: 1,
        }
    }
}
```

### **4.4. SQLite schema**

```sql
CREATE TABLE character_state (
    character_id TEXT PRIMARY KEY,
    mood INTEGER NOT NULL DEFAULT 0,
    energy INTEGER NOT NULL DEFAULT 70,
    affinity INTEGER NOT NULL DEFAULT 10,
    trust INTEGER NOT NULL DEFAULT 20,
    familiarity INTEGER NOT NULL DEFAULT 0,
    curiosity INTEGER NOT NULL DEFAULT 50,
    patience INTEGER NOT NULL DEFAULT 60,
    confidence INTEGER NOT NULL DEFAULT 50,
    updated_at DATETIME NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,

    FOREIGN KEY (character_id) REFERENCES characters(id)
);

CREATE TABLE runtime_app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_character_id TEXT NOT NULL,
    app_mode TEXT NOT NULL DEFAULT 'normal',
    private_mode INTEGER NOT NULL DEFAULT 0,
    quiet_mode INTEGER NOT NULL DEFAULT 0,
    ai_lifecycle_state TEXT NOT NULL DEFAULT 'idle',
    last_interaction_at DATETIME,
    last_proactive_at DATETIME
);

CREATE TABLE daily_counters (
    character_id TEXT NOT NULL,
    date TEXT NOT NULL, -- YYYY-MM-DD
    affinity_gained_today INTEGER NOT NULL DEFAULT 0,
    proactive_count_today INTEGER NOT NULL DEFAULT 0,
    ai_calls_today INTEGER NOT NULL DEFAULT 0,
    ai_cost_cents_today INTEGER NOT NULL DEFAULT 0,
    interaction_count_today INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id, date)
);

CREATE INDEX idx_daily_counters_date ON daily_counters(date);
```

---

## **5. State Lifecycle**

### **5.1. Lifecycle tổng thể**

```text
App start
  ↓
StateManager.init()
  ↓
Load CharacterState từ DB
  ↓
Load RuntimeAppState từ DB
  ↓
Load/Create DailyCounters cho hôm nay
  ↓
Apply pending decay (since last shutdown)
  ↓
Start decay scheduler
  ↓
Start daily reset scheduler
  ↓
Start persistence flusher
  ↓
Ready
  ↓
[Runtime mutations via patch()]
  ↓
App shutdown
  ↓
Flush pending writes
  ↓
Save final state
  ↓
Stop schedulers
```

### **5.2. Lifecycle events**

| **Event** | **Trigger** | **Action** |
|---|---|---|
| `state_initialized` | App start | UI bootstrap |
| `character_state_changed` | Patch applied | Observer react |
| `app_mode_changed` | Desktop awareness | Behavior orchestrator react |
| `daily_reset_done` | 00:00 local | Reset counters |
| `decay_tick` | Every N minutes | Apply decay |
| `state_persisted` | Flush done | Audit log |
| `state_migrated` | Schema version up | Log migration |

---

## **6. StateManager**

### **6.1. Trách nhiệm**

```rust
pub struct StateManager {
    character_states: Arc<rwlock<hashmap<string, characterstate="">&gt;&gt;,
    runtime_state: Arc<rwlock<runtimeappstate>&gt;,
    daily_counters: Arc<rwlock<hashmap<string, dailycounters="">&gt;&gt;,

    guard_chain: GuardChain,
    decay_engine: DecayEngine,
    daily_reset: DailyResetScheduler,
    persistence: StatePersistence,
    event_emitter: StateEventEmitter,

    dirty_flag: Arc<atomicbool>,
}
```

### **6.2. Public API**

```rust
impl StateManager {
    pub async fn init(db: DbPool) -&gt; Result<self>;

    // Read
    pub async fn get_character_state(&amp;self, character_id: &amp;str) -&gt; Result<characterstate>;
    pub async fn get_runtime_state(&amp;self) -&gt; RuntimeAppState;
    pub async fn get_daily_counters(&amp;self, character_id: &amp;str) -&gt; Result<dailycounters>;

    // Write (only entry points)
    pub async fn patch_character_state(
        &amp;self,
        character_id: &amp;str,
        delta: CharacterStateDelta,
        source: MutationSource,
    ) -&gt; Result<mutationresult>;

    pub async fn set_app_mode(&amp;self, mode: AppMode) -&gt; Result&lt;()&gt;;
    pub async fn set_active_character(&amp;self, character_id: String) -&gt; Result&lt;()&gt;;
    pub async fn set_private_mode(&amp;self, enabled: bool) -&gt; Result&lt;()&gt;;
    pub async fn set_quiet_mode(&amp;self, enabled: bool) -&gt; Result&lt;()&gt;;
    pub async fn set_ai_lifecycle(&amp;self, state: AILifecycleState) -&gt; Result&lt;()&gt;;

    pub async fn record_interaction(&amp;self, character_id: &amp;str) -&gt; Result&lt;()&gt;;
    pub async fn record_proactive(&amp;self, character_id: &amp;str) -&gt; Result&lt;()&gt;;
    pub async fn record_ai_call(&amp;self, character_id: &amp;str, cost_cents: u32) -&gt; Result&lt;()&gt;;

    // Maintenance
    pub async fn flush(&amp;self) -&gt; Result&lt;()&gt;;
    pub async fn shutdown(&amp;self) -&gt; Result&lt;()&gt;;
}
```

### **6.3. MutationSource**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MutationSource {
    Ai,
    UserAction,
    Decay,
    DailyReset,
    Migration,
    Manual,
}
```

---

## **7. State Mutation Flow**

### **7.1. Flow chuẩn**

```text
Subsystem proposes delta
  ↓
StateManager.patch_character_state(id, delta, source)
  ↓
GuardChain.validate(delta, current, source)
  ↓
  ├─ RangeGuard.clamp()
  ├─ DailyCapGuard.check()
  ├─ PrivateModeGuard.filter()
  ├─ PersonalityModifier.adjust()
  └─ GameLogicGuard.apply()
  ↓
Apply final delta to in-memory state
  ↓
Update daily counters
  ↓
Mark dirty
  ↓
Emit `character_state_changed` event
  ↓
Return MutationResult
  ↓
[Background: flusher persists to DB]
```

### **7.2. MutationResult**

```rust
pub struct MutationResult {
    pub character_id: String,
    pub applied_delta: CharacterStateDelta,
    pub original_delta: CharacterStateDelta,
    pub new_state: CharacterState,
    pub modified_by_guards: Vec<string>, // ["range_clamped", "daily_cap"]
    pub warnings: Vec<string>,
}
```

### **7.3. Pseudocode**

```rust
pub async fn patch_character_state(
    &amp;self,
    character_id: &amp;str,
    delta: CharacterStateDelta,
    source: MutationSource,
) -&gt; Result<mutationresult> {
    let original = delta.clone();

    // 1. Load current
    let current = self.get_character_state(character_id).await?;

    // 2. Guard chain
    let guarded = self.guard_chain
        .apply(¤t, delta, source.clone(), character_id)
        .await?;

    // 3. Apply
    let new_state = self.apply_delta_in_memory(character_id, &amp;guarded.delta).await?;

    // 4. Update counters if relevant
    if guarded.delta.affinity &gt; 0 {
        self.bump_daily_affinity(character_id, guarded.delta.affinity as u32).await?;
    }

    // 5. Mark dirty
    self.dirty_flag.store(true, Ordering::Release);

    // 6. Emit event
    self.event_emitter.emit_state_changed(&amp;new_state).await;

    Ok(MutationResult {
        character_id: character_id.to_string(),
        applied_delta: guarded.delta,
        original_delta: original,
        new_state,
        modified_by_guards: guarded.modifications,
        warnings: guarded.warnings,
    })
}
```

---

## **8. Guard Chain**

### **8.1. Cấu trúc**

```rust
pub struct GuardChain {
    guards: Vec<box<dyn stateguard="">&gt;,
}

#[async_trait]
pub trait StateGuard: Send + Sync {
    async fn apply(
        &amp;self,
        current: &amp;CharacterState,
        delta: CharacterStateDelta,
        source: MutationSource,
        character_id: &amp;str,
        ctx: &amp;mut GuardContext,
    ) -&gt; Result<characterstatedelta>;

    fn name(&amp;self) -&gt; &amp;'static str;
}

pub struct GuardContext {
    pub modifications: Vec<string>,
    pub warnings: Vec<string>,
}
```

### **8.2. Guard pipeline mặc định**

```text
1. RangeGuard           → Clamp delta về biên hợp lệ
2. PrivateModeGuard     → Zero out relationship deltas nếu private mode
3. DailyCapGuard        → Clamp affinity nếu vượt daily cap
4. PersonalityModifier  → Điều chỉnh delta theo personality (vd shy → affinity gain chậm)
5. GameLogicGuard       → Rule game logic (vd trust không tăng nếu affinity &lt; 30)
```

### **8.3. RangeGuard**

```rust
impl StateGuard for RangeGuard {
    async fn apply(
        &amp;self,
        _current: &amp;CharacterState,
        mut delta: CharacterStateDelta,
        _source: MutationSource,
        _character_id: &amp;str,
        ctx: &amp;mut GuardContext,
    ) -&gt; Result<characterstatedelta> {
        let original = delta.clone();

        delta.mood = delta.mood.clamp(-3, 3);
        delta.energy = delta.energy.clamp(-10, 10);
        delta.affinity = delta.affinity.clamp(-2, 5);
        delta.trust = delta.trust.clamp(-2, 3);
        delta.familiarity = delta.familiarity.clamp(-1, 2);
        delta.curiosity = delta.curiosity.clamp(-3, 3);
        delta.patience = delta.patience.clamp(-5, 5);
        delta.confidence = delta.confidence.clamp(-3, 3);

        if delta != original {
            ctx.modifications.push("range_clamped".into());
        }

        Ok(delta)
    }

    fn name(&amp;self) -&gt; &amp;'static str { "range_guard" }
}
```

### **8.4. DailyCapGuard**

```rust
impl StateGuard for DailyCapGuard {
    async fn apply(
        &amp;self,
        _current: &amp;CharacterState,
        mut delta: CharacterStateDelta,
        _source: MutationSource,
        character_id: &amp;str,
        ctx: &amp;mut GuardContext,
    ) -&gt; Result<characterstatedelta> {
        const DAILY_AFFINITY_CAP: u32 = 10;

        if delta.affinity &gt; 0 {
            let counters = self.daily_counters.get(character_id).await?;
            let remaining = DAILY_AFFINITY_CAP.saturating_sub(counters.affinity_gained_today);

            if remaining == 0 {
                delta.affinity = 0;
                ctx.modifications.push("daily_affinity_cap_reached".into());
            } else if (delta.affinity as u32) &gt; remaining {
                delta.affinity = remaining as i8;
                ctx.modifications.push("daily_affinity_capped".into());
            }
        }

        Ok(delta)
    }

    fn name(&amp;self) -&gt; &amp;'static str { "daily_cap_guard" }
}
```

### **8.5. PrivateModeGuard**

```rust
impl StateGuard for PrivateModeGuard {
    async fn apply(
        &amp;self,
        _current: &amp;CharacterState,
        mut delta: CharacterStateDelta,
        _source: MutationSource,
        _character_id: &amp;str,
        ctx: &amp;mut GuardContext,
    ) -&gt; Result<characterstatedelta> {
        if self.runtime_state.read().await.private_mode {
            if delta.affinity != 0 || delta.trust != 0 || delta.familiarity != 0 {
                ctx.modifications.push("private_mode_zeroed_relationship".into());
            }
            delta.affinity = 0;
            delta.trust = 0;
            delta.familiarity = 0;
        }
        Ok(delta)
    }

    fn name(&amp;self) -&gt; &amp;'static str { "private_mode_guard" }
}
```

### **8.6. PersonalityModifier**

```rust
impl StateGuard for PersonalityModifier {
    async fn apply(
        &amp;self,
        _current: &amp;CharacterState,
        mut delta: CharacterStateDelta,
        _source: MutationSource,
        character_id: &amp;str,
        ctx: &amp;mut GuardContext,
    ) -&gt; Result<characterstatedelta> {
        let profile = self.character_manager.get_profile(character_id).await?;

        // Shy character: affinity tăng chậm hơn
        if profile.personality.shyness &gt; 0.7 &amp;&amp; delta.affinity &gt; 0 {
            delta.affinity = ((delta.affinity as f32) * 0.7) as i8;
            ctx.modifications.push("shyness_affinity_dampened".into());
        }

        // High playfulness: mood tăng dễ hơn
        if profile.personality.playfulness &gt; 0.7 &amp;&amp; delta.mood &gt; 0 {
            delta.mood = (delta.mood + 1).min(3);
            ctx.modifications.push("playfulness_mood_boosted".into());
        }

        Ok(delta)
    }

    fn name(&amp;self) -&gt; &amp;'static str { "personality_modifier" }
}
```

---

## **9. Decay System**

### **9.1. Nguyên tắc decay**

```text
- Mood → decay về 0 (neutral) theo thời gian.
- Energy → decay xuống nếu không "sleep" (idle dài).
- Affinity/Trust/Familiarity → KHÔNG decay (chỉ tăng/giảm qua tương tác).
- Curiosity → decay nhẹ về 50.
- Patience → decay về 60 (baseline).
- Confidence → decay rất chậm về 50.
```

### **9.2. Decay timing**

| **Field** | **Decay rate** | **Target** | **Interval** |
|---|---|---|---|
| **mood** | -1 mỗi 30 phút | 0 | 30 min |
| **energy** | -1 mỗi 20 phút (nếu app active) | 0 | 20 min |
| **energy** | +2 mỗi 30 phút (nếu idle &gt; 1h) | 100 | 30 min |
| **curiosity** | -1 mỗi 2 giờ | 50 | 2 hours |
| **patience** | +1 mỗi 1 giờ | 60 | 1 hour |
| **confidence** | -1 mỗi 6 giờ | 50 | 6 hours |

### **9.3. DecayEngine**

```rust
pub struct DecayEngine {
    interval: Duration,
    state_manager: Weak<statemanager>,
}

impl DecayEngine {
    pub async fn run(&amp;self) {
        let mut ticker = tokio::time::interval(Duration::from_secs(60));
        loop {
            ticker.tick().await;
            if let Some(sm) = self.state_manager.upgrade() {
                if let Err(e) = self.tick(&amp;sm).await {
                    tracing::warn!("decay tick failed: {}", e);
                }
            } else {
                break;
            }
        }
    }

    async fn tick(&amp;self, sm: &amp;StateManager) -&gt; Result&lt;()&gt; {
        let now = Utc::now();
        let characters: Vec<string> = sm.character_states.read().await.keys().cloned().collect();

        for character_id in characters {
            let delta = self.compute_decay_delta(&amp;character_id, now).await?;
            if !delta.is_zero() {
                sm.patch_character_state(&amp;character_id, delta, MutationSource::Decay).await?;
            }
        }
        Ok(())
    }
}
```

### **9.4. Pending decay khi app shutdown**

Khi app khởi động lại, tính khoảng thời gian từ `updated_at` cuối → áp decay tích lũy nhưng **cap ở 24 giờ** để tránh shock state.

```rust
pub async fn apply_pending_decay(&amp;self, character_id: &amp;str) -&gt; Result&lt;()&gt; {
    let state = self.get_character_state(character_id).await?;
    let elapsed = (Utc::now() - state.updated_at).to_std()?;
    let capped = elapsed.min(Duration::from_secs(24 * 3600));

    let delta = self.decay_engine.compute_for_duration(&amp;state, capped);
    if !delta.is_zero() {
        self.patch_character_state(character_id, delta, MutationSource::Decay).await?;
    }
    Ok(())
}
```

---

## **10. Daily Reset System**

### **10.1. Nguyên tắc**

```text
- Reset chạy lúc 00:00 local time mỗi ngày.
- Tạo record DailyCounters mới cho ngày mới.
- KHÔNG xóa record cũ (giữ để analytics).
- Cleanup record &gt; 30 ngày.
```

### **10.2. Reset scheduler**

```rust
pub struct DailyResetScheduler {
    state_manager: Weak<statemanager>,
}

impl DailyResetScheduler {
    pub async fn run(&amp;self) {
        loop {
            let now = Local::now();
            let next_midnight = (now.date_naive() + chrono::Duration::days(1))
                .and_hms_opt(0, 0, 5).unwrap();
            let wait = (next_midnight - now.naive_local()).to_std().unwrap_or(Duration::from_secs(60));

            tokio::time::sleep(wait).await;

            if let Some(sm) = self.state_manager.upgrade() {
                if let Err(e) = self.reset(&amp;sm).await {
                    tracing::error!("daily reset failed: {}", e);
                }
            } else {
                break;
            }
        }
    }

    async fn reset(&amp;self, sm: &amp;StateManager) -&gt; Result&lt;()&gt; {
        let today = Local::now().date_naive();
        let characters: Vec<string> = sm.character_states.read().await.keys().cloned().collect();

        for character_id in characters {
            sm.create_daily_counters(&amp;character_id, today).await?;
        }

        sm.cleanup_old_counters(today - chrono::Duration::days(30)).await?;
        sm.event_emitter.emit_daily_reset(today).await;
        Ok(())
    }
}
```

---

## **11. Persistence Layer**

### **11.1. Strategy**

```text
- In-memory state là source of truth runtime.
- Mutation chỉ mark dirty, không ghi DB ngay.
- Flusher chạy mỗi 5 giây nếu dirty flag set.
- Khi app shutdown, force flush.
- Khi critical mutation (active character switch, mode change), flush ngay.
```

### **11.2. StatePersistence**

```rust
pub struct StatePersistence {
    db: DbPool,
    flush_interval: Duration,
    state_manager: Weak<statemanager>,
}

impl StatePersistence {
    pub async fn run(&amp;self) {
        let mut ticker = tokio::time::interval(self.flush_interval);
        loop {
            ticker.tick().await;
            if let Some(sm) = self.state_manager.upgrade() {
                if sm.dirty_flag.swap(false, Ordering::AcqRel) {
                    if let Err(e) = self.flush_all(&amp;sm).await {
                        tracing::error!("persistence flush failed: {}", e);
                        sm.dirty_flag.store(true, Ordering::Release);
                    }
                }
            } else {
                break;
            }
        }
    }

    async fn flush_all(&amp;self, sm: &amp;StateManager) -&gt; Result&lt;()&gt; {
        let states = sm.character_states.read().await.clone();
        let runtime = sm.runtime_state.read().await.clone();
        let counters = sm.daily_counters.read().await.clone();

        let mut tx = self.db.begin().await?;

        for (_, state) in states {
            self.upsert_character_state(&amp;mut tx, &amp;state).await?;
        }
        self.upsert_runtime_state(&amp;mut tx, &amp;runtime).await?;
        for (_, c) in counters {
            self.upsert_daily_counters(&amp;mut tx, &amp;c).await?;
        }

        tx.commit().await?;
        Ok(())
    }
}
```

### **11.3. Flush triggers**

| **Trigger** | **Flush type** |
|---|---|
| Periodic tick (5s) | Debounced |
| App shutdown | Force |
| Active character switch | Immediate |
| Private mode toggle | Immediate |
| Daily reset | Immediate |
| Migration done | Immediate |

---

## **12. Observer &amp; Event System**

### **12.1. Event types**

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StateEvent {
    CharacterStateChanged {
        character_id: String,
        new_state: CharacterState,
        delta: CharacterStateDelta,
        source: MutationSource,
    },
    AppModeChanged {
        old: AppMode,
        new: AppMode,
    },
    ActiveCharacterChanged {
        old: Option<string>,
        new: String,
    },
    PrivateModeToggled { enabled: bool },
    QuietModeToggled { enabled: bool },
    AILifecycleChanged { state: AILifecycleState },
    DailyResetDone { date: NaiveDate },
}
```

### **12.2. Subscribers**

| **Subscriber** | **Quan tâm event nào** | **Action** |
|---|---|---|
| **AnimationDirector** | `CharacterStateChanged` (mood, energy) | Update idle animation variant |
| **AI Orchestrator** | `ActiveCharacterChanged`, `AppModeChanged` | Rebuild context |
| **ProactivityController** | `AppModeChanged`, `PrivateModeToggled` | Block/allow proactive |
| **Frontend Overlay** | All | Update UI |
| **Audit Logger** | All | Log |

### **12.3. IPC bridge**

```rust
impl StateEventEmitter {
    pub async fn emit_state_changed(&amp;self, state: &amp;CharacterState) {
        // Internal bus
        let _ = self.internal_bus.send(StateEvent::CharacterStateChanged {
            character_id: state.character_id.clone(),
            new_state: state.clone(),
            delta: CharacterStateDelta::zero(),
            source: MutationSource::Manual,
        });

        // Frontend
        if let Some(app) = self.app_handle.upgrade() {
            let _ = app.emit("character_state_changed", state);
        }
    }
}
```

---

## **13. Per-Character State Binding**

### **13.1. Nguyên tắc**

```text
- Mỗi character có 1 record CharacterState độc lập.
- Active character = character được render và tương tác hiện tại.
- Khi switch character:
  1. Flush state của character cũ.
  2. Load state của character mới.
  3. Apply pending decay.
  4. Emit ActiveCharacterChanged.
  5. AI/Animation/Behavior rebuild context.
```

### **13.2. Switch flow**

```rust
pub async fn set_active_character(&amp;self, new_id: String) -&gt; Result&lt;()&gt; {
    let old_id = {
        let runtime = self.runtime_state.read().await;
        runtime.active_character_id.clone()
    };

    if old_id == new_id { return Ok(()); }

    // 1. Flush old
    self.flush().await?;

    // 2. Ensure new state exists
    if !self.character_states.read().await.contains_key(&amp;new_id) {
        self.load_or_create_character_state(&amp;new_id).await?;
    }

    // 3. Apply pending decay on new
    self.apply_pending_decay(&amp;new_id).await?;

    // 4. Update runtime
    {
        let mut runtime = self.runtime_state.write().await;
        runtime.active_character_id = new_id.clone();
    }

    // 5. Persist runtime immediately
    self.persistence.flush_runtime_only().await?;

    // 6. Emit
    self.event_emitter.emit_active_character_changed(Some(old_id), new_id).await;

    Ok(())
}
```

---

## **14. State Migration**

### **14.1. Versioning**

```rust
pub const CURRENT_STATE_SCHEMA_VERSION: u32 = 1;
```

### **14.2. Migration registry**

```rust
pub struct StateMigrationRegistry {
    migrations: Vec<box<dyn statemigration="">&gt;,
}

#[async_trait]
pub trait StateMigration: Send + Sync {
    fn from_version(&amp;self) -&gt; u32;
    fn to_version(&amp;self) -&gt; u32;
    async fn migrate(&amp;self, db: &amp;DbPool) -&gt; Result&lt;()&gt;;
}
```

### **14.3. Migration flow**

```text
App start
  ↓
Query MAX(schema_version) FROM character_state
  ↓
Nếu &lt; CURRENT_STATE_SCHEMA_VERSION:
  ↓
  Backup DB
  ↓
  Apply migrations theo thứ tự version
  ↓
  Update schema_version cho mọi record
  ↓
  Log migration
  ↓
Continue init
```

### **14.4. Migration ví dụ**

```rust
pub struct MigrationV1ToV2;

#[async_trait]
impl StateMigration for MigrationV1ToV2 {
    fn from_version(&amp;self) -&gt; u32 { 1 }
    fn to_version(&amp;self) -&gt; u32 { 2 }

    async fn migrate(&amp;self, db: &amp;DbPool) -&gt; Result&lt;()&gt; {
        // Ví dụ: thêm field 'creativity'
        sqlx::query("ALTER TABLE character_state ADD COLUMN creativity INTEGER NOT NULL DEFAULT 50")
            .execute(db).await?;
        sqlx::query("UPDATE character_state SET schema_version = 2")
            .execute(db).await?;
        Ok(())
    }
}
```

---

## **15. State Export &amp; Import**

### **15.1. Export format**

```json
{
  "export_version": 1,
  "exported_at": "2026-05-26T22:45:00Z",
  "character_states": [
    {
      "character_id": "mira",
      "mood": 1,
      "energy": 70,
      "affinity": 45,
      "trust": 50,
      "familiarity": 30,
      "curiosity": 55,
      "patience": 60,
      "confidence": 55,
      "updated_at": "2026-05-26T22:00:00Z",
      "schema_version": 1
    }
  ],
  "runtime_state": {
    "active_character_id": "mira",
    "app_mode": "normal",
    "private_mode": false,
    "quiet_mode": false
  },
  "daily_counters": []
}
```

### **15.2. Export flow**

```rust
pub async fn export_state(&amp;self) -&gt; Result<stateexportbundle> {
    self.flush().await?;
    Ok(StateExportBundle {
        export_version: 1,
        exported_at: Utc::now(),
        character_states: self.character_states.read().await.values().cloned().collect(),
        runtime_state: self.runtime_state.read().await.clone(),
        daily_counters: self.daily_counters.read().await.values().cloned().collect(),
    })
}
```

### **15.3. Import flow**

```text
Validate export_version
  ↓
Validate schema_version mỗi record
  ↓
Nếu cần, apply migration
  ↓
Backup current state
  ↓
Replace in-memory state
  ↓
Force flush
  ↓
Emit events cho tất cả character đã thay đổi
```

---

## **16. IPC Contract**

### **16.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `state_get_character` | `{ character_id }` | `CharacterState` |
| `state_get_runtime` | `{}` | `RuntimeAppState` |
| `state_get_daily_counters` | `{ character_id }` | `DailyCounters` |
| `state_set_app_mode` | `{ mode }` | `void` |
| `state_set_active_character` | `{ character_id }` | `void` |
| `state_set_private_mode` | `{ enabled }` | `void` |
| `state_set_quiet_mode` | `{ enabled }` | `void` |
| `state_export` | `{}` | `StateExportBundle` |
| `state_import` | `StateExportBundle` | `ImportResult` |
| `state_force_flush` | `{}` | `void` |

### **16.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `character_state_changed` | `CharacterState` | UI/animation react |
| `app_mode_changed` | `{ old, new }` | UI mode indicator |
| `active_character_changed` | `{ old, new }` | UI swap character |
| `private_mode_toggled` | `{ enabled }` | UI indicator |
| `quiet_mode_toggled` | `{ enabled }` | UI indicator |
| `daily_reset_done` | `{ date }` | UI refresh counters |

---

## **17. Integration với các Subsystem**

### **17.1. AI Interaction System**

```text
- AI đề xuất state_delta → AI Orchestrator gọi
  StateManager.patch_character_state(id, delta, source=Ai).
- AI đọc state qua get_character_state để compose context.
- AI Lifecycle changes → StateManager.set_ai_lifecycle().
```

### **17.2. Animation System**

```text
- AnimationDirector subscribe `character_state_changed`.
- Khi mood/energy đổi → chọn idle variant phù hợp.
- Khi active_character_changed → swap manifest.
```

### **17.3. Memory System**

```text
- Memory không trực tiếp ghi state.
- Tuy nhiên: confirm/verify memory có thể trigger trust +1
  thông qua interaction flow → patch_character_state.
```

### **17.4. Behavior Orchestrator**

```text
- ProactivityController đọc:
  - runtime_state.app_mode
  - runtime_state.private_mode
  - daily_counters.proactive_count_today
- Khi quyết định proactive: StateManager.record_proactive().
```

### **17.5. Desktop Awareness**

```text
- Khi detect mode change → StateManager.set_app_mode().
```

### **17.6. Privacy System**

```text
- Privacy toggle → StateManager.set_private_mode() / set_quiet_mode().
- StateManager exposes flags cho mọi guard đọc.
```

---

## **18. Error Handling**

### **18.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum StateError {
    #[error("Character not found: {0}")]
    CharacterNotFound(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Migration failed: {0}")]
    MigrationFailed(String),

    #[error("Guard rejected mutation: {0}")]
    GuardRejected(String),

    #[error("State corruption detected: {0}")]
    Corruption(String),

    #[error("Import validation failed: {0}")]
    ImportInvalid(String),
}
```

### **18.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Character state not found | Tạo mới với default |
| DB write fail | Retry 1 lần, sau đó queue, alert |
| Corruption detect | Backup file corrupt, restore từ default, log |
| Migration fail | Rollback transaction, abort startup, prompt user |
| Guard reject | Trả result với `applied_delta = 0`, không lỗi |
| Import invalid | Reject, giữ state cũ |

---

## **19. Performance Considerations**

### **19.1. In-memory cache**

```text
- Toàn bộ CharacterState giữ trong RwLock<hashmap>.
- Read: lock read, copy out (state nhỏ ~80 bytes/character).
- Write: lock write trong scope hẹp.
- Max ~20 characters → memory footprint negligible.
```

### **19.2. Persistence cost**

```text
- Flush 5s/lần nếu dirty.
- UPSERT transaction batch.
- Daily counters write riêng (~1KB/day/character).
- Expected DB write: &lt; 100 ops/phút trong worst case.
```

### **19.3. Decay overhead**

```text
- Decay tick mỗi 60s.
- Mỗi character: compute delta O(1).
- Với 1 active + N inactive characters: chỉ decay active.
  (Inactive characters decay lazy khi switch back.)
```

### **19.4. Event emission**

```text
- Internal bus: tokio::sync::broadcast capacity 256.
- Frontend emit: async, không block mutation path.
- High-frequency events (decay tick): coalesce nếu cùng tick.
```

---

## **20. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── state/
│               ├── mod.rs
│               ├── manager.rs              # StateManager
│               ├── types.rs                # CharacterState, Delta, AppMode
│               ├── guards/
│               │   ├── mod.rs
│               │   ├── range.rs
│               │   ├── daily_cap.rs
│               │   ├── private_mode.rs
│               │   ├── personality.rs
│               │   └── game_logic.rs
│               ├── decay.rs                # DecayEngine
│               ├── daily_reset.rs          # DailyResetScheduler
│               ├── persistence.rs          # StatePersistence
│               ├── events.rs               # StateEvent, Emitter
│               ├── migration/
│               │   ├── mod.rs
│               │   └── v1_to_v2.rs
│               ├── export.rs
│               ├── import.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── state_commands.rs
│
├── src/
│   └── shared/
│       └── types/
│           └── state.ts
│
└── docs/
    └── state-system.md
```

---

## **21. Implementation Checklist**

### **21.1. P0 Core**

- [ ] Define `CharacterState`, `RuntimeAppState`, `DailyCounters`.
- [ ] Define `CharacterStateDelta`, `MutationSource`, `MutationResult`.
- [ ] Implement `StateManager` với init/get/patch APIs.
- [ ] Implement SQLite schema và migrations init.
- [ ] Implement in-memory cache với `RwLock<hashmap>`.
- [ ] Implement `patch_character_state` flow đầy đủ.

### **21.2. P0 Guards**

- [ ] Implement `RangeGuard`.
- [ ] Implement `DailyCapGuard`.
- [ ] Implement `PrivateModeGuard`.
- [ ] Implement `PersonalityModifier`.
- [ ] Implement `GameLogicGuard`.
- [ ] Implement `GuardChain` composition.

### **21.3. P0 Lifecycle**

- [ ] Implement `DecayEngine` với tick scheduler.
- [ ] Implement `DailyResetScheduler` với midnight cron.
- [ ] Implement pending decay khi app start.
- [ ] Implement `StatePersistence` với debounced flush.
- [ ] Implement force flush khi critical mutation.

### **21.4. P0 Events**

- [ ] Define `StateEvent` enum.
- [ ] Implement `StateEventEmitter` (internal bus + Tauri emit).
- [ ] Wire AnimationDirector subscribe.
- [ ] Wire AI Orchestrator subscribe.
- [ ] Wire Frontend Overlay subscribe.

### **21.5. P0 IPC**

- [ ] Implement commands: `state_get_*`, `state_set_*`.
- [ ] Implement events: `character_state_changed`, `app_mode_changed`, ...
- [ ] TypeScript types đồng bộ.

### **21.6. P1 Migration &amp; Export**

- [ ] Implement migration registry.
- [ ] Implement v1 baseline migration.
- [ ] Implement export/import flow.
- [ ] Backup before migration.

### **21.7. P1 Per-character**

- [ ] Implement `set_active_character` với swap flow.
- [ ] Implement lazy decay khi switch.
- [ ] Implement character state isolation tests.

### **21.8. P2 Observability**

- [ ] Audit log mutation history.
- [ ] State inspector UI (debug mode).
- [ ] Performance metrics (mutation/s, flush latency).

---

## **22. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **CharacterState** | Trạng thái nội tại per-character (mood, affinity, ...). |
| **RuntimeAppState** | Trạng thái runtime singleton của app. |
| **DailyCounters** | Bộ đếm reset theo ngày (affinity gain, proactive count, ...). |
| **StateManager** | Module duy nhất quản lý state, mọi mutation phải đi qua. |
| **GuardChain** | Pipeline validate/transform delta trước khi apply. |
| **DecayEngine** | Module tự động decay state về baseline theo thời gian. |
| **DailyResetScheduler** | Scheduler chạy lúc 00:00 reset counters. |
| **MutationSource** | Nguồn của mutation (AI, UserAction, Decay, ...). |
| **StateEvent** | Event được emit khi state thay đổi. |
| **Pending decay** | Decay tích lũy khi app offline, apply khi startup. |

---

## **Phụ lục A: Decay timing table**

| **Field** | **Khi app active** | **Khi app idle (&gt;1h)** | **Target baseline** |
|---|---|---|---|
| **mood** | -1 / 30 min | -1 / 60 min | 0 |
| **energy** | -1 / 20 min | +2 / 30 min | 100 |
| **affinity** | no decay | no decay | n/a |
| **trust** | no decay | no decay | n/a |
| **familiarity** | no decay | no decay | n/a |
| **curiosity** | -1 / 2h | -1 / 4h | 50 |
| **patience** | +1 / 1h | +1 / 1h | 60 |
| **confidence** | -1 / 6h | -1 / 6h | 50 |

**Lưu ý:**
- Decay tổng tối đa khi pending: cap 24 giờ.
- Decay không kéo state vượt qua baseline (mood = 0 thì không decay tiếp).

---

## **Phụ lục B: JSON mẫu**

### **B.1. CharacterState**

```json
{
  "character_id": "mira",
  "mood": 1,
  "energy": 68,
  "affinity": 45,
  "trust": 50,
  "familiarity": 30,
  "curiosity": 55,
  "patience": 60,
  "confidence": 55,
  "updated_at": "2026-05-26T22:45:00Z",
  "schema_version": 1
}
```

### **B.2. MutationResult**

```json
{
  "character_id": "mira",
  "applied_delta": {
    "mood": 1,
    "energy": 0,
    "affinity": 1,
    "trust": 1,
    "familiarity": 1,
    "curiosity": 0,
    "patience": 0,
    "confidence": 0
  },
  "original_delta": {
    "mood": 1,
    "energy": 0,
    "affinity": 3,
    "trust": 1,
    "familiarity": 1,
    "curiosity": 0,
    "patience": 0,
    "confidence": 0
  },
  "new_state": { "...": "..." },
  "modified_by_guards": ["daily_affinity_capped"],
  "warnings": []
}
```

### **B.3. DailyCounters**

```json
{
  "character_id": "mira",
  "date": "2026-05-26",
  "affinity_gained_today": 8,
  "proactive_count_today": 3,
  "ai_calls_today": 24,
  "ai_cost_cents_today": 12,
  "interaction_count_today": 18
}
```

### **B.4. StateEvent (CharacterStateChanged)**

```json
{
  "type": "character_state_changed",
  "character_id": "mira",
  "new_state": {
    "character_id": "mira",
    "mood": 1,
    "energy": 68,
    "affinity": 45,
    "trust": 50,
    "familiarity": 30,
    "curiosity": 55,
    "patience": 60,
    "confidence": 55,
    "updated_at": "2026-05-26T22:45:00Z",
    "schema_version": 1
  },
  "delta": {
    "mood": 1, "energy": 0, "affinity": 1, "trust": 1,
    "familiarity": 1, "curiosity": 0, "patience": 0, "confidence": 0
  },
  "source": "ai"
}
```

---

**Tài liệu này là source of truth cho State System. Mọi subsystem phải tuân thủ: state chỉ mutate qua `StateManager.patch()`, mọi mutation đi qua guard chain, mọi thay đổi phải emit event, persistence luôn debounced, decay và daily reset luôn chạy ngầm.**

---