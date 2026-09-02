//! Ranked-Runden (§10.3): Seed = fnv1a32("<game_id>:<YYYY-MM-DD>"), Config nach ISO-Woche.

use chrono::{DateTime, Datelike, NaiveDate, Utc};

use super::rng::fnv1a32;

pub fn round_seed(game_id: &str, day: NaiveDate) -> u32 {
    fnv1a32(&format!("{game_id}:{}", day.format("%Y-%m-%d")))
}

/// Rotation identisch zu `packages/games/src/ranked.ts`: `index = isoWeek % len`.
pub fn ranked_index(iso_week: u32, len: usize) -> usize {
    assert!(len > 0);
    (iso_week as usize) % len
}

pub fn iso_week_of(day: NaiveDate) -> u32 {
    day.iso_week().week()
}

/// Fenster `[00:00 UTC, 24:00 UTC)` eines Tages.
pub fn round_window(day: NaiveDate) -> (DateTime<Utc>, DateTime<Utc>) {
    let start = day.and_hms_opt(0, 0, 0).expect("midnight").and_utc();
    let end = start + chrono::Duration::days(1);
    (start, end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_matches_ts_golden() {
        // Wert aus packages/engine/test/golden/fnv1a32.json ("stroop:2026-09-02")
        let day = NaiveDate::from_ymd_opt(2026, 9, 2).unwrap();
        assert_eq!(round_seed("stroop", day), 460_578_335);
    }

    #[test]
    fn window_is_one_utc_day() {
        let (s, e) = round_window(NaiveDate::from_ymd_opt(2026, 9, 2).unwrap());
        assert_eq!(s.to_rfc3339(), "2026-09-02T00:00:00+00:00");
        assert_eq!((e - s).num_hours(), 24);
    }

    #[test]
    fn index_rotates() {
        assert_eq!(ranked_index(36, 4), 0);
        assert_eq!(ranked_index(37, 4), 1);
        assert_eq!(ranked_index(1, 4), 1);
    }
}
