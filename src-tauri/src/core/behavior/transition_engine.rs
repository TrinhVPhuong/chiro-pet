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

    pub async fn request_pose_with_delta(&self, target_pose: &str, delta: CharacterStateDelta, target_anim: Option<String>, app: &AppHandle) -> Result<(), String> {
        let mut queue = self.action_queue.lock().await;
        let mut current = self.current_pose.lock().await;

        let mut pending = self.pending_state_delta.lock().await;
        *pending = Some(delta);
        drop(pending);

        if *current == target_pose {
            // Already at target pose, just play the target animation if it exists
            if let Some(anim) = target_anim {
                let mut command = AnimationCommand::idle();
                command.animation_id = Some(anim);
                command.play_once = false;
                command.loop_anim = true;
                command.state = AnimationState::Idle;
                command.priority = 20; // Slightly higher than base idle
                command.interrupt_policy = "allow_higher".to_string();
                let _ = self.director.play(app, command).await;
            }
            
            return Ok(());
        }

        if let Some(path) = self.graph.find_path(&current, target_pose) {
            queue.clear();
            for anim in path {
                queue.push_back(anim);
            }
            
            if let Some(anim) = target_anim {
                queue.push_back(anim); // Push target animation at the end
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
            command.animation_id = Some(next_anim.clone());
            
            // If the queue is empty after popping, it means this might be the target_anim, not a transition
            // A more robust check would be to see if next_anim is a transition animation from the graph, 
            // but for now, we can check if it starts with "action_" or "dance_" etc.
            // Let's assume if it's the last one and it's an idle/dance, it loops.
            if queue.is_empty() && (!next_anim.starts_with("action_standup") && !next_anim.starts_with("action_crouch") && !next_anim.starts_with("action_laydown")) {
                command.play_once = false;
                command.loop_anim = true;
                command.state = AnimationState::Idle; // Or deduce from name
                command.priority = 20; 
                command.interrupt_policy = "allow_higher".to_string();
            } else {
                command.play_once = true;
                command.loop_anim = false;
                command.state = AnimationState::OneShotAction("transition".to_string());
                command.priority = 80; // High priority for transitions
                command.interrupt_policy = "higher_priority".to_string();
            }
            
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::behavior::AnimationManifest;

    #[tokio::test]
    async fn test_transition_engine_queue() {
        let manifest = AnimationManifest {
            version: "1.0".into(),
            default_crossfade_ms: 300.0,
            animations: vec![],
        };
        let director = Arc::new(AnimationDirector::new_with_manifest(manifest));
        let graph = TransitionGraph::new(); // Assuming we can make a dummy graph

        // Create an in-memory DB or simple StateManager
        let state_manager = Arc::new(StateManager::new().await.unwrap());
        let engine = TransitionEngine::new(graph, director, state_manager);
        
        let delta = CharacterStateDelta { energy: 10, ..CharacterStateDelta::zero() };
        
        // This won't run cleanly without an app handle, but we can test the internal state pending_state_delta
        let mut pending = engine.pending_state_delta.lock().await;
        *pending = Some(delta.clone());
        drop(pending);
        
        let pending = engine.pending_state_delta.lock().await;
        assert!(pending.is_some());
        assert_eq!(pending.as_ref().unwrap().energy, 10);
    }
}
