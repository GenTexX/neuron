//! §12.2 N-Back: round(1000 × d' × (1 + 0.25·(n−1))).

use serde_json::Value;

use super::{cfg_f64, discrimination_index, field_bool, finalize, js_round, ScoreResult};
use crate::domain::TrialRow;

const GAME: &str = "n-back";

fn factor(n: f64) -> f64 {
    1.0 + 0.25 * (n - 1.0)
}

pub fn score(config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let n = cfg_f64(config, "n", GAME)?;
    let (mut hits, mut misses, mut false_alarms, mut correct_rejections) = (0, 0, 0, 0);
    for row in rows {
        let pressed = field_bool(&row.response, "pressed").unwrap_or(false);
        match (pressed, row.correct) {
            (true, true) => hits += 1,
            (true, false) => false_alarms += 1,
            (false, false) => misses += 1,
            (false, true) => correct_rejections += 1,
        }
    }
    let d = discrimination_index(
        hits,
        hits + misses,
        false_alarms,
        false_alarms + correct_rejections,
    );
    Ok(finalize(1000.0 * d * factor(n)))
}

pub fn theoretical_max(config: &Value) -> ScoreResult {
    let n = cfg_f64(config, "n", GAME)?;
    Ok(js_round(1000.0 * factor(n)) as i32)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "n-back",
            include_str!("../../../../../packages/games/test/fixtures/scoring/n-back.json"),
        );
    }
}
