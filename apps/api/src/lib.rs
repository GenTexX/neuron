//! Neuron-API – Bibliotheksteil, damit Integrationstests denselben Router bauen.

pub mod auth;
pub mod config;
pub mod db;
pub mod domain;
pub mod error;
pub mod jobs;
pub mod routes;
pub mod state;

use std::{sync::Arc, time::Duration};

use axum::{
    http::{header, HeaderValue, Method, StatusCode},
    Router,
};
use sqlx::{postgres::PgPoolOptions, PgPool};
use tower_http::{
    compression::CompressionLayer,
    cors::{AllowOrigin, CorsLayer},
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

use crate::{auth::jwt::JwtKeys, config::Config, state::AppState};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

pub async fn connect(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(16)
        .acquire_timeout(Duration::from_secs(10))
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub fn app_state(pool: PgPool, config: Config) -> AppState {
    let jwt = Arc::new(JwtKeys::new(&config.jwt_secret));
    AppState {
        pool,
        config: Arc::new(config),
        jwt,
    }
}

fn cors_layer(state: &AppState) -> CorsLayer {
    let origins: Vec<HeaderValue> = state
        .config
        .cors_origin_list()
        .into_iter()
        .filter_map(|o| o.parse::<HeaderValue>().ok())
        .collect();
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE])
        .allow_credentials(true)
}

/// Router ohne Static-Auslieferung – für Tests.
pub fn api_only_router(state: AppState) -> Router {
    Router::new()
        .nest("/api", routes::api_router(state.clone()))
        .layer(cors_layer(&state))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Vollständiger Router: API plus SPA-Auslieferung mit Fallback auf index.html (§2).
pub fn build_router(state: AppState) -> Router {
    let static_dir = state.config.static_dir.clone();
    let index = format!("{static_dir}/index.html");
    let serve = ServeDir::new(&static_dir).fallback(ServeFile::new(&index));
    api_only_router(state)
        .fallback_service(serve)
        .layer(CompressionLayer::new())
        .method_not_allowed_fallback(|| async { StatusCode::METHOD_NOT_ALLOWED })
}
