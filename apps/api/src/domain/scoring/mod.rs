//! Serverseitige Score-Formeln (§9.3, §12). Eingabe: Config + `trial_result`-Zeilen.
//! Jede Formel muss mit `packages/games/src/<id>.ts::scoreRows` übereinstimmen;
//! die Paritäts-Fixtures in `packages/games/test/fixtures/scoring/` erzwingen das.

use serde_json::Value;

use super::TrialRow;

mod anagram;
mod corsi;
mod go_nogo;
mod lights_out;
mod mental_chain;
mod mental_rotation;
mod n_back;
mod number_sequence;
mod schulte;
mod stroop;

#[derive(Debug, thiserror::Error)]
pub enum ScoringError {
    #[error("unknown game: {0}")]
    UnknownGame(String),
    #[error("invalid config for {game}: {message}")]
    InvalidConfig { game: &'static str, message: String },
}

pub type ScoreResult = Result<i32, ScoringError>;

/// Rundung wie JavaScripts `Math.round` (halb aufwärts, nicht weg von Null).
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// §7.3 `speedBonus`
pub fn speed_bonus(rt_ms: f64, target_ms: f64, max_bonus: f64) -> i32 {
    if rt_ms >= target_ms {
        return 0;
    }
    js_round(max_bonus * (1.0 - rt_ms / target_ms)) as i32
}

/// §7.3 `discriminationIndex`
pub fn discrimination_index(hits: i32, signals: i32, false_alarms: i32, noise: i32) -> f64 {
    let hr = if signals > 0 {
        hits as f64 / signals as f64
    } else {
        0.0
    };
    let far = if noise > 0 {
        false_alarms as f64 / noise as f64
    } else {
        0.0
    };
    (hr - far).max(0.0)
}

pub fn median(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut s = values.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = s.len() / 2;
    if s.len() % 2 == 1 {
        s[mid]
    } else {
        (s[mid - 1] + s[mid]) / 2.0
    }
}

/// Score ist immer eine nicht-negative ganze Zahl.
pub fn finalize(x: f64) -> i32 {
    js_round(x).max(0.0) as i32
}

pub fn field_i64(v: &Option<Value>, key: &str) -> Option<i64> {
    v.as_ref()?.get(key)?.as_i64()
}

pub fn field_f64(v: &Option<Value>, key: &str) -> Option<f64> {
    v.as_ref()?.get(key)?.as_f64()
}

pub fn field_bool(v: &Option<Value>, key: &str) -> Option<bool> {
    v.as_ref()?.get(key)?.as_bool()
}

pub fn field_str<'a>(v: &'a Option<Value>, key: &str) -> Option<&'a str> {
    v.as_ref()?.get(key)?.as_str()
}

pub fn has_field(v: &Option<Value>, key: &str) -> bool {
    v.as_ref().and_then(|x| x.get(key)).is_some()
}

pub fn cfg_f64(config: &Value, key: &str, game: &'static str) -> Result<f64, ScoringError> {
    config
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| ScoringError::InvalidConfig {
            game,
            message: format!("missing {key}"),
        })
}

pub fn cfg_i64(config: &Value, key: &str, game: &'static str) -> Result<i64, ScoringError> {
    config
        .get(key)
        .and_then(Value::as_i64)
        .ok_or_else(|| ScoringError::InvalidConfig {
            game,
            message: format!("missing {key}"),
        })
}

pub fn score(game_id: &str, config: &Value, rows: &[TrialRow]) -> ScoreResult {
    match game_id {
        "stroop" => stroop::score(config, rows),
        "go-nogo" => go_nogo::score(config, rows),
        "n-back" => n_back::score(config, rows),
        "mental-chain" => mental_chain::score(config, rows),
        "number-sequence" => number_sequence::score(config, rows),
        "corsi" => corsi::score(config, rows),
        "schulte" => schulte::score(config, rows),
        "lights-out" => lights_out::score(config, rows),
        "anagram" => anagram::score(config, rows),
        "mental-rotation" => mental_rotation::score(config, rows),
        other => Err(ScoringError::UnknownGame(other.to_string())),
    }
}

/// §9.2 `theoretical_max(game, config)`
pub fn theoretical_max(game_id: &str, config: &Value) -> ScoreResult {
    match game_id {
        "stroop" => stroop::theoretical_max(config),
        "go-nogo" => go_nogo::theoretical_max(config),
        "n-back" => n_back::theoretical_max(config),
        "mental-chain" => mental_chain::theoretical_max(config),
        "number-sequence" => number_sequence::theoretical_max(config),
        "corsi" => corsi::theoretical_max(config),
        "schulte" => schulte::theoretical_max(config),
        "lights-out" => lights_out::theoretical_max(config),
        "anagram" => anagram::theoretical_max(config),
        "mental-rotation" => mental_rotation::theoretical_max(config),
        other => Err(ScoringError::UnknownGame(other.to_string())),
    }
}

/// Anzahl korrekt bewerteter Zeilen – Basis der Accuracy für die Staircase (§7.4).
pub fn correct_count(rows: &[TrialRow]) -> i32 {
    rows.iter().filter(|r| r.correct).count() as i32
}

#[cfg(test)]
pub(crate) mod parity {
    //! Gemeinsame Fixture-Prüfung: TS-Fixtures → Rust-Score identisch (§15).
    use super::*;

    #[derive(serde::Deserialize)]
    pub struct Fixture {
        pub name: String,
        pub config: Value,
        #[serde(rename = "configHash")]
        pub config_hash: String,
        #[serde(rename = "trialCount")]
        pub trial_count: i32,
        pub rows: Vec<TrialRow>,
        pub expected: i32,
        #[serde(rename = "theoreticalMax")]
        pub theoretical_max: i32,
    }

    pub fn check(game_id: &str, json: &str) {
        let fixtures: Vec<Fixture> = serde_json::from_str(json).expect("fixture json");
        assert!(!fixtures.is_empty(), "{game_id}: keine Fixtures");
        for f in fixtures {
            let got = score(game_id, &f.config, &f.rows)
                .unwrap_or_else(|e| panic!("{game_id}/{}: {e}", f.name));
            assert_eq!(got, f.expected, "{game_id}/{}: score", f.name);
            let max = theoretical_max(game_id, &f.config).unwrap();
            assert_eq!(
                max, f.theoretical_max,
                "{game_id}/{}: theoretical_max",
                f.name
            );
            assert!(got <= max, "{game_id}/{}: score > max", f.name);
            assert_eq!(
                crate::domain::config_hash::config_hash(&f.config),
                f.config_hash,
                "{game_id}/{}: hash",
                f.name
            );
            assert_eq!(
                f.rows.len() as i32,
                f.trial_count,
                "{game_id}/{}: rows",
                f.name
            );
        }
    }

    #[test]
    fn building_blocks_match_ts() {
        assert_eq!(speed_bonus(0.0, 1000.0, 50.0), 50);
        assert_eq!(speed_bonus(500.0, 1000.0, 50.0), 25);
        assert_eq!(speed_bonus(1000.0, 1000.0, 50.0), 0);
        assert_eq!(speed_bonus(250.0, 1000.0, 200.0), 150);
        assert!((discrimination_index(8, 10, 2, 20) - 0.7).abs() < 1e-9);
        assert_eq!(median(&[4.0, 1.0, 3.0, 2.0]), 2.5);
        assert_eq!(median(&[]), 0.0);
        assert_eq!(finalize(12.5), 13);
        assert_eq!(finalize(-5.0), 0);
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
    }
}
