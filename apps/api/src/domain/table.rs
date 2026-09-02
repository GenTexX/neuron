//! Spieltabelle aus `packages/games/game-table.json` (generiert aus der TS-Registry).
//! Einzige Quelle für Level-Configs, trial_count und theoretical_max der Level-Leiter.

use std::{collections::HashMap, sync::LazyLock};

use serde::Deserialize;
use serde_json::Value;

const TABLE_JSON: &str = include_str!("../../../../packages/games/game-table.json");

#[derive(Debug, Clone, Deserialize)]
pub struct Entry {
    pub config: Value,
    #[serde(rename = "configHash")]
    pub config_hash: String,
    #[serde(rename = "trialCount")]
    pub trial_count: i32,
    #[serde(rename = "theoreticalMax")]
    pub theoretical_max: i32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GameDef {
    pub id: String,
    pub category: String,
    #[serde(rename = "inputKind")]
    pub input_kind: String,
    #[serde(rename = "timingSensitive")]
    pub timing_sensitive: bool,
    #[serde(rename = "responseModel")]
    pub response_model: String,
    #[serde(rename = "maxLevel")]
    pub max_level: i32,
    pub levels: Vec<Entry>,
    pub ranked: Vec<Entry>,
}

#[derive(Debug, Deserialize)]
struct TableFile {
    games: Vec<GameDef>,
}

pub struct GameTable {
    pub order: Vec<String>,
    pub games: HashMap<String, GameDef>,
}

pub static TABLE: LazyLock<GameTable> = LazyLock::new(|| {
    let file: TableFile = serde_json::from_str(TABLE_JSON).expect("game-table.json ist gültig");
    let order = file.games.iter().map(|g| g.id.clone()).collect();
    let games = file.games.into_iter().map(|g| (g.id.clone(), g)).collect();
    GameTable { order, games }
});

impl GameTable {
    pub fn get(&self, id: &str) -> Option<&GameDef> {
        self.games.get(id)
    }

    pub fn ids(&self) -> impl Iterator<Item = &str> {
        self.order.iter().map(String::as_str)
    }
}

impl GameDef {
    /// Level wird auf [1, max_level] geklemmt (§7.4).
    pub fn level_entry(&self, level: i32) -> &Entry {
        let l = level.clamp(1, self.max_level) as usize;
        &self.levels[l - 1]
    }

    pub fn ranked_entry(&self, iso_week: u32) -> &Entry {
        &self.ranked[super::ranked::ranked_index(iso_week, self.ranked.len())]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::config_hash::config_hash;

    #[test]
    fn table_loads_and_hashes_match() {
        for id in TABLE.ids() {
            let g = TABLE.get(id).unwrap();
            assert_eq!(g.levels.len() as i32, g.max_level, "{id}");
            assert!(!g.ranked.is_empty(), "{id}");
            for e in g.levels.iter().chain(g.ranked.iter()) {
                assert_eq!(config_hash(&e.config), e.config_hash, "{id}");
                assert!(e.trial_count > 0);
                assert!(e.theoretical_max > 0);
            }
        }
    }

    #[test]
    fn theoretical_max_matches_rust_scoring() {
        for id in TABLE.ids() {
            let g = TABLE.get(id).unwrap();
            for e in g.levels.iter().chain(g.ranked.iter()) {
                let got = crate::domain::scoring::theoretical_max(id, &e.config)
                    .unwrap_or_else(|err| panic!("{id}: {err}"));
                assert_eq!(got, e.theoretical_max, "{id} config {}", e.config);
            }
        }
    }
}
