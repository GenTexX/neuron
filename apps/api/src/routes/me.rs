use axum::{
    extract::{Query, State},
    routing::{get, patch},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::AuthUser,
    db::{games as games_db, leaderboard, runs as runs_db, stats, users},
    domain::table::TABLE,
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/me", get(get_me).patch(patch_me))
        .route("/me/history", get(history))
        .route("/me/stats", get(me_stats))
        .route("/me/settings", patch(patch_me))
}

async fn get_me(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<users::User>> {
    Ok(Json(users::find_user(&state.pool, user.id).await?))
}

#[derive(Deserialize)]
pub struct PatchMeBody {
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
}

async fn patch_me(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PatchMeBody>,
) -> AppResult<Json<users::User>> {
    if let Some(name) = &body.display_name {
        let n = name.trim().chars().count();
        if !(2..=32).contains(&n) {
            return Err(AppError::validation(
                "display_name",
                "Zwischen 2 und 32 Zeichen.",
            ));
        }
    }
    if let Some(tz) = &body.timezone {
        if tz.parse::<chrono_tz::Tz>().is_err() {
            return Err(AppError::validation("timezone", "Unbekannte Zeitzone."));
        }
    }
    let updated = users::update_user(
        &state.pool,
        user.id,
        body.display_name.as_deref().map(str::trim),
        body.timezone.as_deref(),
    )
    .await?;
    Ok(Json(updated))
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    #[serde(default)]
    pub game_id: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub before: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct HistoryRow {
    pub run_id: uuid::Uuid,
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

#[derive(Serialize)]
pub struct HistoryResponse {
    pub entries: Vec<HistoryRow>,
    /// Cursor für die nächste Seite (`before`), null am Ende.
    pub next_before: Option<DateTime<Utc>>,
}

async fn history(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<HistoryQuery>,
) -> AppResult<Json<HistoryResponse>> {
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let entries =
        runs_db::history(&state.pool, user.id, q.game_id.as_deref(), q.before, limit).await?;
    let next_before = if entries.len() as i64 == limit {
        entries.last().map(|e| e.submitted_at)
    } else {
        None
    };
    Ok(Json(HistoryResponse {
        entries: entries
            .into_iter()
            .map(|e| HistoryRow {
                run_id: e.run_id,
                game_id: e.game_id,
                mode: e.mode,
                level: e.level,
                config_hash: e.config_hash,
                score: e.score,
                correct_count: e.correct_count,
                trial_count: e.trial_count,
                valid: e.valid,
                invalid_reason: e.invalid_reason,
                submitted_at: e.submitted_at,
            })
            .collect(),
        next_before,
    }))
}

#[derive(Serialize)]
pub struct ScorePoint {
    pub submitted_at: DateTime<Utc>,
    pub score: i32,
    pub mode: String,
}

#[derive(Serialize)]
pub struct GameStats {
    pub game_id: String,
    pub category: String,
    pub level: i32,
    pub max_level: i32,
    pub runs_played: i32,
    pub personal_best: Option<i32>,
    pub percentile: Option<f64>,
    pub recent_scores: Vec<ScorePoint>,
}

#[derive(Serialize)]
pub struct RecentRun {
    pub game_id: String,
    pub mode: String,
    pub score: Option<i32>,
    pub submitted_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct StatsResponse {
    pub streak: i64,
    pub total_runs: i64,
    pub games: Vec<GameStats>,
    pub category_percentiles: Vec<(String, f64)>,
    pub recent: Vec<RecentRun>,
}

async fn me_stats(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<StatsResponse>> {
    let profile = users::find_user(&state.pool, user.id).await?;
    let streak = runs_db::current_streak(&state.pool, user.id, &profile.timezone).await?;
    let total = stats::total_runs(&state.pool, user.id).await?;
    let states = games_db::all_game_states(&state.pool, user.id).await?;
    let bests = stats::personal_bests(&state.pool, user.id).await?;
    let now = Utc::now();

    let mut games = Vec::new();
    let mut by_category: std::collections::BTreeMap<String, Vec<f64>> = Default::default();

    for id in TABLE.ids() {
        let def = TABLE.get(id).expect("id aus der Tabelle");
        let gs = states
            .iter()
            .find(|(g, _)| g == id)
            .map(|(_, s)| *s)
            .unwrap_or_default();
        let history = stats::score_history(&state.pool, user.id, id, 30).await?;

        // Perzentil in der Ranked-Verteilung der laufenden Runde (§7.3)
        let round = leaderboard::current_round(&state.pool, id, now).await?;
        let (best_ranked, percentile) = match &round {
            Some(r) => {
                let best = stats::best_for(&state.pool, user.id, id, &r.config_hash).await?;
                let p = match best {
                    Some(b) => leaderboard::percentile(&state.pool, id, &r.config_hash, b).await?,
                    None => None,
                };
                (best, p)
            }
            None => (None, None),
        };
        if let Some(p) = percentile {
            by_category.entry(def.category.clone()).or_default().push(p);
        }

        let training_hash = &def.level_entry(gs.level).config_hash;
        let personal_best = bests
            .iter()
            .find(|b| b.game_id == id && b.config_hash == *training_hash)
            .map(|b| b.score)
            .or(best_ranked);

        games.push(GameStats {
            game_id: def.id.clone(),
            category: def.category.clone(),
            level: gs.level,
            max_level: def.max_level,
            runs_played: gs.runs_played,
            personal_best,
            percentile,
            recent_scores: history
                .into_iter()
                .map(|p| ScorePoint {
                    submitted_at: p.submitted_at,
                    score: p.score,
                    mode: p.mode,
                })
                .collect(),
        });
    }

    let recent = stats::recent_runs(&state.pool, user.id, 10)
        .await?
        .into_iter()
        .map(|r| RecentRun {
            game_id: r.game_id,
            mode: r.mode,
            score: r.score,
            submitted_at: r.submitted_at,
        })
        .collect();

    Ok(Json(StatsResponse {
        streak,
        total_runs: total,
        games,
        category_percentiles: by_category
            .into_iter()
            .map(|(cat, ps)| {
                let mean = ps.iter().sum::<f64>() / ps.len() as f64;
                (cat, mean)
            })
            .collect(),
        recent,
    }))
}
