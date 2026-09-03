use axum::{extract::State, http::StatusCode, routing::post, Json, Router};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    auth::{
        jwt::JwtKeys,
        password::{hash_password, verify_password},
        rate_limit,
        refresh::{generate_token, token_hash},
        ACCESS_TTL_SECONDS, REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TTL_DAYS,
    },
    db::users::{self, User},
    error::{AppError, AppResult, FieldError},
    state::AppState,
};

pub fn router(state: &AppState) -> Router<AppState> {
    Router::new()
        .route("/auth/refresh", post(refresh))
        .route("/auth/logout", post(logout))
        .merge(throttled_routes(state))
}

/// Registrierung und Anmeldung sind die einzigen Endpunkte mit Rate Limiting
/// (§8) – sie sind die einzigen, die ohne Anmeldung Argon2 rechnen lassen.
fn throttled_routes(state: &AppState) -> Router<AppState> {
    let routes = Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login));
    rate_limit::throttled(
        routes,
        state.config.trust_proxy_headers,
        state.config.auth_rate_limit_burst,
    )
}

#[derive(Deserialize)]
pub struct RegisterBody {
    pub email: String,
    pub password: String,
    pub display_name: String,
    #[serde(default)]
    pub timezone: Option<String>,
}

#[derive(Deserialize)]
pub struct LoginBody {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct SessionResponse {
    pub access_token: String,
    pub expires_in: i64,
    pub user: User,
}

pub const MIN_PASSWORD_LEN: usize = 10;

fn validate_registration(body: &RegisterBody) -> Result<(), AppError> {
    let mut errors = Vec::new();
    let email = body.email.trim();
    if email.len() < 3 || !email.contains('@') || email.contains(' ') {
        errors.push(FieldError {
            field: "email".into(),
            message: "Ungültige E-Mail-Adresse.".into(),
        });
    }
    if body.password.chars().count() < MIN_PASSWORD_LEN {
        errors.push(FieldError {
            field: "password".into(),
            message: format!("Mindestens {MIN_PASSWORD_LEN} Zeichen."),
        });
    }
    let name = body.display_name.trim();
    if name.chars().count() < 2 || name.chars().count() > 32 {
        errors.push(FieldError {
            field: "display_name".into(),
            message: "Zwischen 2 und 32 Zeichen.".into(),
        });
    }
    if let Some(tz) = &body.timezone {
        if tz.parse::<chrono_tz::Tz>().is_err() {
            errors.push(FieldError {
                field: "timezone".into(),
                message: "Unbekannte Zeitzone.".into(),
            });
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(AppError::Validation(errors))
    }
}

fn refresh_cookie(state: &AppState, value: String, max_age: Duration) -> Cookie<'static> {
    let mut cookie = Cookie::new(REFRESH_COOKIE, value);
    cookie.set_http_only(true);
    cookie.set_secure(state.config.cookie_secure);
    cookie.set_same_site(SameSite::Lax);
    cookie.set_path(REFRESH_COOKIE_PATH);
    cookie.set_max_age(time::Duration::seconds(max_age.num_seconds()));
    if !state.config.cookie_domain.is_empty() && state.config.cookie_domain != "localhost" {
        cookie.set_domain(state.config.cookie_domain.clone());
    }
    cookie
}

async fn issue_session(
    state: &AppState,
    jar: CookieJar,
    user: User,
) -> AppResult<(CookieJar, SessionResponse)> {
    let token = generate_token();
    let expires_at = Utc::now() + Duration::days(REFRESH_TTL_DAYS);
    users::insert_refresh_token(&state.pool, user.id, &token_hash(&token), expires_at).await?;
    let access = state
        .jwt
        .issue(user.id, &user.role)
        .map_err(AppError::Internal)?;
    let jar = jar.add(refresh_cookie(
        state,
        token,
        Duration::days(REFRESH_TTL_DAYS),
    ));
    Ok((
        jar,
        SessionResponse {
            access_token: access,
            expires_in: ACCESS_TTL_SECONDS,
            user,
        },
    ))
}

async fn register(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<RegisterBody>,
) -> AppResult<(StatusCode, CookieJar, Json<SessionResponse>)> {
    validate_registration(&body)?;
    let hash = hash_password(&body.password).map_err(AppError::Internal)?;
    let user = users::create_user(
        &state.pool,
        body.email.trim(),
        &hash,
        body.display_name.trim(),
        body.timezone.as_deref().unwrap_or("Europe/Vienna"),
    )
    .await?;
    let (jar, session) = issue_session(&state, jar, user).await?;
    Ok((StatusCode::CREATED, jar, Json(session)))
}

async fn login(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(body): Json<LoginBody>,
) -> AppResult<(CookieJar, Json<SessionResponse>)> {
    let creds = users::credentials_by_email(&state.pool, body.email.trim()).await?;
    // Gleiche Antwort für unbekannte Nutzer und falsches Passwort.
    let Some(creds) = creds else {
        // Dummy-Verifikation gegen Timing-Unterschiede
        let _ = verify_password(&body.password, "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000");
        return Err(AppError::Unauthorized);
    };
    if !verify_password(&body.password, &creds.password_hash) {
        return Err(AppError::Unauthorized);
    }
    let user = users::find_user(&state.pool, creds.id).await?;
    let (jar, session) = issue_session(&state, jar, user).await?;
    Ok((jar, Json(session)))
}

async fn refresh(
    State(state): State<AppState>,
    jar: CookieJar,
) -> AppResult<(CookieJar, Json<SessionResponse>)> {
    let token = jar
        .get(REFRESH_COOKIE)
        .map(|c| c.value().to_string())
        .ok_or(AppError::Unauthorized)?;
    let hash = token_hash(&token);
    let row = users::find_refresh_token(&state.pool, &hash)
        .await?
        .ok_or(AppError::Unauthorized)?;

    // Wiederverwendung eines verbrauchten Tokens = Diebstahlsignal (§8).
    if row.used_at.is_some() {
        let revoked = users::revoke_all_for_user(&state.pool, row.user_id).await?;
        tracing::warn!(user_id = %row.user_id, revoked, "refresh token reuse detected, all sessions revoked");
        return Err(AppError::Unauthorized);
    }
    if row.expires_at < Utc::now() {
        users::delete_refresh_token(&state.pool, &hash).await?;
        return Err(AppError::Unauthorized);
    }

    let user = users::find_user(&state.pool, row.user_id).await?;
    let new_token = generate_token();
    let expires_at = Utc::now() + Duration::days(REFRESH_TTL_DAYS);
    let new_id =
        users::insert_refresh_token(&state.pool, user.id, &token_hash(&new_token), expires_at)
            .await?;
    users::mark_used(&state.pool, row.id, new_id).await?;

    let access = state
        .jwt
        .issue(user.id, &user.role)
        .map_err(AppError::Internal)?;
    let jar = jar.add(refresh_cookie(
        &state,
        new_token,
        Duration::days(REFRESH_TTL_DAYS),
    ));
    Ok((
        jar,
        Json(SessionResponse {
            access_token: access,
            expires_in: ACCESS_TTL_SECONDS,
            user,
        }),
    ))
}

async fn logout(
    State(state): State<AppState>,
    jar: CookieJar,
) -> AppResult<(StatusCode, CookieJar)> {
    if let Some(cookie) = jar.get(REFRESH_COOKIE) {
        users::delete_refresh_token(&state.pool, &token_hash(cookie.value())).await?;
    }
    let jar = jar.add(refresh_cookie(&state, String::new(), Duration::zero()));
    Ok((StatusCode::NO_CONTENT, jar))
}

/// Nur für Tests/Bootstrap sichtbar.
pub fn keys_for(secret: &str) -> JwtKeys {
    JwtKeys::new(secret)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body(email: &str, password: &str, name: &str) -> RegisterBody {
        RegisterBody {
            email: email.into(),
            password: password.into(),
            display_name: name.into(),
            timezone: None,
        }
    }

    #[test]
    fn registration_validation() {
        assert!(validate_registration(&body("a@b.de", "langgenugpw", "Anna")).is_ok());
        assert!(validate_registration(&body("keine-mail", "langgenugpw", "Anna")).is_err());
        assert!(validate_registration(&body("a@b.de", "kurz", "Anna")).is_err());
        assert!(validate_registration(&body("a@b.de", "langgenugpw", "A")).is_err());
        let mut b = body("a@b.de", "langgenugpw", "Anna");
        b.timezone = Some("Nicht/Existent".into());
        assert!(validate_registration(&b).is_err());
        b.timezone = Some("Europe/Vienna".into());
        assert!(validate_registration(&b).is_ok());
    }
}
