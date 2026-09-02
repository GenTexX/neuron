//! Axum-Handler (§14.1): Deserialisierung, Auth-Extraktion, Statuscodes. Keine Geschäftslogik.

pub mod admin;
pub mod auth;
pub mod games;
pub mod me;
pub mod runs;

use axum::{routing::get, Router};

use crate::state::AppState;

pub fn api_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .merge(auth::router())
        .merge(games::router())
        .merge(runs::router())
        .merge(me::router())
        .merge(admin::router())
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}
