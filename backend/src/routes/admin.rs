//! `/admin` routes — administrative user management and template management.
//! All routes in this module require the `Admin` role (enforced via the
//! `require_admin` role-guard applied in `all_routes`).

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    middleware::{auth_guard::AuthUser, role_guard::require_admin},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    use axum::middleware;
    // require_admin reads Extension<AuthUser> (injected by require_auth in mod.rs);
    // it does not need AppState, so plain from_fn is sufficient.
    let admin_guard = middleware::from_fn(require_admin);
    Router::new()
        .route("/admin/users",         get(list_users))
        .route("/admin/users/{id}",     put(update_user).delete(delete_user))
        .route("/admin/templates",     get(list_templates).post(create_template))
        .route("/admin/templates/{id}", put(update_template).delete(delete_template))
        .route_layer(admin_guard)
}

// ── Row types ────────────────────────────────────────────────

#[derive(sqlx::FromRow, Serialize)]
struct UserRow {
    id:          String,
    email:       Option<String>,
    username:    Option<String>,
    role:        String,
    language:    String,
    parent_id:   Option<String>,
    is_verified: bool,
    is_active:   bool,
}

#[derive(sqlx::FromRow, Serialize)]
struct TemplateRow {
    id:      String,
    owner_id: String,
    name:    String,
    status:  String,
}

// ── Request bodies ───────────────────────────────────────────

#[derive(Deserialize)]
struct UpdateUserBody {
    is_active: Option<bool>,
    role:      Option<String>,
}

#[derive(Deserialize)]
struct CreateTemplateBody {
    name: String,
}

#[derive(Deserialize)]
struct UpdateTemplateBody {
    name: Option<String>,
}

// ── Handlers ─────────────────────────────────────────────────

async fn list_users(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<Vec<UserRow>>> {
    let pool = &state.pool;
    let rows: Vec<UserRow> = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, username, role, language, parent_id,
                is_verified, is_active
         FROM users
         WHERE deleted_at IS NULL
         ORDER BY role, username",
    )
    .fetch_all(pool).await?;
    Ok(Json(rows))
}

async fn update_user(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateUserBody>,
) -> AppResult<Json<UserRow>> {
    let pool = &state.pool;

    // Check user exists
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND deleted_at IS NULL)",
    )
    .bind(&id).fetch_one(pool).await?;
    if !exists { return Err(AppError::NotFound); }

    if let Some(v) = body.is_active {
        sqlx::query("UPDATE users SET is_active = ? WHERE id = ?")
            .bind(v).bind(&id).execute(pool).await?;
    }
    if let Some(ref role) = body.role {
        if !matches!(role.as_str(), "admin" | "parent" | "child") {
            return Err(AppError::BadRequest("Invalid role".into()));
        }
        sqlx::query("UPDATE users SET role = ? WHERE id = ?")
            .bind(role).bind(&id).execute(pool).await?;
    }
    let row: UserRow = sqlx::query_as::<_, UserRow>(
        "SELECT id, email, username, role, language, parent_id,
                is_verified, is_active
         FROM users WHERE id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
    Ok(Json(row))
}

async fn delete_user(
    State(state): State<AppState>,
    Extension(admin): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if id == admin.user_id {
        return Err(AppError::BadRequest("Cannot delete your own account".into()));
    }
    let pool = &state.pool;
    let affected = sqlx::query(
        "UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(&id).execute(pool).await?.rows_affected();
    if affected == 0 { return Err(AppError::NotFound); }
    Ok(StatusCode::NO_CONTENT)
}

async fn create_template(
    State(state): State<AppState>,
    Extension(admin): Extension<AuthUser>,
    Json(body): Json<CreateTemplateBody>,
) -> AppResult<(StatusCode, Json<TemplateRow>)> {
    let pool = &state.pool;
    let id = Uuid::new_v4().to_string();
    let metadata_json = serde_json::to_string(&serde_json::json!({
        "layout": {
            "type": "WEEKLY_SCHEDULE",
            "columns": 1,
            "slotCount": 10
        },
        "schedule": {
            "status": "active",
            "is_template": true,
            "child_id": null,
            "source_template_id": null
        }
    }))
    .map_err(|_| AppError::BadRequest("Invalid metadata JSON".into()))?;

    sqlx::query(
        "INSERT INTO visual_support_documents_templates
            (id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json)
         VALUES (?, ?, ?, NULL, 'DAILY_SCHEDULE', 'CUSTOM', 'en', 0, JSON_OBJECT())",
    )
    .bind(&id)
    .bind(&admin.user_id)
    .bind(&body.name)
    .execute(pool)
    .await?;

    sqlx::query(
        "UPDATE visual_support_documents_templates
         SET document_type = 'WEEKLY_SCHEDULE',
             is_system = 1,
             metadata_json = ?
         WHERE id = ?",
    )
    .bind(&metadata_json)
    .bind(&id)
    .execute(pool)
    .await?;

    let row: TemplateRow = sqlx::query_as::<_, TemplateRow>(
        "SELECT
            id,
            COALESCE(owner_id, '') AS owner_id,
            name,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status
         FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
    Ok((StatusCode::CREATED, Json(row)))
}

async fn list_templates(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
) -> AppResult<Json<Vec<TemplateRow>>> {
    let pool = &state.pool;
    let rows: Vec<TemplateRow> = sqlx::query_as::<_, TemplateRow>(
                "SELECT
                        id,
                        COALESCE(owner_id, '') AS owner_id,
                        name,
                    CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status
                 FROM visual_support_documents_templates
                 WHERE document_type = 'WEEKLY_SCHEDULE'
                     AND (is_system = 1 OR IFNULL(JSON_EXTRACT(metadata_json, '$.schedule.is_template') = true, 0) = 1)
         ORDER BY status, name",
    )
    .fetch_all(pool)
    .await?;
    Ok(Json(rows))
}

async fn update_template(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateTemplateBody>,
) -> AppResult<Json<TemplateRow>> {
    let pool = &state.pool;
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1
            FROM visual_support_documents_templates
            WHERE id = ?
              AND document_type = 'WEEKLY_SCHEDULE'
              AND (is_system = 1 OR IFNULL(JSON_EXTRACT(metadata_json, '$.schedule.is_template') = true, 0) = 1)
        )",
    )
    .bind(&id).fetch_one(pool).await?;
    if !exists { return Err(AppError::NotFound); }

    if let Some(name) = &body.name {
        sqlx::query("UPDATE visual_support_documents_templates SET name = ? WHERE id = ?")
            .bind(name).bind(&id).execute(pool).await?;
    }

    let row: TemplateRow = sqlx::query_as::<_, TemplateRow>(
        "SELECT
            id,
            COALESCE(owner_id, '') AS owner_id,
            name,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status
         FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
    Ok(Json(row))
}

async fn delete_template(
    State(state): State<AppState>,
    Extension(_admin): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let pool = &state.pool;
    let affected = sqlx::query(
                "UPDATE visual_support_documents_templates
                 SET metadata_json = JSON_SET(COALESCE(metadata_json, JSON_OBJECT()), '$.schedule.status', 'archived')
                 WHERE id = ?
                     AND document_type = 'WEEKLY_SCHEDULE'
                     AND (is_system = 1 OR IFNULL(JSON_EXTRACT(metadata_json, '$.schedule.is_template') = true, 0) = 1)",
    )
    .bind(&id)
    .execute(pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}
