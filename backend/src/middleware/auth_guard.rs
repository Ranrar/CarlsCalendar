//! Authentication guard middleware.
//!
//! Reads the `session` cookie, validates it against `user_sessions` in the DB,
//! and injects an `AuthUser` extension into the request for downstream handlers.

use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use tower_cookies::Cookies;

use crate::{
    errors::AppError,
    models::UserRole,
    state::AppState,
};

const SESSION_COOKIE: &str = "session";

/// Authenticated user extracted from a valid session. Injected into request
/// extensions by `require_auth`; downstream handlers use `Extension<AuthUser>`.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id:              String,
    pub role:                 UserRole,
    #[allow(dead_code)]
    pub must_change_password: bool,
}

/// Middleware: require any valid session cookie.
/// On success, inserts `AuthUser` into request extensions.
pub async fn require_auth(
    State(state): State<AppState>,
    cookies: Cookies,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = cookies
        .get(SESSION_COOKIE)
        .map(|c| c.value().to_owned())
        .ok_or(AppError::Unauthorized)?;

    #[derive(sqlx::FromRow)]
    struct SessionRow {
        id:                   String,
        role:                 Option<String>,
        must_change_password: bool,
    }

    let row = sqlx::query_as::<_, SessionRow>(
        "SELECT u.id, u.role, u.must_change_password
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
           AND s.expires_at > NOW()
           AND u.is_active = 1
           AND u.deleted_at IS NULL
         LIMIT 1",
    )
    .bind(&token)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
    .ok_or(AppError::Unauthorized)?;

    let role = match row.role.as_deref().unwrap_or("") {
        "admin"  => UserRole::Admin,
        "child"  => UserRole::Child,
        _        => UserRole::Parent,
    };

    req.extensions_mut().insert(AuthUser {
        user_id:              row.id.clone(),
        role,
        must_change_password: row.must_change_password,
    });

    Ok(next.run(req).await)
}
