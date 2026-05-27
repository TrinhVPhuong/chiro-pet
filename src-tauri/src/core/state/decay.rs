use std::sync::Arc;
use tokio::time::Duration;
use crate::core::state::StateManager;
use crate::core::state::types::{CharacterStateDelta, MutationSource};

pub struct DecayEngine {
    state_manager: Arc<StateManager>,
}

impl DecayEngine {
    pub fn new(state_manager: Arc<StateManager>) -> Self {
        Self { state_manager }
    }

    pub async fn run_loop(self: Arc<Self>, interval_seconds: u64) {
        let mut interval = tokio::time::interval(Duration::from_secs(interval_seconds));
        
        loop {
            interval.tick().await;
            self.tick().await;
        }
    }

    async fn tick(&self) {
        // Only run decay if not in private mode, etc (could add more checks here)
        let runtime = self.state_manager.runtime_state.read().await;
        if runtime.private_mode {
            return;
        }
        drop(runtime);

        // Simple decay: -1 energy, -1 mood every tick (for testing, make it fast, e.g. every minute)
        // In a real game, this would be slower or depend on current activities.
        let delta = CharacterStateDelta {
            energy: -1,
            mood: -1,
            affinity: 0,
            trust: 0,
            familiarity: 0,
            curiosity: 0,
            patience: 0,
            confidence: 0,
        };

        if let Err(e) = self.state_manager.patch_character_state("chiro", delta, MutationSource::Decay).await {
            log::error!("DecayEngine failed to patch state: {:?}", e);
        } else {
            log::debug!("DecayEngine applied periodic decay.");
        }
    }
}
