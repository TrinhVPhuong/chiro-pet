use std::sync::Arc;
use tokio::sync::RwLock;

use super::types::{CharacterState, RuntimeAppState, DailyCounters, CharacterStateDelta, MutationSource, MutationResult};
use super::errors::Result;
use super::guards::{GuardChain, GuardContext};
use chrono::{Utc, NaiveDate, DateTime};
use std::collections::HashMap;
use sqlx::Row;

use super::db::DbPool;

pub struct StateManager {
    pub character_states: Arc<RwLock<HashMap<String, CharacterState>>>,
    pub runtime_state: Arc<RwLock<RuntimeAppState>>,
    pub daily_counters: Arc<RwLock<HashMap<String, DailyCounters>>>,

    guard_chain: GuardChain,
    db: Option<DbPool>,
}

impl StateManager {
    pub async fn new() -> Result<Self> {
        let mut char_states = HashMap::new();
        // Insert a default character for phase 4 testing
        char_states.insert("chiro".to_string(), CharacterState {
            character_id: "chiro".to_string(),
            ..Default::default()
        });

        let mut runtime = RuntimeAppState::default();
        runtime.active_character_id = "chiro".to_string();

        let mut daily = HashMap::new();
        daily.insert("chiro".to_string(), DailyCounters::new("chiro".to_string(), Utc::now().date_naive()));

        Ok(Self {
            character_states: Arc::new(RwLock::new(char_states)),
            runtime_state: Arc::new(RwLock::new(runtime)),
            daily_counters: Arc::new(RwLock::new(daily)),
            guard_chain: GuardChain::new(),
            db: None,
        })
    }

    pub async fn init_db(&mut self, app: &tauri::AppHandle) -> Result<()> {
        let db = DbPool::init(app).await?;
        self.db = Some(db.clone());
        self.load_all_from_db().await?;
        Ok(())
    }

    async fn load_all_from_db(&self) -> Result<()> {
        if let Some(db) = &self.db {
            let records = sqlx::query("SELECT * FROM character_states")
                .fetch_all(&db.pool)
                .await
                .map_err(|e| super::errors::StateError::DatabaseError(e.to_string()))?;

            let mut states = self.character_states.write().await;
            for r in records {
                let character_id: String = r.get("character_id");
                let updated_at_str: String = r.get("updated_at");
                let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
                    .map(|d| d.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                let state = CharacterState {
                    character_id: character_id.clone(),
                    mood: super::types::mood::Mood::new(r.get::<i64, _>("mood") as i8),
                    energy: super::types::energy::Energy::new(r.get::<i64, _>("energy") as i8),
                    affinity: super::types::large_scale::Affinity::new(r.get::<i64, _>("affinity") as u8),
                    trust: super::types::large_scale::Trust::new(r.get::<i64, _>("trust") as u8),
                    familiarity: super::types::large_scale::Familiarity::new(r.get::<i64, _>("familiarity") as u8),
                    curiosity: super::types::small_scale::Curiosity::new(r.get::<i64, _>("curiosity") as u8),
                    patience: super::types::small_scale::Patience::new(r.get::<i64, _>("patience") as u8),
                    confidence: super::types::small_scale::Confidence::new(r.get::<i64, _>("confidence") as u8),
                    loneliness: super::types::small_scale::Loneliness::default(),
                    updated_at,
                    schema_version: r.get::<i64, _>("schema_version") as u32,
                };
                states.insert(character_id, state);
            }

            let daily_records = sqlx::query("SELECT * FROM daily_counters")
                .fetch_all(&db.pool)
                .await
                .map_err(|e| super::errors::StateError::DatabaseError(e.to_string()))?;

            let mut counters = self.daily_counters.write().await;
            for r in daily_records {
                let character_id: String = r.get("character_id");
                let date_str: String = r.get("date_str");
                if let Ok(date) = NaiveDate::parse_from_str(&date_str, "%Y-%m-%d") {
                    let counter = DailyCounters {
                        character_id: character_id.clone(),
                        date,
                        affinity_gained_today: r.get::<i64, _>("affinity_gained_today") as u32,
                        proactive_count_today: r.get::<i64, _>("proactive_count_today") as u32,
                        ai_calls_today: r.get::<i64, _>("ai_calls_today") as u32,
                        ai_cost_cents_today: r.get::<i64, _>("ai_cost_cents_today") as u32,
                        interaction_count_today: r.get::<i64, _>("interaction_count_today") as u32,
                    };
                    counters.insert(character_id, counter);
                }
            }
        }
        Ok(())
    }

    pub async fn get_character_state(&self, character_id: &str) -> Result<CharacterState> {
        let states = self.character_states.read().await;
        states.get(character_id).cloned().ok_or_else(|| super::errors::StateError::CharacterNotFound(character_id.to_string()))
    }

    pub async fn patch_character_state(
        &self,
        character_id: &str,
        delta: CharacterStateDelta,
        source: MutationSource,
    ) -> Result<MutationResult> {
        let original_delta = delta.clone();

        // 1. Load current
        let current = self.get_character_state(character_id).await?;

        // 2. Guard chain
        let mut ctx = GuardContext::new();
        let guarded_delta = self.guard_chain.apply(&current, delta, source, character_id, &mut ctx).await?;

        // 3. Apply in memory
        let mut states = self.character_states.write().await;
        let state = states.get_mut(character_id).ok_or_else(|| super::errors::StateError::CharacterNotFound(character_id.to_string()))?;
        
        state.mood = state.mood.apply_delta(guarded_delta.mood);
        state.energy = state.energy.apply_delta(guarded_delta.energy);
        state.affinity = state.affinity.apply_delta(guarded_delta.affinity as i16);
        state.trust = state.trust.apply_delta(guarded_delta.trust as i16);
        state.familiarity = state.familiarity.apply_delta(guarded_delta.familiarity as i16);
        state.curiosity = state.curiosity.apply_delta(guarded_delta.curiosity as i16);
        state.patience = state.patience.apply_delta(guarded_delta.patience as i16);
        state.confidence = state.confidence.apply_delta(guarded_delta.confidence as i16);
        state.updated_at = Utc::now();

        let new_state = state.clone();
        drop(states);

        // Sync to DB
        if let Some(db) = &self.db {
            let updated_at_str = new_state.updated_at.to_rfc3339();
            let _ = sqlx::query(
                r#"
                INSERT INTO character_states (
                    character_id, mood, energy, affinity, trust, familiarity, curiosity, patience, confidence, updated_at, schema_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(character_id) DO UPDATE SET
                    mood = excluded.mood,
                    energy = excluded.energy,
                    affinity = excluded.affinity,
                    trust = excluded.trust,
                    familiarity = excluded.familiarity,
                    curiosity = excluded.curiosity,
                    patience = excluded.patience,
                    confidence = excluded.confidence,
                    updated_at = excluded.updated_at,
                    schema_version = excluded.schema_version
                "#
            )
            .bind(&new_state.character_id)
            .bind(new_state.mood.value())
            .bind(new_state.energy.value())
            .bind(new_state.affinity.value())
            .bind(new_state.trust.value())
            .bind(new_state.familiarity.value())
            .bind(new_state.curiosity.value())
            .bind(new_state.patience.value())
            .bind(new_state.confidence.value())
            .bind(updated_at_str)
            .bind(new_state.schema_version)
            .execute(&db.pool)
            .await;
        }

        Ok(MutationResult {
            character_id: character_id.to_string(),
            applied_delta: guarded_delta,
            original_delta,
            new_state,
            modified_by_guards: ctx.modifications,
            warnings: ctx.warnings,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_state_manager_patch() {
        let manager = StateManager::new().await.unwrap();
        
        let delta = CharacterStateDelta {
            mood: 2,
            energy: -10,
            affinity: 0,
            trust: 0,
            familiarity: 0,
            curiosity: 0,
            patience: 0,
            confidence: 0,
        };

        let result = manager.patch_character_state("chiro", delta, MutationSource::OfflineAI).await.unwrap();
        
        // Initial defaults are: mood: 0, energy: 0
        assert_eq!(result.new_state.mood.value(), 2);
        assert_eq!(result.new_state.energy.value(), -3); // clamped at MIN

        let current = manager.get_character_state("chiro").await.unwrap();
        assert_eq!(current.mood.value(), 2);
        assert_eq!(current.energy.value(), -3);
    }
}
