//! §12.1 Kopfrechenkette: je korrekter Trial 100 + speedBonus(rt, 8000, 50).

use serde_json::Value;

use super::{cfg_i64, finalize, speed_bonus, ScoreResult};
use crate::domain::TrialRow;

const GAME: &str = "mental-chain";
const RT_TARGET_MS: f64 = 8000.0;
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
            "mental-chain",
            include_str!("../../../../../packages/games/test/fixtures/scoring/mental-chain.json"),
        );
    }
}
