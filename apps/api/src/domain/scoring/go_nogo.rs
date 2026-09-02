//! §12.5 Go/No-Go: round(1000 × (hitRate − 2 × commissionRate)) ≥ 0, + speedBonus(median hit RT, 500, 200).

use serde_json::Value;

use super::{field_bool, finalize, js_round, median, speed_bonus, ScoreResult};
use crate::domain::TrialRow;

pub fn score(_config: &Value, rows: &[TrialRow]) -> ScoreResult {
    let (mut hits, mut misses, mut commissions, mut correct_rejections) = (0, 0, 0, 0);
    let mut hit_rts = Vec::new();
    for row in rows {
        let pressed = field_bool(&row.response, "pressed").unwrap_or(false);
        match (pressed, row.correct) {
            (true, true) => {
                hits += 1;
                if let Some(rt) = row.rt_ms {
                    hit_rts.push(f64::from(rt));
                }
            }
            (true, false) => commissions += 1,
            (false, true) => correct_rejections += 1,
            (false, false) => misses += 1,
        }
    }
    let go = hits + misses;
    let nogo = commissions + correct_rejections;
    let hit_rate = if go > 0 { hits as f64 / go as f64 } else { 0.0 };
    let commission_rate = if nogo > 0 {
        commissions as f64 / nogo as f64
    } else {
        0.0
    };
    let base = js_round(1000.0 * (hit_rate - 2.0 * commission_rate)).max(0.0);
    let bonus = if hit_rts.is_empty() {
        0
    } else {
        speed_bonus(median(&hit_rts), 500.0, 200.0)
    };
    Ok(finalize(base + bonus as f64))
}

pub fn theoretical_max(_config: &Value) -> ScoreResult {
    Ok(1200)
}

#[cfg(test)]
mod tests {
    #[test]
    fn parity() {
        super::super::parity::check(
            "go-nogo",
            include_str!("../../../../../packages/games/test/fixtures/scoring/go-nogo.json"),
        );
    }
}
