use axum::{
    extract::{State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
const CHILD_SESSION_COOKIE: &str = "child_session";
const MAX_ACTIVE_CHILD_DEVICES: i64 = 3;

// ── Request / response types ──────────────────────────────────

#[derive(Deserialize)]
struct RegisterRequest {
    username: String,
    email:    Option<String>,
    password: String,
    timezone: Option<String>,
    locale: Option<String>,
    date_format: Option<String>,
    time_format: Option<String>,
    week_start: Option<u8>,
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
struct ChangePasswordRequest {
    /// New password to set.
    password: String,
    /// Current password is required.
    current_password: String,
}

#[derive(Deserialize)]
struct ChildPairRequest {
    token: String,
}

#[derive(Serialize)]
struct ChildPairResponse {
    child_id: String,
}

#[derive(Serialize)]
struct ChildSessionResponse {
    device_id: String,
    parent_user_id: String,
    child_id: String,
}

#[derive(Serialize)]
struct UserResponse {
    id:       String,
    email:    Option<String>,
    username: Option<String>,
    role:     String,
    language: String,
    timezone: String,
    locale: String,
    date_format: String,
    time_format: String,
    week_start: u8,
}

// ── Database row types (runtime queries — no DATABASE_URL at compile time) ──────

#[derive(sqlx::FromRow)]
struct UserRow {
    id:            String,
    email:         Option<String>,
    username:      Option<String>,
    password_hash: String,
    role:          Option<String>,
    language:      String,
    timezone:      String,
    locale:        String,
    date_format:   String,
    time_format:   String,
    week_start:    i16,
    is_active:     bool,
}

#[derive(sqlx::FromRow)]
struct MeRow {
    id:       String,
    email:    Option<String>,
    username: Option<String>,
    role:     Option<String>,
    language: String,
    timezone: String,
    locale: String,
    date_format: String,
    time_format: String,
    week_start: i16,
}

#[derive(sqlx::FromRow)]
struct TokenRow {
    user_id: String,
}

#[derive(sqlx::FromRow)]
struct ForgotRow {
    id: String,
}

// ── Router ────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register",        post(register))
        .route("/auth/login",           post(login))
        .route("/auth/logout",          post(logout))
        .route("/auth/me",              get(me))
        .route("/auth/child/pair",      post(child_pair))
        .route("/auth/child/me",        get(child_me))
        .route("/auth/child/logout",    post(child_logout))
        .route("/auth/verify-email",    post(verify_email))
        .route("/auth/forgot-password", post(forgot_password))
        .route("/auth/reset-password",   post(reset_password))
        .route("/auth/qr-login",         post(qr_login))
        .route("/auth/change-password",  post(change_password))
}

// ── Handlers ──────────────────────────────────────────────────

/// POST /auth/register — create a new parent account.
async fn register(
    State(state): State<AppState>,
    Json(body): Json<RegisterRequest>,
) -> AppResult<impl IntoResponse> {
    let timezone = normalize_timezone(body.timezone.as_deref())?;
    let locale = normalize_locale(body.locale.as_deref())?;
    let date_format = normalize_date_format(body.date_format.as_deref())?;
    let time_format = normalize_time_format(body.time_format.as_deref())?;
    let week_start = normalize_week_start(body.week_start)?;

    let pool   = &state.pool;
    let config = &state.config;

    if body.username.trim().is_empty() {
        return Err(AppError::BadRequest("Username is required".into()));
    }

    // Email format validation is intentionally skipped.
    // If an email is provided, it is assumed to be valid.

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
           "INSERT INTO users (id, username, email, password_hash, role, language, timezone, locale, date_format, time_format, week_start, is_verified, is_active)
            VALUES (?, ?, ?, ?, 'parent', 'en', ?, ?, ?, ?, ?, ?, 1)",
    )
    .bind(&id)
    .bind(&body.username)
    .bind(&body.email)
    .bind(hash)
    .bind(&timezone)
    .bind(&locale)
    .bind(&date_format)
    .bind(&time_format)
    .bind(week_start)
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

/// POST /auth/login — email+password login for parent/admin accounts.
async fn login(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(body): Json<LoginRequest>,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;
    // Find user by email or username
    let user_row = if let Some(ref email) = body.email {
        sqlx::query_as::<_, UserRow>(
            "SELECT id, email, username, password_hash, role, language, timezone, locale, date_format, time_format, week_start, is_active
             FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1",
        )
        .bind(email)
        .fetch_optional(pool)
        .await?
    } else if body.username.is_some() {
        return Err(AppError::BadRequest(
            "Username/password login is disabled. Use email/password.".into(),
        ));
    } else {
        return Err(AppError::BadRequest("Provide email".into()));
    };

    let row = user_row.ok_or(AppError::Unauthorized)?;

    if !row.is_active {
        return Err(AppError::Unauthorized);
    }
    // Child profile accounts cannot log in directly.
    let role = row.role.as_deref().unwrap_or("parent");
    if role == "child" {
        return Err(AppError::Forbidden);
    }

    // Email verification enforcement is temporarily disabled.

    verify_password(&body.password, &row.password_hash)?;

    // Create session
    let session_token = create_session(pool, &row.id, SESSION_DAYS).await?;
    set_session_cookie(&cookies, &state.config.app_env, &session_token, SESSION_DAYS);

    Ok(Json(UserResponse {
        id:       row.id.clone(),
        email:    row.email.clone(),
        username: row.username.clone(),
        role:     role.to_owned(),
        language: row.language.clone(),
        timezone: row.timezone.clone(),
        locale: row.locale.clone(),
        date_format: row.date_format.clone(),
        time_format: row.time_format.clone(),
        week_start: row.week_start as u8,
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
    clear_session_cookie(&cookies, &state.config.app_env);
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
        "SELECT u.id, u.email, u.username, u.role, u.language, u.timezone,
            u.locale, u.date_format, u.time_format, u.week_start
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
        id:       row.id.clone(),
        email:    row.email.clone(),
        username: row.username.clone(),
        role:     row.role.clone().unwrap_or_default(),
        language: row.language.clone(),
        timezone: row.timezone.clone(),
        locale: row.locale.clone(),
        date_format: row.date_format.clone(),
        time_format: row.time_format.clone(),
        week_start: row.week_start as u8,
    }))
}

/// POST /auth/child/pair — exchange an active QR token for a child device session.
async fn child_pair(
    State(state): State<AppState>,
    cookies: Cookies,
    headers: axum::http::HeaderMap,
    Json(body): Json<ChildPairRequest>,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct PairRow {
        qr_id: String,
        child_id: String,
        parent_user_id: Option<String>,
    }

    let pair = sqlx::query_as::<_, PairRow>(
        "SELECT q.id AS qr_id, q.child_id, cp.parent_id AS parent_user_id
         FROM qr_tokens q
         JOIN child_profiles cp ON cp.id = q.child_id
         WHERE q.token = ? AND q.is_active = 1
         LIMIT 1",
    )
    .bind(&body.token)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::BadRequest("Invalid or inactive QR code".into()))?;

    let parent_user_id = pair
        .parent_user_id
        .ok_or_else(|| AppError::Forbidden)?;

    let active_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM child_device_tokens WHERE child_id = ? AND revoked_at IS NULL",
    )
    .bind(&pair.child_id)
    .fetch_one(pool)
    .await?;

    if active_count >= MAX_ACTIVE_CHILD_DEVICES {
        return Err(AppError::Conflict(format!(
            "Maximum number of active devices reached ({MAX_ACTIVE_CHILD_DEVICES})"
        )));
    }

    let raw_device_token = generate_token();
    let token_hash = hash_token(&raw_device_token);

    let user_agent_hash = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(hash_token);

    let ip_range = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|v| v.trim().to_owned())
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.trim().to_owned())
        });

    let device_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO child_device_tokens
            (id, parent_user_id, child_id, token_hash, created_at, last_used_at, user_agent_hash, ip_range)
         VALUES (?, ?, ?, ?, NOW(), NOW(), ?, ?)",
    )
    .bind(&device_id)
    .bind(&parent_user_id)
    .bind(&pair.child_id)
    .bind(&token_hash)
    .bind(&user_agent_hash)
    .bind(&ip_range)
    .execute(pool)
    .await?;

    // Single-use pairing code behavior.
    sqlx::query("UPDATE qr_tokens SET is_active = 0 WHERE id = ?")
        .bind(&pair.qr_id)
        .execute(pool)
        .await?;

    set_child_session_cookie(&cookies, &state.config.app_env, &raw_device_token);

    Ok(Json(ChildPairResponse {
        child_id: pair.child_id,
    }))
}

/// GET /auth/child/me — return active child device session metadata.
async fn child_me(
    State(state): State<AppState>,
    cookies: Cookies,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;
    let raw = cookies
        .get(CHILD_SESSION_COOKIE)
        .map(|c| c.value().to_owned())
        .ok_or(AppError::Unauthorized)?;

    let token_hash = hash_token(&raw);

    #[derive(sqlx::FromRow)]
    struct ChildSessionRow {
        id: String,
        parent_user_id: String,
        child_id: String,
    }

    let row = sqlx::query_as::<_, ChildSessionRow>(
        "SELECT id, parent_user_id, child_id
         FROM child_device_tokens
         WHERE token_hash = ? AND revoked_at IS NULL
         LIMIT 1",
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    sqlx::query("UPDATE child_device_tokens SET last_used_at = NOW() WHERE id = ?")
        .bind(&row.id)
        .execute(pool)
        .await?;

    Ok(Json(ChildSessionResponse {
        device_id: row.id,
        parent_user_id: row.parent_user_id,
        child_id: row.child_id,
    }))
}

/// POST /auth/child/logout — revoke current child device session.
async fn child_logout(
    State(state): State<AppState>,
    cookies: Cookies,
) -> AppResult<impl IntoResponse> {
    let pool = &state.pool;

    if let Some(raw) = cookies.get(CHILD_SESSION_COOKIE).map(|c| c.value().to_owned()) {
        let token_hash = hash_token(&raw);
        sqlx::query("UPDATE child_device_tokens SET revoked_at = NOW() WHERE token_hash = ?")
            .bind(&token_hash)
            .execute(pool)
            .await?;
    }

    clear_child_session_cookie(&cookies, &state.config.app_env);
    Ok(StatusCode::NO_CONTENT)
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
        "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
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
    State(_state): State<AppState>,
    _cookies: Cookies,
    Json(_body): Json<serde_json::Value>,
) -> AppResult<impl IntoResponse> {
    Ok((
        StatusCode::GONE,
        Json(serde_json::json!({
            "message": "QR login no longer creates child sessions. Open /my-calendar?token=<qr-token> instead."
        })),
    ))
}

/// POST /auth/change-password — change password for the currently logged-in user.
async fn change_password(
    State(state): State<AppState>,
    cookies: Cookies,
    Json(body): Json<ChangePasswordRequest>,
) -> AppResult<impl IntoResponse> {
    let pool   = &state.pool;
    let config = &state.config;

    let token = cookies
        .get(SESSION_COOKIE)
        .map(|c| c.value().to_owned())
        .ok_or(AppError::Unauthorized)?;

    let row = sqlx::query_as::<_, UserRow>(
        "SELECT u.id, u.email, u.username, u.password_hash, u.role, u.language, u.timezone,
            u.locale, u.date_format, u.time_format, u.week_start, u.is_active
         FROM user_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > NOW()
           AND u.is_active = 1 AND u.deleted_at IS NULL
         LIMIT 1",
    )
    .bind(&token)
    .fetch_optional(pool).await?
    .ok_or(AppError::Unauthorized)?;

    if row.role.as_deref() == Some("child") {
        return Err(AppError::Forbidden);
    }

    verify_password(&body.current_password, &row.password_hash)?;

    if config.app_env != "development" {
        validate_password_strength(&body.password)?;
    }

    let hash = hash_password(&body.password)?;
    sqlx::query(
        "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
    )
    .bind(hash)
    .bind(&row.id)
    .execute(pool)
    .await?;

    Ok(Json(serde_json::json!({ "message": "Password changed successfully." })))
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

fn set_session_cookie(cookies: &Cookies, app_env: &str, token: &str, days: i64) {
    let is_prod = app_env != "development";
    let cookie = Cookie::build((SESSION_COOKIE, token.to_owned()))
        .http_only(true)
        .same_site(SameSite::Strict)
        .secure(is_prod)
        .path("/")
        .max_age(CookieDuration::days(days))
        .build();
    cookies.add(cookie);
}

fn clear_session_cookie(cookies: &Cookies, app_env: &str) {
    let is_prod = app_env != "development";
    let cookie = Cookie::build((SESSION_COOKIE, ""))
        .http_only(true)
        .same_site(SameSite::Strict)
        .secure(is_prod)
        .path("/")
        .max_age(CookieDuration::ZERO)
        .build();
    cookies.add(cookie);
}

fn set_child_session_cookie(cookies: &Cookies, app_env: &str, token: &str) {
    let is_prod = app_env != "development";
    let cookie = Cookie::build((CHILD_SESSION_COOKIE, token.to_owned()))
        .http_only(true)
        .same_site(SameSite::Strict)
        .secure(is_prod)
        .path("/")
        .max_age(CookieDuration::days(180))
        .build();
    cookies.add(cookie);
}

fn clear_child_session_cookie(cookies: &Cookies, app_env: &str) {
    let is_prod = app_env != "development";
    let cookie = Cookie::build((CHILD_SESSION_COOKIE, ""))
        .http_only(true)
        .same_site(SameSite::Strict)
        .secure(is_prod)
        .path("/")
        .max_age(CookieDuration::ZERO)
        .build();
    cookies.add(cookie);
}

fn hash_token(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn normalize_timezone(input: Option<&str>) -> AppResult<String> {
    let tz = input.unwrap_or("UTC").trim();
    if tz.is_empty() {
        return Ok("UTC".to_string());
    }
    if tz.len() > 64 {
        return Err(AppError::BadRequest("Timezone is too long".into()));
    }
    if !tz
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '/' || c == '_' || c == '-' || c == '+')
    {
        return Err(AppError::BadRequest("Invalid timezone format".into()));
    }
    Ok(tz.to_string())
}

fn normalize_locale(input: Option<&str>) -> AppResult<String> {
    let locale = input.unwrap_or("en-GB").trim();
    if locale.is_empty() {
        return Ok("en-GB".to_string());
    }
    if locale.len() > 16 {
        return Err(AppError::BadRequest("Locale is too long".into()));
    }
    if !locale
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::BadRequest("Invalid locale format".into()));
    }
    Ok(locale.to_string())
}

fn normalize_date_format(input: Option<&str>) -> AppResult<String> {
    let raw = input.unwrap_or("locale").trim().to_ascii_lowercase();
    match raw.as_str() {
        "locale" | "dd-mm-yyyy" | "dd_month_yyyy" | "mm/dd/yyyy" => Ok(raw),
        _ => Err(AppError::BadRequest("Invalid date_format".into())),
    }
}

fn normalize_time_format(input: Option<&str>) -> AppResult<String> {
    let raw = input.unwrap_or("24h").trim().to_ascii_lowercase();
    match raw.as_str() {
        "24h" | "12h" => Ok(raw),
        _ => Err(AppError::BadRequest("Invalid time_format".into())),
    }
}

fn normalize_week_start(input: Option<u8>) -> AppResult<u8> {
    let week_start = input.unwrap_or(1);
    if !(1..=7).contains(&week_start) {
        return Err(AppError::BadRequest("week_start must be in range 1..7".into()));
    }
    Ok(week_start)
}
