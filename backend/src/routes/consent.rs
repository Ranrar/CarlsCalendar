//! `GET /consent` — read current cookie consent
//! `POST /consent` — set cookie consent choice (accepted | declined)
//! `DELETE /consent` — withdraw consent / forget choice
//!
//! Uses `tower-cookies` to manage the `cookie_consent` cookie.
//! The cookie is intentionally **not** HttpOnly so that the frontend
//! JavaScript can read it directly from `document.cookie` without an
//! extra round-trip on every page load.

use axum::{
    http::HeaderMap,
    extract::State,
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tower_cookies::{
    cookie::{time::Duration as CookieDuration, SameSite},
    Cookie, Cookies,
};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    state::AppState,
};

const CONSENT_COOKIE: &str = "cookie_consent";
const SESSION_COOKIE: &str = "session";
const DEFAULT_COOKIE_POLICY_VERSION: &str = "cookie-policy-v1";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/consent", get(get_consent).post(set_consent).delete(clear_consent))
    .route("/consent/policies", get(list_policy_versions))
}

// ── Response / request types ──────────────────────────────────

#[derive(Serialize)]
struct ConsentResponse {
    /// `"accepted"`, `"declined"`, or `null` (not yet decided).
    consent: Option<String>,
}

#[derive(Deserialize)]
struct SetConsentBody {
    /// Must be `"accepted"` or `"declined"`.
    choice: String,
    /// Optional legal policy version identifier for auditability.
    policy_version: Option<String>,
    /// Optional source marker (`banner`, `settings`, `api`).
    source: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
struct PolicyVersionRow {
    policy_scope: String,
    version: String,
    title: Option<String>,
    published_at: chrono::NaiveDateTime,
    retired_at: Option<chrono::NaiveDateTime>,
}

// ── Handlers ─────────────────────────────────────────────────

/// Return the visitor's current cookie consent choice.
async fn get_consent(cookies: Cookies) -> Json<ConsentResponse> {
    let consent = cookies
        .get(CONSENT_COOKIE)
        .map(|c| c.value().to_owned());
    Json(ConsentResponse { consent })
}

/// Return currently active policy versions.
async fn list_policy_versions(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<PolicyVersionRow>>> {
    let rows = sqlx::query_as::<_, PolicyVersionRow>(
        "SELECT policy_scope, version, title, published_at, retired_at
         FROM policy_versions
         WHERE published_at <= NOW()
           AND (retired_at IS NULL OR retired_at > NOW())
         ORDER BY policy_scope, published_at DESC",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

/// Persist the visitor's choice in a 1-year cookie.
async fn set_consent(
    State(state): State<AppState>,
    cookies: Cookies,
    headers: HeaderMap,
    Json(body): Json<SetConsentBody>,
) -> AppResult<StatusCode> {
    if !matches!(body.choice.as_str(), "accepted" | "declined") {
        return Err(AppError::BadRequest(
            "choice must be 'accepted' or 'declined'".into(),
        ));
    }

    let is_prod = state.config.app_env != "development";

    let choice = body.choice;
    let cookie = Cookie::build((CONSENT_COOKIE, choice.clone()))
        .http_only(false)          // JS must be able to read it
        .same_site(SameSite::Lax)  // Lax allows cookie on top-level navigations
        .path("/")
        .secure(is_prod)
        .max_age(CookieDuration::days(365))
        .build();

    cookies.add(cookie);

    let user_id = resolve_user_id_from_session_cookie(&state, &cookies).await?;
    let source = body.source.unwrap_or_else(|| "banner".to_owned());
    let policy_version = body
        .policy_version
        .unwrap_or_else(|| DEFAULT_COOKIE_POLICY_VERSION.to_owned());

    ensure_policy_version_is_active(&state, "cookies", &policy_version).await?;

    persist_consent_event(
        &state,
        user_id.as_deref(),
        "cookies",
        choice.as_str(),
        Some(policy_version),
        source,
        &headers,
        None,
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// Withdraw consent — delete the cookie so the banner reappears.
async fn clear_consent(
    State(state): State<AppState>,
    cookies: Cookies,
) -> AppResult<StatusCode> {
    let is_prod = state.config.app_env != "development";

    let cookie = Cookie::build((CONSENT_COOKIE, ""))
        .http_only(false)
        .same_site(SameSite::Lax)
        .path("/")
        .secure(is_prod)
        .max_age(CookieDuration::ZERO)
        .build();

    cookies.add(cookie);

    let user_id = resolve_user_id_from_session_cookie(&state, &cookies).await?;
    ensure_policy_version_is_active(&state, "cookies", DEFAULT_COOKIE_POLICY_VERSION).await?;
    persist_consent_event(
        &state,
        user_id.as_deref(),
        "cookies",
        "withdrawn",
        Some(DEFAULT_COOKIE_POLICY_VERSION.to_owned()),
        "api".to_owned(),
        &HeaderMap::new(),
        None,
    )
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn resolve_user_id_from_session_cookie(
    state: &AppState,
    cookies: &Cookies,
) -> AppResult<Option<String>> {
    let Some(token) = cookies.get(SESSION_COOKIE).map(|c| c.value().to_owned()) else {
        return Ok(None);
    };

    #[derive(sqlx::FromRow)]
    struct SessionUserRow {
        user_id: String,
    }

    let row = sqlx::query_as::<_, SessionUserRow>(
        "SELECT u.id AS user_id
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
    .await?;

    Ok(row.map(|r| r.user_id))
}

async fn persist_consent_event(
    state: &AppState,
    user_id: Option<&str>,
    consent_scope: &str,
    choice: &str,
    policy_version: Option<String>,
    source: String,
    headers: &HeaderMap,
    evidence_json: Option<serde_json::Value>,
) -> AppResult<()> {
    let id = Uuid::new_v4().to_string();
    let user_agent_hash = headers
        .get(axum::http::header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .map(hash_value);
    let ip_hash = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(',').next())
        .map(|v| hash_value(v.trim()))
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|v| hash_value(v.trim()))
        });

    sqlx::query(
        "INSERT INTO consent_events
            (id, user_id, consent_scope, choice, policy_version, source, user_agent_hash, ip_hash, evidence_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id)
    .bind(user_id)
    .bind(consent_scope)
    .bind(choice)
    .bind(policy_version)
    .bind(source)
    .bind(user_agent_hash)
    .bind(ip_hash)
    .bind(evidence_json)
    .execute(&state.pool)
    .await?;

    Ok(())
}

fn hash_value(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("{:x}", hasher.finalize())
}

async fn ensure_policy_version_is_active(
    state: &AppState,
    policy_scope: &str,
    policy_version: &str,
) -> AppResult<()> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1
            FROM policy_versions
            WHERE policy_scope = ?
              AND version = ?
              AND published_at <= NOW()
              AND (retired_at IS NULL OR retired_at > NOW())
        )",
    )
    .bind(policy_scope)
    .bind(policy_version)
    .fetch_one(&state.pool)
    .await?;

    if !exists {
        return Err(AppError::BadRequest(format!(
            "Unknown or inactive policy version '{}' for scope '{}'",
            policy_version, policy_scope
        )));
    }

    Ok(())
}
