//! §12.4 Stroop: korrekt 100 + speedBonus(rt, deadline, 60); falsch −40; keine Antwort 0.

use serde_json::Value;

use super::{cfg_f64, cfg_i64, finalize, has_field, speed_bonus, ScoreResult};
use crate::domain::TrialRow;

const GAME: &str = "stroop";

pub fn score(config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let deadline = cfg_f64(config, "deadlineMs", GAME)?;
    let mut total = 0.0;
    for row in rows {
        if !has_field(&row.response, "choice") {
            continue;
        }
        if row.correct {
            let rt = row.rt_ms.map(f64::from).unwrap_or(deadline);
            total += 100.0 + speed_bonus(rt, deadline, 60.0) as f64;
        } else {
            total -= 40.0;
        }
    }
    Ok(finalize(total))
}

pub fn theoretical_max(config: &Value) -> ScoreResult {
    Ok((cfg_i64(config, "trials", GAME)? * 160) as i32)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "stroop",
            include_str!("../../../../../packages/games/test/fixtures/scoring/stroop.json"),
        );
    }
}
