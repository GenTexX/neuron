use chrono::{DateTime, Datelike, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

use crate::error::AppResult;

pub struct RankedRound {
    pub id: Uuid,
    pub game_id: String,
    pub config: Value,
    pub config_hash: String,
    pub seed: i64,
    pub trial_count: i32,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
}

#[allow(clippy::too_many_arguments)]
pub async fn upsert_round(
    pool: &PgPool,
    game_id: &str,
    config: &Value,
    config_hash: &str,
    seed: i64,
    trial_count: i32,
    starts_at: DateTime<Utc>,
    ends_at: DateTime<Utc>,
) -> AppResult<()> {
    sqlx::query!(
        r#"INSERT INTO ranked_round (id, game_id, config, config_hash, seed, trial_count, starts_at, ends_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (game_id, starts_at) DO NOTHING"#,
        Uuid::now_v7(),
        game_id,
        config,
        config_hash,
        seed,
        trial_count,
        starts_at,
        ends_at
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Die zum Zeitpunkt `at` laufende Runde eines Spiels.
pub async fn current_round(
    pool: &PgPool,
    game_id: &str,
    at: DateTime<Utc>,
) -> AppResult<Option<RankedRound>> {
    let row = sqlx::query!(
        r#"SELECT id, game_id, config, config_hash, seed, trial_count, starts_at, ends_at
           FROM ranked_round
           WHERE game_id = $1 AND starts_at <= $2 AND ends_at > $2
           ORDER BY starts_at DESC LIMIT 1"#,
        game_id,
        at
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| RankedRound {
        id: r.id,
        game_id: r.game_id,
        config: r.config,
        config_hash: r.config_hash,
        seed: r.seed,
        trial_count: r.trial_count,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
    }))
}

pub async fn round_by_id(pool: &PgPool, id: Uuid) -> AppResult<Option<RankedRound>> {
    let row = sqlx::query!(
        r#"SELECT id, game_id, config, config_hash, seed, trial_count, starts_at, ends_at
           FROM ranked_round WHERE id = $1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| RankedRound {
        id: r.id,
        game_id: r.game_id,
        config: r.config,
        config_hash: r.config_hash,
        seed: r.seed,
        trial_count: r.trial_count,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
    }))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Period {
    Daily,
    Weekly,
    Alltime,
}

impl Period {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "daily" => Some(Period::Daily),
            "weekly" => Some(Period::Weekly),
            "alltime" => Some(Period::Alltime),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Period::Daily => "daily",
            Period::Weekly => "weekly",
            Period::Alltime => "alltime",
        }
    }
}

pub struct LeaderboardEntry {
    pub rank: i64,
    pub user_id: Uuid,
    pub display_name: String,
    pub score: i32,
    pub achieved_at: DateTime<Utc>,
}

/// Zeitfenster für den Zeitraum (§10.3). `daily` ist an die laufende Runde gebunden.
pub fn window(
    period: Period,
    round: Option<&RankedRound>,
    now: DateTime<Utc>,
) -> (Option<DateTime<Utc>>, Option<DateTime<Utc>>) {
    match period {
        Period::Daily => round
            .map(|r| (Some(r.starts_at), Some(r.ends_at)))
            .unwrap_or((None, None)),
        Period::Weekly => {
            let days_from_monday = now.weekday().num_days_from_monday() as i64;
            let start = (now - chrono::Duration::days(days_from_monday))
                .date_naive()
                .and_hms_opt(0, 0, 0)
                .expect("midnight")
                .and_utc();
            (Some(start), Some(start + chrono::Duration::days(7)))
        }
        Period::Alltime => (None, None),
    }
}

/// Bester gültiger Ranked-Run je Nutzer im Fenster; bei Gleichstand entscheidet
/// der frühere `submitted_at` (§11.2).
pub async fn leaderboard(
    pool: &PgPool,
    game_id: &str,
    config_hash: &str,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
    limit: i64,
) -> AppResult<Vec<LeaderboardEntry>> {
    let rows = sqlx::query!(
        r#"WITH best AS (
             SELECT DISTINCT ON (r.user_id) r.user_id, r.score, r.submitted_at
             FROM run r
             WHERE r.game_id = $1 AND r.config_hash = $2 AND r.mode = 'ranked'
               AND r.valid AND r.submitted_at IS NOT NULL AND r.score IS NOT NULL
               AND ($3::timestamptz IS NULL OR r.submitted_at >= $3)
               AND ($4::timestamptz IS NULL OR r.submitted_at < $4)
             ORDER BY r.user_id, r.score DESC, r.submitted_at ASC
           )
           SELECT rank() OVER (ORDER BY b.score DESC, b.submitted_at ASC) as "rank!",
                  b.user_id, u.display_name, b.score as "score!", b.submitted_at as "submitted_at!"
           FROM best b JOIN app_user u ON u.id = b.user_id
           ORDER BY b.score DESC, b.submitted_at ASC
           LIMIT $5"#,
        game_id,
        config_hash,
        from,
        to,
        limit
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|r| LeaderboardEntry {
            rank: r.rank,
            user_id: r.user_id,
            display_name: r.display_name,
            score: r.score,
            achieved_at: r.submitted_at,
        })
        .collect())
}

pub struct MyRank {
    pub rank: i64,
    pub score: i32,
    pub of: i64,
}

pub async fn my_rank(
    pool: &PgPool,
    game_id: &str,
    config_hash: &str,
    user_id: Uuid,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
) -> AppResult<Option<MyRank>> {
    let row = sqlx::query!(
        r#"WITH best AS (
             SELECT DISTINCT ON (r.user_id) r.user_id, r.score, r.submitted_at
             FROM run r
             WHERE r.game_id = $1 AND r.config_hash = $2 AND r.mode = 'ranked'
               AND r.valid AND r.submitted_at IS NOT NULL AND r.score IS NOT NULL
               AND ($3::timestamptz IS NULL OR r.submitted_at >= $3)
               AND ($4::timestamptz IS NULL OR r.submitted_at < $4)
             ORDER BY r.user_id, r.score DESC, r.submitted_at ASC
           ), ranked AS (
             SELECT user_id, score,
                    rank() OVER (ORDER BY score DESC, submitted_at ASC) as rnk,
                    count(*) OVER () as total
             FROM best
           )
           SELECT rnk as "rank!", score as "score!", total as "of!"
           FROM ranked WHERE user_id = $5"#,
        game_id,
        config_hash,
        from,
        to,
        user_id
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| MyRank {
        rank: r.rank,
        score: r.score,
        of: r.of,
    }))
}

/// Perzentilrang eines Scores in der Ranked-Verteilung eines `config_hash` (§7.3).
/// Anteil der Nutzer (bester Run je Nutzer) mit echt kleinerem Score.
pub async fn percentile(
    pool: &PgPool,
    game_id: &str,
    config_hash: &str,
    score: i32,
) -> AppResult<Option<f64>> {
    let row = sqlx::query!(
        r#"WITH best AS (
             SELECT max(score) as score FROM run
             WHERE game_id = $1 AND config_hash = $2 AND mode = 'ranked'
               AND valid AND submitted_at IS NOT NULL AND score IS NOT NULL
             GROUP BY user_id
           )
           SELECT count(*) FILTER (WHERE score < $3) as "below!", count(*) as "total!" FROM best"#,
        game_id,
        config_hash,
        score
    )
    .fetch_one(pool)
    .await?;
    if row.total == 0 {
        return Ok(None);
    }
    Ok(Some(row.below as f64 / row.total as f64))
}
