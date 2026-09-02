//! §12.8 Zahlenfolgen: je korrekter Trial 100 + speedBonus(rt, 20000, 50).

use serde_json::Value;

use super::{cfg_i64, finalize, speed_bonus, ScoreResult};
use crate::domain::TrialRow;

const GAME: &str = "number-sequence";
const RT_TARGET_MS: f64 = 20_000.0;
const RT_BONUS: f64 = 50.0;

pub fn score(_config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let mut total = 0.0;
    for row in rows {
        if !row.correct {
            continue;
        }
        let rt = row.rt_ms.map(f64::from).unwrap_or(RT_TARGET_MS);
        total += 100.0 + speed_bonus(rt, RT_TARGET_MS, RT_BONUS) as f64;
    }
    Ok(finalize(total))
}

pub fn theoretical_max(config: &Value) -> ScoreResult {
    Ok((cfg_i64(config, "trials", GAME)? * 150) as i32)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "number-sequence",
            include_str!(
                "../../../../../packages/games/test/fixtures/scoring/number-sequence.json"
            ),
        );
    }
}
