use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppResult;

pub struct PersonalBest {
    pub game_id: String,
    pub config_hash: String,
    pub score: i32,
    pub achieved_at: DateTime<Utc>,
}

pub async fn personal_bests(pool: &PgPool, user_id: Uuid) -> AppResult<Vec<PersonalBest>> {
    let rows = sqlx::query!(
        r#"SELECT game_id, config_hash, score, achieved_at FROM personal_best WHERE user_id = $1"#,
        user_id
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| PersonalBest {
            game_id: r.game_id,
            config_hash: r.config_hash,
            score: r.score,
            achieved_at: r.achieved_at,
        })
        .collect())
}

pub async fn best_for(
    pool: &PgPool,
    user_id: Uuid,
    game_id: &str,
    config_hash: &str,
) -> AppResult<Option<i32>> {
    let row = sqlx::query!(
        r#"SELECT score FROM personal_best
           WHERE user_id = $1 AND game_id = $2 AND config_hash = $3"#,
        user_id,
        game_id,
        config_hash
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| r.score))
}

pub struct ScorePoint {
    pub submitted_at: DateTime<Utc>,
    pub score: i32,
    pub mode: String,
    pub config_hash: String,
}

/// Score-Verlauf der letzten `limit` gültigen Runs eines Spiels (§11.2).
pub async fn score_history(
    pool: &PgPool,
    user_id: Uuid,
    game_id: &str,
    limit: i64,
) -> AppResult<Vec<ScorePoint>> {
    let rows = sqlx::query!(
        r#"SELECT submitted_at as "submitted_at!", score as "score!", mode, config_hash
           FROM run
           WHERE user_id = $1 AND game_id = $2 AND valid
             AND submitted_at IS NOT NULL AND score IS NOT NULL
           ORDER BY submitted_at DESC LIMIT $3"#,
        user_id,
        game_id,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .rev()
        .map(|r| ScorePoint {
            submitted_at: r.submitted_at,
            score: r.score,
            mode: r.mode,
            config_hash: r.config_hash,
        })
        .collect())
}

pub async fn total_runs(pool: &PgPool, user_id: Uuid) -> AppResult<i64> {
    let row = sqlx::query!(
        r#"SELECT count(*) as "count!" FROM run
           WHERE user_id = $1 AND valid AND submitted_at IS NOT NULL"#,
        user_id
    )
    .fetch_one(pool)
    .await?;
    Ok(row.count)
}

pub struct RecentRun {
    pub game_id: String,
    pub mode: String,
    pub score: Option<i32>,
    pub submitted_at: DateTime<Utc>,
}

pub async fn recent_runs(pool: &PgPool, user_id: Uuid, limit: i64) -> AppResult<Vec<RecentRun>> {
    let rows = sqlx::query!(
        r#"SELECT game_id, mode, score, submitted_at as "submitted_at!"
           FROM run WHERE user_id = $1 AND submitted_at IS NOT NULL
           ORDER BY submitted_at DESC LIMIT $2"#,
        user_id,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| RecentRun {
            game_id: r.game_id,
            mode: r.mode,
            score: r.score,
            submitted_at: r.submitted_at,
        })
        .collect())
}
