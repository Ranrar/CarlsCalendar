use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use serde::Serializer;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    compliance,
    errors::{AppError, AppResult},
    middleware::{auth_guard::AuthUser, role_guard::require_admin},
    services::pictograms,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    use axum::middleware;
    let admin_guard = middleware::from_fn(require_admin);

    Router::new()
        .route("/admin/compliance/dsr", get(list_dsr_logs))
        .route("/admin/compliance/deletions", get(list_deletion_logs))
        .route("/admin/compliance/retention-rules", get(list_retention_rules).post(create_retention_rule))
        .route("/admin/compliance/retention-rules/{id}", put(update_retention_rule))
        .route("/admin/compliance/retention/cleanup", post(run_retention_cleanup_now))
        .route("/admin/compliance/pictogram-prefetch", get(get_pictogram_prefetch_settings).put(update_pictogram_prefetch_settings))
        .route("/admin/compliance/pictogram-prefetch/run", post(run_pictogram_prefetch_now))
        .route("/admin/compliance/breach-logs", get(list_breach_logs).post(create_breach_log))
        .route("/admin/compliance/breach-logs/{id}", put(update_breach_log))
        .route("/admin/compliance/subprocessors", get(list_subprocessors).post(create_subprocessor))
        .route("/admin/compliance/subprocessors/{id}", put(update_subprocessor).delete(delete_subprocessor))
        .route_layer(admin_guard)
}

#[derive(sqlx::FromRow, Serialize)]
struct DsrAuditRow {
    id: String,
    request_id: String,
    user_id: Option<String>,
    action: String,
    status: String,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    requested_at: chrono::DateTime<chrono::Utc>,
    #[serde(serialize_with = "serialize_option_naive_datetime_utc")]
    completed_at: Option<chrono::DateTime<chrono::Utc>>,
    error_message: Option<String>,
    actor_user_id: Option<String>,
    metadata: Option<String>,
}

#[derive(sqlx::FromRow, Serialize)]
struct DeletionLogRow {
    id: String,
    table_name: String,
    record_id: Option<String>,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    deleted_at: chrono::DateTime<chrono::Utc>,
    reason: String,
    details: Option<String>,
    actor_user_id: Option<String>,
}

#[derive(sqlx::FromRow, Serialize)]
struct RetentionRuleRow {
    id: String,
    name: String,
    table_name: String,
    timestamp_column: String,
    retention_days: i32,
    enabled: bool,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::DateTime<chrono::Utc>,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
struct CreateRetentionRuleBody {
    name: String,
    table_name: String,
    timestamp_column: String,
    retention_days: i32,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct UpdateRetentionRuleBody {
    name: Option<String>,
    retention_days: Option<i32>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct UpdatePictogramPrefetchBody {
    enabled: Option<bool>,
    idle_minutes: Option<u64>,
    batch_size: Option<u64>,
}

#[derive(sqlx::FromRow, Serialize)]
struct BreachLogRow {
    id: String,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    detected_at: chrono::DateTime<chrono::Utc>,
    #[serde(serialize_with = "serialize_option_naive_datetime_utc")]
    reported_at: Option<chrono::DateTime<chrono::Utc>>,
    severity: String,
    status: String,
    title: String,
    description: Option<String>,
    affected_records: Option<i64>,
    authority_notified: bool,
    data_subjects_notified: bool,
    created_by: Option<String>,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::DateTime<chrono::Utc>,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
struct CreateBreachLogBody {
    severity: String,
    title: String,
    description: Option<String>,
    affected_records: Option<i64>,
    authority_notified: Option<bool>,
    data_subjects_notified: Option<bool>,
}

#[derive(Deserialize)]
struct UpdateBreachLogBody {
    severity: Option<String>,
    status: Option<String>,
    title: Option<String>,
    description: Option<String>,
    affected_records: Option<i64>,
    authority_notified: Option<bool>,
    data_subjects_notified: Option<bool>,
    reported_at: Option<String>,
}

#[derive(sqlx::FromRow, Serialize)]
struct SubprocessorRow {
    id: String,
    provider: String,
    purpose: String,
    location: String,
    dpa_signed_date: Option<chrono::NaiveDate>,
    transfer_basis: String,
    notes: Option<String>,
    is_active: bool,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::DateTime<chrono::Utc>,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    updated_at: chrono::DateTime<chrono::Utc>,
}

fn serialize_naive_datetime_utc<S>(value: &chrono::DateTime<chrono::Utc>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    serializer.serialize_str(&value.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

fn serialize_option_naive_datetime_utc<S>(
    value: &Option<chrono::DateTime<chrono::Utc>>,
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

#[derive(Deserialize)]
struct CreateSubprocessorBody {
    provider: String,
    purpose: String,
    location: String,
    dpa_signed_date: Option<String>,
    transfer_basis: String,
    notes: Option<String>,
    is_active: Option<bool>,
}

#[derive(Deserialize)]
struct UpdateSubprocessorBody {
    provider: Option<String>,
    purpose: Option<String>,
    location: Option<String>,
    dpa_signed_date: Option<String>,
    transfer_basis: Option<String>,
    notes: Option<String>,
    is_active: Option<bool>,
}

async fn list_dsr_logs(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<Vec<DsrAuditRow>>> {
    let rows = sqlx::query_as::<_, DsrAuditRow>(
        "SELECT id, request_id, user_id, action, status, requested_at, completed_at,
                error_message, actor_user_id, CAST(metadata AS CHAR) AS metadata
         FROM dsr_audit_logs
         ORDER BY requested_at DESC
         LIMIT 500",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

async fn list_deletion_logs(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<Vec<DeletionLogRow>>> {
    let rows = sqlx::query_as::<_, DeletionLogRow>(
        "SELECT id, table_name, record_id, deleted_at, reason,
                CAST(details AS CHAR) AS details, actor_user_id
         FROM deletion_logs
         ORDER BY deleted_at DESC
         LIMIT 500",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

async fn list_retention_rules(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<Vec<RetentionRuleRow>>> {
    let rows = sqlx::query_as::<_, RetentionRuleRow>(
        "SELECT id, name, table_name, timestamp_column, retention_days, enabled, created_at, updated_at
         FROM retention_rules
         ORDER BY table_name, timestamp_column",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

async fn create_retention_rule(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Json(body): Json<CreateRetentionRuleBody>,
) -> AppResult<(StatusCode, Json<RetentionRuleRow>)> {
    if body.retention_days <= 0 {
        return Err(AppError::BadRequest("retention_days must be > 0".into()));
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO retention_rules
            (id, name, table_name, timestamp_column, retention_days, enabled)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.table_name)
    .bind(&body.timestamp_column)
    .bind(body.retention_days)
    .bind(body.enabled.unwrap_or(true))
    .execute(&state.pool)
    .await?;

    let row = sqlx::query_as::<_, RetentionRuleRow>(
        "SELECT id, name, table_name, timestamp_column, retention_days, enabled, created_at, updated_at
         FROM retention_rules WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn update_retention_rule(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateRetentionRuleBody>,
) -> AppResult<Json<RetentionRuleRow>> {
    if let Some(name) = &body.name {
        sqlx::query("UPDATE retention_rules SET name = ? WHERE id = ?")
            .bind(name)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(days) = body.retention_days {
        if days <= 0 {
            return Err(AppError::BadRequest("retention_days must be > 0".into()));
        }
        sqlx::query("UPDATE retention_rules SET retention_days = ? WHERE id = ?")
            .bind(days)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(enabled) = body.enabled {
        sqlx::query("UPDATE retention_rules SET enabled = ? WHERE id = ?")
            .bind(enabled)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    let row = sqlx::query_as::<_, RetentionRuleRow>(
        "SELECT id, name, table_name, timestamp_column, retention_days, enabled, created_at, updated_at
         FROM retention_rules WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

async fn run_retention_cleanup_now(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<StatusCode> {
    compliance::run_retention_cleanup(&state.pool)
        .await
        .map_err(AppError::Internal)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_pictogram_prefetch_settings(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<pictograms::PictogramPrefetchSettingsDto>> {
    let settings = pictograms::get_prefetch_settings(&state.pool, &state.config).await?;
    Ok(Json(settings))
}

async fn update_pictogram_prefetch_settings(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Json(body): Json<UpdatePictogramPrefetchBody>,
) -> AppResult<Json<pictograms::PictogramPrefetchSettingsDto>> {
    let settings = pictograms::update_prefetch_settings(
        &state.pool,
        &state.config,
        body.enabled,
        body.idle_minutes,
        body.batch_size,
    )
    .await?;
    Ok(Json(settings))
}

async fn run_pictogram_prefetch_now(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<pictograms::PictogramPrefetchRunResultDto>> {
    let result = pictograms::run_prefetch_now(&state.pool, &state.config).await?;
    Ok(Json(result))
}

async fn list_breach_logs(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<Vec<BreachLogRow>>> {
    let rows = sqlx::query_as::<_, BreachLogRow>(
        "SELECT id, detected_at, reported_at, severity, status, title, description,
                affected_records, authority_notified, data_subjects_notified,
                created_by, created_at, updated_at
         FROM breach_logs
         ORDER BY detected_at DESC
         LIMIT 500",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

async fn create_breach_log(
    State(state): State<AppState>,
    Extension(admin): Extension<AuthUser>,
    Json(body): Json<CreateBreachLogBody>,
) -> AppResult<(StatusCode, Json<BreachLogRow>)> {
    if !matches!(body.severity.as_str(), "low" | "medium" | "high" | "critical") {
        return Err(AppError::BadRequest("Invalid severity".into()));
    }

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO breach_logs
            (id, severity, status, title, description, affected_records, authority_notified,
             data_subjects_notified, created_by)
         VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.severity)
    .bind(&body.title)
    .bind(&body.description)
    .bind(body.affected_records)
    .bind(body.authority_notified.unwrap_or(false))
    .bind(body.data_subjects_notified.unwrap_or(false))
    .bind(&admin.user_id)
    .execute(&state.pool)
    .await?;

    let row = sqlx::query_as::<_, BreachLogRow>(
        "SELECT id, detected_at, reported_at, severity, status, title, description,
                affected_records, authority_notified, data_subjects_notified,
                created_by, created_at, updated_at
         FROM breach_logs WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn update_breach_log(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateBreachLogBody>,
) -> AppResult<Json<BreachLogRow>> {
    if let Some(severity) = &body.severity {
        if !matches!(severity.as_str(), "low" | "medium" | "high" | "critical") {
            return Err(AppError::BadRequest("Invalid severity".into()));
        }
        sqlx::query("UPDATE breach_logs SET severity = ? WHERE id = ?")
            .bind(severity)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(status) = &body.status {
        if !matches!(status.as_str(), "open" | "investigating" | "contained" | "resolved") {
            return Err(AppError::BadRequest("Invalid status".into()));
        }
        sqlx::query("UPDATE breach_logs SET status = ? WHERE id = ?")
            .bind(status)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.title {
        sqlx::query("UPDATE breach_logs SET title = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.description {
        sqlx::query("UPDATE breach_logs SET description = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.affected_records {
        sqlx::query("UPDATE breach_logs SET affected_records = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.authority_notified {
        sqlx::query("UPDATE breach_logs SET authority_notified = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.data_subjects_notified {
        sqlx::query("UPDATE breach_logs SET data_subjects_notified = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.reported_at {
        sqlx::query("UPDATE breach_logs SET reported_at = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    let row = sqlx::query_as::<_, BreachLogRow>(
        "SELECT id, detected_at, reported_at, severity, status, title, description,
                affected_records, authority_notified, data_subjects_notified,
                created_by, created_at, updated_at
         FROM breach_logs WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

async fn list_subprocessors(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<Vec<SubprocessorRow>>> {
    let rows = sqlx::query_as::<_, SubprocessorRow>(
        "SELECT id, provider, purpose, location, dpa_signed_date, transfer_basis,
                notes, is_active, created_at, updated_at
         FROM subprocessor_register
         ORDER BY provider",
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(rows))
}

async fn create_subprocessor(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Json(body): Json<CreateSubprocessorBody>,
) -> AppResult<(StatusCode, Json<SubprocessorRow>)> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO subprocessor_register
            (id, provider, purpose, location, dpa_signed_date, transfer_basis, notes, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.provider)
    .bind(&body.purpose)
    .bind(&body.location)
    .bind(&body.dpa_signed_date)
    .bind(&body.transfer_basis)
    .bind(&body.notes)
    .bind(body.is_active.unwrap_or(true))
    .execute(&state.pool)
    .await?;

    let row = sqlx::query_as::<_, SubprocessorRow>(
        "SELECT id, provider, purpose, location, dpa_signed_date, transfer_basis,
                notes, is_active, created_at, updated_at
         FROM subprocessor_register WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn update_subprocessor(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateSubprocessorBody>,
) -> AppResult<Json<SubprocessorRow>> {
    if let Some(v) = &body.provider {
        sqlx::query("UPDATE subprocessor_register SET provider = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.purpose {
        sqlx::query("UPDATE subprocessor_register SET purpose = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.location {
        sqlx::query("UPDATE subprocessor_register SET location = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.dpa_signed_date {
        sqlx::query("UPDATE subprocessor_register SET dpa_signed_date = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.transfer_basis {
        sqlx::query("UPDATE subprocessor_register SET transfer_basis = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = &body.notes {
        sqlx::query("UPDATE subprocessor_register SET notes = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    if let Some(v) = body.is_active {
        sqlx::query("UPDATE subprocessor_register SET is_active = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    let row = sqlx::query_as::<_, SubprocessorRow>(
        "SELECT id, provider, purpose, location, dpa_signed_date, transfer_basis,
                notes, is_active, created_at, updated_at
         FROM subprocessor_register WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

async fn delete_subprocessor(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let affected = sqlx::query("DELETE FROM subprocessor_register WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?
        .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}
