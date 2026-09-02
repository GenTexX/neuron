#![allow(dead_code)] // Hilfen werden je Testbinary unterschiedlich genutzt

//! Test-Hilfen: Router bauen, JSON-Requests absetzen, Nutzer anlegen.

use axum::{
    body::Body,
    http::{header, Request, StatusCode},
    Router,
};
use http_body_util::BodyExt;
use neuron_api::{api_only_router, app_state, config::Config, db::games::sync_games};
use serde_json::Value;
use sqlx::PgPool;
use tower::ServiceExt;

pub const JWT_SECRET: &str = "test-secret-mit-mindestens-32-zeichen!!";

pub fn test_config() -> Config {
    Config {
        database_url: String::new(),
        jwt_secret: JWT_SECRET.to_string(),
        bind_addr: "127.0.0.1:0".into(),
        static_dir: "./build".into(),
        rust_log: "error".into(),
        cookie_domain: "localhost".into(),
        cors_origins: "http://localhost:5173".into(),
        cookie_secure: false,
        run_migrations: false,
    }
}

pub async fn app(pool: PgPool) -> Router {
    sync_games(&pool).await.expect("games synced");
    api_only_router(app_state(pool, test_config()))
}

pub struct Response {
    pub status: StatusCode,
    pub body: Value,
    pub cookies: Vec<String>,
}

impl Response {
    pub fn refresh_cookie(&self) -> Option<String> {
        self.cookies
            .iter()
            .find(|c| c.starts_with("neuron_refresh="))
            .map(|c| c.split(';').next().unwrap_or("").to_string())
    }
}

pub async fn request(
    app: &Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    cookie: Option<&str>,
    body: Option<Value>,
) -> Response {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(t) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }
    if let Some(c) = cookie {
        builder = builder.header(header::COOKIE, c);
    }
    let req = match body {
        Some(v) => builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(serde_json::to_vec(&v).unwrap()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    };
    let res = app.clone().oneshot(req).await.expect("request");
    let status = res.status();
    let cookies = res
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok().map(str::to_string))
        .collect();
    let bytes = res.into_body().collect().await.expect("body").to_bytes();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes)
            .unwrap_or(Value::String(String::from_utf8_lossy(&bytes).into()))
    };
    Response {
        status,
        body,
        cookies,
    }
}

pub async fn register(app: &Router, email: &str, name: &str) -> (String, uuid::Uuid, String) {
    let res = request(
        app,
        "POST",
        "/api/auth/register",
        None,
        None,
        Some(serde_json::json!({
            "email": email,
            "password": "einsicheres-passwort",
            "display_name": name,
            "timezone": "Europe/Vienna"
        })),
    )
    .await;
    assert_eq!(res.status, StatusCode::CREATED, "register: {:?}", res.body);
    let token = res.body["access_token"].as_str().unwrap().to_string();
    let id = uuid::Uuid::parse_str(res.body["user"]["id"].as_str().unwrap()).unwrap();
    let cookie = res.refresh_cookie().expect("refresh cookie");
    (token, id, cookie)
}

/// Hebt einen Nutzer zur Rolle `admin` und gibt ein passendes Token zurück.
pub async fn make_admin(pool: &PgPool, user_id: uuid::Uuid) -> String {
    sqlx::query("UPDATE app_user SET role = 'admin' WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await
        .unwrap();
    neuron_api::auth::jwt::JwtKeys::new(JWT_SECRET)
        .issue(user_id, "admin")
        .unwrap()
}

/// Router plus angelegte Ranked-Runden für heute und morgen (§10.3).
/// Die Rotation setzt synchronisierte Spiele voraus, daher erst `app`, dann rotieren.
pub async fn app_with_rounds(pool: PgPool) -> Router {
    let router = app(pool.clone()).await;
    neuron_api::jobs::rotate_rounds::rotate_once(&pool)
        .await
        .expect("rounds rotated");
    router
}
