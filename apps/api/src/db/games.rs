use sqlx::PgPool;
use uuid::Uuid;

use crate::{domain::table::TABLE, error::AppResult};

/// Synchronisiert die Spieltabelle aus `packages/games/game-table.json` in die DB.
/// Bestehende `enabled`-Flags bleiben erhalten (Admin-Entscheidung, §11.3).
pub async fn sync_games(pool: &PgPool) -> AppResult<()> {
    for id in TABLE.ids() {
        let def = TABLE.get(id).expect("id aus der Tabelle");
        sqlx::query!(
            r#"INSERT INTO game (id, category, max_level, enabled)
               VALUES ($1, $2, $3, true)
               ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category,
                                              max_level = EXCLUDED.max_level"#,
            def.id,
            def.category,
            def.max_level
        )
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub struct GameRow {
    pub id: String,
    pub category: String,
    pub enabled: bool,
    pub max_level: i32,
}

pub async fn list_games(pool: &PgPool) -> AppResult<Vec<GameRow>> {
    let rows = sqlx::query!(r#"SELECT id, category, enabled, max_level FROM game ORDER BY id"#)
        .fetch_all(pool)
        .await?;
    Ok(rows
        .into_iter()
        .map(|r| GameRow {
            id: r.id,
            category: r.category,
            enabled: r.enabled,
            max_level: r.max_level,
        })
        .collect())
}

pub async fn find_game(pool: &PgPool, id: &str) -> AppResult<Option<GameRow>> {
    let row = sqlx::query!(
        r#"SELECT id, category, enabled, max_level FROM game WHERE id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| GameRow {
        id: r.id,
        category: r.category,
        enabled: r.enabled,
        max_level: r.max_level,
    }))
}

pub async fn set_enabled(pool: &PgPool, id: &str, enabled: bool) -> AppResult<bool> {
    let res = sqlx::query!(r#"UPDATE game SET enabled = $2 WHERE id = $1"#, id, enabled)
        .execute(pool)
        .await?;
    Ok(res.rows_affected() > 0)
}

// ---------- user_game_state (§7.4) ----------

#[derive(Debug, Clone, Copy)]
pub struct GameState {
    pub level: i32,
    pub consecutive_up: i32,
    pub runs_played: i32,
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            level: 1,
            consecutive_up: 0,
            runs_played: 0,
        }
    }
}

pub async fn game_state(pool: &PgPool, user_id: Uuid, game_id: &str) -> AppResult<GameState> {
    let row = sqlx::query!(
        r#"SELECT level, consecutive_up, runs_played FROM user_game_state
           WHERE user_id = $1 AND game_id = $2"#,
        user_id,
        game_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row
        .map(|r| GameState {
            level: r.level,
            consecutive_up: r.consecutive_up,
            runs_played: r.runs_played,
        })
        .unwrap_or_default())
}

pub async fn all_game_states(pool: &PgPool, user_id: Uuid) -> AppResult<Vec<(String, GameState)>> {
    let rows = sqlx::query!(
        r#"SELECT game_id, level, consecutive_up, runs_played FROM user_game_state WHERE user_id = $1"#,
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| {
            (
                r.game_id,
                GameState {
                    level: r.level,
                    consecutive_up: r.consecutive_up,
                    runs_played: r.runs_played,
                },
            )
        })
        .collect())
}
