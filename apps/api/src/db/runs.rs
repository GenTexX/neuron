use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{domain::TrialRow, error::AppResult};

#[derive(Debug, Clone)]
pub struct Run {
    pub id: Uuid,
    pub user_id: Uuid,
    pub game_id: String,
    pub mode: String,
    pub ranked_round_id: Option<Uuid>,
    pub level: Option<i32>,
    pub config: Value,
    pub config_hash: String,
    pub seed: i64,
    pub trial_count: i32,
    pub nonce: Vec<u8>,
    pub server_started_at: DateTime<Utc>,
    pub submitted_at: Option<DateTime<Utc>>,
    pub score: Option<i32>,
    pub valid: bool,
}

#[allow(clippy::too_many_arguments)]
pub async fn create_run(
    pool: &PgPool,
    user_id: Uuid,
    game_id: &str,
    mode: &str,
    ranked_round_id: Option<Uuid>,
    level: Option<i32>,
    config: &Value,
    config_hash: &str,
    seed: i64,
    trial_count: i32,
    nonce: &[u8],
) -> AppResult<Run> {
    let id = Uuid::now_v7();
    let row = sqlx::query!(
        r#"INSERT INTO run (id, user_id, game_id, mode, ranked_round_id, level, config,
                            config_hash, seed, trial_count, nonce)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id, server_started_at"#,
        id,
        user_id,
        game_id,
        mode,
        ranked_round_id,
        level,
        config,
        config_hash,
        seed,
        trial_count,
        nonce
    )
    .fetch_one(pool)
    .await?;
    Ok(Run {
        id: row.id,
        user_id,
        game_id: game_id.to_string(),
        mode: mode.to_string(),
        ranked_round_id,
        level,
        config: config.clone(),
        config_hash: config_hash.to_string(),
        seed,
        trial_count,
        nonce: nonce.to_vec(),
        server_started_at: row.server_started_at,
        submitted_at: None,
        score: None,
        valid: false,
    })
}

/// Räumt einen offenen, unsubmitteten Ranked-Run derselben Runde weg (§10.2).
pub async fn delete_unsubmitted_ranked_run(
    pool: &PgPool,
    user_id: Uuid,
    round_id: Uuid,
) -> AppResult<u64> {
    let res = sqlx::query!(
        r#"DELETE FROM run
           WHERE user_id = $1 AND ranked_round_id = $2 AND submitted_at IS NULL"#,
        user_id,
        round_id
    )
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

pub async fn has_submitted_ranked_run(
    pool: &PgPool,
    user_id: Uuid,
    round_id: Uuid,
) -> AppResult<bool> {
    let row = sqlx::query!(
        r#"SELECT 1 as "exists!" FROM run
           WHERE user_id = $1 AND ranked_round_id = $2 AND submitted_at IS NOT NULL"#,
        user_id,
        round_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.is_some())
}

/// Lädt und sperrt die Run-Zeile (§14.3, `SELECT … FOR UPDATE`).
pub async fn lock_run(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> AppResult<Option<Run>> {
    let row = sqlx::query!(
        r#"SELECT id, user_id, game_id, mode, ranked_round_id, level, config, config_hash,
                  seed, trial_count, nonce, server_started_at, submitted_at, score, valid
           FROM run WHERE id = $1 FOR UPDATE"#,
        id
    )
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row.map(|r| Run {
        id: r.id,
        user_id: r.user_id,
        game_id: r.game_id,
        mode: r.mode,
        ranked_round_id: r.ranked_round_id,
        level: r.level,
        config: r.config,
        config_hash: r.config_hash,
        seed: r.seed,
        trial_count: r.trial_count,
        nonce: r.nonce,
        server_started_at: r.server_started_at,
        submitted_at: r.submitted_at,
        score: r.score,
        valid: r.valid,
    }))
}

/// Bulk-Insert der Trial-Zeilen per UNNEST (§14.3).
pub async fn insert_trial_results(
    tx: &mut Transaction<'_, Postgres>,
    run_id: Uuid,
    rows: &[TrialRow],
) -> AppResult<()> {
    let idx: Vec<i32> = rows.iter().map(|r| r.idx).collect();
    let response: Vec<Option<Value>> = rows.iter().map(|r| r.response.clone()).collect();
    let rt: Vec<Option<i32>> = rows.iter().map(|r| r.rt_ms).collect();
    let presented: Vec<Option<i32>> = rows.iter().map(|r| r.presented_ms).collect();
    let correct: Vec<bool> = rows.iter().map(|r| r.correct).collect();
    sqlx::query!(
        r#"INSERT INTO trial_result (run_id, idx, response, rt_ms, presented_ms, correct)
           SELECT $1, * FROM UNNEST($2::int[], $3::jsonb[], $4::int[], $5::int[], $6::bool[])
           ON CONFLICT (run_id, idx) DO NOTHING"#,
        run_id,
        &idx,
        &response as &[Option<Value>],
        &rt as &[Option<i32>],
        &presented as &[Option<i32>],
        &correct
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn finish_run(
    tx: &mut Transaction<'_, Postgres>,
    run_id: Uuid,
    submitted_at: DateTime<Utc>,
    client_duration_ms: i32,
    correct_count: i32,
    score: i32,
    valid: bool,
    invalid_reason: Option<&str>,
) -> AppResult<()> {
    sqlx::query!(
        r#"UPDATE run SET submitted_at = $2, client_duration_ms = $3, correct_count = $4,
                          score = $5, valid = $6, invalid_reason = $7
           WHERE id = $1"#,
        run_id,
        submitted_at,
        client_duration_ms,
        correct_count,
        score,
        valid,
        invalid_reason
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn upsert_game_state(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    game_id: &str,
    level: i32,
    consecutive_up: i32,
) -> AppResult<()> {
    sqlx::query!(
        r#"INSERT INTO user_game_state (user_id, game_id, level, consecutive_up, runs_played, updated_at)
           VALUES ($1, $2, $3, $4, 1, now())
           ON CONFLICT (user_id, game_id) DO UPDATE
             SET level = EXCLUDED.level,
                 consecutive_up = EXCLUDED.consecutive_up,
                 runs_played = user_game_state.runs_played + 1,
                 updated_at = now()"#,
        user_id,
        game_id,
        level,
        consecutive_up
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub struct PersonalBestUpdate {
    pub is_new_best: bool,
    pub previous: Option<i32>,
}

pub async fn upsert_personal_best(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    game_id: &str,
    config_hash: &str,
    score: i32,
    run_id: Uuid,
    achieved_at: DateTime<Utc>,
) -> AppResult<PersonalBestUpdate> {
    let previous = sqlx::query!(
        r#"SELECT score FROM personal_best
           WHERE user_id = $1 AND game_id = $2 AND config_hash = $3"#,
        user_id,
        game_id,
        config_hash
    )
    .fetch_optional(&mut **tx)
    .await?
    .map(|r| r.score);

    let is_new_best = previous.is_none_or(|p| score > p);
    if is_new_best {
        sqlx::query!(
            r#"INSERT INTO personal_best (user_id, game_id, config_hash, score, run_id, achieved_at)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (user_id, game_id, config_hash) DO UPDATE
                 SET score = EXCLUDED.score, run_id = EXCLUDED.run_id,
                     achieved_at = EXCLUDED.achieved_at"#,
            user_id,
            game_id,
            config_hash,
            score,
            run_id,
            achieved_at
        )
        .execute(&mut **tx)
        .await?;
    }
    Ok(PersonalBestUpdate {
        is_new_best,
        previous,
    })
}

/// Trägt den lokalen Kalendertag des Nutzers in `daily_activity` ein (§10.4).
pub async fn record_daily_activity(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    submitted_at: DateTime<Utc>,
) -> AppResult<NaiveDate> {
    let row = sqlx::query!(
        r#"WITH tz AS (SELECT timezone FROM app_user WHERE id = $1)
           INSERT INTO daily_activity (user_id, local_day, run_count)
           SELECT $1, ($2 AT TIME ZONE tz.timezone)::date, 1 FROM tz
           ON CONFLICT (user_id, local_day)
             DO UPDATE SET run_count = daily_activity.run_count + 1
           RETURNING local_day"#,
        user_id,
        submitted_at
    )
    .fetch_one(&mut **tx)
    .await?;
    Ok(row.local_day)
}

/// Aktuelle Streak, abgeleitet aus `daily_activity` (§10.4).
pub async fn current_streak(pool: &PgPool, user_id: Uuid, timezone: &str) -> AppResult<i64> {
    let row = sqlx::query!(
        r#"WITH d AS (
             SELECT local_day,
                    local_day - (ROW_NUMBER() OVER (ORDER BY local_day))::int AS grp
             FROM daily_activity WHERE user_id = $1
           )
           SELECT count(*) as "count!" FROM d
           WHERE grp = (SELECT grp FROM d ORDER BY local_day DESC LIMIT 1)
             AND (SELECT max(local_day) FROM d) >= ((now() AT TIME ZONE $2)::date - 1)"#,
        user_id,
        timezone
    )
    .fetch_one(pool)
    .await?;
    Ok(row.count)
}

pub struct HistoryEntry {
    pub run_id: Uuid,
    pub game_id: String,
    pub mode: String,
    pub level: Option<i32>,
    pub config_hash: String,
    pub score: Option<i32>,
    pub correct_count: Option<i32>,
    pub trial_count: i32,
    pub valid: bool,
    pub invalid_reason: Option<String>,
    pub submitted_at: DateTime<Utc>,
}

pub async fn history(
    pool: &PgPool,
    user_id: Uuid,
    game_id: Option<&str>,
    before: Option<DateTime<Utc>>,
    limit: i64,
) -> AppResult<Vec<HistoryEntry>> {
    let rows = sqlx::query!(
        r#"SELECT id, game_id, mode, level, config_hash, score, correct_count, trial_count,
                  valid, invalid_reason, submitted_at as "submitted_at!"
           FROM run
           WHERE user_id = $1
             AND submitted_at IS NOT NULL
             AND ($2::text IS NULL OR game_id = $2)
             AND ($3::timestamptz IS NULL OR submitted_at < $3)
           ORDER BY submitted_at DESC
           LIMIT $4"#,
        user_id,
        game_id,
        before,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| HistoryEntry {
            run_id: r.id,
            game_id: r.game_id,
            mode: r.mode,
            level: r.level,
            config_hash: r.config_hash,
            score: r.score,
            correct_count: r.correct_count,
            trial_count: r.trial_count,
            valid: r.valid,
            invalid_reason: r.invalid_reason,
            submitted_at: r.submitted_at,
        })
        .collect())
}

pub async fn invalidate_run(pool: &PgPool, run_id: Uuid, reason: &str) -> AppResult<bool> {
    let res = sqlx::query!(
        r#"UPDATE run SET valid = false, invalid_reason = $2 WHERE id = $1"#,
        run_id,
        reason
    )
    .execute(pool)
    .await?;
    if res.rows_affected() > 0 {
        sqlx::query!(r#"DELETE FROM personal_best WHERE run_id = $1"#, run_id)
            .execute(pool)
            .await?;
    }
    Ok(res.rows_affected() > 0)
}
