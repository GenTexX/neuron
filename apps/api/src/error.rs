//! Einheitliche Fehlerbehandlung (§14.2): `AppError` → `{ "error": { code, message } }`.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct FieldError {
    pub field: String,
    pub message: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(&'static str),
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("validation failed")]
    Validation(Vec<FieldError>),
    #[error("too many requests")]
    RateLimited,
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl AppError {
    pub fn validation(field: &str, message: &str) -> Self {
        AppError::Validation(vec![FieldError {
            field: field.to_string(),
            message: message.to_string(),
        }])
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => AppError::Internal(anyhow::Error::from(other)),
        }
    }
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    error: ErrorInner<'a>,
}

#[derive(Serialize)]
struct ErrorInner<'a> {
    code: &'a str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    fields: Option<Vec<FieldError>>,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message, fields) = match self {
            AppError::NotFound => (
                StatusCode::NOT_FOUND,
                "not_found",
                "Nicht gefunden.".to_string(),
                None,
            ),
            AppError::Conflict(code) => (StatusCode::CONFLICT, code, "Konflikt.".to_string(), None),
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Anmeldung erforderlich.".to_string(),
                None,
            ),
            AppError::Forbidden => (
                StatusCode::FORBIDDEN,
                "forbidden",
                "Keine Berechtigung.".to_string(),
                None,
            ),
            AppError::Validation(fields) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "validation_failed",
                "Eingaben ungültig.".to_string(),
                Some(fields),
            ),
            AppError::RateLimited => (
                StatusCode::TOO_MANY_REQUESTS,
                "rate_limited",
                "Zu viele Anfragen.".to_string(),
                None,
            ),
            AppError::Internal(err) => {
                // Interne Fehler werden geloggt, nie an den Client durchgereicht.
                tracing::error!(error = ?err, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "Interner Fehler.".to_string(),
                    None,
                )
            }
        };
        (
            status,
            Json(ErrorBody {
                error: ErrorInner {
                    code,
                    message,
                    fields,
                },
            }),
        )
            .into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
