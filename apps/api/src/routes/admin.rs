use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::post,
    Json, Router,
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    auth::extractor::AdminUser,
    db::{games as games_db, runs as runs_db},
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/admin/games/{id}/enable", post(enable))
        .route("/admin/games/{id}/disable", post(disable))
        .route("/admin/runs/{id}/invalidate", post(invalidate))
}

async fn enable(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    set(&state, &id, true).await
}

async fn disable(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    set(&state, &id, false).await
}

async fn set(state: &AppState, id: &str, enabled: bool) -> AppResult<StatusCode> {
    if games_db::set_enabled(&state.pool, id, enabled).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}

#[derive(Deserialize)]
pub struct InvalidateBody {
    pub reason: String,
}

async fn invalidate(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
    Json(body): Json<InvalidateBody>,
) -> AppResult<StatusCode> {
    if body.reason.trim().is_empty() {
        return Err(AppError::validation("reason", "Begründung erforderlich."));
    }
    if runs_db::invalidate_run(&state.pool, id, body.reason.trim()).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound)
    }
}
