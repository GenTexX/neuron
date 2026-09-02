//! Ranked-Runden-Rotation (§10.3): legt stündlich für jedes aktivierte Spiel die
//! Runde des laufenden und des folgenden Tages an, falls noch nicht vorhanden.

use chrono::{NaiveDate, Utc};
use sqlx::PgPool;

use crate::{
    db::{games as games_db, leaderboard},
    domain::{
        ranked::{iso_week_of, round_seed, round_window},
        table::TABLE,
    },
};

pub async fn ensure_rounds_for_day(pool: &PgPool, day: NaiveDate) -> anyhow::Result<usize> {
    let games = games_db::list_games(pool).await?;
    let (starts_at, ends_at) = round_window(day);
    let iso_week = iso_week_of(day);
    let mut created = 0;

    for row in games.iter().filter(|g| g.enabled) {
        let Some(def) = TABLE.get(&row.id) else {
            continue;
        };
        let entry = def.ranked_entry(iso_week);
        leaderboard::upsert_round(
            pool,
            &row.id,
            &entry.config,
            &entry.config_hash,
            round_seed(&row.id, day) as i64,
            entry.trial_count,
            starts_at,
            ends_at,
        )
        .await?;
        created += 1;
    }
    Ok(created)
}

pub async fn rotate_once(pool: &PgPool) -> anyhow::Result<()> {
    let today = Utc::now().date_naive();
    let tomorrow = today + chrono::Duration::days(1);
    ensure_rounds_for_day(pool, today).await?;
    ensure_rounds_for_day(pool, tomorrow).await?;
    Ok(())
}

/// Hintergrundschleife, stündlich.
pub fn spawn(pool: PgPool) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            ticker.tick().await;
            if let Err(err) = rotate_once(&pool).await {
                tracing::error!(error = ?err, "ranked round rotation failed");
            } else {
                tracing::debug!("ranked rounds rotated");
            }
        }
    });
}
