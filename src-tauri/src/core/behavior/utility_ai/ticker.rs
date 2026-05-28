use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use rand::Rng;
use tauri::Emitter;

use crate::core::state::StateManager;
use crate::core::behavior::transition_engine::TransitionEngine;
use super::action::UtilityAction;
use tauri::AppHandle;
use std::collections::HashMap;
use chrono::Utc;

pub struct ProactivityTicker {
    state_manager: Arc<StateManager>,
    transition_engine: Arc<TransitionEngine>,
    actions_pool: Arc<RwLock<HashMap<String, UtilityAction>>>,
    active_action_id: Arc<RwLock<Option<String>>>,
    last_action_time: Arc<RwLock<HashMap<String, i64>>>,
    app_handle: AppHandle,
}

impl ProactivityTicker {
    pub fn new(
        state_manager: Arc<StateManager>,
        transition_engine: Arc<TransitionEngine>,
        actions_pool: HashMap<String, UtilityAction>,
        app_handle: AppHandle,
    ) -> Self {
        Self {
            state_manager,
            transition_engine,
            actions_pool: Arc::new(RwLock::new(actions_pool)),
            active_action_id: Arc::new(RwLock::new(None)),
            last_action_time: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        }
    }

    pub async fn run_loop(self: Arc<Self>, interval_seconds: u64) {
        let mut interval = tokio::time::interval(Duration::from_secs(interval_seconds));
        
        loop {
            interval.tick().await;
            self.tick().await;
        }
    }

    async fn tick(&self) {
        // Check AI Lifecycle state before proceeding
        let runtime = self.state_manager.runtime_state.read().await;
        
        // Only tick if the AI is Idle
        match runtime.ai_lifecycle_state {
            crate::core::state::types::AILifecycleState::Idle => {}
            _ => return, // Suspend Utility AI
        }

        // Apply 60s cooldown after interactions
        if let Some(last_interaction) = runtime.last_interaction_at {
            let elapsed = Utc::now().signed_duration_since(last_interaction);
            if elapsed.num_seconds() < 60 {
                return; // Cooldown not yet met
            }
        }
        
        drop(runtime);

        let state = match self.state_manager.get_character_state("chiro").await {
            Ok(s) => s,
            Err(e) => {
                log::error!("Failed to get character state: {:?}", e);
                return;
            }
        };

        let actions = self.actions_pool.read().await;
        let active_id = self.active_action_id.read().await.clone();
        let last_times = self.last_action_time.read().await;
        let now = Utc::now().timestamp();

        let mut scored_actions: Vec<(String, f32)> = Vec::new();

        for (id, action) in actions.iter() {
            // Check cooldown
            if let Some(&last_time) = last_times.get(id) {
                if now - last_time < action.cooldown_seconds as i64 {
                    continue; // Skip on cooldown
                }
            }

            let mut score = action.evaluate(&state);

            // Action Inertia: Add bonus if this is the currently active action
            if Some(id.clone()) == active_id {
                score += 0.15; // 15% inertia bonus
                score = score.clamp(0.0, 1.0);
            }

            if score >= 0.2 { // Minimum threshold
                scored_actions.push((id.clone(), score));
            }
        }

        if scored_actions.is_empty() {
            return;
        }

        // Sort by score descending
        scored_actions.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Take top 3
        let top_n = scored_actions.into_iter().take(3).collect::<Vec<_>>();
        
        // Weighted random selection
        let selected_action_id = {
            let total_score: f32 = top_n.iter().map(|(_, s)| s).sum();
            let mut rng = rand::thread_rng();
            let mut pick_value = rng.gen_range(0.0..total_score);
            
            let mut selected = top_n[0].0.clone();
            for (id, score) in top_n {
                pick_value -= score;
                if pick_value <= 0.0 {
                    selected = id;
                    break;
                }
            }
            selected
        };

        let selected_action = actions.get(&selected_action_id).unwrap();

        // Check if we need to interrupt or continue
        if let Some(active) = &active_id {
            if *active != selected_action_id {
                // Only switch if the new action score > current action score (with inertia)
                // and new action is allowed to interrupt or current action is finished.
                // For MVP Phase 4, we assume we switch if the score is better and we made it here.
                log::info!("Utility AI: Switching from {} to {}", active, selected_action_id);
            } else {
                log::info!("Utility AI: Continuing action {}", active);
                return; // Nothing to change
            }
        } else {
            log::info!("Utility AI: Starting action {}", selected_action_id);
        }

        // Apply
        let mut active_lock = self.active_action_id.write().await;
        *active_lock = Some(selected_action_id.clone());
        drop(active_lock);

        let mut time_lock = self.last_action_time.write().await;
        time_lock.insert(selected_action_id.clone(), now);
        drop(time_lock);

        // Check for shader mode overrides based on action
        if selected_action.id == "take_a_nap" {
            #[derive(Clone, serde::Serialize)]
            struct ShaderModePayload { mode: String }
            let _ = self.app_handle.emit("change_shader_mode", ShaderModePayload { mode: "sleep".to_string() });
        } else {
            #[derive(Clone, serde::Serialize)]
            struct ShaderModePayload { mode: String }
            let _ = self.app_handle.emit("change_shader_mode", ShaderModePayload { mode: "normal".to_string() });
        }

        // Tell Transition Engine to go to target pose, and queue the state delta to apply when finished
        if let Err(e) = self.transition_engine.request_pose_with_delta(&selected_action.target_pose, selected_action.state_effects.clone(), selected_action.target_anim.clone(), &self.app_handle).await {
            log::error!("Failed to request pose: {}", e);
            return;
        }
    }
}
