//! 3-up-1-down (§7.4) – Referenz: `packages/engine/src/staircase.ts`.

pub const SUCCESS_THRESHOLD: f64 = 0.8;
pub const UPS_REQUIRED: i32 = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StaircaseState {
    pub level: i32,
    pub consecutive_up: i32,
    pub runs_played: i32,
}

pub fn clamp_level(level: i32, max_level: i32) -> i32 {
    level.clamp(1, max_level.max(1))
}

pub fn apply(state: StaircaseState, accuracy: f64, valid: bool, max_level: i32) -> StaircaseState {
    let runs_played = state.runs_played + 1;
    if !valid {
        return StaircaseState {
            runs_played,
            ..state
        };
    }
    if accuracy >= SUCCESS_THRESHOLD {
        let ups = state.consecutive_up + 1;
        if ups >= UPS_REQUIRED {
            return StaircaseState {
                level: clamp_level(state.level + 1, max_level),
                consecutive_up: 0,
                runs_played,
            };
        }
        return StaircaseState {
            level: state.level,
            consecutive_up: ups,
            runs_played,
        };
    }
    StaircaseState {
        level: clamp_level(state.level - 1, max_level),
        consecutive_up: 0,
        runs_played,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const S0: StaircaseState = StaircaseState {
        level: 1,
        consecutive_up: 0,
        runs_played: 0,
    };

    #[test]
    fn three_up() {
        let s = apply(S0, 0.9, true, 10);
        assert_eq!(
            s,
            StaircaseState {
                level: 1,
                consecutive_up: 1,
                runs_played: 1
            }
        );
        let s = apply(s, 0.8, true, 10);
        let s = apply(s, 0.85, true, 10);
        assert_eq!(
            s,
            StaircaseState {
                level: 2,
                consecutive_up: 0,
                runs_played: 3
            }
        );
    }

    #[test]
    fn one_down_and_clamp() {
        let s = StaircaseState {
            level: 5,
            consecutive_up: 2,
            runs_played: 9,
        };
        assert_eq!(
            apply(s, 0.5, true, 10),
            StaircaseState {
                level: 4,
                consecutive_up: 0,
                runs_played: 10
            }
        );
        assert_eq!(apply(S0, 0.1, true, 10).level, 1);
        let top = StaircaseState {
            level: 10,
            consecutive_up: 2,
            runs_played: 0,
        };
        assert_eq!(apply(top, 1.0, true, 10).level, 10);
    }

    #[test]
    fn invalid_runs_do_nothing() {
        let s = StaircaseState {
            level: 3,
            consecutive_up: 2,
            runs_played: 4,
        };
        assert_eq!(
            apply(s, 1.0, false, 10),
            StaircaseState {
                level: 3,
                consecutive_up: 2,
                runs_played: 5
            }
        );
    }
}
