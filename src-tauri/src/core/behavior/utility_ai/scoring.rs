use serde::{Deserialize, Serialize};
use std::f32::consts::E;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CurveType {
    Linear,
    Logistic,
    InverseQuadratic,
    Polynomial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoringCurve {
    pub curve_type: CurveType,
    pub m: f32, // Slope or steepness
    pub k: f32, // Shift or inflection point
    pub b: f32, // Y-intercept
    pub c: f32, // Exponent for polynomial
}

impl Default for ScoringCurve {
    fn default() -> Self {
        Self {
            curve_type: CurveType::Linear,
            m: 1.0,
            k: 0.0,
            b: 0.0,
            c: 1.0,
        }
    }
}

impl ScoringCurve {
    pub fn evaluate(&self, x: f32) -> f32 {
        let x_clamped = x.clamp(0.0, 1.0); // Assume input is normalized [0, 1]

        let y = match self.curve_type {
            CurveType::Linear => {
                self.m * (x_clamped - self.k) + self.b
            }
            CurveType::Polynomial => {
                self.m * (x_clamped - self.k).powf(self.c) + self.b
            }
            CurveType::Logistic => {
                // Logistic curve: y = 1 / (1 + e^(-m * (x - k))) + b
                // Example: m=10.0, k=0.5 makes a nice S-curve crossing 0.5 at x=0.5
                (1.0 / (1.0 + E.powf(-self.m * (x_clamped - self.k)))) + self.b
            }
            CurveType::InverseQuadratic => {
                // Good for urgency (e.g. sleep when energy is very low)
                // Need to avoid division by zero
                let denominator = x_clamped - self.k;
                if denominator.abs() < 0.001 {
                    // Maximum score near the asymptote
                    self.m * 1000.0 + self.b
                } else {
                    self.m * (1.0 / (denominator * denominator)) + self.b
                }
            }
        };

        y.clamp(0.0, 1.0)
    }
}
