use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};
use std::time::{SystemTime, UNIX_EPOCH};

use super::animation_command::AnimationCommand;
use super::animation_manifest::AnimationManifest;
use super::animation_state::AnimationState;
use super::context_registry::ContextRegistry;

pub struct AnimationDirector {
    manifest: AnimationManifest,
    registry: Arc<Mutex<ContextRegistry>>,
    current_animation_id: Arc<Mutex<Option<String>>>,
    current_priority: Arc<Mutex<u8>>,
}

impl AnimationDirector {
    pub fn new(manifest_path: &str) -> Result<Self, String> {
        let manifest = AnimationManifest::load_from_file(manifest_path)?;
        Ok(Self {
            manifest,
            registry: Arc::new(Mutex::new(ContextRegistry::new())),
            current_animation_id: Arc::new(Mutex::new(None)),
            current_priority: Arc::new(Mutex::new(0)),
        })
    }

    pub fn new_with_manifest(manifest: AnimationManifest) -> Self {
        Self {
            manifest,
            registry: Arc::new(Mutex::new(ContextRegistry::new())),
            current_animation_id: Arc::new(Mutex::new(None)),
            current_priority: Arc::new(Mutex::new(0)),
        }
    }

    fn get_current_time_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    pub async fn play(&self, app: &AppHandle, mut command: AnimationCommand) -> Result<(), String> {
        let current_prio = *self.current_priority.lock().await;

        let can_interrupt = match command.interrupt_policy.as_str() {
            "always" => true,
            "never" => false,
            "higher_priority" => command.priority > current_prio,
            _ => command.priority > current_prio,
        };

        if !can_interrupt {
            return Ok(()); // Ignore if cannot interrupt
        }

        command.timestamp_ms = Self::get_current_time_ms();

        // Resolve animation_id from state if not explicitly provided
        if command.animation_id.is_none() {
            let current_id = self.current_animation_id.lock().await.clone();
            command.animation_id = self.manifest.get_animation_id_for_state(&command.state, current_id.as_deref());
        }

        // Add to registry if it has a context_id
        if let Some(ctx_id) = &command.context_id {
            self.registry.lock().await.add(ctx_id.clone(), command.priority, command.timestamp_ms);
        }

        // Update current state
        *self.current_priority.lock().await = command.priority;
        *self.current_animation_id.lock().await = command.animation_id.clone();

        // Emit command to frontend
        app.emit("animation_command", &command).map_err(|e| e.to_string())?;

        // TODO: Handle duration_ms and fallback scheduling if needed

        Ok(())
    }

    pub async fn stop_context(&self, app: &AppHandle, context_id: &str) -> Result<(), String> {
        let mut registry = self.registry.lock().await;
        registry.remove(context_id);

        if let Some(highest) = registry.get_highest_priority() {
            // Restore highest priority context
            // For now, we just fallback to idle if context removed, 
            // a full implementation would reconstruct the command from the context or state
            // To simplify, we'll force idle for now
            drop(registry); // Release lock before calling play
            self.force_idle(app).await?;
        } else {
            drop(registry); // Release lock before calling play
            self.force_idle(app).await?;
        }

        Ok(())
    }

    pub async fn force_idle(&self, app: &AppHandle) -> Result<(), String> {
        self.registry.lock().await.clear();
        *self.current_priority.lock().await = 0;
        *self.current_animation_id.lock().await = None;

        let mut command = AnimationCommand::idle();
        command.timestamp_ms = Self::get_current_time_ms();
        command.animation_id = self.manifest.get_animation_id_for_state(&AnimationState::Idle, None);

        app.emit("animation_command", &command).map_err(|e| e.to_string())
    }
    
    // For testing
    pub async fn test_can_interrupt(&self, mut command: AnimationCommand) -> bool {
        let current_prio = *self.current_priority.lock().await;

        match command.interrupt_policy.as_str() {
            "always" => true,
            "never" => false,
            "higher_priority" => command.priority > current_prio,
            _ => command.priority > current_prio,
        }
    }
    
    pub async fn set_priority_for_test(&self, p: u8) {
        *self.current_priority.lock().await = p;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_animation_director_interrupt_policy() {
        let manifest = AnimationManifest {
            version: "1.0".to_string(),
            default_crossfade_ms: 300.0,
            animations: vec![],
        };
        let director = AnimationDirector::new_with_manifest(manifest);
        
        // Base state priority 50
        director.set_priority_for_test(50).await;

        // Try to interrupt with dragging (95) - higher priority
        let mut drag_cmd = AnimationCommand::dragging();
        assert_eq!(director.test_can_interrupt(drag_cmd).await, true);
        
        // Try to interrupt with thinking (40) - lower priority
        let mut think_cmd = AnimationCommand::thinking("think_test".to_string());
        assert_eq!(director.test_can_interrupt(think_cmd).await, false);
    }
}
