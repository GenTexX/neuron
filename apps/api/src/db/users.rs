use chrono::{DateTime, Utc};
use sqlx::{PgExecutor, PgPool};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, serde::Serialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub role: String,
    pub timezone: String,
    pub created_at: DateTime<Utc>,
}

pub async fn create_user(
    pool: &PgPool,
    email: &str,
    password_hash: &str,
    display_name: &str,
    timezone: &str,
) -> AppResult<User> {
    let id = Uuid::now_v7();
    let row = sqlx::query_as!(
        User,
        r#"INSERT INTO app_user (id, email, password_hash, display_name, timezone)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email::text as "email!", display_name, role, timezone, created_at"#,
        id,
        email,
        password_hash,
        display_name,
        timezone
    )
    .fetch_one(pool)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.constraint() == Some("app_user_email_key") => {
            AppError::Conflict("email_taken")
        }
        sqlx::Error::Database(db) if db.constraint() == Some("app_user_display_name_lower_idx") => {
            AppError::Conflict("display_name_taken")
        }
        _ => AppError::from(e),
    })?;
    Ok(row)
}

pub struct Credentials {
    pub id: Uuid,
    pub password_hash: String,
    pub role: String,
}

pub async fn credentials_by_email(pool: &PgPool, email: &str) -> AppResult<Option<Credentials>> {
    let row = sqlx::query!(
        r#"SELECT id, password_hash, role FROM app_user WHERE email = $1"#,
        email
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| Credentials {
        id: r.id,
        password_hash: r.password_hash,
        role: r.role,
    }))
}

pub async fn find_user<'e, E: PgExecutor<'e>>(executor: E, id: Uuid) -> AppResult<User> {
    let user = sqlx::query_as!(
        User,
        r#"SELECT id, email::text as "email!", display_name, role, timezone, created_at
           FROM app_user WHERE id = $1"#,
        id
    )
    .fetch_one(executor)
    .await?;
    Ok(user)
}

pub async fn update_user(
    pool: &PgPool,
    id: Uuid,
    display_name: Option<&str>,
    timezone: Option<&str>,
) -> AppResult<User> {
    let user = sqlx::query_as!(
        User,
        r#"UPDATE app_user
           SET display_name = COALESCE($2, display_name),
               timezone     = COALESCE($3, timezone)
           WHERE id = $1
           RETURNING id, email::text as "email!", display_name, role, timezone, created_at"#,
        id,
        display_name,
        timezone
    )
    .fetch_one(pool)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db) if db.constraint() == Some("app_user_display_name_lower_idx") => {
            AppError::Conflict("display_name_taken")
        }
        _ => AppError::from(e),
    })?;
    Ok(user)
}

// ---------- Refresh-Tokens (§8) ----------

pub struct RefreshRow {
    pub id: Uuid,
    pub user_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
}

pub async fn insert_refresh_token(
    pool: &PgPool,
    user_id: Uuid,
    token_hash: &[u8],
    expires_at: DateTime<Utc>,
) -> AppResult<Uuid> {
    let id = Uuid::now_v7();
    sqlx::query!(
        r#"INSERT INTO refresh_token (id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, $4)"#,
        id,
        user_id,
        token_hash,
        expires_at
    )
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn find_refresh_token(pool: &PgPool, token_hash: &[u8]) -> AppResult<Option<RefreshRow>> {
    let row = sqlx::query!(
        r#"SELECT id, user_id, expires_at, used_at FROM refresh_token WHERE token_hash = $1"#,
        token_hash
    )
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|r| RefreshRow {
        id: r.id,
        user_id: r.user_id,
        expires_at: r.expires_at,
        used_at: r.used_at,
    }))
}

/// Markiert das alte Token als verbraucht und verweist auf den Nachfolger.
pub async fn mark_used(pool: &PgPool, id: Uuid, replaced_by: Uuid) -> AppResult<()> {
    sqlx::query!(
        r#"UPDATE refresh_token SET used_at = now(), replaced_by = $2 WHERE id = $1"#,
        id,
        replaced_by
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// Diebstahlsignal: alle Sessions des Nutzers invalidieren (§8).
pub async fn revoke_all_for_user(pool: &PgPool, user_id: Uuid) -> AppResult<u64> {
    let res = sqlx::query!(r#"DELETE FROM refresh_token WHERE user_id = $1"#, user_id)
        .execute(pool)
        .await?;
    Ok(res.rows_affected())
}

pub async fn delete_refresh_token(pool: &PgPool, token_hash: &[u8]) -> AppResult<()> {
    sqlx::query!(
        r#"DELETE FROM refresh_token WHERE token_hash = $1"#,
        token_hash
    )
    .execute(pool)
    .await?;
    Ok(())
}
