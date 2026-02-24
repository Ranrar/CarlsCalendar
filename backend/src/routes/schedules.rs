//! `/schedules` routes — CRUD for weekly schedules and their activity cards.
//! Backed by visual support templates + template activities.

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    middleware::auth_guard::AuthUser,
    models::UserRole,
    state::AppState,
};

const WEEKLY_TYPE: &str = "WEEKLY_SCHEDULE";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/schedules", get(list_schedules).post(create_schedule))
        .route("/schedules/templates", get(list_templates))
        .route("/schedules/templates/{id}", get(get_template))
        .route("/schedules/templates/{id}/copy", post(copy_template))
        .route("/schedules/{id}", get(get_schedule).put(update_schedule).delete(delete_schedule))
        .route("/schedules/{id}/status", patch(update_status))
        .route("/schedules/{id}/activity-cards", get(list_activity_cards).post(add_activity_card))
        .route("/schedules/{id}/activity-cards/reorder", patch(reorder_activity_cards))
        .route("/schedules/{id}/activity-cards/{card_id}", put(update_activity_card).delete(delete_activity_card))
}

#[derive(sqlx::FromRow, Serialize)]
struct ScheduleRow {
    id: String,
    owner_id: String,
    child_id: Option<String>,
    name: String,
    status: String,
    is_template: bool,
}

#[derive(sqlx::FromRow)]
struct ScheduleListRow {
    id: String,
    owner_id: String,
    child_id: Option<String>,
    name: String,
    status: String,
    is_template: bool,
    used_by_children: Option<String>,
    activity_card_count: i64,
}

#[derive(Serialize)]
struct ScheduleListItem {
    id: String,
    owner_id: String,
    child_id: Option<String>,
    name: String,
    status: String,
    is_template: bool,
    used_by_children: Vec<String>,
    activity_card_count: i64,
}

#[derive(sqlx::FromRow, Serialize, Clone)]
struct ActivityCardRow {
    id: String,
    schedule_id: String,
    activity_card_id: Option<String>,
    title: String,
    description: Option<String>,
    picture_path: Option<String>,
    start_time: String,
    end_time: Option<String>,
    sort_order: i32,
}

#[derive(Serialize)]
struct ScheduleWithActivityCards {
    #[serde(flatten)]
    schedule: ScheduleRow,
    activity_cards: Vec<ActivityCardRow>,
}

#[derive(Deserialize)]
struct CreateScheduleBody {
    name: String,
    child_id: Option<String>,
}

#[derive(Deserialize)]
struct UpdateScheduleBody {
    name: Option<String>,
    child_id: Option<String>,
}

#[derive(Deserialize)]
struct UpdateStatusBody {
    status: String,
}

#[derive(Deserialize)]
struct CreateActivityCardBody {
    activity_card_id: Option<String>,
    title: String,
    description: Option<String>,
    picture_path: Option<String>,
    start_time: String,
    end_time: Option<String>,
    sort_order: Option<i32>,
}

#[derive(Deserialize)]
struct UpdateActivityCardBody {
    activity_card_id: Option<String>,
    title: Option<String>,
    description: Option<String>,
    picture_path: Option<String>,
    start_time: Option<String>,
    end_time: Option<String>,
    sort_order: Option<i32>,
}

#[derive(Deserialize)]
struct ReorderBody {
    activity_card_ids: Vec<String>,
}

fn schedule_metadata_json(
    status: &str,
    is_template: bool,
    child_id: Option<&str>,
    source_template_id: Option<&str>,
) -> AppResult<String> {
    serde_json::to_string(&json!({
        "layout": {
            "type": WEEKLY_TYPE,
            "columns": 1,
            "slotCount": 10
        },
        "schedule": {
            "status": status,
            "is_template": is_template,
            "child_id": child_id,
            "source_template_id": source_template_id
        }
    }))
    .map_err(|_| AppError::BadRequest("Invalid schedule metadata".into()))
}

async fn assert_owns_schedule(
    pool: &crate::db::Db,
    schedule_id: &str,
    caller: &AuthUser,
) -> AppResult<()> {
    if caller.role == UserRole::Admin {
        return Ok(());
    }

    let is_mine: bool = sqlx::query_scalar(
        "SELECT EXISTS(
            SELECT 1
            FROM visual_support_documents_templates
            WHERE id = ?
              AND document_type = ?
              AND owner_id = ?
        )",
    )
    .bind(schedule_id)
    .bind(WEEKLY_TYPE)
    .bind(&caller.user_id)
    .fetch_one(pool)
    .await?;

    if !is_mine {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

async fn assert_owns_child_if_set(
    pool: &crate::db::Db,
    child_id: &Option<String>,
    caller: &AuthUser,
) -> AppResult<()> {
    let Some(child_id) = child_id else {
        return Ok(());
    };

    if child_id.trim().is_empty() {
        return Err(AppError::BadRequest("child_id cannot be empty".into()));
    }

    let exists: bool = if caller.role == UserRole::Admin {
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM child_profiles WHERE id = ?)")
            .bind(child_id)
            .fetch_one(pool)
            .await?
    } else {
        sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM child_profiles WHERE id = ? AND parent_id = ?)",
        )
        .bind(child_id)
        .bind(&caller.user_id)
        .fetch_one(pool)
        .await?
    };

    if !exists {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

async fn get_schedule_row(pool: &crate::db::Db, id: &str) -> AppResult<ScheduleRow> {
    sqlx::query_as::<_, ScheduleRow>(
        "SELECT
            t.id,
            COALESCE(t.owner_id, '') AS owner_id,
                        CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
            t.name,
                        CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
            IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template
         FROM visual_support_documents_templates t
         WHERE t.id = ?
           AND t.document_type = ?",
    )
    .bind(id)
    .bind(WEEKLY_TYPE)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

async fn load_activity_cards_for_schedule(
    pool: &crate::db::Db,
    schedule_id: &str,
) -> AppResult<Vec<ActivityCardRow>> {
    let rows: Vec<ActivityCardRow> = sqlx::query_as::<_, ActivityCardRow>(
        "SELECT
            vta.id,
            ? AS schedule_id,
            vta.activity_card_id,
            COALESCE(NULLIF(vta.text_label, ''), vsa.label_text) AS title,
            vta.optional_notes AS description,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.picture_path')), ''), vsa.local_image_path) AS CHAR(500)) AS picture_path,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.start_time')), ''), '08:00') AS CHAR(5)) AS start_time,
            CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.end_time')), '') AS CHAR(5)) AS end_time,
            vta.activity_order AS sort_order
         FROM visual_support_template_activities vta
         LEFT JOIN visual_support_activity_library vsa ON vsa.id = vta.activity_card_id
         WHERE vta.template_id = ?
         ORDER BY vta.activity_order",
    )
    .bind(schedule_id)
    .bind(schedule_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

async fn list_schedules(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> AppResult<Json<Vec<ScheduleListItem>>> {
    let pool = &state.pool;

    let rows: Vec<ScheduleListRow> = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ScheduleListRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template,
                (
                    SELECT COUNT(*)
                    FROM visual_support_template_activities vta
                    WHERE vta.template_id = t.id
                ) AS activity_card_count,
                (
                    SELECT GROUP_CONCAT(DISTINCT cp.display_name ORDER BY cp.display_name SEPARATOR '||')
                    FROM child_profiles cp
                    LEFT JOIN visual_support_documents d
                        ON d.child_id = cp.id
                       AND d.template_id = t.id
                       AND d.document_type = ?
                    WHERE cp.parent_id = t.owner_id
                                            AND (cp.id = CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) OR d.id IS NOT NULL)
                ) AS used_by_children
             FROM visual_support_documents_templates t
             WHERE t.document_type = ?
               AND IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 0
               AND t.is_system = 0
             ORDER BY t.name",
        )
        .bind(WEEKLY_TYPE)
        .bind(WEEKLY_TYPE)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, ScheduleListRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template,
                (
                    SELECT COUNT(*)
                    FROM visual_support_template_activities vta
                    WHERE vta.template_id = t.id
                ) AS activity_card_count,
                (
                    SELECT GROUP_CONCAT(DISTINCT cp.display_name ORDER BY cp.display_name SEPARATOR '||')
                    FROM child_profiles cp
                    LEFT JOIN visual_support_documents d
                        ON d.child_id = cp.id
                       AND d.template_id = t.id
                       AND d.document_type = ?
                    WHERE cp.parent_id = t.owner_id
                                            AND (cp.id = CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) OR d.id IS NOT NULL)
                ) AS used_by_children
             FROM visual_support_documents_templates t
             WHERE t.document_type = ?
               AND t.owner_id = ?
               AND IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 0
               AND t.is_system = 0
             ORDER BY t.name",
        )
        .bind(WEEKLY_TYPE)
        .bind(WEEKLY_TYPE)
        .bind(&user.user_id)
        .fetch_all(pool)
        .await?
    };

    let items = rows
        .into_iter()
        .map(|r| ScheduleListItem {
            id: r.id,
            owner_id: r.owner_id,
            child_id: r.child_id,
            name: r.name,
            status: r.status,
            is_template: r.is_template,
            activity_card_count: r.activity_card_count,
            used_by_children: r
                .used_by_children
                .unwrap_or_default()
                .split("||")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToString::to_string)
                .collect(),
        })
        .collect();

    Ok(Json(items))
}

async fn create_schedule(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<CreateScheduleBody>,
) -> AppResult<(StatusCode, Json<ScheduleRow>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_child_if_set(pool, &body.child_id, &user).await?;

    let id = Uuid::new_v4().to_string();
    let metadata = schedule_metadata_json("inactive", false, body.child_id.as_deref(), None)?;

    sqlx::query(
        "INSERT INTO visual_support_documents_templates
            (id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json)
         VALUES (?, ?, ?, NULL, ?, 'CUSTOM', 'en', 0, ?)",
    )
    .bind(&id)
    .bind(&user.user_id)
    .bind(&body.name)
    .bind(WEEKLY_TYPE)
    .bind(metadata)
    .execute(pool)
    .await?;

    let row = get_schedule_row(pool, &id).await?;
    Ok((StatusCode::CREATED, Json(row)))
}

async fn list_templates(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> AppResult<Json<Vec<ScheduleRow>>> {
    let pool = &state.pool;

    let rows: Vec<ScheduleRow> = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template
             FROM visual_support_documents_templates t
             WHERE t.document_type = ?
               AND (t.is_system = 1 OR IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 1)
             ORDER BY t.name",
        )
        .bind(WEEKLY_TYPE)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template
             FROM visual_support_documents_templates t
             WHERE t.document_type = ?
               AND (
                    t.is_system = 1
                    OR (t.owner_id = ? AND IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 1)
               )
             ORDER BY t.name",
        )
        .bind(WEEKLY_TYPE)
        .bind(&user.user_id)
        .fetch_all(pool)
        .await?
    };

    Ok(Json(rows))
}

async fn copy_template(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(template_id): Path<String>,
) -> AppResult<(StatusCode, Json<ScheduleRow>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;

    let tmpl: ScheduleRow = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template
             FROM visual_support_documents_templates t
             WHERE t.id = ?
               AND t.document_type = ?
               AND (t.is_system = 1 OR IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 1)",
        )
        .bind(&template_id)
        .bind(WEEKLY_TYPE)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    } else {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template
             FROM visual_support_documents_templates t
             WHERE t.id = ?
               AND t.document_type = ?
               AND (t.is_system = 1 OR (t.owner_id = ? AND IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 1))",
        )
        .bind(&template_id)
        .bind(WEEKLY_TYPE)
        .bind(&user.user_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    };

    let new_id = Uuid::new_v4().to_string();
    let metadata = schedule_metadata_json("inactive", false, None, Some(&template_id))?;

    sqlx::query(
        "INSERT INTO visual_support_documents_templates
            (id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json)
         VALUES (?, ?, ?, NULL, ?, 'CUSTOM', 'en', 0, ?)",
    )
    .bind(&new_id)
    .bind(&user.user_id)
    .bind(&tmpl.name)
    .bind(WEEKLY_TYPE)
    .bind(metadata)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO visual_support_template_activities
            (id, template_id, activity_order, activity_card_id, pictogram_id, text_label, optional_notes, metadata_json)
         SELECT
            UUID(),
            ?,
            activity_order,
            activity_card_id,
            pictogram_id,
            text_label,
            optional_notes,
            metadata_json
         FROM visual_support_template_activities
         WHERE template_id = ?
         ORDER BY activity_order",
    )
    .bind(&new_id)
    .bind(&template_id)
    .execute(pool)
    .await?;

    let row = get_schedule_row(pool, &new_id).await?;
    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_template(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<ScheduleWithActivityCards>> {
    let pool = &state.pool;

    let sched: ScheduleRow = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template
             FROM visual_support_documents_templates t
             WHERE t.id = ?
               AND t.document_type = ?
               AND (t.is_system = 1 OR IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 1)",
        )
        .bind(&id)
        .bind(WEEKLY_TYPE)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    } else {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT
                t.id,
                COALESCE(t.owner_id, '') AS owner_id,
                CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.child_id')), '') AS CHAR(36)) AS child_id,
                t.name,
                CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.metadata_json, '$.schedule.status')), ''), 'inactive') AS CHAR(20)) AS status,
                IF(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true OR t.is_system = 1, 1, 0) AS is_template
             FROM visual_support_documents_templates t
             WHERE t.id = ?
               AND t.document_type = ?
               AND (t.is_system = 1 OR (t.owner_id = ? AND IFNULL(JSON_EXTRACT(t.metadata_json, '$.schedule.is_template') = true, 0) = 1))",
        )
        .bind(&id)
        .bind(WEEKLY_TYPE)
        .bind(&user.user_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    };

    let activity_cards = load_activity_cards_for_schedule(pool, &id).await?;
    Ok(Json(ScheduleWithActivityCards { schedule: sched, activity_cards }))
}

async fn get_schedule(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<ScheduleWithActivityCards>> {
    let pool = &state.pool;
    let sched = get_schedule_row(pool, &id).await?;

    if user.role != UserRole::Admin && sched.owner_id != user.user_id {
        return Err(AppError::Forbidden);
    }

    let activity_cards = load_activity_cards_for_schedule(pool, &id).await?;
    Ok(Json(ScheduleWithActivityCards { schedule: sched, activity_cards }))
}

async fn update_schedule(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateScheduleBody>,
) -> AppResult<Json<ScheduleRow>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &id, &user).await?;
    assert_owns_child_if_set(pool, &body.child_id, &user).await?;

    if let Some(name) = &body.name {
        sqlx::query("UPDATE visual_support_documents_templates SET name = ? WHERE id = ?")
            .bind(name)
            .bind(&id)
            .execute(pool)
            .await?;
    }

    if let Some(child_id) = &body.child_id {
        sqlx::query(
            "UPDATE visual_support_documents_templates
             SET metadata_json = JSON_SET(COALESCE(metadata_json, JSON_OBJECT()), '$.schedule.child_id', ?)
             WHERE id = ?",
        )
        .bind(child_id)
        .bind(&id)
        .execute(pool)
        .await?;
    }

    let row = get_schedule_row(pool, &id).await?;
    Ok(Json(row))
}

async fn delete_schedule(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &id, &user).await?;

    let mut tx = pool.begin().await?;

    // Remove any child-day assignment documents pointing to this schedule.
    sqlx::query(
        "DELETE FROM visual_support_documents
         WHERE template_id = ?
           AND document_type = ?",
    )
    .bind(&id)
    .bind(WEEKLY_TYPE)
    .execute(&mut *tx)
    .await?;

    // Hard-delete the schedule template itself.
    // For non-admin users, enforce ownership in SQL as an extra safety guard.
    let result = if user.role == UserRole::Admin {
        sqlx::query(
            "DELETE FROM visual_support_documents_templates
             WHERE id = ?
               AND document_type = ?
               AND is_system = 0",
        )
        .bind(&id)
        .bind(WEEKLY_TYPE)
        .execute(&mut *tx)
        .await?
    } else {
        sqlx::query(
            "DELETE FROM visual_support_documents_templates
             WHERE id = ?
               AND owner_id = ?
               AND document_type = ?
               AND is_system = 0",
        )
        .bind(&id)
        .bind(&user.user_id)
        .bind(WEEKLY_TYPE)
        .execute(&mut *tx)
        .await?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn update_status(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusBody>,
) -> AppResult<Json<ScheduleRow>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let valid = matches!(body.status.as_str(), "active" | "inactive" | "archived");
    if !valid {
        return Err(AppError::BadRequest("Invalid status value".into()));
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &id, &user).await?;

    sqlx::query(
        "UPDATE visual_support_documents_templates
         SET metadata_json = JSON_SET(COALESCE(metadata_json, JSON_OBJECT()), '$.schedule.status', ?)
         WHERE id = ?",
    )
    .bind(&body.status)
    .bind(&id)
    .execute(pool)
    .await?;

    let row = get_schedule_row(pool, &id).await?;
    Ok(Json(row))
}

async fn list_activity_cards(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<ActivityCardRow>>> {
    let pool = &state.pool;
    let sched = get_schedule_row(pool, &id).await?;

    if user.role != UserRole::Admin && sched.owner_id != user.user_id {
        return Err(AppError::Forbidden);
    }

    let activity_cards = load_activity_cards_for_schedule(pool, &id).await?;
    Ok(Json(activity_cards))
}

async fn add_activity_card(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(schedule_id): Path<String>,
    Json(body): Json<CreateActivityCardBody>,
) -> AppResult<(StatusCode, Json<ActivityCardRow>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &schedule_id, &user).await?;

    let sort_order = if let Some(o) = body.sort_order {
        o
    } else {
        let max: Option<i32> = sqlx::query_scalar(
            "SELECT MAX(activity_order) FROM visual_support_template_activities WHERE template_id = ?",
        )
        .bind(&schedule_id)
        .fetch_one(pool)
        .await?;
        max.unwrap_or(-1) + 1
    };

    let owner_id: String = sqlx::query_scalar(
        "SELECT owner_id FROM visual_support_documents_templates WHERE id = ?",
    )
    .bind(&schedule_id)
    .fetch_one(pool)
    .await?;

    let resolved_activity_card_id = if let Some(activity_card_id) = body.activity_card_id.clone() {
        let allowed: bool = sqlx::query_scalar(
            "SELECT EXISTS(
                SELECT 1
                FROM visual_support_activity_library
                WHERE id = ?
                  AND (is_system = 1 OR owner_id = ?)
            )",
        )
        .bind(&activity_card_id)
        .bind(&owner_id)
        .fetch_one(pool)
        .await?;

        if !allowed {
            return Err(AppError::Forbidden);
        }
        Some(activity_card_id)
    } else {
        let label = body.title.trim();
        if label.is_empty() {
            return Err(AppError::BadRequest("Activity card title is required".into()));
        }

        let existing: Option<String> = sqlx::query_scalar(
            "SELECT id
             FROM visual_support_activity_library
             WHERE owner_id = ? AND language = 'en' AND label_text = ?
             ORDER BY created_at ASC
             LIMIT 1",
        )
        .bind(&owner_id)
        .bind(label)
        .fetch_optional(pool)
        .await?;

        if let Some(id) = existing {
            id
        } else {
            let new_activity_card_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO visual_support_activity_library
                    (id, owner_id, language, label_text, local_image_path, is_system)
                 VALUES (?, ?, 'en', ?, ?, 0)",
            )
            .bind(&new_activity_card_id)
            .bind(&owner_id)
            .bind(label)
            .bind(body.picture_path.clone())
            .execute(pool)
            .await?;
            new_activity_card_id
        }
        .into()
    };

    let mut metadata: Value = json!({
        "start_time": body.start_time,
    });
    if let Some(end_time) = &body.end_time {
        metadata["end_time"] = Value::String(end_time.clone());
    }
    if let Some(picture_path) = &body.picture_path {
        metadata["picture_path"] = Value::String(picture_path.clone());
    }
    let metadata_json = serde_json::to_string(&metadata)
        .map_err(|_| AppError::BadRequest("Invalid metadata JSON".into()))?;

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO visual_support_template_activities
            (id, template_id, activity_order, activity_card_id, pictogram_id, text_label, optional_notes, metadata_json)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&schedule_id)
    .bind(sort_order)
    .bind(resolved_activity_card_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(metadata_json)
    .execute(pool)
    .await?;

    let card: ActivityCardRow = sqlx::query_as::<_, ActivityCardRow>(
        "SELECT
            vta.id,
            ? AS schedule_id,
            vta.activity_card_id,
            COALESCE(NULLIF(vta.text_label, ''), vsa.label_text) AS title,
            vta.optional_notes AS description,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.picture_path')), ''), vsa.local_image_path) AS CHAR(500)) AS picture_path,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.start_time')), ''), '08:00') AS CHAR(5)) AS start_time,
            CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.end_time')), '') AS CHAR(5)) AS end_time,
            vta.activity_order AS sort_order
         FROM visual_support_template_activities vta
         LEFT JOIN visual_support_activity_library vsa ON vsa.id = vta.activity_card_id
         WHERE vta.id = ?",
    )
    .bind(&schedule_id)
    .bind(&id)
    .fetch_one(pool)
    .await?;

    Ok((StatusCode::CREATED, Json(card)))
}

async fn reorder_activity_cards(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(schedule_id): Path<String>,
    Json(body): Json<ReorderBody>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &schedule_id, &user).await?;

    for (i, card_id) in body.activity_card_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE visual_support_template_activities
             SET activity_order = ?
             WHERE id = ? AND template_id = ?",
        )
        .bind(i as i32)
        .bind(card_id)
        .bind(&schedule_id)
        .execute(pool)
        .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn update_activity_card(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((schedule_id, card_id)): Path<(String, String)>,
    Json(body): Json<UpdateActivityCardBody>,
) -> AppResult<Json<ActivityCardRow>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &schedule_id, &user).await?;

    let existing_metadata: Option<String> = sqlx::query_scalar(
        "SELECT CAST(metadata_json AS CHAR)
         FROM visual_support_template_activities
         WHERE id = ? AND template_id = ?",
    )
    .bind(&card_id)
    .bind(&schedule_id)
    .fetch_optional(pool)
    .await?;

    let mut metadata: Value = existing_metadata
        .as_deref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .unwrap_or_else(|| json!({}));

    if let Some(v) = &body.picture_path {
        metadata["picture_path"] = Value::String(v.clone());
    }
    if let Some(v) = &body.start_time {
        metadata["start_time"] = Value::String(v.clone());
    }
    if let Some(v) = &body.end_time {
        metadata["end_time"] = Value::String(v.clone());
    }

    let metadata_json = serde_json::to_string(&metadata)
        .map_err(|_| AppError::BadRequest("Invalid metadata JSON".into()))?;

    if let Some(v) = &body.title {
        sqlx::query(
            "UPDATE visual_support_template_activities
             SET text_label = ?
             WHERE id = ? AND template_id = ?",
        )
        .bind(v)
        .bind(&card_id)
        .bind(&schedule_id)
        .execute(pool)
        .await?;
    }

    if let Some(v) = &body.description {
        sqlx::query(
            "UPDATE visual_support_template_activities
             SET optional_notes = ?
             WHERE id = ? AND template_id = ?",
        )
        .bind(v)
        .bind(&card_id)
        .bind(&schedule_id)
        .execute(pool)
        .await?;
    }

    if body.picture_path.is_some() || body.start_time.is_some() || body.end_time.is_some() {
        sqlx::query(
            "UPDATE visual_support_template_activities
             SET metadata_json = ?
             WHERE id = ? AND template_id = ?",
        )
        .bind(metadata_json)
        .bind(&card_id)
        .bind(&schedule_id)
        .execute(pool)
        .await?;
    }

    if let Some(v) = body.sort_order {
        sqlx::query(
            "UPDATE visual_support_template_activities
             SET activity_order = ?
             WHERE id = ? AND template_id = ?",
        )
        .bind(v)
        .bind(&card_id)
        .bind(&schedule_id)
        .execute(pool)
        .await?;
    }

    if let Some(v) = &body.activity_card_id {
        sqlx::query(
            "UPDATE visual_support_template_activities
             SET activity_card_id = ?
             WHERE id = ? AND template_id = ?",
        )
        .bind(v)
        .bind(&card_id)
        .bind(&schedule_id)
        .execute(pool)
        .await?;
    }

    let card: ActivityCardRow = sqlx::query_as::<_, ActivityCardRow>(
        "SELECT
            vta.id,
            ? AS schedule_id,
            vta.activity_card_id,
            COALESCE(NULLIF(vta.text_label, ''), vsa.label_text) AS title,
            vta.optional_notes AS description,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.picture_path')), ''), vsa.local_image_path) AS CHAR(500)) AS picture_path,
            CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.start_time')), ''), '08:00') AS CHAR(5)) AS start_time,
            CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vta.metadata_json, '$.end_time')), '') AS CHAR(5)) AS end_time,
            vta.activity_order AS sort_order
         FROM visual_support_template_activities vta
         LEFT JOIN visual_support_activity_library vsa ON vsa.id = vta.activity_card_id
         WHERE vta.id = ? AND vta.template_id = ?",
    )
    .bind(&schedule_id)
    .bind(&card_id)
    .bind(&schedule_id)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(card))
}

async fn delete_activity_card(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((schedule_id, card_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &schedule_id, &user).await?;

    sqlx::query("DELETE FROM visual_support_template_activities WHERE id = ? AND template_id = ?")
        .bind(&card_id)
        .bind(&schedule_id)
        .execute(pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
