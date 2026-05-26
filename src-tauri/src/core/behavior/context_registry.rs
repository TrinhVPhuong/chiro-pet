use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationContext {
    pub id: String,
    pub priority: u8,
    pub timestamp_ms: u64,
}

pub struct ContextRegistry {
    contexts: HashMap<String, AnimationContext>,
}

impl ContextRegistry {
    pub fn new() -> Self {
        Self {
            contexts: HashMap::new(),
        }
    }

    pub fn add(&mut self, id: String, priority: u8, timestamp_ms: u64) {
        self.contexts.insert(id.clone(), AnimationContext {
            id,
            priority,
            timestamp_ms,
        });
    }

    pub fn remove(&mut self, id: &str) -> Option<AnimationContext> {
        self.contexts.remove(id)
    }

    pub fn clear(&mut self) {
        self.contexts.clear();
    }

    pub fn get_highest_priority(&self) -> Option<&AnimationContext> {
        self.contexts.values().max_by_key(|c| c.priority)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_registry_priority() {
        let mut registry = ContextRegistry::new();
        registry.add("talk".to_string(), 60, 1000);
        registry.add("drag".to_string(), 95, 1001);
        registry.add("think".to_string(), 40, 1002);

        let highest = registry.get_highest_priority();
        assert!(highest.is_some());
        assert_eq!(highest.unwrap().id, "drag");

        registry.remove("drag");
        let highest = registry.get_highest_priority();
        assert!(highest.is_some());
        assert_eq!(highest.unwrap().id, "talk");
    }
}
