use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::{extractor::AuthUser, refresh},
    db::{games as games_db, leaderboard, runs as runs_db, users},
    domain::{
        scoring, staircase,
        table::TABLE,
        validate::{self, SubmitCheck},
        TrialRow,
    },
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/runs", post(create_run))
        .route("/runs/{id}/submit", post(submit_run))
}

#[derive(Deserialize)]
pub struct CreateRunBody {
    pub game_id: String,
    pub mode: String,
}

#[derive(Serialize)]
pub struct CreateRunResponse {
    pub run_id: Uuid,
    pub game_id: String,
    pub mode: String,
    pub seed: u32,
    pub config: Value,
    pub config_hash: String,
    pub trial_count: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<i32>,
    pub nonce: String,
    pub server_started_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round_ends_at: Option<DateTime<Utc>>,
}

async fn create_run(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateRunBody>,
) -> AppResult<(StatusCode, Json<CreateRunResponse>)> {
    let def = TABLE.get(&body.game_id).ok_or(AppError::NotFound)?;
    let row = games_db::find_game(&state.pool, &body.game_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if !row.enabled {
        return Err(AppError::Conflict("game_disabled"));
    }

    let nonce = refresh::generate_nonce();
    let (run, level, round_ends_at) = match body.mode.as_str() {
        "training" => {
            let gs = games_db::game_state(&state.pool, user.id, &body.game_id).await?;
            let level = staircase::clamp_level(gs.level, def.max_level);
            let entry = def.level_entry(level);
            // Der Seed ist im Training zufällig: jede Sitzung soll neue Aufgaben liefern.
            let seed = u32::from_le_bytes([nonce[0], nonce[1], nonce[2], nonce[3]]);
            let run = runs_db::create_run(
                &state.pool,
                user.id,
                &body.game_id,
                "training",
                None,
                Some(level),
                &entry.config,
                &entry.config_hash,
                seed as i64,
                entry.trial_count,
                &nonce,
            )
            .await?;
            (run, Some(level), None)
        }
        "ranked" => {
            let now = Utc::now();
            let round = leaderboard::current_round(&state.pool, &body.game_id, now)
                .await?
                .ok_or(AppError::Conflict("no_ranked_round"))?;
            if runs_db::has_submitted_ranked_run(&state.pool, user.id, round.id).await? {
                return Err(AppError::Conflict("ranked_already_played"));
            }
            // Ein offener, unsubmitteter Run derselben Runde blockiert den Slot nicht (§10.2).
            runs_db::delete_unsubmitted_ranked_run(&state.pool, user.id, round.id).await?;
            let run = runs_db::create_run(
                &state.pool,
                user.id,
                &body.game_id,
                "ranked",
                Some(round.id),
                None,
                &round.config,
                &round.config_hash,
                round.seed,
                round.trial_count,
                &nonce,
            )
            .await?;
            (run, None, Some(round.ends_at))
        }
        _ => return Err(AppError::validation("mode", "training oder ranked")),
    };

    Ok((
        StatusCode::CREATED,
        Json(CreateRunResponse {
            run_id: run.id,
            game_id: run.game_id,
            mode: run.mode,
            seed: run.seed as u32,
            config: run.config,
            config_hash: run.config_hash,
            trial_count: run.trial_count,
            level,
            nonce: refresh::encode_b64(&run.nonce),
            server_started_at: run.server_started_at,
            round_ends_at,
        }),
    ))
}

#[derive(Deserialize)]
pub struct SubmitBody {
    pub nonce: String,
    pub client_duration_ms: i64,
    #[serde(default)]
    pub client_aborted: bool,
    pub trials: Vec<TrialRow>,
}

#[derive(Serialize)]
pub struct LevelChange {
    pub before: i32,
    pub after: i32,
    pub changed: bool,
}

#[derive(Serialize)]
pub struct RankInfo {
    pub daily: i64,
    pub of: i64,
}

#[derive(Serialize)]
pub struct StreakInfo {
    pub current: i64,
    pub extended_today: bool,
}

#[derive(Serialize)]
pub struct SubmitResponse {
    pub score: i32,
    pub correct_count: i32,
    pub accuracy: f64,
    pub valid: bool,
    pub invalid_reason: Option<String>,
    pub personal_best: bool,
    pub previous_best: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<LevelChange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rank: Option<RankInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percentile: Option<f64>,
    pub streak: StreakInfo,
}

async fn submit_run(
    State(state): State<AppState>,
    Path(run_id): Path<Uuid>,
    user: AuthUser,
    Json(body): Json<SubmitBody>,
) -> AppResult<Json<SubmitResponse>> {
    let submitted_at = Utc::now();
    let submitted_nonce = refresh::decode_b64(&body.nonce).unwrap_or_default();

    let mut tx = state.pool.begin().await.map_err(AppError::from)?;
    // 1. Run laden und sperren
    let run = runs_db::lock_run(&mut tx, run_id)
        .await?
        .ok_or(AppError::NotFound)?;
    if run.user_id != user.id {
        return Err(AppError::NotFound);
    }
    if run.submitted_at.is_some() {
        return Err(AppError::Conflict("already_submitted"));
    }

    let def = TABLE.get(&run.game_id).ok_or(AppError::NotFound)?;
    let round_ends_at = match run.ranked_round_id {
        Some(id) => leaderboard::round_by_id(&state.pool, id)
            .await?
            .map(|r| r.ends_at),
        None => None,
    };

    // 4. Score serverseitig aus den Rohdaten berechnen (§9.3)
    let mut rows: Vec<TrialRow> = body.trials;
    rows.sort_by_key(|r| r.idx);
    let score = scoring::score(&run.game_id, &run.config, &rows)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let theoretical_max = scoring::theoretical_max(&run.game_id, &run.config)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let correct_count = scoring::correct_count(&rows);

    // 2. Validierung (§9.2)
    let invalid_reason = validate::validate(&SubmitCheck {
        run_user_id: run.user_id,
        auth_user_id: user.id,
        already_submitted: false,
        stored_nonce: &run.nonce,
        submitted_nonce: &submitted_nonce,
        server_started_at: run.server_started_at,
        submitted_at,
        trial_count: run.trial_count,
        rows: &rows,
        client_duration_ms: body.client_duration_ms,
        round_ends_at,
        score,
        theoretical_max,
        client_aborted: body.client_aborted,
    });
    let valid = invalid_reason.is_none();
    let stored_score = if valid { score } else { 0 };

    // 3. Trial-Zeilen schreiben (auch bei ungültigem Run – der Verlauf bleibt ehrlich)
    runs_db::insert_trial_results(&mut tx, run.id, &rows).await?;
    runs_db::finish_run(
        &mut tx,
        run.id,
        submitted_at,
        body.client_duration_ms.clamp(0, i32::MAX as i64) as i32,
        correct_count,
        stored_score,
        valid,
        invalid_reason,
    )
    .await?;

    let accuracy = if run.trial_count > 0 {
        correct_count as f64 / run.trial_count as f64
    } else {
        0.0
    };

    // 5. Nur bei gültigem Run: Personal Best, Staircase, Streak
    let mut personal_best = false;
    let mut previous_best = None;
    let mut level_change = None;
    let mut extended_today = false;
    if valid {
        let pb = runs_db::upsert_personal_best(
            &mut tx,
            user.id,
            &run.game_id,
            &run.config_hash,
            score,
            run.id,
            submitted_at,
        )
        .await?;
        personal_best = pb.is_new_best;
        previous_best = pb.previous;

        if run.mode == "training" {
            let before = run.level.unwrap_or(1);
            let gs = games_db::game_state(&state.pool, user.id, &run.game_id).await?;
            let next = staircase::apply(
                staircase::StaircaseState {
                    level: before,
                    consecutive_up: gs.consecutive_up,
                    runs_played: gs.runs_played,
                },
                accuracy,
                true,
                def.max_level,
            );
            runs_db::upsert_game_state(
                &mut tx,
                user.id,
                &run.game_id,
                next.level,
                next.consecutive_up,
            )
            .await?;
            level_change = Some(LevelChange {
                before,
                after: next.level,
                changed: next.level != before,
            });
        }
        runs_db::record_daily_activity(&mut tx, user.id, submitted_at).await?;
        extended_today = true;
    } else if run.mode == "training" {
        // Ungültige Runs verändern das Level nicht, zählen aber als gespielt (§7.4).
        let before = run.level.unwrap_or(1);
        let gs = games_db::game_state(&state.pool, user.id, &run.game_id).await?;
        runs_db::upsert_game_state(&mut tx, user.id, &run.game_id, gs.level, gs.consecutive_up)
            .await?;
        level_change = Some(LevelChange {
            before,
            after: gs.level,
            changed: false,
        });
    }

    tx.commit().await.map_err(AppError::from)?;

    // 6. Rang, Perzentil und Streak
    let (rank, percentile) = if valid && run.mode == "ranked" {
        let now = Utc::now();
        let round = leaderboard::current_round(&state.pool, &run.game_id, now).await?;
        let (from, to) = leaderboard::window(leaderboard::Period::Daily, round.as_ref(), now);
        let r = leaderboard::my_rank(
            &state.pool,
            &run.game_id,
            &run.config_hash,
            user.id,
            from,
            to,
        )
        .await?
        .map(|m| RankInfo {
            daily: m.rank,
            of: m.of,
        });
        let p = leaderboard::percentile(&state.pool, &run.game_id, &run.config_hash, score).await?;
        (r, p)
    } else {
        (None, None)
    };

    let profile = users::find_user(&state.pool, user.id).await?;
    let streak = runs_db::current_streak(&state.pool, user.id, &profile.timezone).await?;

    Ok(Json(SubmitResponse {
        score: stored_score,
        correct_count,
        accuracy,
        valid,
        invalid_reason: invalid_reason.map(str::to_string),
        personal_best,
        previous_best,
        level: level_change,
        rank,
        percentile,
        streak: StreakInfo {
            current: streak,
            extended_today,
        },
    }))
}
