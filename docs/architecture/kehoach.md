# Implementation Guide chi tiết: State Mutation Guard Runtime

Đã xác nhận status. Triển khai **Implementation Guide** theo task list 4 giai đoạn agent đề xuất, kèm code template Rust ready-to-paste.

---

## **Tổng quan plan**

| **Giai đoạn** | **Effort** | **Deliverable** | **Risk** |
|---|---|---|---|
| **GĐ 1** — Guard Logic + Providers | 2-3 ngày | Pipeline + Stage 1,2 + NoOp providers | Thấp |
| **GĐ 2** — Tracker + Audit | 2 ngày | DailyCapTracker + AuditLog | Thấp |
| **GĐ 3** — Wiring + Migration | 2-3 ngày | Full pipeline + DB migration | **Cao** (migration) |
| **GĐ 4** — Unit Tests | 2 ngày | 100% newtype, 90% stages | Trung bình |

**Tổng:** ~10 ngày làm việc. Có thể parallel GĐ4 với GĐ3.

---

# **GIAI ĐOẠN 1: Guard Logic &amp; Providers**

## **1.1. File structure cần tạo**

```text
src-tauri/src/core/state/
├── guards/                          ← MỚI
│   ├── mod.rs                       ← Export Guard, errors
│   ├── pipeline.rs                  ← StateMutationGuard struct + apply()
│   ├── errors.rs                    ← GuardError enum
│   ├── events.rs                    ← StateChangedEvent payload
│   ├── stages/
│   │   ├── mod.rs
│   │   ├── schema.rs                ← Stage 1
│   │   ├── range.rs                 ← Stage 2
│   │   ├── daily_cap.rs             ← Stage 3 (GĐ2)
│   │   ├── personality.rs           ← Stage 4 (NoOp GĐ1)
│   │   ├── mode.rs                  ← Stage 5 (NoOp GĐ1)
│   │   ├── privacy.rs               ← Stage 6 (NoOp GĐ1)
│   │   └── commit.rs                ← Stage 7
│   └── tracker.rs                   ← DailyCapTracker (GĐ2)
│
├── providers/                       ← MỚI
│   ├── mod.rs
│   ├── profile.rs                   ← CharacterProfileProvider trait + NoOp
│   ├── mode.rs                      ← EffectiveModeProvider trait + NoOp
│   └── privacy.rs                   ← PrivacyPolicyProvider trait + NoOp
│
├── types/                           ← ĐÃ CÓ
│   ├── mod.rs
│   ├── mood.rs
│   ├── energy.rs
│   ├── small_scale.rs
│   ├── large_scale.rs
│   └── character_state.rs
│
├── audit/                           ← MỚI (GĐ2)
│   ├── mod.rs
│   └── log.rs
│
├── migration/                       ← MỚI (GĐ3)
│   ├── mod.rs
│   └── v1_to_v2.rs
│
└── manager.rs                       ← REFACTOR (GĐ3)
```

---

## **1.2. `guards/errors.rs` — GuardError**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GuardError {
    #[error("schema validation failed: {0}")]
    SchemaError(String),

    #[error("unknown character: {0}")]
    UnknownCharacter(String),

    #[error("state store error: {0}")]
    StateStoreError(String),

    #[error("commit failed: {0}")]
    CommitFailed(String),

    #[error("profile provider error: {0}")]
    ProfileProviderError(String),

    #[error("lock poisoned: {0}")]
    LockPoisoned(String),

    #[error("internal error: {0}")]
    Internal(String),
}

impl GuardError {
    pub fn is_recoverable(&amp;self) -&gt; bool {
        !matches!(self, GuardError::CommitFailed(_) | GuardError::LockPoisoned(_))
    }
}
```

---

## **1.3. `guards/events.rs` — Event payload**

```rust
use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::core::state::types::CharacterState;
use super::pipeline::{AppliedDelta, MutationSource};

#[derive(Debug, Clone, Serialize)]
pub struct StateChangedEvent {
    pub character_id: String,
    pub before_state: CharacterState,
    pub after_state: CharacterState,
    pub applied_deltas: Vec<applieddelta>,
    pub source: MutationSource,
    pub committed_at: DateTime<utc>,
}

pub trait StateEventEmitter: Send + Sync {
    fn emit_state_changed(&amp;self, event: &amp;StateChangedEvent);
    fn emit_mutation_rejected(&amp;self, character_id: &amp;str, reasons: &amp;[String]);
    fn emit_daily_reset(&amp;self, character_id: &amp;str, date: chrono::NaiveDate);
}

/// NoOp emitter for testing
pub struct NoOpEmitter;

impl StateEventEmitter for NoOpEmitter {
    fn emit_state_changed(&amp;self, _: &amp;StateChangedEvent) {}
    fn emit_mutation_rejected(&amp;self, _: &amp;str, _: &amp;[String]) {}
    fn emit_daily_reset(&amp;self, _: &amp;str, _: chrono::NaiveDate) {}
}
```

---

## **1.4. `providers/profile.rs` — Profile provider trait + NoOp**

```rust
use std::sync::Arc;

/// Tạm thời định nghĩa minimal personality cho Guard Stage 4.
/// Khi CharacterProfile thật được implement, struct này sẽ được thay thế.
#[derive(Debug, Clone, Default)]
pub struct PersonalitySnapshot {
    pub warmth: f32,      // 0..1
    pub shyness: f32,
    pub playfulness: f32,
    pub patience: f32,
    pub curiosity: f32,
}

impl PersonalitySnapshot {
    pub fn neutral() -&gt; Self {
        Self {
            warmth: 0.5,
            shyness: 0.5,
            playfulness: 0.5,
            patience: 0.5,
            curiosity: 0.5,
        }
    }
}

pub trait CharacterProfileProvider: Send + Sync {
    fn get_personality(&amp;self, character_id: &amp;str) -&gt; Option<personalitysnapshot>;
}

/// NoOp provider — luôn trả về neutral personality.
/// Dùng cho Phase hiện tại khi CharacterProfile chưa tồn tại.
pub struct NoOpProfileProvider;

impl CharacterProfileProvider for NoOpProfileProvider {
    fn get_personality(&amp;self, _character_id: &amp;str) -&gt; Option<personalitysnapshot> {
        Some(PersonalitySnapshot::neutral())
    }
}

pub fn default_profile_provider() -&gt; Arc<dyn characterprofileprovider=""> {
    Arc::new(NoOpProfileProvider)
}
```

---

## **1.5. `providers/mode.rs` — Mode provider trait + NoOp**

```rust
use std::sync::Arc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EffectiveBehaviorMode {
    Normal,
    Focus,
    Gaming,
    Meeting,
    Watching,
    Idle,
    Sleep,
    Quiet,
    Streamer,
    Private,
    Restricted,
}

pub trait EffectiveModeProvider: Send + Sync {
    fn current_mode(&amp;self) -&gt; EffectiveBehaviorMode;
}

pub struct NoOpModeProvider;

impl EffectiveModeProvider for NoOpModeProvider {
    fn current_mode(&amp;self) -&gt; EffectiveBehaviorMode {
        EffectiveBehaviorMode::Normal
    }
}

pub fn default_mode_provider() -&gt; Arc<dyn effectivemodeprovider=""> {
    Arc::new(NoOpModeProvider)
}
```

---

## **1.6. `providers/privacy.rs` — Privacy provider trait + NoOp**

```rust
use std::sync::Arc;

#[derive(Debug, Clone, Default)]
pub struct PrivacySnapshot {
    pub private_mode_enabled: bool,
    pub quiet_mode_enabled: bool,
    pub restricted_mode_enabled: bool,
    pub streamer_mode_enabled: bool,
}

pub trait PrivacyPolicyProvider: Send + Sync {
    fn current_snapshot(&amp;self) -&gt; PrivacySnapshot;
}

pub struct NoOpPrivacyProvider;

impl PrivacyPolicyProvider for NoOpPrivacyProvider {
    fn current_snapshot(&amp;self) -&gt; PrivacySnapshot {
        PrivacySnapshot::default()
    }
}

pub fn default_privacy_provider() -&gt; Arc<dyn privacypolicyprovider=""> {
    Arc::new(NoOpPrivacyProvider)
}
```

---

## **1.7. `guards/pipeline.rs` — Core struct (skeleton GĐ1)**

```rust
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::core::state::types::{CharacterState, StateField};
use crate::core::state::store::StateStore;
use crate::core::state::providers::{
    CharacterProfileProvider, EffectiveModeProvider, PrivacyPolicyProvider,
};
use super::errors::GuardError;
use super::events::{StateChangedEvent, StateEventEmitter};

// ============== Request / Response ==============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateMutationRequest {
    pub character_id: String,
    pub deltas: Vec<fielddelta>,
    pub source: MutationSource,
    pub reason: String,
    #[serde(default)]
    pub bypass_personality: bool,
    #[serde(default)]
    pub bypass_daily_cap: bool,
    pub requested_at: DateTime<utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldDelta {
    pub field: StateField,
    pub delta: i16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
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

impl MutationSource {
    pub fn name(&amp;self) -&gt; &amp;'static str {
        match self {
            MutationSource::UtilityAi { .. } =&gt; "utility_ai",
            MutationSource::Llm { .. } =&gt; "llm",
            MutationSource::UserInteraction { .. } =&gt; "user_interaction",
            MutationSource::Decay =&gt; "decay",
            MutationSource::BehaviorOrchestrator { .. } =&gt; "behavior",
            MutationSource::DebugCommand =&gt; "debug",
            MutationSource::Migration =&gt; "migration",
            MutationSource::System =&gt; "system",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MutationResult {
    pub character_id: String,
    pub applied_deltas: Vec<applieddelta>,
    pub rejected_deltas: Vec<rejecteddelta>,
    pub before_state: CharacterState,
    pub after_state: CharacterState,
    pub source: MutationSource,
    pub stages_executed: Vec<string>,
    pub committed_at: DateTime<utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppliedDelta {
    pub field: StateField,
    pub requested_delta: i16,
    pub modified_delta: i16,
    pub before_value: i16,
    pub after_value: i16,
    pub modifier_chain: Vec<modifierstep>,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RejectionReason {
    InvalidValue { detail: String },
    DailyCapExceeded { remaining: i16 },
    PrivacyBlocked { mode: String },
    ModeBlocked { mode: String },
    PolicyForbidden { policy: String },
    UnknownCharacter,
    SchemaError { detail: String },
}

// ============== Config ==============

#[derive(Debug, Clone)]
pub struct GuardConfig {
    pub daily_caps: HashMap<statefield, i16="">,
    pub personality_enabled: bool,
    pub mode_policy_enabled: bool,
    pub privacy_policy_enabled: bool,
    pub audit_log_size: usize,
}

impl Default for GuardConfig {
    fn default() -&gt; Self {
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
        }
    }
}

// ============== Guard ==============

pub struct StateMutationGuard {
    pub(crate) config: Arc<rwlock<guardconfig>&gt;,
    pub(crate) state_store: Arc<statestore>,
    pub(crate) profile_provider: Arc<dyn characterprofileprovider="">,
    pub(crate) mode_provider: Arc<dyn effectivemodeprovider="">,
    pub(crate) privacy_provider: Arc<dyn privacypolicyprovider="">,
    pub(crate) event_emitter: Arc<dyn stateeventemitter="">,
    // GĐ2 sẽ thêm: daily_trackers, audit_log
}

impl StateMutationGuard {
    pub fn new(
        config: GuardConfig,
        state_store: Arc<statestore>,
        profile_provider: Arc<dyn characterprofileprovider="">,
        mode_provider: Arc<dyn effectivemodeprovider="">,
        privacy_provider: Arc<dyn privacypolicyprovider="">,
        event_emitter: Arc<dyn stateeventemitter="">,
    ) -&gt; Self {
        Self {
            config: Arc::new(RwLock::new(config)),
            state_store,
            profile_provider,
            mode_provider,
            privacy_provider,
            event_emitter,
        }
    }

    /// MAIN ENTRY POINT — apply mutation request through full pipeline.
    pub fn apply(
        &amp;self,
        request: StateMutationRequest,
    ) -&gt; Result<mutationresult, guarderror=""> {
        // Stage 1: Schema validation
        super::stages::schema::validate(&amp;request)?;

        // Load current state
        let before_state = self
            .state_store
            .get(&amp;request.character_id)
            .ok_or_else(|| GuardError::UnknownCharacter(request.character_id.clone()))?;

        // Stages 2-6: process each delta
        let mut applied = Vec::new();
        let mut rejected = Vec::new();
        let mut working_state = before_state.clone();

        for delta in &amp;request.deltas {
            match self.process_delta(delta, &amp;working_state, &amp;request) {
                Ok(applied_delta) =&gt; {
                    working_state = self.apply_to_state(working_state, &amp;applied_delta);
                    applied.push(applied_delta);
                }
                Err(reason) =&gt; {
                    rejected.push(RejectedDelta {
                        field: delta.field,
                        requested_delta: delta.delta,
                        reason,
                    });
                }
            }
        }

        // Stage 7: Commit
        let after_state = super::stages::commit::commit(
            &amp;self.state_store,
            working_state,
        )?;

        let result = MutationResult {
            character_id: request.character_id.clone(),
            applied_deltas: applied,
            rejected_deltas: rejected,
            before_state: before_state.clone(),
            after_state: after_state.clone(),
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

        // Emit event if state actually changed
        if !result.applied_deltas.is_empty() {
            let event = StateChangedEvent {
                character_id: result.character_id.clone(),
                before_state,
                after_state,
                applied_deltas: result.applied_deltas.clone(),
                source: result.source.clone(),
                committed_at: result.committed_at,
            };
            self.event_emitter.emit_state_changed(&amp;event);
        }

        if !result.rejected_deltas.is_empty() {
            let reasons: Vec<string> = result
                .rejected_deltas
                .iter()
                .map(|r| format!("{:?}", r.reason))
                .collect();
            self.event_emitter
                .emit_mutation_rejected(&amp;result.character_id, &amp;reasons);
        }

        Ok(result)
    }

    /// Process single delta through stages 2-6.
    /// GĐ1: chỉ implement Stage 2 (range). Các stage khác là NoOp.
    fn process_delta(
        &amp;self,
        delta: &amp;FieldDelta,
        current_state: &amp;CharacterState,
        request: &amp;StateMutationRequest,
    ) -&gt; Result<applieddelta, rejectionreason=""> {
        let mut chain = Vec::new();
        let mut effective = delta.delta;

        // Stage 2: Range preview
        let before_range = effective;
        effective = super::stages::range::preview(current_state, delta.field, effective);
        chain.push(ModifierStep {
            stage: "range".into(),
            before: before_range,
            after: effective,
            note: "clamped to field bounds".into(),
        });

        if effective == 0 &amp;&amp; delta.delta != 0 {
            return Err(RejectionReason::InvalidValue {
                detail: "delta clamped to zero (already at bound)".into(),
            });
        }

        // Stage 3: Daily Cap (GĐ2 — placeholder)
        // Stage 4: Personality (GĐ1 NoOp khi bypass)
        if !request.bypass_personality &amp;&amp; self.config.read().unwrap().personality_enabled {
            let before_p = effective;
            if let Some(personality) = self.profile_provider.get_personality(&amp;request.character_id)
            {
                effective = super::stages::personality::apply(
                    &amp;personality,
                    delta.field,
                    effective,
                );
            }
            chain.push(ModifierStep {
                stage: "personality".into(),
                before: before_p,
                after: effective,
                note: "personality modifier".into(),
            });
        }

        // Stage 5: Mode (NoOp via NoOpProvider trong GĐ1)
        if self.config.read().unwrap().mode_policy_enabled {
            let before_m = effective;
            let mode = self.mode_provider.current_mode();
            effective = super::stages::mode::apply(mode, delta.field, effective, &amp;request.source)?;
            chain.push(ModifierStep {
                stage: "mode".into(),
                before: before_m,
                after: effective,
                note: format!("mode={:?}", mode),
            });
        }

        // Stage 6: Privacy
        if self.config.read().unwrap().privacy_policy_enabled {
            let before_pr = effective;
            let snapshot = self.privacy_provider.current_snapshot();
            effective = super::stages::privacy::apply(
                &amp;snapshot,
                delta.field,
                effective,
                &amp;request.source,
            )?;
            chain.push(ModifierStep {
                stage: "privacy".into(),
                before: before_pr,
                after: effective,
                note: "privacy check".into(),
            });
        }

        // Compute final value
        let before_value = get_field_value(current_state, delta.field);
        let after_value = before_value + effective;

        Ok(AppliedDelta {
            field: delta.field,
            requested_delta: delta.delta,
            modified_delta: effective,
            before_value,
            after_value,
            modifier_chain: chain,
        })
    }

    fn apply_to_state(
        &amp;self,
        mut state: CharacterState,
        delta: &amp;AppliedDelta,
    ) -&gt; CharacterState {
        apply_delta_to_state(&amp;mut state, delta.field, delta.modified_delta);
        state
    }
}

// ============== Helpers ==============

pub(crate) fn get_field_value(state: &amp;CharacterState, field: StateField) -&gt; i16 {
    match field {
        StateField::Mood =&gt; state.mood.value() as i16,
        StateField::Energy =&gt; state.energy.value() as i16,
        StateField::Curiosity =&gt; state.curiosity.value() as i16,
        StateField::Patience =&gt; state.patience.value() as i16,
        StateField::Confidence =&gt; state.confidence.value() as i16,
        StateField::Loneliness =&gt; state.loneliness.value() as i16,
        StateField::Affinity =&gt; state.affinity.value() as i16,
        StateField::Trust =&gt; state.trust.value() as i16,
        StateField::Familiarity =&gt; state.familiarity.value() as i16,
    }
}

pub(crate) fn apply_delta_to_state(
    state: &amp;mut CharacterState,
    field: StateField,
    delta: i16,
) {
    match field {
        StateField::Mood =&gt; state.mood = state.mood.apply_delta(delta as i8),
        StateField::Energy =&gt; state.energy = state.energy.apply_delta(delta as i8),
        StateField::Curiosity =&gt; state.curiosity = state.curiosity.apply_delta(delta),
        StateField::Patience =&gt; state.patience = state.patience.apply_delta(delta),
        StateField::Confidence =&gt; state.confidence = state.confidence.apply_delta(delta),
        StateField::Loneliness =&gt; state.loneliness = state.loneliness.apply_delta(delta),
        StateField::Affinity =&gt; state.affinity = state.affinity.apply_delta(delta),
        StateField::Trust =&gt; state.trust = state.trust.apply_delta(delta),
        StateField::Familiarity =&gt; state.familiarity = state.familiarity.apply_delta(delta),
    }
}
```

---

## **1.8. `guards/stages/schema.rs` — Stage 1**

```rust
use std::collections::HashSet;
use chrono::Utc;

use crate::core::state::guards::errors::GuardError;
use crate::core::state::guards::pipeline::StateMutationRequest;

const MAX_DELTAS_PER_REQUEST: usize = 16;
const MAX_REASON_LENGTH: usize = 200;
const MAX_CLOCK_SKEW_SECONDS: i64 = 5;

pub fn validate(request: &amp;StateMutationRequest) -&gt; Result&lt;(), GuardError&gt; {
    if request.character_id.is_empty() {
        return Err(GuardError::SchemaError("empty character_id".into()));
    }

    if request.deltas.is_empty() {
        return Err(GuardError::SchemaError("empty deltas".into()));
    }

    if request.deltas.len() &gt; MAX_DELTAS_PER_REQUEST {
        return Err(GuardError::SchemaError(format!(
            "too many deltas: {} (max {})",
            request.deltas.len(),
            MAX_DELTAS_PER_REQUEST
        )));
    }

    if request.reason.len() &gt; MAX_REASON_LENGTH {
        return Err(GuardError::SchemaError(format!(
            "reason too long: {} chars (max {})",
            request.reason.len(),
            MAX_REASON_LENGTH
        )));
    }

    let now = Utc::now();
    let skew = (request.requested_at - now).num_seconds();
    if skew &gt; MAX_CLOCK_SKEW_SECONDS {
        return Err(GuardError::SchemaError(format!(
            "requested_at in future: {}s",
            skew
        )));
    }

    let mut seen = HashSet::new();
    for delta in &amp;request.deltas {
        if !seen.insert(delta.field) {
            return Err(GuardError::SchemaError(format!(
                "duplicate field: {:?}",
                delta.field
            )));
        }
    }

    Ok(())
}
```

---

## **1.9. `guards/stages/range.rs` — Stage 2**

```rust
use crate::core::state::types::{CharacterState, StateField, Mood, Energy, Affinity, Trust, Familiarity, Curiosity, Patience, Confidence, Loneliness};

/// Preview clamp: tính effective_delta sau khi áp range bounds.
/// Không mutate state, chỉ return delta đã điều chỉnh.
pub fn preview(state: &amp;CharacterState, field: StateField, requested_delta: i16) -&gt; i16 {
    let (current, min, max) = get_field_bounds(state, field);
    let target = current.saturating_add(requested_delta);
    let clamped_target = target.clamp(min, max);
    clamped_target - current
}

fn get_field_bounds(state: &amp;CharacterState, field: StateField) -&gt; (i16, i16, i16) {
    match field {
        StateField::Mood =&gt; (
            state.mood.value() as i16,
            Mood::MIN as i16,
            Mood::MAX as i16,
        ),
        StateField::Energy =&gt; (
            state.energy.value() as i16,
            Energy::MIN as i16,
            Energy::MAX as i16,
        ),
        StateField::Curiosity =&gt; (state.curiosity.value() as i16, 0, Curiosity::MAX as i16),
        StateField::Patience =&gt; (state.patience.value() as i16, 0, Patience::MAX as i16),
        StateField::Confidence =&gt; (state.confidence.value() as i16, 0, Confidence::MAX as i16),
        StateField::Loneliness =&gt; (state.loneliness.value() as i16, 0, Loneliness::MAX as i16),
        StateField::Affinity =&gt; (state.affinity.value() as i16, 0, Affinity::MAX as i16),
        StateField::Trust =&gt; (state.trust.value() as i16, 0, Trust::MAX as i16),
        StateField::Familiarity =&gt; (state.familiarity.value() as i16, 0, Familiarity::MAX as i16),
    }
}
```

---

## **1.10. Stage 4/5/6 skeleton (NoOp behavior GĐ1)**

### **`guards/stages/personality.rs`**

```rust
use crate::core::state::providers::PersonalitySnapshot;
use crate::core::state::types::StateField;

pub fn apply(
    personality: &amp;PersonalitySnapshot,
    field: StateField,
    delta: i16,
) -&gt; i16 {
    let modifier = match field {
        StateField::Affinity if delta &gt; 0 =&gt; 1.0 - personality.shyness * 0.3,
        StateField::Mood if delta &gt; 0 =&gt; 0.8 + personality.warmth * 0.4,
        StateField::Mood if delta &lt; 0 =&gt; 1.0 - personality.warmth * 0.2,
        StateField::Trust if delta &gt; 0 =&gt; 0.7 + personality.patience * 0.3,
        StateField::Curiosity if delta &lt; 0 =&gt; 1.0 - personality.curiosity * 0.3,
        _ =&gt; 1.0,
    };

    (delta as f32 * modifier).round() as i16
}
```

### **`guards/stages/mode.rs`**

```rust
use crate::core::state::guards::pipeline::{MutationSource, RejectionReason};
use crate::core::state::providers::EffectiveBehaviorMode;
use crate::core::state::types::StateField;

pub fn apply(
    mode: EffectiveBehaviorMode,
    field: StateField,
    delta: i16,
    source: &amp;MutationSource,
) -&gt; Result<i16, rejectionreason=""> {
    use EffectiveBehaviorMode::*;

    match mode {
        Restricted | Private =&gt; {
            let is_relationship = matches!(
                field,
                StateField::Affinity | StateField::Trust | StateField::Familiarity
            );
            let is_ai = matches!(
                source,
                MutationSource::Llm { .. } | MutationSource::UtilityAi { .. }
            );

            if is_relationship &amp;&amp; is_ai {
                return Err(RejectionReason::ModeBlocked {
                    mode: format!("{:?}", mode),
                });
            }
            Ok(delta)
        }
        Meeting | Gaming =&gt; Ok((delta as f32 * 0.5).round() as i16),
        Focus =&gt; Ok((delta as f32 * 0.7).round() as i16),
        _ =&gt; Ok(delta),
    }
}
```

### **`guards/stages/privacy.rs`**

```rust
use crate::core::state::guards::pipeline::{MutationSource, RejectionReason};
use crate::core::state::providers::PrivacySnapshot;
use crate::core::state::types::StateField;

pub fn apply(
    privacy: &amp;PrivacySnapshot,
    field: StateField,
    delta: i16,
    source: &amp;MutationSource,
) -&gt; Result<i16, rejectionreason=""> {
    if privacy.restricted_mode_enabled {
        if matches!(source, MutationSource::Llm { .. }) {
            return Err(RejectionReason::PrivacyBlocked {
                mode: "restricted".into(),
            });
        }
    }

    if privacy.private_mode_enabled {
        let is_relationship = matches!(
            field,
            StateField::Affinity | StateField::Trust | StateField::Familiarity
        );
        if is_relationship &amp;&amp; matches!(source, MutationSource::Llm { .. }) {
            return Err(RejectionReason::PrivacyBlocked {
                mode: "private".into(),
            });
        }
    }

    Ok(delta)
}
```

### **`guards/stages/commit.rs`**

```rust
use std::sync::Arc;
use chrono::Utc;

use crate::core::state::guards::errors::GuardError;
use crate::core::state::store::StateStore;
use crate::core::state::types::CharacterState;

pub fn commit(
    store: &amp;Arc<statestore>,
    mut new_state: CharacterState,
) -&gt; Result<characterstate, guarderror=""> {
    new_state.updated_at = Utc::now();
    store
        .patch(new_state.clone())
        .map_err(|e| GuardError::CommitFailed(e.to_string()))?;
    Ok(new_state)
}
```

---

## **1.11. `guards/mod.rs` + `guards/stages/mod.rs`**

```rust
// guards/mod.rs
pub mod errors;
pub mod events;
pub mod pipeline;
pub mod stages;

pub use errors::GuardError;
pub use events::{StateChangedEvent, StateEventEmitter, NoOpEmitter};
pub use pipeline::{
    StateMutationGuard, StateMutationRequest, MutationResult, MutationSource,
    FieldDelta, AppliedDelta, RejectedDelta, RejectionReason, GuardConfig,
};
```

```rust
// guards/stages/mod.rs
pub mod schema;
pub mod range;
pub mod personality;
pub mod mode;
pub mod privacy;
pub mod commit;
// GĐ2: pub mod daily_cap;
```

### **Checklist GĐ1**

- [ ] Tạo file structure `guards/` và `providers/`
- [ ] Implement `errors.rs`, `events.rs`
- [ ] Implement 3 NoOp providers
- [ ] Implement `pipeline.rs` (skeleton, chưa có daily cap)
- [ ] Implement stages 1, 2, 4, 5, 6, 7
- [ ] Compile pass `cargo build`
- [ ] Smoke test: tạo Guard với NoOp providers, gọi `apply()` với request đơn giản, verify state thay đổi đúng

---

# **GIAI ĐOẠN 2: Daily Tracker &amp; Audit Log**

## **2.1. `guards/tracker.rs` — DailyCapTracker**

```rust
use std::collections::HashMap;
use chrono::{NaiveDate, Local};
use serde::{Deserialize, Serialize};

use crate::core::state::types::StateField;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCapTracker {
    pub character_id: String,
    pub date: NaiveDate,
    pub used: HashMap<statefield, i16="">,
}

impl DailyCapTracker {
    pub fn new(character_id: String, date: NaiveDate) -&gt; Self {
        Self {
            character_id,
            date,
            used: HashMap::new(),
        }
    }

    pub fn today(character_id: String) -&gt; Self {
        Self::new(character_id, Local::now().date_naive())
    }

    /// Trả về delta còn được phép cho field này (theo abs value).
    /// Luôn &gt;= 0.
    pub fn remaining(&amp;self, field: StateField, cap: i16) -&gt; i16 {
        let used = self.used.get(&amp;field).copied().unwrap_or(0);
        (cap - used.abs()).max(0)
    }

    /// Cộng dồn abs(delta) vào used counter.
    pub fn consume(&amp;mut self, field: StateField, delta: i16) {
        let entry = self.used.entry(field).or_insert(0);
        *entry = entry.saturating_add(delta.abs());
    }

    /// Kiểm tra có cần reset (qua ngày mới) không.
    pub fn needs_reset(&amp;self) -&gt; bool {
        self.date != Local::now().date_naive()
    }

    pub fn reset(&amp;mut self) {
        self.date = Local::now().date_naive();
        self.used.clear();
    }
}
```

---

## **2.2. `guards/stages/daily_cap.rs` — Stage 3**

```rust
use std::sync::{Arc, RwLock};
use std::collections::HashMap;

use crate::core::state::guards::pipeline::RejectionReason;
use crate::core::state::guards::tracker::DailyCapTracker;
use crate::core::state::types::StateField;

pub fn apply(
    tracker: &amp;Arc<rwlock<dailycaptracker>&gt;,
    caps: &amp;HashMap<statefield, i16="">,
    field: StateField,
    delta: i16,
    bypass: bool,
) -&gt; Result<i16, rejectionreason=""> {
    if bypass {
        return Ok(delta);
    }

    let cap = caps.get(&amp;field).copied().unwrap_or(i16::MAX);
    if cap &lt;= 0 {
        return Err(RejectionReason::PolicyForbidden {
            policy: format!("no daily allowance for {:?}", field),
        });
    }

    let tracker_read = tracker.read().map_err(|_| RejectionReason::InvalidValue {
        detail: "tracker lock poisoned".into(),
    })?;

    let remaining = tracker_read.remaining(field, cap);
    drop(tracker_read);

    if remaining &lt;= 0 {
        return Err(RejectionReason::DailyCapExceeded { remaining: 0 });
    }

    let abs_delta = delta.abs();
    if abs_delta &gt; remaining {
        let sign = if delta &gt;= 0 { 1 } else { -1 };
        Ok(sign * remaining)
    } else {
        Ok(delta)
    }
}

pub fn consume(
    tracker: &amp;Arc<rwlock<dailycaptracker>&gt;,
    field: StateField,
    delta: i16,
) {
    if let Ok(mut t) = tracker.write() {
        if t.needs_reset() {
            t.reset();
        }
        t.consume(field, delta);
    }
}
```

---

## **2.3. `audit/log.rs` — Ring buffer**

```rust
use std::collections::VecDeque;
use std::sync::RwLock;

use crate::core::state::guards::pipeline::MutationResult;

pub struct AuditLog {
    buffer: RwLock<vecdeque<mutationresult>&gt;,
    capacity: usize,
}

impl AuditLog {
    pub fn new(capacity: usize) -&gt; Self {
        Self {
            buffer: RwLock::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    pub fn append(&amp;self, result: MutationResult) {
        if let Ok(mut buf) = self.buffer.write() {
            if buf.len() &gt;= self.capacity {
                buf.pop_front();
            }
            buf.push_back(result);
        }
    }

    pub fn recent(&amp;self, n: usize) -&gt; Vec<mutationresult> {
        self.buffer
            .read()
            .map(|buf| buf.iter().rev().take(n).cloned().collect())
            .unwrap_or_default()
    }

    pub fn clear(&amp;self) {
        if let Ok(mut buf) = self.buffer.write() {
            buf.clear();
        }
    }

    pub fn len(&amp;self) -&gt; usize {
        self.buffer.read().map(|b| b.len()).unwrap_or(0)
    }
}
```

---

## **2.4. Update `pipeline.rs` — Tích hợp tracker + audit**

Thêm vào struct `StateMutationGuard`:

```rust
use std::sync::{Arc, RwLock};
use std::collections::HashMap;

use crate::core::state::audit::log::AuditLog;
use super::tracker::DailyCapTracker;

pub struct StateMutationGuard {
    // ... fields cũ
    pub(crate) daily_trackers: Arc<rwlock<hashmap<string, arc<rwlock<dailycaptracker="">&gt;&gt;&gt;&gt;,
    pub(crate) audit_log: Arc<auditlog>,
}
```

Update `new()`:

```rust
impl StateMutationGuard {
    pub fn new(/* ... */) -&gt; Self {
        let audit_capacity = config.audit_log_size;
        Self {
            // ...
            daily_trackers: Arc::new(RwLock::new(HashMap::new())),
            audit_log: Arc::new(AuditLog::new(audit_capacity)),
        }
    }

    fn get_or_create_tracker(&amp;self, character_id: &amp;str) -&gt; Arc<rwlock<dailycaptracker>&gt; {
        let mut trackers = self.daily_trackers.write().unwrap();
        if let Some(tracker) = trackers.get(character_id) {
            let needs_reset = tracker.read().map(|t| t.needs_reset()).unwrap_or(true);
            if !needs_reset {
                return tracker.clone();
            }
            // Reset existing
            if let Ok(mut t) = tracker.write() {
                t.reset();
            }
            self.event_emitter
                .emit_daily_reset(character_id, chrono::Local::now().date_naive());
            return tracker.clone();
        }

        let new_tracker = Arc::new(RwLock::new(DailyCapTracker::today(
            character_id.to_string(),
        )));
        trackers.insert(character_id.to_string(), new_tracker.clone());
        new_tracker
    }
}
```

Thêm Stage 3 vào `process_delta()` giữa Stage 2 (range) và Stage 4 (personality):

```rust
// Stage 3: Daily Cap
let tracker = self.get_or_create_tracker(&amp;request.character_id);
let caps = self.config.read().unwrap().daily_caps.clone();

let before_cap = effective;
effective = super::stages::daily_cap::apply(
    &amp;tracker,
    &amp;caps,
    delta.field,
    effective,
    request.bypass_daily_cap,
)?;
chain.push(ModifierStep {
    stage: "daily_cap".into(),
    before: before_cap,
    after: effective,
    note: format!("cap={}", caps.get(&amp;delta.field).copied().unwrap_or(0)),
});
```

Sau khi `commit()` thành công, consume tracker:

```rust
// In apply(), sau khi commit thành công:
for applied in &amp;result.applied_deltas {
    let tracker = self.get_or_create_tracker(&amp;result.character_id);
    super::stages::daily_cap::consume(&amp;tracker, applied.field, applied.modified_delta);
}

// Append audit
self.audit_log.append(result.clone());
```

### **Checklist GĐ2**

- [ ] Implement `DailyCapTracker` với `remaining()`, `consume()`, `reset()`
- [ ] Implement `daily_cap.rs` stage
- [ ] Implement `AuditLog` ring buffer
- [ ] Wire tracker + audit vào `StateMutationGuard`
- [ ] Test daily reset bằng cách mock thời gian
- [ ] Test cap exhaustion edge case

---

# **GIAI ĐOẠN 3: Wiring &amp; DB Migration**

## **3.1. Refactor `manager.rs` — Single point of write**

**Trước:**

```rust
// manager.rs (cũ)
impl StateManager {
    pub fn patch_character_state(&amp;self, patch: CharacterStatePatch) -&gt; Result&lt;...&gt; {
        // Direct write
        self.store.patch(...)
    }
}
```

**Sau:**

```rust
// manager.rs (mới)
use std::sync::Arc;

use crate::core::state::guards::{
    StateMutationGuard, StateMutationRequest, FieldDelta, MutationSource, MutationResult,
};
use crate::core::state::types::StateField;

pub struct StateManager {
    guard: Arc<statemutationguard>,
    // Bỏ direct store reference — buộc đi qua guard
}

impl StateManager {
    pub fn new(guard: Arc<statemutationguard>) -&gt; Self {
        Self { guard }
    }

    /// Public API duy nhất để mutate state.
    pub fn mutate(
        &amp;self,
        request: StateMutationRequest,
    ) -&gt; Result<mutationresult, box<dyn="" std::error::error="" +="" send="" sync="">&gt; {
        self.guard.apply(request).map_err(|e| e.into())
    }

    /// Convenience helper cho Utility AI.
    pub fn apply_utility_action_effects(
        &amp;self,
        character_id: &amp;str,
        action_id: &amp;str,
        effects: &amp;[(StateField, i16)],
    ) -&gt; Result<mutationresult, box<dyn="" std::error::error="" +="" send="" sync="">&gt; {
        let deltas = effects
            .iter()
            .map(|(f, d)| FieldDelta {
                field: *f,
                delta: *d,
            })
            .collect();

        let request = StateMutationRequest {
            character_id: character_id.to_string(),
            deltas,
            source: MutationSource::UtilityAi {
                action_id: action_id.to_string(),
            },
            reason: format!("utility_action:{}", action_id),
            bypass_personality: false,
            bypass_daily_cap: false,
            requested_at: chrono::Utc::now(),
        };

        self.mutate(request)
    }

    /// Convenience helper cho Decay engine.
    pub fn apply_decay(
        &amp;self,
        character_id: &amp;str,
        decay_deltas: &amp;[(StateField, i16)],
    ) -&gt; Result<mutationresult, box<dyn="" std::error::error="" +="" send="" sync="">&gt; {
        let deltas = decay_deltas
            .iter()
            .map(|(f, d)| FieldDelta {
                field: *f,
                delta: *d,
            })
            .collect();

        let request = StateMutationRequest {
            character_id: character_id.to_string(),
            deltas,
            source: MutationSource::Decay,
            reason: "scheduled_decay".to_string(),
            bypass_personality: true,
            bypass_daily_cap: true, // Decay bypass cap
            requested_at: chrono::Utc::now(),
        };

        self.mutate(request)
    }

    /// Convenience helper cho User Interaction.
    pub fn apply_user_interaction(
        &amp;self,
        character_id: &amp;str,
        interaction_type: &amp;str,
        effects: &amp;[(StateField, i16)],
    ) -&gt; Result<mutationresult, box<dyn="" std::error::error="" +="" send="" sync="">&gt; {
        let deltas = effects
            .iter()
            .map(|(f, d)| FieldDelta {
                field: *f,
                delta: *d,
            })
            .collect();

        let request = StateMutationRequest {
            character_id: character_id.to_string(),
            deltas,
            source: MutationSource::UserInteraction {
                interaction_type: interaction_type.to_string(),
            },
            reason: format!("user_interaction:{}", interaction_type),
            bypass_personality: false,
            bypass_daily_cap: false,
            requested_at: chrono::Utc::now(),
        };

        self.mutate(request)
    }
}
```

### **Audit caller sites**

Tìm và refactor mọi nơi gọi state mutation:

```bash
# Bash commands hỗ trợ
grep -rn "state_store.patch" src-tauri/src/
grep -rn "StateStore::patch" src-tauri/src/
grep -rn "store.patch" src-tauri/src/
```

**Caller sites điển hình cần refactor:**

| **File** | **Vị trí** | **Refactor thành** |
|---|---|---|
| `behavior/utility_ai/ticker.rs` | Apply action effects | `manager.apply_utility_action_effects()` |
| `state/decay.rs` | Decay tick | `manager.apply_decay()` |
| `commands.rs` (nếu có) | User interaction commands | `manager.apply_user_interaction()` |
| `ai/orchestrator.rs` (tương lai) | LLM state_delta | `manager.mutate()` với `MutationSource::Llm` |

---

## **3.2. DB Migration v1 → v2**

### **`migration/v1_to_v2.rs`**

```rust
use rusqlite::{Connection, Result as SqlResult};
use chrono::Utc;

use crate::core::state::types::{
    CharacterState, Mood, Energy, Affinity, Trust, Familiarity,
    Curiosity, Patience, Confidence, Loneliness,
};

pub fn detect_schema_version(conn: &amp;Connection) -&gt; SqlResult<u32> {
    let result: SqlResult<u32> = conn.query_row(
        "SELECT value FROM meta WHERE key = 'schema_version'",
        [],
        |row| row.get(0),
    );

    match result {
        Ok(v) =&gt; Ok(v),
        Err(_) =&gt; Ok(1), // Default to v1 nếu meta table chưa có
    }
}

pub fn migrate_v1_to_v2(conn: &amp;mut Connection) -&gt; SqlResult<u32> {
    let tx = conn.transaction()?;

    // 1. Đọc tất cả character state cũ
    let mut stmt = tx.prepare("SELECT character_id, mood, energy, affinity, trust, familiarity, curiosity, patience, confidence FROM character_states")?;

    let rows: Vec&lt;(String, i64, i64, i64, i64, i64, i64, i64, i64)&gt; = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
            ))
        })?
        .collect::<sqlresult<vec<_>&gt;&gt;()?;
    drop(stmt);

    let mut migrated_count = 0u32;

    for (cid, mood, energy, affinity, trust, familiarity, curiosity, patience, confidence) in rows {
        let new_state = CharacterState {
            character_id: cid.clone(),
            mood: Mood::new(scale_mood_v1_to_v2(mood as i8)),
            energy: Energy::new(scale_energy_v1_to_v2(energy as i8)),
            affinity: Affinity::new(affinity.clamp(0, 100) as u8),
            trust: Trust::new(trust.clamp(0, 100) as u8),
            familiarity: Familiarity::new(familiarity.clamp(0, 100) as u8),
            curiosity: Curiosity::new(scale_to_5_v1_to_v2(curiosity, 100)),
            patience: Patience::new(scale_to_5_v1_to_v2(patience, 100)),
            confidence: Confidence::new(scale_to_5_v1_to_v2(confidence, 100)),
            loneliness: Loneliness::default(),
            updated_at: Utc::now(),
            schema_version: 2,
        };

        tx.execute(
            "UPDATE character_states SET
                mood = ?2, energy = ?3, affinity = ?4, trust = ?5,
                familiarity = ?6, curiosity = ?7, patience = ?8, confidence = ?9,
                loneliness = ?10, updated_at = ?11, schema_version = 2
             WHERE character_id = ?1",
            rusqlite::params![
                cid,
                new_state.mood.value() as i64,
                new_state.energy.value() as i64,
                new_state.affinity.value() as i64,
                new_state.trust.value() as i64,
                new_state.familiarity.value() as i64,
                new_state.curiosity.value() as i64,
                new_state.patience.value() as i64,
                new_state.confidence.value() as i64,
                new_state.loneliness.value() as i64,
                new_state.updated_at.to_rfc3339(),
            ],
        )?;

        migrated_count += 1;
    }

    // Update meta
    tx.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2')",
        [],
    )?;

    tx.commit()?;

    Ok(migrated_count)
}

/// Scale từ v1 mood range (giả định -10..10) → v2 (-3..3)
fn scale_mood_v1_to_v2(old: i8) -&gt; i8 {
    let normalized = (old as f32 / 10.0).clamp(-1.0, 1.0);
    (normalized * 3.0).round() as i8
}

/// Scale từ v1 energy range (giả định 0..100) → v2 (-3..3 centered)
fn scale_energy_v1_to_v2(old: i8) -&gt; i8 {
    let normalized = (old as f32 / 100.0).clamp(0.0, 1.0);
    ((normalized - 0.5) * 6.0).round() as i8
}

/// Scale 0..max → 0..5
fn scale_to_5_v1_to_v2(old: i64, max: i64) -&gt; u8 {
    ((old as f32 / max as f32) * 5.0).round().clamp(0.0, 5.0) as u8
}
```

### **Wire migration vào app startup**

```rust
// src-tauri/src/lib.rs hoặc nơi khởi tạo DB
pub fn initialize_database(db_path: &amp;str) -&gt; Result<connection, box<dyn="" std::error::error="">&gt; {
    let mut conn = Connection::open(db_path)?;

    // Đảm bảo meta table tồn tại
    conn.execute(
        "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )?;

    let version = crate::core::state::migration::v1_to_v2::detect_schema_version(&amp;conn)?;

    if version &lt; 2 {
        log::info!("Migrating state schema from v{} to v2", version);
        let count = crate::core::state::migration::v1_to_v2::migrate_v1_to_v2(&amp;mut conn)?;
        log::info!("Migrated {} character states to v2", count);
    }

    Ok(conn)
}
```

### **Checklist GĐ3**

- [ ] Refactor `manager.rs` thành facade chỉ gọi qua Guard
- [ ] Tìm &amp; refactor tất cả caller sites của `StateStore::patch()`
- [ ] Update `ticker.rs` dùng `manager.apply_utility_action_effects()`
- [ ] Update `decay.rs` dùng `manager.apply_decay()` với `bypass_daily_cap=true`
- [ ] Implement migration v1 → v2
- [ ] Wire migration vào app startup
- [ ] Test migration với fixture DB v1
- [ ] Backup DB trước khi migrate (rename file thành `chiro-pet.db.v1.bak`)

---

# **GIAI ĐOẠN 4: Unit Testing**

## **4.1. Newtype tests — 100% coverage**

```rust
// types/mood.rs (cuối file)
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mood_clamps_above_max() {
        assert_eq!(Mood::new(10).value(), Mood::MAX);
    }

    #[test]
    fn mood_clamps_below_min() {
        assert_eq!(Mood::new(-10).value(), Mood::MIN);
    }

    #[test]
    fn mood_normalized_at_min_is_zero() {
        assert_eq!(Mood::new(Mood::MIN).normalized(), 0.0);
    }

    #[test]
    fn mood_normalized_at_max_is_one() {
        assert_eq!(Mood::new(Mood::MAX).normalized(), 1.0);
    }

    #[test]
    fn mood_normalized_at_zero_is_half() {
        assert!((Mood::new(0).normalized() - 0.5).abs() &lt; f32::EPSILON);
    }

    #[test]
    fn mood_apply_delta_positive() {
        assert_eq!(Mood::new(0).apply_delta(2).value(), 2);
    }

    #[test]
    fn mood_apply_delta_clamps_max() {
        assert_eq!(Mood::new(2).apply_delta(5).value(), Mood::MAX);
    }

    #[test]
    fn mood_apply_delta_clamps_min() {
        assert_eq!(Mood::new(-2).apply_delta(-5).value(), Mood::MIN);
    }

    #[test]
    fn mood_default_is_zero() {
        assert_eq!(Mood::default().value(), 0);
    }
}
```

Lặp lại pattern này cho 8 newtypes còn lại.

---

## **4.2. Stage tests**

```rust
// guards/stages/range.rs (cuối file)
#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::state::types::CharacterState;

    fn state_with_mood(mood: i8) -&gt; CharacterState {
        CharacterState {
            mood: Mood::new(mood),
            ..Default::default()
        }
    }

    #[test]
    fn preview_clamps_positive_overflow() {
        let state = state_with_mood(2);
        // mood=2, request +5 → clamp at 3, effective = 1
        assert_eq!(preview(&amp;state, StateField::Mood, 5), 1);
    }

    #[test]
    fn preview_returns_zero_when_already_at_bound() {
        let state = state_with_mood(Mood::MAX);
        assert_eq!(preview(&amp;state, StateField::Mood, 5), 0);
    }

    #[test]
    fn preview_handles_negative_clamp() {
        let state = state_with_mood(-2);
        assert_eq!(preview(&amp;state, StateField::Mood, -5), -1);
    }

    #[test]
    fn preview_in_range_passes_through() {
        let state = state_with_mood(0);
        assert_eq!(preview(&amp;state, StateField::Mood, 2), 2);
    }
}
```

```rust
// guards/stages/daily_cap.rs (cuối file)
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, RwLock};
    use chrono::Local;

    fn make_tracker(used: i16) -&gt; Arc<rwlock<dailycaptracker>&gt; {
        let mut t = DailyCapTracker::new("test".into(), Local::now().date_naive());
        if used &gt; 0 {
            t.consume(StateField::Affinity, used);
        }
        Arc::new(RwLock::new(t))
    }

    fn make_caps() -&gt; HashMap<statefield, i16=""> {
        let mut caps = HashMap::new();
        caps.insert(StateField::Affinity, 5);
        caps
    }

    #[test]
    fn cap_reduces_delta_when_close_to_limit() {
        let tracker = make_tracker(4);
        let result = apply(&amp;tracker, &amp;make_caps(), StateField::Affinity, 3, false);
        assert_eq!(result, Ok(1));
    }

    #[test]
    fn cap_rejects_when_exhausted() {
        let tracker = make_tracker(5);
        let result = apply(&amp;tracker, &amp;make_caps(), StateField::Affinity, 1, false);
        assert!(matches!(result, Err(RejectionReason::DailyCapExceeded { .. })));
    }

    #[test]
    fn bypass_skips_cap() {
        let tracker = make_tracker(5);
        let result = apply(&amp;tracker, &amp;make_caps(), StateField::Affinity, 10, true);
        assert_eq!(result, Ok(10));
    }

    #[test]
    fn negative_delta_uses_abs_for_remaining() {
        let tracker = make_tracker(0);
        let result = apply(&amp;tracker, &amp;make_caps(), StateField::Affinity, -3, false);
        assert_eq!(result, Ok(-3));
    }
}
```

---

## **4.3. E2E pipeline test**

```rust
// guards/pipeline.rs (cuối file)
#[cfg(test)]
mod e2e_tests {
    use super::*;
    use std::sync::Arc;
    use crate::core::state::providers::*;
    use crate::core::state::store::StateStore;
    use crate::core::state::guards::events::NoOpEmitter;

    fn make_guard() -&gt; StateMutationGuard {
        let store = Arc::new(StateStore::new_in_memory());
        store.create_default("mira");

        StateMutationGuard::new(
            GuardConfig::default(),
            store,
            Arc::new(NoOpProfileProvider),
            Arc::new(NoOpModeProvider),
            Arc::new(NoOpPrivacyProvider),
            Arc::new(NoOpEmitter),
        )
    }

    #[test]
    fn full_pipeline_applies_simple_mutation() {
        let guard = make_guard();
        let request = StateMutationRequest {
            character_id: "mira".into(),
            deltas: vec![FieldDelta {
                field: StateField::Mood,
                delta: 1,
            }],
            source: MutationSource::UtilityAi {
                action_id: "test".into(),
            },
            reason: "e2e test".into(),
            bypass_personality: false,
            bypass_daily_cap: false,
            requested_at: chrono::Utc::now(),
        };

        let result = guard.apply(request).expect("should succeed");
        assert_eq!(result.applied_deltas.len(), 1);
        assert_eq!(result.rejected_deltas.len(), 0);
        assert_eq!(result.after_state.mood.value(), 1);
    }

    #[test]
    fn partial_mutation_some_clamped_some_rejected() {
        // Implementation: setup tracker exhausted cho affinity,
        // request gồm mood +1 (OK) và affinity +5 (rejected)
        // assert applied=[mood], rejected=[affinity]
    }
}
```

---

## **4.4. Concurrency smoke test**

```rust
#[cfg(test)]
mod concurrency_tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn concurrent_mutations_respect_daily_cap() {
        let guard = Arc::new(make_guard());
        let mut handles = vec![];

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
                    reason: "concurrent".into(),
                    bypass_personality: false,
                    bypass_daily_cap: false,
                    requested_at: chrono::Utc::now(),
                })
            }));
        }

        for h in handles {
            let _ = h.join();
        }

        let state = guard.state_store.get("mira").unwrap();
        // Cap = 5, không bao giờ vượt
        assert!(state.affinity.value() &lt;= 5);
    }
}
```

### **Checklist GĐ4**

- [ ] Newtype tests: 100% coverage (9 newtypes × 5-8 tests = 45-70 tests)
- [ ] Stage tests: schema, range, daily_cap, personality, mode, privacy (mỗi stage 4-6 tests)
- [ ] E2E pipeline tests: 5+ scenarios
- [ ] Migration tests: fixture v1 data → verify v2 output
- [ ] Concurrency smoke test
- [ ] `cargo test` pass 100%
- [ ] Coverage report (`cargo tarpaulin` hoặc `cargo llvm-cov`)

---

# **Rollout Plan**

## **Thứ tự merge**

```text
PR #1: GĐ1 — Guard skeleton + NoOp providers + Stages 1,2,4,5,6,7
  → Smoke test pass, không phá compile

PR #2: GĐ2 — DailyCapTracker + Stage 3 + AuditLog
  → Stage 3 tests pass

PR #3: GĐ3.a — Refactor manager.rs facade + redirect all callers
  → All existing tests still pass

PR #4: GĐ3.b — DB Migration v1 → v2
  → Migration test với fixture pass

PR #5: GĐ4 — Full unit test coverage
  → cargo tarpaulin show &gt;90% state module coverage
```

## **Verification sau mỗi PR**

```bash
# Sau mỗi PR
cargo build --release
cargo test --workspace
cargo clippy -- -D warnings
cargo tarpaulin --skip-clean --out Stdout  # Coverage

# Smoke test runtime
cargo run --release
# → Verify character vẫn render, Utility AI vẫn tick, state vẫn decay
```

## **Rollback strategy**

```text
- DB backup trước GĐ3.b (rename chiro-pet.db → chiro-pet.db.pre-v2)
- Feature flag GUARD_ENABLED env var để bypass Guard nếu critical bug
- Audit log persist (optional) để forensic nếu state corrupt
```

---

# **Quan điểm thẳng**

&gt; **Plan này khả thi trong ~10 ngày làm việc với 1 dev.** Risk chính là **GĐ3.b (Migration)** vì:
&gt; - User có thể có data thật cần migrate
&gt; - Một bug trong scaling formula → state bị reset
&gt; - Phải có **backup DB tự động** trước khi chạy migration
&gt;
&gt; **Khuyến nghị thêm:**
&gt; 1. **Dry-run migration mode**: Chạy migration trên copy DB, log diff, không commit. Verify diff trước khi chạy thật.
&gt; 2. **Migration test fixture**: Tạo `tests/fixtures/state_v1.db` chứa ~5 character với edge case (mood=10, mood=-10, energy=0, energy=100, affinity=255 do bug cũ).
&gt; 3. **Audit log persist optional**: Mặc định in-memory. Bật persist qua env var khi debug production issue.
&gt; 4. **Skip GĐ3.b nếu chưa có user data**: Nếu app chưa release ra ngoài, drop bảng cũ và recreate cleanly. Không cần migration formula phức tạp.

---

# **Câu hỏi xác nhận**

| # | **Câu hỏi** | **Tác động** |
|---|---|---|
| **1** | App đã có user thật chưa? | Quyết định mức độ careful cho GĐ3.b |
| **2** | Có dùng `tokio` cho async ở manager không? | Quyết định `Mutex` vs `tokio::sync::Mutex` |
| **3** | `StateStore::patch()` trả về error type gì hiện tại? | Cần map vào `GuardError::CommitFailed` |
| **4** | `StateField` enum đã có trong `types/mod.rs` chưa? | Nếu chưa, tạo theo spec Section 6.2 |
| **5** | Migration có cần Auto trigger lúc app start hay manual command? | Quyết định UX |

