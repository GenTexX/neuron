use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    auth::extractor::MaybeAuthUser,
    db::{
        games as games_db,
        leaderboard::{self, Period},
        runs as runs_db, stats,
    },
    domain::table::TABLE,
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/games", get(list_games))
        .route("/games/{id}/leaderboard", get(game_leaderboard))
}

#[derive(Serialize)]
pub struct PersonalBestInfo {
    pub score: i32,
    pub config_hash: String,
}

#[derive(Serialize)]
pub struct RankedRoundInfo {
    pub id: uuid::Uuid,
    pub config: Value,
    pub config_hash: String,
    pub trial_count: i32,
    pub ends_at: DateTime<Utc>,
    pub played: bool,
}

#[derive(Serialize)]
pub struct GameInfo {
    pub id: String,
    pub category: String,
    pub input_kind: String,
    pub timing_sensitive: bool,
    pub response_model: String,
    pub enabled: bool,
    pub max_level: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runs_played: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub personal_best: Option<PersonalBestInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ranked_round: Option<RankedRoundInfo>,
}

async fn list_games(
    State(state): State<AppState>,
    MaybeAuthUser(user): MaybeAuthUser,
) -> AppResult<Json<Vec<GameInfo>>> {
    let rows = games_db::list_games(&state.pool).await?;
    let now = Utc::now();

    let (states, bests) = match &user {
        Some(u) => (
            games_db::all_game_states(&state.pool, u.id).await?,
            stats::personal_bests(&state.pool, u.id).await?,
        ),
        None => (Vec::new(), Vec::new()),
    };

    let mut out = Vec::new();
    for id in TABLE.ids() {
        let Some(def) = TABLE.get(id) else { continue };
        let Some(row) = rows.iter().find(|r| r.id == id) else {
            continue;
        };
        let gs = states.iter().find(|(g, _)| g == id).map(|(_, s)| *s);

        let round = leaderboard::current_round(&state.pool, id, now).await?;
        let ranked_round = match (&round, &user) {
            (Some(r), Some(u)) => Some(RankedRoundInfo {
                id: r.id,
                config: r.config.clone(),
                config_hash: r.config_hash.clone(),
                trial_count: r.trial_count,
                ends_at: r.ends_at,
                played: runs_db::has_submitted_ranked_run(&state.pool, u.id, r.id).await?,
            }),
            (Some(r), None) => Some(RankedRoundInfo {
                id: r.id,
                config: r.config.clone(),
                config_hash: r.config_hash.clone(),
                trial_count: r.trial_count,
                ends_at: r.ends_at,
                played: false,
            }),
            _ => None,
        };

        // Personal Best zur aktuellen Trainings-Config des Nutzers
        let personal_best = gs.and_then(|s| {
            let hash = &def.level_entry(s.level).config_hash;
            bests
                .iter()
                .find(|b| b.game_id == id && b.config_hash == *hash)
                .map(|b| PersonalBestInfo {
                    score: b.score,
                    config_hash: b.config_hash.clone(),
                })
        });

        out.push(GameInfo {
            id: def.id.clone(),
            category: def.category.clone(),
            input_kind: def.input_kind.clone(),
            timing_sensitive: def.timing_sensitive,
            response_model: def.response_model.clone(),
            enabled: row.enabled,
            max_level: def.max_level,
            level: gs.map(|s| s.level).or(user.as_ref().map(|_| 1)),
            runs_played: gs.map(|s| s.runs_played).or(user.as_ref().map(|_| 0)),
            personal_best,
            ranked_round,
        });
    }
    Ok(Json(out))
}

#[derive(Deserialize)]
pub struct LeaderboardQuery {
    #[serde(default)]
    pub period: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    /// Optional: expliziter config_hash (Standard: der der laufenden Runde).
    #[serde(default)]
    pub config_hash: Option<String>,
}

#[derive(Serialize)]
pub struct LeaderboardRow {
    pub rank: i64,
    pub display_name: String,
    pub score: i32,
    pub achieved_at: DateTime<Utc>,
    pub is_me: bool,
}

#[derive(Serialize)]
pub struct MeRow {
    pub rank: i64,
    pub score: i32,
    pub of: i64,
}

#[derive(Serialize)]
pub struct LeaderboardResponse {
    pub game_id: String,
    pub config_hash: String,
    pub period: String,
    pub entries: Vec<LeaderboardRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub me: Option<MeRow>,
}

async fn game_leaderboard(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<LeaderboardQuery>,
    MaybeAuthUser(user): MaybeAuthUser,
) -> AppResult<Json<LeaderboardResponse>> {
    TABLE.get(&id).ok_or(AppError::NotFound)?;
    let period = Period::parse(q.period.as_deref().unwrap_or("daily"))
        .ok_or_else(|| AppError::validation("period", "daily, weekly oder alltime"))?;
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let now = Utc::now();
    let round = leaderboard::current_round(&state.pool, &id, now).await?;

    let config_hash = match (q.config_hash, &round) {
        (Some(h), _) => h,
        (None, Some(r)) => r.config_hash.clone(),
        (None, None) => return Err(AppError::NotFound),
    };

    let (from, to) = leaderboard::window(period, round.as_ref(), now);
    let entries = leaderboard::leaderboard(&state.pool, &id, &config_hash, from, to, limit).await?;
    let me = match &user {
        Some(u) => leaderboard::my_rank(&state.pool, &id, &config_hash, u.id, from, to)
            .await?
            .map(|m| MeRow {
                rank: m.rank,
                score: m.score,
                of: m.of,
            }),
        None => None,
    };

    Ok(Json(LeaderboardResponse {
        game_id: id,
        config_hash,
        period: period.as_str().to_string(),
        entries: entries
            .into_iter()
            .map(|e| LeaderboardRow {
                rank: e.rank,
                display_name: e.display_name,
                score: e.score,
                achieved_at: e.achieved_at,
                is_me: user.as_ref().is_some_and(|u| u.id == e.user_id),
            })
            .collect(),
        me,
    }))
}
