//! Axum-Extraktoren für authentifizierte und optionale Nutzer.

use axum::{extract::FromRequestParts, http::request::Parts};
use uuid::Uuid;

use crate::{error::AppError, state::AppState};

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: Uuid,
    pub role: String,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
}

fn from_parts(parts: &Parts, state: &AppState) -> Option<AuthUser> {
    let header = parts
        .headers
        .get(axum::http::header::AUTHORIZATION)?
        .to_str()
        .ok()?;
    let token = header.strip_prefix("Bearer ")?;
    let claims = state.jwt.verify(token)?;
    Some(AuthUser {
        id: Uuid::parse_str(&claims.sub).ok()?,
        role: claims.role,
    })
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        from_parts(parts, state).ok_or(AppError::Unauthorized)
    }
}

/// Optionaler Nutzer – für Endpunkte, die ohne Auth weniger Felder liefern (§11.2).
pub struct MaybeAuthUser(pub Option<AuthUser>);

impl FromRequestParts<AppState> for MaybeAuthUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(MaybeAuthUser(from_parts(parts, state)))
    }
}

/// Erzwingt die Rolle `admin` (§11.3).
pub struct AdminUser(pub AuthUser);

impl FromRequestParts<AppState> for AdminUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let user = AuthUser::from_request_parts(parts, state).await?;
        if user.is_admin() {
            Ok(AdminUser(user))
        } else {
            Err(AppError::Forbidden)
        }
    }
}
