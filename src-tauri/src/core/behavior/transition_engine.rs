use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;
use std::collections::VecDeque;

use super::animation_director::AnimationDirector;
use super::animation_command::AnimationCommand;
use super::transition_graph::TransitionGraph;
use super::animation_state::AnimationState;

use crate::core::state::types::CharacterStateDelta;
use crate::core::state::StateManager;

pub struct TransitionEngine {
    graph: TransitionGraph,
    current_pose: Arc<Mutex<String>>,
    action_queue: Arc<Mutex<VecDeque<String>>>,
    director: Arc<AnimationDirector>,
    state_manager: Option<Arc<StateManager>>,
    pending_state_delta: Arc<Mutex<Option<CharacterStateDelta>>>,
}

impl TransitionEngine {
    pub fn new(graph: TransitionGraph, director: Arc<AnimationDirector>, state_manager: Arc<StateManager>) -> Self {
        Self {
            graph,
            current_pose: Arc::new(Mutex::new("Stand".to_string())), // Default start pose
            action_queue: Arc::new(Mutex::new(VecDeque::new())),
            director,
            state_manager: Some(state_manager),
            pending_state_delta: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn request_pose_with_delta(&self, target_pose: &str, delta: CharacterStateDelta, app: &AppHandle) -> Result<(), String> {
        let mut queue = self.action_queue.lock().await;
        let mut current = self.current_pose.lock().await;

        let mut pending = self.pending_state_delta.lock().await;
        *pending = Some(delta);
        drop(pending);

        if *current == target_pose {
            return Ok(());
        }

        if let Some(path) = self.graph.find_path(&current, target_pose) {
            queue.clear();
            for anim in path {
                queue.push_back(anim);
            }
            
            // Set the new target pose immediately so consecutive calls don't recalculate from start
            *current = target_pose.to_string();

            drop(queue);
            drop(current);

            self.play_next(app).await?;
            Ok(())
        } else {
            Err(format!("No path found from {} to {}", current, target_pose))
        }
    }

    pub async fn play_direct_animation(&self, animation_id: &str, expression: Option<String>, state: AnimationState, priority: u8, app: &AppHandle) -> Result<(), String> {
        let mut command = AnimationCommand::idle();
        command.command_id = uuid::Uuid::new_v4().to_string();
        command.animation_id = Some(animation_id.to_string());
        command.expression = expression;
        command.play_once = true;
        command.loop_anim = false;
        command.state = state;
        command.priority = priority;
        command.interrupt_policy = "allow_higher".to_string();

        // Clear queue when playing a direct animation to interrupt transitions
        let mut queue = self.action_queue.lock().await;
        queue.clear();
        drop(queue);

        self.director.play(app, command).await
    }

    pub async fn on_animation_finished(&self, app: &AppHandle) -> Result<(), String> {
        self.play_next(app).await
    }

    async fn play_next(&self, app: &AppHandle) -> Result<(), String> {
        let mut queue = self.action_queue.lock().await;
        
        if let Some(next_anim) = queue.pop_front() {
            let mut command = AnimationCommand::idle(); // Use a base command
            command.animation_id = Some(next_anim);
            command.play_once = true;
            command.loop_anim = false;
            command.state = AnimationState::OneShotAction("transition".to_string());
            command.priority = 80; // High priority for transitions
            command.interrupt_policy = "higher_priority".to_string();
            
            self.director.play(app, command).await?;
        } else {
            // Queue is empty, target pose reached. Apply pending state delta.
            let mut pending = self.pending_state_delta.lock().await;
            if let Some(delta) = pending.take() {
                if let Some(sm) = &self.state_manager {
                    let sm_clone = sm.clone();
                    // Fire and forget state patch
                    tokio::spawn(async move {
                        let _ = sm_clone.patch_character_state("chiro", delta, crate::core::state::types::MutationSource::OfflineAI).await;
                    });
                }
            }
        }
        
        Ok(())
    }
}
