//! Reine Domänenlogik (§14.1): keine DB, kein HTTP, vollständig unit-testbar.

pub mod config_hash;
pub mod ranked;
pub mod rng;
pub mod scoring;
pub mod staircase;
pub mod table;
pub mod validate;

/// Eine `trial_result`-Zeile, wie sie der Client sendet (§9.3).
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize, PartialEq)]
pub struct TrialRow {
    pub idx: i32,
    #[serde(default)]
    pub response: Option<serde_json::Value>,
    #[serde(default)]
    pub rt_ms: Option<i32>,
    #[serde(default)]
    pub presented_ms: Option<i32>,
    pub correct: bool,
}
