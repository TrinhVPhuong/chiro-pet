#[cfg(test)]
mod tests {
    use crate::core::behavior::utility_ai::scoring::{ScoringCurve, CurveType};
    use crate::core::behavior::utility_ai::action::{Consideration, UtilityAction};
    use crate::core::state::types::{CharacterState, CharacterStateDelta};

    fn get_default_state() -> CharacterState {
        CharacterState {
            character_id: "test".to_string(),
            mood: 0,
            energy: 50,
            affinity: 50,
            trust: 50,
            familiarity: 50,
            curiosity: 50,
            patience: 50,
            confidence: 50,
            updated_at: chrono::Utc::now(),
            schema_version: 1,
        }
    }

    #[test]
    fn test_scoring_curve_linear() {
        let curve = ScoringCurve {
            curve_type: CurveType::Linear,
            m: 1.0,
            k: 0.0,
            b: 0.0,
            c: 1.0,
        };

        assert_eq!(curve.evaluate(0.0), 0.0);
        assert_eq!(curve.evaluate(0.5), 0.5);
        assert_eq!(curve.evaluate(1.0), 1.0);
        
        let curve2 = ScoringCurve {
            curve_type: CurveType::Linear,
            m: -1.0, // Inverted
            k: 0.0,
            b: 1.0,
            c: 1.0,
        };
        assert_eq!(curve2.evaluate(0.0), 1.0);
        assert_eq!(curve2.evaluate(0.5), 0.5);
        assert_eq!(curve2.evaluate(1.0), 0.0);
    }

    #[test]
    fn test_action_compensation() {
        let mut state = get_default_state();
        state.energy = 20; // Needs sleep

        let consideration_1 = Consideration {
            state_field: "energy".into(),
            curve: ScoringCurve {
                curve_type: CurveType::Linear,
                m: -1.0, k: 0.0, b: 1.0, c: 1.0 // Lower energy = higher score. Score = 0.8
            },
            weight: 1.0,
        };

        let consideration_2 = Consideration {
            state_field: "mood".into(),
            curve: ScoringCurve {
                curve_type: CurveType::Linear,
                m: 1.0, k: 0.0, b: 0.0, c: 1.0 // Score = 0.5
            },
            weight: 1.0,
        };

        let action = UtilityAction {
            id: "test_action".into(),
            target_pose: "Laying".into(),
            animation_tags: vec![],
            base_weight: 1.0,
            considerations: vec![consideration_1, consideration_2],
            state_effects: CharacterStateDelta::zero(),
            cooldown_seconds: 0,
            can_interrupt: false,
        };

        let score = action.evaluate(&state);
        // Compensation formula: (0.8 * 0.5) ^ (1/2) = sqrt(0.4) ≈ 0.632
        assert!((score - 0.632).abs() < 0.01);
    }
}
