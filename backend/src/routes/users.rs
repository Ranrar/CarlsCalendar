//! `/users/me` — read and update the current authenticated user's profile.
//!
//! `GET  /users/me`   — returns id, email, username, role, language
//! `PATCH /users/me`  — update language preference (and future fields)

use axum::{
    extract::{Extension, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize, Serializer};
use sqlx::FromRow;
use tower_cookies::{
    cookie::{time::Duration as CookieDuration},
    Cookie, Cookies,
};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    middleware::auth_guard::AuthUser,
    models::UserRole,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
    .route("/users/me", get(get_me).patch(update_me).delete(delete_me))
    .route("/users/me/export", get(export_me))
}

// ── Response / request types ──────────────────────────────────

#[derive(Serialize)]
struct MeResponse {
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

#[derive(Serialize, FromRow)]
struct MeRow {
    id:       String,
    email:    Option<String>,
    username: Option<String>,
    role:     String,
    language: String,
    timezone: String,
    locale: String,
    date_format: String,
    time_format: String,
    week_start: i16,
}

#[derive(Deserialize)]
struct UpdateMeBody {
    /// Language code to set. Must be one of: `"en"`, `"da"`.
    language: Option<String>,
    /// IANA timezone, e.g. "Europe/Copenhagen".
    timezone: Option<String>,
    /// Locale code, e.g. "da-DK", "en-US".
    locale: Option<String>,
    /// Date display format.
    date_format: Option<String>,
    /// Time display format, either "24h" or "12h".
    time_format: Option<String>,
    /// Week start day (1=Mon ... 7=Sun).
    week_start: Option<u8>,
}

#[derive(Serialize, FromRow)]
struct ExportChildRow {
    id: String,
    parent_id: Option<String>,
    display_name: String,
    avatar_path: Option<String>,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::NaiveDateTime,
}

#[derive(Serialize, FromRow)]
struct ExportScheduleRow {
    id: String,
    owner_id: String,
    child_id: Option<String>,
    name: String,
    status: String,
    is_template: bool,
    source_template_id: Option<String>,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::NaiveDateTime,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    updated_at: chrono::NaiveDateTime,
}

#[derive(Serialize, FromRow)]
struct ExportActivityCardRow {
    id: String,
    schedule_id: String,
    activity_card_id: Option<String>,
    title: String,
    description: Option<String>,
    picture_path: Option<String>,
    start_time: String,
    end_time: Option<String>,
    sort_order: i32,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::NaiveDateTime,
}

#[derive(Serialize, FromRow)]
struct ExportAssignmentRow {
    id: String,
    schedule_id: String,
    child_id: String,
    day_of_week: i8,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::NaiveDateTime,
}

#[derive(Serialize, FromRow)]
struct ExportDeviceRow {
    id: String,
    parent_user_id: String,
    child_id: String,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::NaiveDateTime,
    #[serde(serialize_with = "serialize_option_naive_datetime_utc")]
    last_used_at: Option<chrono::NaiveDateTime>,
    #[serde(serialize_with = "serialize_option_naive_datetime_utc")]
    revoked_at: Option<chrono::NaiveDateTime>,
    user_agent_hash: Option<String>,
    ip_range: Option<String>,
}

fn serialize_naive_datetime_utc<S>(value: &chrono::NaiveDateTime, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let utc = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(*value, chrono::Utc);
    serializer.serialize_str(&utc.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

fn serialize_option_naive_datetime_utc<S>(
    value: &Option<chrono::NaiveDateTime>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match value {
        Some(v) => serialize_naive_datetime_utc(v, serializer),
        None => serializer.serialize_none(),
    }
}

// ── Accepted language codes ────────────────────────────────────

const ALLOWED_LANGUAGES: &[&str] = &["en", "da"];

// ── Handlers ─────────────────────────────────────────────────

/// Return the authenticated user's profile.
async fn get_me(
    Extension(auth): Extension<AuthUser>,
    State(state): State<AppState>,
) -> AppResult<Json<MeResponse>> {
    let pool = &state.pool;
    let row: MeRow = sqlx::query_as::<_, MeRow>(
        "SELECT id, email, username, role, language, timezone, locale, date_format, time_format, week_start
         FROM users
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&auth.user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(MeResponse {
        id:       row.id,
        email:    row.email,
        username: row.username,
        role:     row.role,
        language: row.language,
        timezone: row.timezone,
        locale: row.locale,
        date_format: row.date_format,
        time_format: row.time_format,
        week_start: row.week_start as u8,
    }))
}

/// Update mutable profile fields for the authenticated user.
///
/// Currently supports `language` and `timezone`. Returns `204 No Content` on success.
async fn update_me(
    Extension(auth): Extension<AuthUser>,
    State(state): State<AppState>,
    Json(body): Json<UpdateMeBody>,
) -> AppResult<StatusCode> {
    if auth.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    if let Some(lang) = body.language {
        if !ALLOWED_LANGUAGES.contains(&lang.as_str()) {
            return Err(AppError::BadRequest(format!(
                "Unsupported language '{}'. Allowed: {}",
                lang,
                ALLOWED_LANGUAGES.join(", ")
            )));
        }

        sqlx::query("UPDATE users SET language = ?, updated_at = NOW() WHERE id = ?")
            .bind(&lang)
            .bind(&auth.user_id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(tz) = body.timezone {
        let normalized = normalize_timezone(Some(&tz))?;
        sqlx::query("UPDATE users SET timezone = ?, updated_at = NOW() WHERE id = ?")
            .bind(&normalized)
            .bind(&auth.user_id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(locale) = body.locale {
        let normalized = normalize_locale(Some(&locale))?;
        sqlx::query("UPDATE users SET locale = ?, updated_at = NOW() WHERE id = ?")
            .bind(&normalized)
            .bind(&auth.user_id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(date_format) = body.date_format {
        let normalized = normalize_date_format(Some(&date_format))?;
        sqlx::query("UPDATE users SET date_format = ?, updated_at = NOW() WHERE id = ?")
            .bind(&normalized)
            .bind(&auth.user_id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(time_format) = body.time_format {
        let normalized = normalize_time_format(Some(&time_format))?;
        sqlx::query("UPDATE users SET time_format = ?, updated_at = NOW() WHERE id = ?")
            .bind(&normalized)
            .bind(&auth.user_id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(week_start) = body.week_start {
        let normalized = normalize_week_start(Some(week_start))?;
        sqlx::query("UPDATE users SET week_start = ?, updated_at = NOW() WHERE id = ?")
            .bind(normalized)
            .bind(&auth.user_id)
            .execute(&state.pool)
            .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

/// Export parent-owned data as JSON for GDPR portability.
async fn export_me(
    Extension(auth): Extension<AuthUser>,
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    if auth.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    let dsr_request_id = Uuid::new_v4().to_string();

    let user: MeRow = sqlx::query_as::<_, MeRow>(
        "SELECT id, email, username, role, language, timezone, locale, date_format, time_format, week_start
         FROM users
         WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&auth.user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let children: Vec<ExportChildRow> = sqlx::query_as::<_, ExportChildRow>(
        "SELECT id, parent_id, display_name, avatar_path, created_at
         FROM child_profiles
         WHERE parent_id = ?
         ORDER BY created_at",
    )
    .bind(&auth.user_id)
    .fetch_all(pool)
    .await?;

    let schedules: Vec<ExportScheduleRow> = sqlx::query_as::<_, ExportScheduleRow>(
                "SELECT
                        t.id,
                        t.owner_id,
                    CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                        t.name,
                    CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                        IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template,
                    CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.source_template_id')), '') AS CHAR(36)) AS source_template_id,
                        t.created_at,
                        t.updated_at
                 FROM visual_support_documents_templates t
                 WHERE t.owner_id = ?
                     AND t.document_type = 'WEEKLY_SCHEDULE'
                 ORDER BY t.created_at",
    )
    .bind(&auth.user_id)
    .fetch_all(pool)
    .await?;

    let schedule_activity_cards: Vec<ExportActivityCardRow> = sqlx::query_as::<_, ExportActivityCardRow>(
        "SELECT
            vta.id,
                        t.id AS schedule_id,
            vta.activity_card_id,
            COALESCE(NULLIF(vta.text_label, ''), vsa.label_text) AS title,
            vta.optional_notes AS description,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.picture_path')), ''), vsa.local_image_path) AS CHAR(500)) AS picture_path,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.start_time')), ''), '08:00') AS CHAR(5)) AS start_time,
            CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.end_time')), '') AS CHAR(5)) AS end_time,
            vta.activity_order AS sort_order,
            vta.created_at
         FROM visual_support_template_activities vta
         LEFT JOIN visual_support_activity_library vsa ON vsa.id = vta.activity_card_id
                 JOIN visual_support_documents_templates t ON t.id = vta.template_id
                 WHERE t.owner_id = ?
                     AND t.document_type = 'WEEKLY_SCHEDULE'
                 ORDER BY t.id, vta.activity_order",
    )
    .bind(&auth.user_id)
    .fetch_all(pool)
    .await?;

    let assignments: Vec<ExportAssignmentRow> = sqlx::query_as::<_, ExportAssignmentRow>(
                "SELECT
                        d.id,
                        d.template_id AS schedule_id,
                        d.child_id,
                        CAST(JSON_UNQUOTE(JSON_EXTRACT(d.content_json, '$.assignment.day_of_week')) AS SIGNED) AS day_of_week,
                        d.created_at
                 FROM visual_support_documents d
                 JOIN child_profiles cp ON cp.id = d.child_id
                 WHERE cp.parent_id = ?
                     AND d.document_type = 'WEEKLY_SCHEDULE'
                     AND d.template_id IS NOT NULL
                 ORDER BY d.child_id, day_of_week",
    )
    .bind(&auth.user_id)
    .fetch_all(pool)
    .await?;

    let devices: Vec<ExportDeviceRow> = sqlx::query_as::<_, ExportDeviceRow>(
        "SELECT id, parent_user_id, child_id, created_at, last_used_at, revoked_at, user_agent_hash, ip_range
         FROM child_device_tokens
         WHERE parent_user_id = ?
         ORDER BY created_at DESC",
    )
    .bind(&auth.user_id)
    .fetch_all(pool)
    .await?;

    sqlx::query(
        "INSERT INTO dsr_audit_logs
            (id, request_id, user_id, action, status, requested_at, completed_at, actor_user_id, metadata)
         VALUES (?, ?, ?, 'export', 'completed', NOW(), NOW(), ?, JSON_OBJECT('endpoint', '/users/me/export'))",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&dsr_request_id)
    .bind(&auth.user_id)
    .bind(&auth.user_id)
    .execute(pool)
    .await?;

    Ok(Json(serde_json::json!({
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "user": user,
        "children": children,
        "schedules": schedules,
        "schedule_activity_cards": schedule_activity_cards,
        "assignments": assignments,
        "child_devices": devices
    })))
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

/// Delete current parent account and associated data.
async fn delete_me(
    Extension(auth): Extension<AuthUser>,
    State(state): State<AppState>,
    cookies: Cookies,
) -> AppResult<StatusCode> {
    if auth.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    if auth.role == UserRole::Admin {
        return Err(AppError::BadRequest(
            "Admin self-delete is disabled.".into(),
        ));
    }

    // Hard delete parent user; FK cascade removes owned data and sessions.
    let affected = sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(&auth.user_id)
        .execute(&state.pool)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    let pool = &state.pool;
    let dsr_request_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO dsr_audit_logs
            (id, request_id, user_id, action, status, requested_at, completed_at, actor_user_id, metadata)
         VALUES (?, ?, ?, 'delete', 'completed', NOW(), NOW(), ?, JSON_OBJECT('endpoint', '/users/me'))",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&dsr_request_id)
    .bind(&auth.user_id)
    .bind(&auth.user_id)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO deletion_logs (id, table_name, record_id, deleted_at, reason, details, actor_user_id)
         VALUES (?, 'users', ?, NOW(), 'manual', JSON_OBJECT('source', '/users/me'), ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&auth.user_id)
    .bind(&auth.user_id)
    .execute(pool)
    .await?;

    let is_prod = state.config.app_env != "development";

    let clear_parent = Cookie::build(("session", ""))
        .http_only(true)
        .same_site(tower_cookies::cookie::SameSite::Strict)
        .secure(is_prod)
        .path("/")
        .max_age(CookieDuration::ZERO)
        .build();
    cookies.add(clear_parent);

    let clear_child = Cookie::build(("child_session", ""))
        .http_only(true)
        .same_site(tower_cookies::cookie::SameSite::Strict)
        .secure(is_prod)
        .path("/")
        .max_age(CookieDuration::ZERO)
        .build();
    cookies.add(clear_child);

    Ok(StatusCode::NO_CONTENT)
}
