//! §12.6 Schulte-Tabelle: `max(0, round(300000 / totalMs) − 20 × wrongTaps)`, ≤ 600.

use serde_json::Value;

use super::{field_f64, finalize, js_round, ScoreResult};
use crate::domain::TrialRow;

const NUMERATOR: f64 = 300_000.0;
const WRONG_TAP_PENALTY: f64 = 20.0;
const MAX: f64 = 600.0;

pub fn score(_config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let mut total = 0.0;
    for row in rows {
        if !row.correct {
            continue;
        }
        let Some(total_ms) = field_f64(&row.response, "totalMs") else {
            continue;
        };
        if total_ms <= 0.0 {
            continue;
        }
        let wrong_taps = field_f64(&row.response, "wrongTaps").unwrap_or(0.0);
        let raw = (js_round(NUMERATOR / total_ms) - WRONG_TAP_PENALTY * wrong_taps).max(0.0);
        total += raw.min(MAX);
    }
    Ok(finalize(total.min(MAX)))
}

pub fn theoretical_max(_config: &Value) -> ScoreResult {
    Ok(MAX as i32)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "schulte",
            include_str!("../../../../../packages/games/test/fixtures/scoring/schulte.json"),
        );
    }
}
