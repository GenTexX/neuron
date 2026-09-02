//! §12.7 Mentale Rotation: korrekt `100 + speedBonus(rt, deadlineMs, 80)`, falsch −50.

use serde_json::Value;

use super::{cfg_f64, cfg_i64, field_bool, finalize, speed_bonus, ScoreResult};
use crate::domain::TrialRow;

const GAME: &str = "mental-rotation";
const CORRECT_POINTS: f64 = 100.0;
const WRONG_PENALTY: f64 = 50.0;
const SPEED_BONUS: f64 = 80.0;
const MAX_PER_TRIAL: i64 = 180;

pub fn score(config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let deadline = cfg_f64(config, "deadlineMs", GAME)?;
    let mut total = 0.0;
    for row in rows {
        // Ohne Antwort (`same` fehlt) zählt der Trial mit 0.
        if field_bool(&row.response, "same").is_none() {
            continue;
        }
        if row.correct {
            let bonus = match row.rt_ms {
                None => 0,
                Some(rt) => speed_bonus(f64::from(rt).max(0.0), deadline, SPEED_BONUS),
            };
            total += CORRECT_POINTS + bonus as f64;
        } else {
            total -= WRONG_PENALTY;
        }
    }
    Ok(finalize(total.max(0.0)))
}

pub fn theoretical_max(config: &Value) -> ScoreResult {
    Ok((cfg_i64(config, "trials", GAME)? * MAX_PER_TRIAL) as i32)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "mental-rotation",
            include_str!(
                "../../../../../packages/games/test/fixtures/scoring/mental-rotation.json"
            ),
        );
    }
}
