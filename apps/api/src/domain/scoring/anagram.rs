//! §12.9 Anagramme: korrekt `(80 + 15 × wordLength) + speedBonus(rt, deadlineMs, 60)`.

use serde_json::Value;

use super::{cfg_f64, cfg_i64, field_str, finalize, speed_bonus, ScoreResult};
use crate::domain::TrialRow;

const GAME: &str = "anagram";
const BASE_POINTS: f64 = 80.0;
const POINTS_PER_LETTER: f64 = 15.0;
const SPEED_BONUS: f64 = 60.0;

pub fn score(config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let deadline = cfg_f64(config, "deadlineMs", GAME)?;
    let mut total = 0.0;
    for row in rows {
        if !row.correct {
            continue;
        }
        let Some(text) = field_str(&row.response, "text") else {
            continue;
        };
        // `trim` folgt hier JavaScripts String.prototype.trim (Unicode-Whitespace);
        // die Wortliste enthält nur a–z, daher ist die Länge in Zeichen zu messen.
        let word_length = text.trim().chars().count() as f64;
        let bonus = match row.rt_ms {
            None => 0,
            Some(rt) => speed_bonus(f64::from(rt).max(0.0), deadline, SPEED_BONUS),
        };
        total += BASE_POINTS + POINTS_PER_LETTER * word_length + bonus as f64;
    }
    Ok(finalize(total))
}

pub fn theoretical_max(config: &Value) -> ScoreResult {
    let trials = cfg_i64(config, "trials", GAME)? as f64;
    let max_len = cfg_i64(config, "maxLen", GAME)? as f64;
    Ok((trials * (BASE_POINTS + POINTS_PER_LETTER * max_len + SPEED_BONUS)) as i32)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "anagram",
            include_str!("../../../../../packages/games/test/fixtures/scoring/anagram.json"),
        );
    }
}
