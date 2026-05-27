use async_trait::async_trait;
use crate::core::state::types::{CharacterState, CharacterStateDelta, MutationSource};
use crate::core::state::errors::Result;

pub struct GuardContext {
    pub modifications: Vec<String>,
    pub warnings: Vec<String>,
}

impl GuardContext {
    pub fn new() -> Self {
        Self {
            modifications: Vec::new(),
            warnings: Vec::new(),
        }
    }
}

#[async_trait]
pub trait StateGuard: Send + Sync {
    async fn apply(
        &self,
        current: &CharacterState,
        delta: CharacterStateDelta,
        source: MutationSource,
        character_id: &str,
        ctx: &mut GuardContext,
    ) -> Result<CharacterStateDelta>;

    fn name(&self) -> &'static str;
}

pub struct RangeGuard;

#[async_trait]
impl StateGuard for RangeGuard {
    async fn apply(
        &self,
        _current: &CharacterState,
        mut delta: CharacterStateDelta,
        _source: MutationSource,
        _character_id: &str,
        ctx: &mut GuardContext,
    ) -> Result<CharacterStateDelta> {
        let original = delta.clone();

        delta.mood = delta.mood.clamp(-5, 5);
        delta.energy = delta.energy.clamp(-20, 20);
        delta.affinity = delta.affinity.clamp(-5, 10);
        delta.trust = delta.trust.clamp(-5, 10);
        delta.familiarity = delta.familiarity.clamp(-5, 10);
        delta.curiosity = delta.curiosity.clamp(-10, 10);
        delta.patience = delta.patience.clamp(-10, 10);
        delta.confidence = delta.confidence.clamp(-10, 10);

        if delta != original {
            ctx.modifications.push("range_clamped".into());
        }

        Ok(delta)
    }

    fn name(&self) -> &'static str { "range_guard" }
}

pub struct GuardChain {
    guards: Vec<Box<dyn StateGuard>>,
}

impl GuardChain {
    pub fn new() -> Self {
        let mut chain = Self { guards: Vec::new() };
        chain.guards.push(Box::new(RangeGuard));
        // Add more guards here in the future
        chain
    }

    pub async fn apply(
        &self,
        current: &CharacterState,
        mut delta: CharacterStateDelta,
        source: MutationSource,
        character_id: &str,
        ctx: &mut GuardContext,
    ) -> Result<CharacterStateDelta> {
        for guard in &self.guards {
            delta = guard.apply(current, delta, source.clone(), character_id, ctx).await?;
        }
        Ok(delta)
    }
}
