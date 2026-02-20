use axum::{
    extract::{State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tower_cookies::{
    cookie::{time::Duration as CookieDuration, SameSite},
    Cookie, Cookies,
};
use uuid::Uuid;

use crate::{
    auth::{
        email::{send_password_reset_email, send_verification_email},
        generate_token, hash_password, validate_password_strength, verify_password,
    },
    db::Db,
    errors::{AppError, AppResult},
    state::AppState,
};

// ── Session cookie constants ──────────────────────────────────

const SESSION_COOKIE: &str = "session";
const SESSION_DAYS:   i64  = 30;
const VERIFY_HOURS:   i64  = 24;
const RESET_HOURS:    i64  = 1;

// ── Request / response types ──────────────────────────────────

#[derive(Deserialize)]
struct RegisterRequest {
    username: String,
    email:    Option<String>,
    password: String,
}

#[derive(Deserialize)]
struct LoginRequest {
    /// email (for parent/admin) OR username (for child)
    email:    Option<String>,
    username: Option<String>,
    password: String,
}

#[derive(Deserialize)]
struct VerifyEmailRequest {
    token: String,
}

#[derive(Deserialize)]
struct ForgotPasswordRequest {
    email: String,
}

#[derive(Deserialize)]
struct ResetPasswordRequest {
    token:    String,
    password: String,
}

#[derive(Deserialize)]
struct QrLoginRequest {
    token: String,
}

#[derive(Serialize)]
struct UserResponse {
    id:                   String,
    email:                Option<String>,
    username:             Option<String>,
    role:                 String,
    language:             String,
    must_change_password: bool,
}

// ── Database row types (runtime queries — no DATABASE_URL at compile time) ──────

#[derive(sqlx::FromRow)]
struct UserRow {
    id:                   String,
    email:                Option<String>,
    username:             Option<String>,
    password_hash:        String,
    role:                 Option<String>,
    language:             String,
    is_verified:          bool,
    is_active:            bool,
    must_change_password: bool,
}

#[derive(sqlx::FromRow)]
struct MeRow {
    id:                   String,
    email:                Option<String>,
    username:             Option<String>,
    role:                 Option<String>,
    language:             String,
    must_change_password: bool,
}

#[derive(sqlx::FromRow)]
struct TokenRow {
    user_id: String,
}

#[derive(sqlx::FromRow)]
struct ForgotRow {
    id: String,
}

#[derive(sqlx::FromRow)]
struct QrRow {
    child_user_id:        String,
    email:                Option<String>,
    username:             Option<String>,
    language:             String,
    must_change_password: bool,
}

// ── Router ────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register",        post(register))
        .route("/auth/login",           post(login))
        .route("/auth/logout",          post(logout))
        .route("/auth/me",              get(me))
        .route("/auth/verify-email",    post(verify_email))
        .route("/auth/forgot-password", post(forgot_password))
        .route("/auth/reset-password",  post(reset_password))
        .route("/auth/qr-login",        post(qr_login))
}

// ── Handlers ──────────────────────────────────────────────────

/// POST /auth/register — create a new parent account.
async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> AppResult<impl IntoResponse> {
    let pool   = &state.pool;
    let config = &state.config;

    if body.username.trim().is_empty() {
        return Err(AppError::BadRequest("Username is required".into()));
    }

    // Validate email format only when provided
    if let Some(ref email) = body.email {
        validate_email(email)?;
    }

    // DEV: password strength is disabled in development for easy testing.
    // PRODUCTION: remove this guard so all passwords are validated.
    if config.app_env != "development" {
        validate_password_strength(&body.password)?;
    }

    // Check username not already taken
    let username_taken: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = ? AND deleted_at IS NULL)",
    )
    .bind(&body.username)
    .fetch_one(pool)
    .await?;
    if username_taken {
        return Err(AppError::Conflict("Username is already taken".into()));
    }

    // Check email not already taken (if provided)
    if let Some(ref email) = body.email {
        let email_taken: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM users WHERE email = ? AND deleted_at IS NULL)",
        )
        .bind(email)
        .fetch_one(pool)
        .await?;
        if email_taken {
            return Err(AppError::Conflict("Email address is already registered".into()));
        }
    }

    let hash = hash_password(&body.password)?;
    let id   = Uuid::new_v4().to_string();

    let insert_result = sqlx::query(
        "INSERT INTO users (id, username, email, password_hash, role, language, is_verified, is_active, must_change_password)
         VALUES (?, ?, ?, ?, 'parent', 'en', ?, 1, 0)",
    )
    .bind(&id)
    .bind(&body.username)
    .bind(&body.email)
    .bind(hash)
    // verified immediately if no email provided; otherwise requires email verification
    .bind(body.email.is_none())
    .execute(pool)
    .await;

    // Guard against duplicate key (race condition / double-submit)
    if let Err(sqlx::Error::Database(ref db_err)) = insert_result {
        if db_err.code().as_deref() == Some("23000") {
            return Err(AppError::Conflict("Username or email is already taken".into()));
        }
    }
    insert_result?;

    // Send email verification only when an email was provided
    if let Some(ref email) = body.email {
        let token = issue_email_token(pool, &id, "verify_email", VERIFY_HOURS).await?;
        send_verification_email(config, email, &token).await?;
        return Ok((
            StatusCode::CREATED,
            Json(serde_json::json!({ "message": "Account created. Please check your email to verify your address." })),
        ));
    }

    Ok((
        StatusCode::CREATED,
        Json(serde_json::json!({ "message": "Account created." })),
    ))
}

/// POST /auth/login — email+password login for parents/admin, username+password for children.
async fn login(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(body): Json<LoginRequest>,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;
    // Find user by email or username
    let user_row = if let Some(ref email) = body.email {
        sqlx::query_as::<_, UserRow>(
            "SELECT id, email, username, password_hash, role, language, is_verified, is_active, must_change_password
             FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1",
        )
        .bind(email)
        .fetch_optional(pool)
        .await?
    } else if let Some(ref username) = body.username {
        sqlx::query_as::<_, UserRow>(
            "SELECT id, email, username, password_hash, role, language, is_verified, is_active, must_change_password
             FROM users WHERE username = ? AND deleted_at IS NULL LIMIT 1",
        )
        .bind(username)
        .fetch_optional(pool)
        .await?
    } else {
        return Err(AppError::BadRequest("Provide email or username".into()));
    };

    let row = user_row.ok_or(AppError::Unauthorized)?;

    if !row.is_active {
        return Err(AppError::Unauthorized);
    }
    // Parents/admins must verify their email before logging in
    let role = row.role.as_deref().unwrap_or("parent");
    if role != "child" && role != "admin" && !row.is_verified {
        return Err(AppError::BadRequest(
            "Please verify your email address before logging in.".into(),
        ));
    }

    verify_password(&body.password, &row.password_hash)?;

    // Create session
    let session_token = create_session(pool, &row.id, SESSION_DAYS).await?;
    set_session_cookie(&cookies, &session_token, SESSION_DAYS);

    Ok(Json(UserResponse {
        id:                   row.id.clone(),
        email:                row.email.clone(),
        username:             row.username.clone(),
        role:                 role.to_owned(),
        language:             row.language.clone(),
        must_change_password: row.must_change_password,
    }))
}

/// POST /auth/logout — delete the current session.
async fn logout(
    State(state): State<AppState>,
    cookies: Cookies,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;
    if let Some(token) = cookies.get(SESSION_COOKIE).map(|c| c.value().to_owned()) {
        sqlx::query("DELETE FROM user_sessions WHERE token = ?")
            .bind(&token)
            .execute(pool)
            .await?;
    }
    clear_session_cookie(&cookies);
    Ok(StatusCode::NO_CONTENT)
}

/// GET /auth/me — return the currently logged-in user.
async fn me(
    State(state): State<AppState>,
    cookies: Cookies,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;
    let token = cookies
        .get(SESSION_COOKIE)
        .map(|c| c.value().to_owned())
        .ok_or(AppError::Unauthorized)?;

    let row = sqlx::query_as::<_, MeRow>(
        "SELECT u.id, u.email, u.username, u.role, u.language, u.must_change_password
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > NOW() AND u.is_active = 1 AND u.deleted_at IS NULL
         LIMIT 1",
    )
    .bind(&token)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    Ok(Json(UserResponse {
        id:                   row.id.clone(),
        email:                row.email.clone(),
        username:             row.username.clone(),
        role:                 row.role.clone().unwrap_or_default(),
        language:             row.language.clone(),
        must_change_password: row.must_change_password,
    }))
}

/// POST /auth/verify-email — confirm an email address.
async fn verify_email(
    State(state): State<AppState>,
    Json(body): Json<VerifyEmailRequest>,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;
    let row = sqlx::query_as::<_, TokenRow>(
        "SELECT user_id FROM email_tokens
         WHERE token = ? AND kind = 'verify_email' AND expires_at > NOW() LIMIT 1",
    )
    .bind(&body.token)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("Invalid or expired verification token".into()))?;

    sqlx::query("UPDATE users SET is_verified = 1 WHERE id = ?")
        .bind(&row.user_id)
        .execute(pool)
        .await?;

    sqlx::query("DELETE FROM email_tokens WHERE token = ?")
        .bind(&body.token)
        .execute(pool)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Email verified. You can now log in." })))
}

/// POST /auth/forgot-password — request a password-reset link.
async fn forgot_password(
    State(state): State<AppState>,
    Json(body): Json<ForgotPasswordRequest>,
) -> AppResult<impl IntoResponse> {
    let pool   = &state.pool;
    let config = &state.config;
    // Always return success to avoid leaking whether an email is registered
    let row = sqlx::query_as::<_, ForgotRow>(
        "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL AND is_active = 1 LIMIT 1",
    )
    .bind(&body.email)
    .fetch_optional(pool)
    .await?;

    if let Some(row) = row {
        let token = issue_email_token(pool, &row.id, "reset_password", RESET_HOURS).await?;
        // Best-effort — don't let email failure return an error
        let _ = send_password_reset_email(config, &body.email, &token).await;
    }

    Ok(Json(serde_json::json!({
        "message": "If that email is registered you will receive a reset link shortly."
    })))
}

/// POST /auth/reset-password — apply a new password from a reset token.
async fn reset_password(
    State(state): State<AppState>,
    Json(body): Json<ResetPasswordRequest>,
) -> AppResult<impl IntoResponse> {
    let pool   = &state.pool;
    let config = &state.config;
    // DEV: password strength is disabled in development for easy testing.
    // PRODUCTION: remove this guard so all passwords are validated.
    if config.app_env != "development" {
        validate_password_strength(&body.password)?;
    }

    let row = sqlx::query_as::<_, TokenRow>(
        "SELECT user_id FROM email_tokens
         WHERE token = ? AND kind = 'reset_password' AND expires_at > NOW() LIMIT 1",
    )
    .bind(&body.token)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("Invalid or expired reset token".into()))?;

    let hash = hash_password(&body.password)?;

    sqlx::query(
        "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = NOW() WHERE id = ?",
    )
    .bind(hash)
    .bind(&row.user_id)
    .execute(pool)
    .await?;

    sqlx::query("DELETE FROM email_tokens WHERE token = ?")
        .bind(&body.token)
        .execute(pool)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Password updated. Please log in." })))
}

/// POST /auth/qr-login — log in a child via QR code token.
async fn qr_login(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(body): Json<QrLoginRequest>,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;
    let row = sqlx::query_as::<_, QrRow>(
        "SELECT q.child_user_id, u.email, u.username, u.language, u.must_change_password
         FROM qr_tokens q
         JOIN users u ON u.id = q.child_user_id
         WHERE q.token = ? AND q.is_active = 1 AND u.is_active = 1 AND u.deleted_at IS NULL
         LIMIT 1",
    )
    .bind(&body.token)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("Invalid or inactive QR code".into()))?;

    let session_token = create_session(pool, &row.child_user_id, SESSION_DAYS).await?;
    set_session_cookie(&cookies, &session_token, SESSION_DAYS);

    Ok(Json(UserResponse {
        id:                   row.child_user_id.clone(),
        email:                row.email.clone(),
        username:             row.username.clone(),
        role:                 "child".to_owned(),
        language:             row.language.clone(),
        must_change_password: row.must_change_password,
    }))
}

// ── Internal helpers ──────────────────────────────────────────

async fn create_session(pool: &Db, user_id: &str, days: i64) -> AppResult<String> {
    let token = generate_token();
    let id    = Uuid::new_v4().to_string();
    let expires_at =
        (Utc::now() + chrono::Duration::days(days)).naive_utc();

    sqlx::query(
        "INSERT INTO user_sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id)
    .bind(user_id)
    .bind(&token)
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(token)
}

async fn issue_email_token(
    pool: &Db,
    user_id: &str,
    kind: &str,
    hours: i64,
) -> AppResult<String> {
    // Invalidate any existing tokens of the same kind for this user
    sqlx::query("DELETE FROM email_tokens WHERE user_id = ? AND kind = ?")
        .bind(user_id)
        .bind(kind)
        .execute(pool)
        .await?;

    let token = generate_token();
    let id    = Uuid::new_v4().to_string();
    let expires_at =
        (Utc::now() + chrono::Duration::hours(hours)).naive_utc();

    sqlx::query(
        "INSERT INTO email_tokens (id, user_id, token, kind, expires_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(user_id)
    .bind(&token)
    .bind(kind)
    .bind(expires_at)
    .execute(pool)
    .await?;

    Ok(token)
}

fn set_session_cookie(cookies: &Cookies, token: &str, days: i64) {
    let cookie = Cookie::build((SESSION_COOKIE, token.to_owned()))
        .http_only(true)
        .same_site(SameSite::Strict)
        .path("/")
        .max_age(CookieDuration::days(days))
        .build();
    cookies.add(cookie);
}

fn clear_session_cookie(cookies: &Cookies) {
    let cookie = Cookie::build((SESSION_COOKIE, ""))
        .http_only(true)
        .path("/")
        .max_age(CookieDuration::ZERO)
        .build();
    cookies.add(cookie);
}

fn validate_email(email: &str) -> AppResult<()> {
    if !email.contains('@') || email.len() < 5 {
        return Err(AppError::BadRequest("Invalid email address".into()));
    }
    Ok(())
}
