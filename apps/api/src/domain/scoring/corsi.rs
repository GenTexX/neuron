//! §12.3 Corsi-Blöcke: je korrekter Trial `10 × len²`, `len` = Anzahl der Taps.

use serde_json::Value;

use super::{cfg_i64, finalize, ScoreResult};
use crate::domain::TrialRow;

const GAME: &str = "corsi";

fn sequence_length(start_length: i64, index: i64) -> i64 {
    start_length + index / 2
}

pub fn score(_config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let mut total = 0.0;
    for row in rows {
        if !row.correct {
            continue;
        }
        let taps = row
            .response
            .as_ref()
            .and_then(|v| v.get("taps"))
            .and_then(|v| v.as_array());
        let Some(taps) = taps else { continue };
        let len = taps.len() as f64;
        total += 10.0 * len * len;
    }
    Ok(finalize(total))
}

pub fn theoretical_max(config: &Value) -> ScoreResult {
    let trials = cfg_i64(config, "trials", GAME)?;
    let start_length = cfg_i64(config, "startLength", GAME)?;
    let mut total = 0i64;
    for i in 0..trials {
        let len = sequence_length(start_length, i);
        total += 10 * len * len;
    }
    Ok(total as i32)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "corsi",
            include_str!("../../../../../packages/games/test/fixtures/scoring/corsi.json"),
        );
    }
}
