//! Integritätsprüfungen beim Submit (§9.2). Reine Funktion, eine Zeile je Tabellenzeile.

use chrono::{DateTime, Duration, Utc};

use super::TrialRow;

pub const MIN_WINDOW_SECS: i64 = 2;
pub const MAX_WINDOW_SECS: i64 = 2 * 60 * 60;
pub const MIN_HUMAN_RT_MS: i32 = 120;
pub const ROBOTIC_STDDEV_MS: f64 = 8.0;
pub const ROBOTIC_MIN_TRIALS: usize = 8;
pub const DURATION_TOLERANCE: f64 = 0.25;
pub const ROUND_GRACE_MINUTES: i64 = 5;

pub struct SubmitCheck<'a> {
    pub run_user_id: uuid::Uuid,
    pub auth_user_id: uuid::Uuid,
    pub already_submitted: bool,
    pub stored_nonce: &'a [u8],
    pub submitted_nonce: &'a [u8],
    pub server_started_at: DateTime<Utc>,
    pub submitted_at: DateTime<Utc>,
    pub trial_count: i32,
    pub rows: &'a [TrialRow],
    pub client_duration_ms: i64,
    pub round_ends_at: Option<DateTime<Utc>>,
    pub score: i32,
    pub theoretical_max: i32,
    pub client_aborted: bool,
}

/// Liefert `None` bei gültigem Run, sonst den `invalid_reason`.
/// Die Reihenfolge entspricht der Tabelle in §9.2; die erste Verletzung gewinnt.
pub fn validate(c: &SubmitCheck<'_>) -> Option<&'static str> {
    if c.run_user_id != c.auth_user_id {
        return Some("wrong_user");
    }
    if c.already_submitted {
        return Some("already_submitted");
    }
    if c.stored_nonce != c.submitted_nonce {
        return Some("nonce_mismatch");
    }
    if c.client_aborted {
        return Some("client_aborted");
    }
    let window = c.submitted_at - c.server_started_at;
    if window < Duration::seconds(MIN_WINDOW_SECS) || window > Duration::seconds(MAX_WINDOW_SECS) {
        return Some("implausible_window");
    }
    if !trial_indices_complete(c.rows, c.trial_count) {
        return Some("trial_count_mismatch");
    }
    if c.rows
        .iter()
        .any(|r| r.correct && matches!(r.rt_ms, Some(rt) if rt < MIN_HUMAN_RT_MS))
    {
        return Some("superhuman_rt");
    }
    if c.rows.len() >= ROBOTIC_MIN_TRIALS {
        let rts: Vec<f64> = c
            .rows
            .iter()
            .filter_map(|r| r.rt_ms)
            .map(f64::from)
            .collect();
        if rts.len() >= ROBOTIC_MIN_TRIALS && stddev(&rts) <= ROBOTIC_STDDEV_MS {
            return Some("robotic_timing");
        }
    }
    let server_ms = window.num_milliseconds() as f64;
    if server_ms > 0.0 {
        let diff = (c.client_duration_ms as f64 - server_ms).abs();
        if diff / server_ms >= DURATION_TOLERANCE {
            return Some("duration_mismatch");
        }
    }
    if let Some(ends_at) = c.round_ends_at {
        if c.submitted_at > ends_at + Duration::minutes(ROUND_GRACE_MINUTES) {
            return Some("round_expired");
        }
    }
    if c.score > c.theoretical_max {
        return Some("score_out_of_range");
    }
    None
}

pub fn trial_indices_complete(rows: &[TrialRow], trial_count: i32) -> bool {
    if trial_count < 0 || rows.len() != trial_count as usize {
        return false;
    }
    let mut seen = vec![false; rows.len()];
    for r in rows {
        if r.idx < 0 || r.idx as usize >= rows.len() || seen[r.idx as usize] {
            return false;
        }
        seen[r.idx as usize] = true;
    }
    true
}

/// Populations-Standardabweichung.
pub fn stddev(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let n = values.len() as f64;
    let mean = values.iter().sum::<f64>() / n;
    let var = values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    var.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn rows(n: i32, rt_base: i32) -> Vec<TrialRow> {
        (0..n)
            .map(|i| TrialRow {
                idx: i,
                response: Some(serde_json::json!({ "choice": 1 })),
                rt_ms: Some(rt_base + (i * 37) % 400),
                presented_ms: Some(1000),
                correct: true,
            })
            .collect()
    }

    fn base<'a>(rows: &'a [TrialRow], nonce: &'a [u8]) -> SubmitCheck<'a> {
        let started = DateTime::parse_from_rfc3339("2026-09-02T10:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let user = Uuid::from_u128(1);
        SubmitCheck {
            run_user_id: user,
            auth_user_id: user,
            already_submitted: false,
            stored_nonce: nonce,
            submitted_nonce: nonce,
            server_started_at: started,
            submitted_at: started + Duration::seconds(60),
            trial_count: rows.len() as i32,
            rows,
            client_duration_ms: 60_000,
            round_ends_at: None,
            score: 100,
            theoretical_max: 1000,
            client_aborted: false,
        }
    }

    #[test]
    fn valid_run_passes() {
        let r = rows(10, 300);
        assert_eq!(validate(&base(&r, b"n")), None);
    }

    #[test]
    fn wrong_user() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.auth_user_id = Uuid::from_u128(2);
        assert_eq!(validate(&c), Some("wrong_user"));
    }

    #[test]
    fn already_submitted() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.already_submitted = true;
        assert_eq!(validate(&c), Some("already_submitted"));
    }

    #[test]
    fn nonce_mismatch() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.submitted_nonce = b"x";
        assert_eq!(validate(&c), Some("nonce_mismatch"));
    }

    #[test]
    fn client_aborted() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.client_aborted = true;
        assert_eq!(validate(&c), Some("client_aborted"));
    }

    #[test]
    fn implausible_window() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.submitted_at = c.server_started_at + Duration::seconds(1);
        assert_eq!(validate(&c), Some("implausible_window"));
        c.submitted_at = c.server_started_at + Duration::hours(3);
        assert_eq!(validate(&c), Some("implausible_window"));
    }

    #[test]
    fn trial_count_mismatch() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.trial_count = 11;
        assert_eq!(validate(&c), Some("trial_count_mismatch"));
        let mut dup = rows(10, 300);
        dup[3].idx = 2;
        let c2 = base(&dup, b"n");
        assert_eq!(validate(&c2), Some("trial_count_mismatch"));
    }

    #[test]
    fn superhuman_rt() {
        let mut r = rows(10, 300);
        r[4].rt_ms = Some(80);
        assert_eq!(validate(&base(&r, b"n")), Some("superhuman_rt"));
        // Bei falschen Trials ist ein schneller Druck erlaubt
        r[4].correct = false;
        assert_eq!(validate(&base(&r, b"n")), None);
    }

    #[test]
    fn robotic_timing() {
        let mut r = rows(10, 300);
        for row in r.iter_mut() {
            row.rt_ms = Some(300);
        }
        assert_eq!(validate(&base(&r, b"n")), Some("robotic_timing"));
        // unter 8 Trials gilt die Prüfung nicht
        let mut short = rows(7, 300);
        for row in short.iter_mut() {
            row.rt_ms = Some(300);
        }
        assert_eq!(validate(&base(&short, b"n")), None);
    }

    #[test]
    fn duration_mismatch() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.client_duration_ms = 30_000;
        assert_eq!(validate(&c), Some("duration_mismatch"));
        c.client_duration_ms = 50_000;
        assert_eq!(validate(&c), None);
    }

    #[test]
    fn round_expired() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.round_ends_at = Some(c.server_started_at + Duration::seconds(30));
        assert_eq!(validate(&c), None); // innerhalb der 5-min-Kulanz
        c.round_ends_at = Some(c.server_started_at - Duration::minutes(10));
        assert_eq!(validate(&c), Some("round_expired"));
    }

    #[test]
    fn score_out_of_range() {
        let r = rows(10, 300);
        let mut c = base(&r, b"n");
        c.score = 1001;
        assert_eq!(validate(&c), Some("score_out_of_range"));
    }
}
