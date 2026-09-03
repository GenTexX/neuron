//! Auth-Flow inkl. Refresh-Rotation und Diebstahlerkennung (§8, §15).

mod common;

use axum::http::StatusCode;
use common::{app, register, request};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn register_login_and_me(pool: PgPool) {
    let app = app(pool).await;
    let (token, id, _) = register(&app, "anna@example.org", "Anna").await;

    let me = request(&app, "GET", "/api/me", Some(&token), None, None).await;
    assert_eq!(me.status, StatusCode::OK);
    assert_eq!(me.body["id"].as_str().unwrap(), id.to_string());
    assert_eq!(me.body["display_name"], "Anna");
    assert_eq!(me.body["timezone"], "Europe/Vienna");
    // Der Hash darf nie nach außen gelangen.
    assert!(me.body.get("password_hash").is_none());

    let login = request(
        &app,
        "POST",
        "/api/auth/login",
        None,
        None,
        Some(json!({ "email": "anna@example.org", "password": "einsicheres-passwort" })),
    )
    .await;
    assert_eq!(login.status, StatusCode::OK);
    assert!(login.refresh_cookie().is_some());

    let wrong = request(
        &app,
        "POST",
        "/api/auth/login",
        None,
        None,
        Some(json!({ "email": "anna@example.org", "password": "falsches-passwort" })),
    )
    .await;
    assert_eq!(wrong.status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong.body["error"]["code"], "unauthorized");

    let unknown = request(
        &app,
        "POST",
        "/api/auth/login",
        None,
        None,
        Some(json!({ "email": "niemand@example.org", "password": "einsicheres-passwort" })),
    )
    .await;
    assert_eq!(unknown.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn registration_rejects_duplicates_and_invalid_input(pool: PgPool) {
    let app = app(pool).await;
    register(&app, "anna@example.org", "Anna").await;

    let dup_mail = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        None,
        Some(json!({ "email": "anna@example.org", "password": "einsicheres-passwort", "display_name": "Andere" })),
    )
    .await;
    assert_eq!(dup_mail.status, StatusCode::CONFLICT);
    assert_eq!(dup_mail.body["error"]["code"], "email_taken");

    let dup_name = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        None,
        Some(json!({ "email": "b@example.org", "password": "einsicheres-passwort", "display_name": "anna" })),
    )
    .await;
    assert_eq!(dup_name.status, StatusCode::CONFLICT);
    assert_eq!(dup_name.body["error"]["code"], "display_name_taken");

    let short_pw = request(
        &app,
        "POST",
        "/api/auth/register",
        None,
        None,
        Some(json!({ "email": "c@example.org", "password": "kurz", "display_name": "Carl" })),
    )
    .await;
    assert_eq!(short_pw.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(short_pw.body["error"]["code"], "validation_failed");
}

#[sqlx::test(migrations = "./migrations")]
async fn refresh_rotates_and_detects_reuse(pool: PgPool) {
    let app = app(pool).await;
    let (_, _, cookie) = register(&app, "anna@example.org", "Anna").await;

    let first = request(&app, "POST", "/api/auth/refresh", None, Some(&cookie), None).await;
    assert_eq!(first.status, StatusCode::OK);
    let rotated = first.refresh_cookie().expect("rotiertes Cookie");
    assert_ne!(rotated, cookie, "Refresh-Token muss rotieren");

    // Das neue Token funktioniert.
    let second = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(&rotated),
        None,
    )
    .await;
    assert_eq!(second.status, StatusCode::OK);
    let rotated2 = second.refresh_cookie().unwrap();

    // Wiederverwendung des ersten (verbrauchten) Tokens = Diebstahlsignal:
    // alle Sessions werden invalidiert.
    let reuse = request(&app, "POST", "/api/auth/refresh", None, Some(&cookie), None).await;
    assert_eq!(reuse.status, StatusCode::UNAUTHORIZED);

    let after = request(
        &app,
        "POST",
        "/api/auth/refresh",
        None,
        Some(&rotated2),
        None,
    )
    .await;
    assert_eq!(
        after.status,
        StatusCode::UNAUTHORIZED,
        "alle Sessions invalidiert"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn logout_invalidates_refresh_token(pool: PgPool) {
    let app = app(pool).await;
    let (_, _, cookie) = register(&app, "anna@example.org", "Anna").await;

    let out = request(&app, "POST", "/api/auth/logout", None, Some(&cookie), None).await;
    assert_eq!(out.status, StatusCode::NO_CONTENT);

    let after = request(&app, "POST", "/api/auth/refresh", None, Some(&cookie), None).await;
    assert_eq!(after.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn protected_routes_require_auth(pool: PgPool) {
    let app = app(pool).await;
    for uri in ["/api/me", "/api/me/stats", "/api/me/history"] {
        let res = request(&app, "GET", uri, None, None, None).await;
        assert_eq!(res.status, StatusCode::UNAUTHORIZED, "{uri}");
    }
    let bad = request(
        &app,
        "GET",
        "/api/me",
        Some("kein.echtes.token"),
        None,
        None,
    )
    .await;
    assert_eq!(bad.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrations = "./migrations")]
async fn patch_me_updates_profile(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    let ok = request(
        &app,
        "PATCH",
        "/api/me",
        Some(&token),
        None,
        Some(json!({ "display_name": "Annabelle", "timezone": "Europe/Berlin" })),
    )
    .await;
    assert_eq!(ok.status, StatusCode::OK);
    assert_eq!(ok.body["display_name"], "Annabelle");
    assert_eq!(ok.body["timezone"], "Europe/Berlin");

    let bad_tz = request(
        &app,
        "PATCH",
        "/api/me",
        Some(&token),
        None,
        Some(json!({ "timezone": "Mars/Olympus" })),
    )
    .await;
    assert_eq!(bad_tz.status, StatusCode::UNPROCESSABLE_ENTITY);

    let bad_name = request(
        &app,
        "PATCH",
        "/api/me",
        Some(&token),
        None,
        Some(json!({ "display_name": "A" })),
    )
    .await;
    assert_eq!(bad_name.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test(migrations = "./migrations")]
async fn login_attempts_are_rate_limited_per_ip(pool: PgPool) {
    let app = app(pool).await;
    register(&app, "anna@example.org", "Anna").await; // verbraucht einen Versuch

    let attempt = |email: &'static str| json!({ "email": email, "password": "falsches-passwort" });

    // §8: 10 Anfragen pro IP und 15 Minuten – die Registrierung zählt mit.
    let mut statuses = Vec::new();
    for _ in 0..12 {
        let res = request(
            &app,
            "POST",
            "/api/auth/login",
            None,
            None,
            Some(attempt("anna@example.org")),
        )
        .await;
        statuses.push(res.status);
    }

    assert!(
        statuses.contains(&StatusCode::TOO_MANY_REQUESTS),
        "die Bremse greift nicht: {statuses:?}"
    );
    let allowed = statuses
        .iter()
        .filter(|s| **s == StatusCode::UNAUTHORIZED)
        .count();
    assert_eq!(allowed, 9, "nach der Registrierung bleiben neun Versuche");

    // Der Fehler kommt im einheitlichen Format (§11).
    let blocked = request(
        &app,
        "POST",
        "/api/auth/login",
        None,
        None,
        Some(attempt("anna@example.org")),
    )
    .await;
    assert_eq!(blocked.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(blocked.body["error"]["code"], "rate_limited");
}

#[sqlx::test(migrations = "./migrations")]
async fn the_limit_is_per_ip_not_global(pool: PgPool) {
    let app = app(pool).await;

    // Eine IP schöpft ihr Kontingent aus …
    for _ in 0..12 {
        common::request_from(
            &app,
            "POST",
            "/api/auth/login",
            None,
            None,
            Some(json!({ "email": "a@example.org", "password": "falsches-passwort" })),
            "198.51.100.1:1000",
        )
        .await;
    }

    // … eine andere darf weiterhin.
    let other = common::request_from(
        &app,
        "POST",
        "/api/auth/login",
        None,
        None,
        Some(json!({ "email": "a@example.org", "password": "falsches-passwort" })),
        "198.51.100.2:1000",
    )
    .await;
    assert_eq!(
        other.status,
        StatusCode::UNAUTHORIZED,
        "fremde IP wird mitbestraft"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn rate_limiting_does_not_touch_other_endpoints(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    // /me ist nicht gedrosselt – nur die beiden Auth-Endpunkte sind es (§8).
    for _ in 0..20 {
        let res = request(&app, "GET", "/api/me", Some(&token), None, None).await;
        assert_eq!(res.status, StatusCode::OK);
    }
}
