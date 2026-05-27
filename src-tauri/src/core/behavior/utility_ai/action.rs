use serde::{Deserialize, Serialize};
use super::scoring::ScoringCurve;
use crate::core::state::types::{CharacterState, CharacterStateDelta};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Consideration {
    pub state_field: String, // e.g., "energy", "mood", "curiosity"
    pub curve: ScoringCurve,
    pub weight: f32,
}

impl Consideration {
    pub fn evaluate(&self, state: &CharacterState) -> f32 {
        // Normalize state values to [0.0, 1.0] for the curve evaluation
        let raw_value = match self.state_field.as_str() {
            "energy" => state.energy as f32 / 100.0,
            "mood" => (state.mood as f32 + 10.0) / 20.0, // -10..10 normalized to 0..1
            "curiosity" => state.curiosity as f32 / 100.0,
            "affinity" => state.affinity as f32 / 100.0,
            "trust" => state.trust as f32 / 100.0,
            "familiarity" => state.familiarity as f32 / 100.0,
            "patience" => state.patience as f32 / 100.0,
            "confidence" => state.confidence as f32 / 100.0,
            _ => 0.5, // Default mid-value for unknown fields
        };

        let score = self.curve.evaluate(raw_value);
        score * self.weight
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UtilityAction {
    pub id: String, // e.g., "take_a_nap"
    pub target_pose: String, // e.g., "Laying"
    pub animation_tags: Vec<String>, // e.g., ["idle", "sleep"]
    pub base_weight: f32, // Multiplier for the final score
    pub considerations: Vec<Consideration>,
    pub state_effects: CharacterStateDelta, // Effects applied via StateManager upon completion
    pub cooldown_seconds: u64,
    pub can_interrupt: bool, // Can this action interrupt another action?
}

impl UtilityAction {
    pub fn evaluate(&self, state: &CharacterState) -> f32 {
        if self.considerations.is_empty() {
            return self.base_weight;
        }

        let mut product = 1.0;
        let n = self.considerations.len() as f32;

        for consideration in &self.considerations {
            let score = consideration.evaluate(state).clamp(0.01, 1.0); // Avoid multiplying by absolute 0
            product *= score;
        }

        // Compensation factor for multiple considerations:
        // Final Score = (Score1 * Score2 * ... * ScoreN) ^ (1 / N)
        let mut final_score = product.powf(1.0 / n);
        
        final_score *= self.base_weight;
        final_score.clamp(0.0, 1.0)
    }
}
