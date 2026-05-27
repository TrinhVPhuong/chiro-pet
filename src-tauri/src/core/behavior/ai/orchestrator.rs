use std::sync::Arc;
use tauri::AppHandle;
use tokio::time::Duration;
use chrono::Utc;
use tauri::{Manager, Emitter};

use crate::core::state::StateManager;
use crate::core::state::types::{AILifecycleState, CharacterStateDelta, MutationSource};
use crate::core::behavior::AnimationDirector;
use crate::core::behavior::AnimationState;

use super::types::*;

pub struct AIOrchestrator {
    state_manager: Arc<StateManager>,
    animation_director: Arc<AnimationDirector>,
    app_handle: AppHandle,
}

impl AIOrchestrator {
    pub fn new(
        state_manager: Arc<StateManager>,
        animation_director: Arc<AnimationDirector>,
        app_handle: AppHandle,
    ) -> Self {
        Self {
            state_manager,
            animation_director,
            app_handle,
        }
    }

    /// Handles a direct chat message from the user
    pub async fn handle_chat(&self, message: String) -> Result<AIInteractionResponse, String> {
        // 1. Set state to Thinking
        self.set_lifecycle_state(AILifecycleState::Thinking).await?;
        
        // TODO: Emit thinking animation or overlay event here if needed

        // 2. Fetch response from Provider (Mocked for now)
        let response = self.mock_fetch_openai(&message).await?;

        // 3. Set state to Speaking
        self.set_lifecycle_state(AILifecycleState::Speaking).await?;

        // 4. Apply State Delta
        self.apply_state_delta(&response.state_delta).await?;

        // 5. Play suggested animation (through Transition Engine)
        if let Some(anim_id) = &response.suggested_animation {
            let app_clone = self.app_handle.clone();
            let anim_id_clone = anim_id.clone();
            let expression_clone = response.suggested_expression.clone();
            
            // To call Transition Engine, we should ideally have a reference to it in the orchestrator,
            // but for Phase 5 P0, we can access it via Tauri state
            let transition_engine = self.app_handle.state::<Arc<crate::core::behavior::TransitionEngine>>();
            if let Err(e) = transition_engine.play_direct_animation(
                &anim_id_clone, 
                expression_clone, 
                AnimationState::Talking, 
                60, 
                &app_clone
            ).await {
                log::error!("Failed to play reaction animation via TransitionEngine: {}", e);
            }
        }

        // 6. Emit message to Frontend for Speech Bubble
        #[derive(Clone, serde::Serialize)]
        struct SpeechBubblePayload {
            message: String,
            emotion: String,
        }
        
        let _ = self.app_handle.emit("show_bubble", SpeechBubblePayload {
            message: response.message.clone(),
            emotion: format!("{:?}", response.emotion).to_lowercase(),
        });

        // 7. Schedule transition back to Idle based on message length
        let char_count = response.message.chars().count();
        let reading_time_ms = (char_count as u64 * 50).max(3000); // 50ms per char, min 3s
        
        let state_manager = self.state_manager.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(reading_time_ms)).await;
            
            // Revert back to Idle
            let mut runtime = state_manager.runtime_state.write().await;
            runtime.ai_lifecycle_state = AILifecycleState::Idle;
            // Update last_interaction_at to start the 60s cooldown for ProactivityTicker
            runtime.last_interaction_at = Some(Utc::now());
            drop(runtime);
            
            log::info!("AI Orchestrator: Returned to Idle state.");
        });

        Ok(response)
    }

    async fn set_lifecycle_state(&self, new_state: AILifecycleState) -> Result<(), String> {
        let mut runtime = self.state_manager.runtime_state.write().await;
        runtime.ai_lifecycle_state = new_state.clone();
        runtime.last_interaction_at = Some(Utc::now());
        drop(runtime);
        
        log::info!("AI Lifecycle State changed to: {:?}", new_state);
        Ok(())
    }

    async fn apply_state_delta(&self, delta: &AIStateDelta) -> Result<(), String> {
        if delta.mood == 0 && delta.energy == 0 && delta.affinity == 0 && delta.trust == 0 && delta.familiarity == 0 {
            return Ok(());
        }

        let char_delta = CharacterStateDelta {
            mood: delta.mood,
            energy: delta.energy,
            affinity: delta.affinity,
            trust: delta.trust,
            familiarity: delta.familiarity,
            curiosity: 0,
            patience: 0,
            confidence: 0,
        };

        self.state_manager.patch_character_state("chiro", char_delta, MutationSource::Ai)
            .await
            .map_err(|e| format!("Failed to patch state: {:?}", e))?;
            
        Ok(())
    }

    /// Mocks a call to OpenAI
    async fn mock_fetch_openai(&self, user_message: &str) -> Result<AIInteractionResponse, String> {
        // Simulate network latency
        tokio::time::sleep(Duration::from_millis(1500)).await;

        let lower_msg = user_message.to_lowercase();
        
        // Simple mock logic based on keywords
        if lower_msg.contains("hello") || lower_msg.contains("hi") || lower_msg.contains("chào") {
            Ok(AIInteractionResponse {
                message: "Chào anh! Em ở đây, có gì cần em giúp không?".to_string(),
                emotion: AIEmotion::Happy,
                intent: AIIntent::SmallTalk,
                state_delta: AIStateDelta { mood: 1, energy: 0, affinity: 1, trust: 0, familiarity: 0 },
                suggested_animation: Some("action_greeting".to_string()),
                suggested_expression: Some("happy".to_string()),
                interruption: AIInterruption::default(),
                memory_operations: vec![],
                next_action: AINextAction::default(),
                debug_reason: Some("Mocked greeting response".to_string()),
            })
        } else if lower_msg.contains("mệt") || lower_msg.contains("tired") || lower_msg.contains("sleep") {
            Ok(AIInteractionResponse {
                message: "Anh mệt rồi à? Hãy nghỉ ngơi một chút đi, em sẽ canh chừng cho.".to_string(),
                emotion: AIEmotion::Caring,
                intent: AIIntent::EmotionalSupport,
                state_delta: AIStateDelta { mood: 0, energy: -1, affinity: 1, trust: 0, familiarity: 0 },
                suggested_animation: Some("action_crouch".to_string()),
                suggested_expression: Some("caring".to_string()),
                interruption: AIInterruption::default(),
                memory_operations: vec![],
                next_action: AINextAction::default(),
                debug_reason: Some("Mocked caring response".to_string()),
            })
        } else {
            Ok(AIInteractionResponse {
                message: format!("Anh vừa nói '{}' đúng không? Thú vị quá!", user_message),
                emotion: AIEmotion::Curiosity,
                intent: AIIntent::Acknowledge,
                state_delta: AIStateDelta::default(),
                suggested_animation: Some("action_attention_seeking".to_string()),
                suggested_expression: Some("curiosity".to_string()),
                interruption: AIInterruption::default(),
                memory_operations: vec![],
                next_action: AINextAction::default(),
                debug_reason: Some("Mocked generic response".to_string()),
            })
        }
    }
}
