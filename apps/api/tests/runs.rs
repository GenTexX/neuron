//! Run-Lebenszyklus: Anlegen, Submit, Validierung, Staircase, Streak, Ranked-Sperre (§15).

mod common;

use axum::http::StatusCode;
use chrono::{Duration, Utc};
use common::{app, register, request};
use neuron_api::{db::leaderboard, domain::table::TABLE, jobs::rotate_rounds};
use serde_json::{json, Value};
use sqlx::PgPool;

/// Baut plausible Trial-Zeilen für stroop: `correct_count` richtige Antworten,
/// Rest falsch, mit gestreuten Reaktionszeiten (verhindert `robotic_timing`).
fn stroop_rows(trial_count: i32, correct_count: i32) -> Value {
    let rows: Vec<Value> = (0..trial_count)
        .map(|i| {
            let correct = i < correct_count;
            json!({
                "idx": i,
                "response": { "choice": if correct { 1 } else { 2 } },
                "rt_ms": 400 + (i * 37) % 500,
                "presented_ms": 900,
                "correct": correct
            })
        })
        .collect();
    Value::Array(rows)
}

async fn start_run(
    app: &axum::Router,
    token: &str,
    game: &str,
    mode: &str,
) -> (String, i32, Value) {
    let res = request(
        app,
        "POST",
        "/api/runs",
        Some(token),
        None,
        Some(json!({ "game_id": game, "mode": mode })),
    )
    .await;
    assert_eq!(
        res.status,
        StatusCode::CREATED,
        "create run: {:?}",
        res.body
    );
    (
        res.body["run_id"].as_str().unwrap().to_string(),
        res.body["trial_count"].as_i64().unwrap() as i32,
        res.body.clone(),
    )
}

async fn submit(
    app: &axum::Router,
    token: &str,
    run_id: &str,
    nonce: &str,
    duration_ms: i64,
    trials: Value,
) -> common::Response {
    request(
        app,
        "POST",
        &format!("/api/runs/{run_id}/submit"),
        Some(token),
        None,
        Some(json!({
            "nonce": nonce,
            "client_duration_ms": duration_ms,
            "client_aborted": false,
            "trials": trials
        })),
    )
    .await
}

/// Der Submit muss mindestens 2 s nach `POST /runs` erfolgen (§9.2).
async fn wait_for_window() {
    tokio::time::sleep(std::time::Duration::from_millis(2100)).await;
}

#[sqlx::test(migrations = "./migrations")]
async fn create_run_returns_server_seed_and_config(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    let (_, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    assert_eq!(body["mode"], "training");
    assert_eq!(body["level"], 1);
    assert_eq!(trial_count, 30);
    assert!(body["seed"].is_number());
    assert!(!body["nonce"].as_str().unwrap().is_empty());
    // Config kommt vom Server und entspricht der Level-1-Config aus der Tabelle.
    let expected = &TABLE.get("stroop").unwrap().level_entry(1).config;
    assert_eq!(&body["config"], expected);
    assert_eq!(
        body["config_hash"],
        TABLE.get("stroop").unwrap().level_entry(1).config_hash
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn create_run_rejects_unknown_and_disabled_games(pool: PgPool) {
    let app = app(pool.clone()).await;
    let (token, id, _) = register(&app, "anna@example.org", "Anna").await;

    let unknown = request(
        &app,
        "POST",
        "/api/runs",
        Some(&token),
        None,
        Some(json!({ "game_id": "gibt-es-nicht", "mode": "training" })),
    )
    .await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);

    let bad_mode = request(
        &app,
        "POST",
        "/api/runs",
        Some(&token),
        None,
        Some(json!({ "game_id": "stroop", "mode": "turnier" })),
    )
    .await;
    assert_eq!(bad_mode.status, StatusCode::UNPROCESSABLE_ENTITY);

    let admin = common::make_admin(&pool, id).await;
    let disable = request(
        &app,
        "POST",
        "/api/admin/games/stroop/disable",
        Some(&admin),
        None,
        None,
    )
    .await;
    assert_eq!(disable.status, StatusCode::NO_CONTENT);

    let disabled = request(
        &app,
        "POST",
        "/api/runs",
        Some(&token),
        None,
        Some(json!({ "game_id": "stroop", "mode": "training" })),
    )
    .await;
    assert_eq!(disabled.status, StatusCode::CONFLICT);
    assert_eq!(disabled.body["error"]["code"], "game_disabled");
}

#[sqlx::test(migrations = "./migrations")]
async fn submit_scores_server_side_and_updates_streak(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;
    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();

    wait_for_window().await;
    let res = submit(
        &app,
        &token,
        &run_id,
        &nonce,
        2400,
        stroop_rows(trial_count, 27),
    )
    .await;
    assert_eq!(res.status, StatusCode::OK, "{:?}", res.body);
    assert_eq!(res.body["valid"], true, "{:?}", res.body["invalid_reason"]);
    assert_eq!(res.body["correct_count"], 27);
    assert_eq!(res.body["accuracy"], 0.9);
    // Der Score kommt aus der Server-Formel, nicht vom Client.
    assert!(res.body["score"].as_i64().unwrap() > 0);
    assert_eq!(res.body["personal_best"], true);
    assert!(res.body["previous_best"].is_null());
    assert_eq!(res.body["streak"]["current"], 1);
    assert_eq!(res.body["streak"]["extended_today"], true);
    assert_eq!(res.body["level"]["before"], 1);
    assert_eq!(
        res.body["level"]["changed"], false,
        "erst nach drei Erfolgen"
    );

    // Zweiter Submit desselben Runs ist ein Konflikt.
    let again = submit(
        &app,
        &token,
        &run_id,
        &nonce,
        2400,
        stroop_rows(trial_count, 27),
    )
    .await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    assert_eq!(again.body["error"]["code"], "already_submitted");
}

#[sqlx::test(migrations = "./migrations")]
async fn staircase_raises_level_after_three_successes(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    let mut last = json!(null);
    for round in 1..=3 {
        let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
        assert_eq!(
            body["level"], 1,
            "Level steigt erst nach dem dritten Erfolg"
        );
        let nonce = body["nonce"].as_str().unwrap().to_string();
        wait_for_window().await;
        let res = submit(
            &app,
            &token,
            &run_id,
            &nonce,
            2400,
            stroop_rows(trial_count, 27),
        )
        .await;
        assert_eq!(res.body["valid"], true, "Runde {round}: {:?}", res.body);
        last = res.body;
    }
    assert_eq!(last["level"]["before"], 1);
    assert_eq!(last["level"]["after"], 2);
    assert_eq!(last["level"]["changed"], true);

    // Der nächste Run läuft auf Level 2 mit der zugehörigen Config.
    let (_, _, body) = start_run(&app, &token, "stroop", "training").await;
    assert_eq!(body["level"], 2);
    assert_eq!(
        &body["config"],
        &TABLE.get("stroop").unwrap().level_entry(2).config
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn staircase_lowers_level_after_a_failure(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    // Erst auf Level 2 steigen …
    for _ in 0..3 {
        let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
        let nonce = body["nonce"].as_str().unwrap().to_string();
        wait_for_window().await;
        submit(
            &app,
            &token,
            &run_id,
            &nonce,
            2400,
            stroop_rows(trial_count, 27),
        )
        .await;
    }
    // … dann einen schlechten Run: accuracy 0.5 < 0.8
    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();
    wait_for_window().await;
    let res = submit(
        &app,
        &token,
        &run_id,
        &nonce,
        2400,
        stroop_rows(trial_count, 15),
    )
    .await;
    assert_eq!(res.body["valid"], true);
    assert_eq!(res.body["level"]["before"], 2);
    assert_eq!(res.body["level"]["after"], 1);
    assert_eq!(res.body["level"]["changed"], true);
}

#[sqlx::test(migrations = "./migrations")]
async fn invalid_runs_are_stored_but_do_not_count(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    // Falsche Nonce → nonce_mismatch, aber Status 200 (§14.3 Punkt 2)
    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    wait_for_window().await;
    let res = submit(
        &app,
        &token,
        &run_id,
        "ZmFsc2NoZQ",
        2400,
        stroop_rows(trial_count, 30),
    )
    .await;
    assert_eq!(res.status, StatusCode::OK);
    assert_eq!(res.body["valid"], false);
    assert_eq!(res.body["invalid_reason"], "nonce_mismatch");
    assert_eq!(res.body["score"], 0);
    assert_eq!(res.body["personal_best"], false);
    assert_eq!(
        res.body["streak"]["current"], 0,
        "ungültige Runs erzeugen keine Streak"
    );
    assert_eq!(res.body["level"]["changed"], false);
    let _ = body;

    // Der Run erscheint trotzdem im Verlauf.
    let history = request(&app, "GET", "/api/me/history", Some(&token), None, None).await;
    assert_eq!(history.body["entries"].as_array().unwrap().len(), 1);
    assert_eq!(history.body["entries"][0]["valid"], false);
    assert_eq!(
        history.body["entries"][0]["invalid_reason"],
        "nonce_mismatch"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn submit_detects_implausible_window_and_trial_mismatch(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    // Sofortiger Submit: Fenster < 2 s
    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();
    let fast = submit(
        &app,
        &token,
        &run_id,
        &nonce,
        100,
        stroop_rows(trial_count, 30),
    )
    .await;
    assert_eq!(fast.body["invalid_reason"], "implausible_window");

    // Falsche Anzahl Trials
    let (run_id, _, body) = start_run(&app, &token, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();
    wait_for_window().await;
    let short = submit(&app, &token, &run_id, &nonce, 2400, stroop_rows(5, 5)).await;
    assert_eq!(short.body["invalid_reason"], "trial_count_mismatch");

    // Roboterhafte Zeiten
    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();
    let robotic: Vec<Value> = (0..trial_count)
        .map(|i| {
            json!({ "idx": i, "response": {"choice": 1}, "rt_ms": 500,
                          "presented_ms": 900, "correct": true })
        })
        .collect();
    wait_for_window().await;
    let res = submit(&app, &token, &run_id, &nonce, 2400, Value::Array(robotic)).await;
    assert_eq!(res.body["invalid_reason"], "robotic_timing");
}

#[sqlx::test(migrations = "./migrations")]
async fn submit_rejects_foreign_runs(pool: PgPool) {
    let app = app(pool).await;
    let (anna, _, _) = register(&app, "anna@example.org", "Anna").await;
    let (bert, _, _) = register(&app, "bert@example.org", "Bert").await;

    let (run_id, trial_count, body) = start_run(&app, &anna, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();
    wait_for_window().await;
    let res = submit(
        &app,
        &bert,
        &run_id,
        &nonce,
        2400,
        stroop_rows(trial_count, 30),
    )
    .await;
    assert_eq!(
        res.status,
        StatusCode::NOT_FOUND,
        "fremde Runs sind unsichtbar"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn ranked_run_can_only_be_played_once(pool: PgPool) {
    let app = common::app_with_rounds(pool.clone()).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;

    let round = leaderboard::current_round(&pool, "stroop", Utc::now())
        .await
        .unwrap()
        .unwrap();
    assert!(round.ends_at > round.starts_at);

    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "ranked").await;
    assert_eq!(body["mode"], "ranked");
    assert_eq!(&body["config"], &round.config);
    assert_eq!(body["seed"].as_i64().unwrap(), round.seed);
    let nonce = body["nonce"].as_str().unwrap().to_string();

    // Ein zweiter offener Run derselben Runde ist erlaubt (der alte wird verworfen).
    let (run_id2, _, body2) = start_run(&app, &token, "stroop", "ranked").await;
    assert_ne!(run_id, run_id2);
    let nonce2 = body2["nonce"].as_str().unwrap().to_string();

    wait_for_window().await;
    let res = submit(
        &app,
        &token,
        &run_id2,
        &nonce2,
        2400,
        stroop_rows(trial_count, 28),
    )
    .await;
    assert_eq!(res.body["valid"], true, "{:?}", res.body);
    assert_eq!(res.body["rank"]["daily"], 1);
    assert_eq!(res.body["rank"]["of"], 1);
    assert!(res.body["percentile"].is_number());

    // Nach dem Submit ist die Runde für diesen Nutzer gesperrt.
    let blocked = request(
        &app,
        "POST",
        "/api/runs",
        Some(&token),
        None,
        Some(json!({ "game_id": "stroop", "mode": "ranked" })),
    )
    .await;
    assert_eq!(blocked.status, StatusCode::CONFLICT);
    assert_eq!(blocked.body["error"]["code"], "ranked_already_played");
    let _ = nonce;
}

#[sqlx::test(migrations = "./migrations")]
async fn leaderboard_ranks_multiple_users(pool: PgPool) {
    let app = common::app_with_rounds(pool.clone()).await;

    let players = [
        ("anna@example.org", "Anna", 30),
        ("bert@example.org", "Bert", 20),
        ("cleo@example.org", "Cleo", 25),
    ];
    let mut tokens = Vec::new();
    for (email, name, correct) in players {
        let (token, _, _) = register(&app, email, name).await;
        let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "ranked").await;
        let nonce = body["nonce"].as_str().unwrap().to_string();
        wait_for_window().await;
        let res = submit(
            &app,
            &token,
            &run_id,
            &nonce,
            2400,
            stroop_rows(trial_count, correct),
        )
        .await;
        assert_eq!(res.body["valid"], true, "{name}: {:?}", res.body);
        tokens.push((name, token));
    }

    let lb = request(
        &app,
        "GET",
        "/api/games/stroop/leaderboard?period=daily&limit=10",
        Some(&tokens[1].1),
        None,
        None,
    )
    .await;
    assert_eq!(lb.status, StatusCode::OK);
    let entries = lb.body["entries"].as_array().unwrap();
    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0]["display_name"], "Anna");
    assert_eq!(entries[1]["display_name"], "Cleo");
    assert_eq!(entries[2]["display_name"], "Bert");
    assert_eq!(entries[0]["rank"], 1);
    assert_eq!(entries[2]["is_me"], true, "Bert erkennt sich selbst");
    assert_eq!(lb.body["me"]["rank"], 3);
    assert_eq!(lb.body["me"]["of"], 3);

    // Weekly und alltime liefern dieselbe Rangfolge.
    for period in ["weekly", "alltime"] {
        let res = request(
            &app,
            "GET",
            &format!("/api/games/stroop/leaderboard?period={period}"),
            None,
            None,
            None,
        )
        .await;
        assert_eq!(res.status, StatusCode::OK, "{period}");
        assert_eq!(res.body["entries"].as_array().unwrap().len(), 3, "{period}");
        assert_eq!(res.body["entries"][0]["display_name"], "Anna", "{period}");
    }

    let bad = request(
        &app,
        "GET",
        "/api/games/stroop/leaderboard?period=monatlich",
        None,
        None,
        None,
    )
    .await;
    assert_eq!(bad.status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[sqlx::test(migrations = "./migrations")]
async fn games_list_reflects_user_state(pool: PgPool) {
    let app = common::app_with_rounds(pool).await;

    let anon = request(&app, "GET", "/api/games", None, None, None).await;
    assert_eq!(anon.status, StatusCode::OK);
    let games = anon.body.as_array().unwrap();
    assert_eq!(games.len(), TABLE.ids().count());
    assert!(games
        .iter()
        .all(|g| g["level"].is_null() || g["level"].is_number()));

    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;
    let auth = request(&app, "GET", "/api/games", Some(&token), None, None).await;
    let stroop = auth
        .body
        .as_array()
        .unwrap()
        .iter()
        .find(|g| g["id"] == "stroop")
        .unwrap();
    assert_eq!(stroop["level"], 1);
    assert_eq!(stroop["runs_played"], 0);
    assert_eq!(stroop["ranked_round"]["played"], false);
    assert_eq!(stroop["category"], "attention");
    assert_eq!(stroop["max_level"], 15);
}

#[sqlx::test(migrations = "./migrations")]
async fn rotation_is_idempotent_and_covers_two_days(pool: PgPool) {
    let _app = app(pool.clone()).await; // synchronisiert die Spieltabelle
    rotate_rounds::rotate_once(&pool).await.unwrap();
    rotate_rounds::rotate_once(&pool).await.unwrap();

    let today = Utc::now();
    let tomorrow = today + Duration::days(1);
    for at in [today, tomorrow] {
        let round = leaderboard::current_round(&pool, "stroop", at)
            .await
            .unwrap();
        assert!(round.is_some(), "Runde für {at} fehlt");
    }
    let count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM ranked_round WHERE game_id = 'stroop'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(count, 2, "keine Duplikate bei mehrfacher Rotation");
}

#[sqlx::test(migrations = "./migrations")]
async fn admin_can_invalidate_a_run(pool: PgPool) {
    let app = app(pool.clone()).await;
    let (token, user_id, _) = register(&app, "anna@example.org", "Anna").await;
    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();
    wait_for_window().await;
    let res = submit(
        &app,
        &token,
        &run_id,
        &nonce,
        2400,
        stroop_rows(trial_count, 27),
    )
    .await;
    assert_eq!(res.body["valid"], true);

    let (other, _, _) = register(&app, "bert@example.org", "Bert").await;
    let forbidden = request(
        &app,
        "POST",
        &format!("/api/admin/runs/{run_id}/invalidate"),
        Some(&other),
        None,
        Some(json!({ "reason": "Test" })),
    )
    .await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);

    let admin = common::make_admin(&pool, user_id).await;
    let ok = request(
        &app,
        "POST",
        &format!("/api/admin/runs/{run_id}/invalidate"),
        Some(&admin),
        None,
        Some(json!({ "reason": "manipuliert" })),
    )
    .await;
    assert_eq!(ok.status, StatusCode::NO_CONTENT);

    let history = request(&app, "GET", "/api/me/history", Some(&token), None, None).await;
    assert_eq!(history.body["entries"][0]["valid"], false);
    assert_eq!(history.body["entries"][0]["invalid_reason"], "manipuliert");
}

#[sqlx::test(migrations = "./migrations")]
async fn stats_endpoint_reports_progress(pool: PgPool) {
    let app = app(pool).await;
    let (token, _, _) = register(&app, "anna@example.org", "Anna").await;
    let (run_id, trial_count, body) = start_run(&app, &token, "stroop", "training").await;
    let nonce = body["nonce"].as_str().unwrap().to_string();
    wait_for_window().await;
    submit(
        &app,
        &token,
        &run_id,
        &nonce,
        2400,
        stroop_rows(trial_count, 27),
    )
    .await;

    let stats = request(&app, "GET", "/api/me/stats", Some(&token), None, None).await;
    assert_eq!(stats.status, StatusCode::OK);
    assert_eq!(stats.body["streak"], 1);
    assert_eq!(stats.body["total_runs"], 1);
    let stroop = stats.body["games"]
        .as_array()
        .unwrap()
        .iter()
        .find(|g| g["game_id"] == "stroop")
        .unwrap();
    assert_eq!(stroop["runs_played"], 1);
    assert_eq!(stroop["recent_scores"].as_array().unwrap().len(), 1);
    assert!(stroop["personal_best"].as_i64().unwrap() > 0);
    assert_eq!(stats.body["recent"].as_array().unwrap().len(), 1);
}
