//! §12.10 Lights Out: `solved ? max(50, 600 − 25 × (moves − optimal) − floor(elapsedMs / 2000)) : 0`.

use serde_json::Value;

use super::{field_bool, field_f64, finalize, ScoreResult};
use crate::domain::TrialRow;

const MAX: f64 = 600.0;
const MIN_SCORE: f64 = 50.0;
const MOVE_PENALTY: f64 = 25.0;
const TIME_DIVISOR: f64 = 2000.0;

pub fn score(_config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let mut total = 0.0;
    for row in rows {
        if !row.correct || field_bool(&row.response, "solved") != Some(true) {
            continue;
        }
        let move_count = field_f64(&row.response, "moveCount").unwrap_or(0.0);
        let optimal = field_f64(&row.response, "optimalMoves").unwrap_or(0.0);
        let elapsed = field_f64(&row.response, "elapsedMs").unwrap_or(0.0);
        let extra = (move_count - optimal).max(0.0);
        let time_penalty = (elapsed.max(0.0) / TIME_DIVISOR).floor();
        let raw = MAX - MOVE_PENALTY * extra - time_penalty;
        total += raw.max(MIN_SCORE);
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
            "lights-out",
            include_str!("../../../../../packages/games/test/fixtures/scoring/lights-out.json"),
        );
    }
}
