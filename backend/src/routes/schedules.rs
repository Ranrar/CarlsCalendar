//! `/schedules` routes — CRUD for schedules and their items.

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, patch, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    middleware::auth_guard::AuthUser,
    models::UserRole,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/schedules",                          get(list_schedules).post(create_schedule))
        .route("/schedules/templates",                get(list_templates))
        .route("/schedules/templates/{id}",           get(get_template))
        .route("/schedules/templates/{id}/copy",      post(copy_template))
        .route("/schedules/{id}",                     get(get_schedule).put(update_schedule).delete(delete_schedule))
        .route("/schedules/{id}/status",              patch(update_status))
        .route("/schedules/{id}/items",               get(list_items).post(add_item))
        .route("/schedules/{id}/items/reorder",       patch(reorder_items))
        .route("/schedules/{id}/items/{item_id}",     put(update_item).delete(delete_item))
}

// ── Row types ────────────────────────────────────────────────

#[derive(sqlx::FromRow, Serialize)]
struct ScheduleRow {
    id:           String,
    owner_id:     String,
    child_id:     Option<String>,
    name:         String,
    status:       String,
    is_template:  bool,
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
    item_count: i64,
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
    item_count: i64,
}

#[derive(sqlx::FromRow, Serialize, Clone)]
struct ItemRow {
    id:           String,
    schedule_id:  String,
    title:        String,
    description:  Option<String>,
    picture_path: Option<String>,
    start_time:   String,
    end_time:     Option<String>,
    sort_order:   i32,
}

#[derive(Serialize)]
struct ScheduleWithItems {
    #[serde(flatten)]
    schedule: ScheduleRow,
    items: Vec<ItemRow>,
}

// ── Request bodies ───────────────────────────────────────────

#[derive(Deserialize)]
struct CreateScheduleBody {
    name:     String,
    child_id: Option<String>,
}

#[derive(Deserialize)]
struct UpdateScheduleBody {
    name:     Option<String>,
    child_id: Option<String>,
}

#[derive(Deserialize)]
struct UpdateStatusBody {
    status: String,
}

#[derive(Deserialize)]
struct CreateItemBody {
    title:        String,
    description:  Option<String>,
    picture_path: Option<String>,
    start_time:   String,
    end_time:     Option<String>,
    sort_order:   Option<i32>,
}

#[derive(Deserialize)]
struct UpdateItemBody {
    title:        Option<String>,
    description:  Option<String>,
    picture_path: Option<String>,
    start_time:   Option<String>,
    end_time:     Option<String>,
    sort_order:   Option<i32>,
}

#[derive(Deserialize)]
struct ReorderBody {
    // Ordered list of item IDs; we assign sort_order 0, 1, 2, ...
    item_ids: Vec<String>,
}

// ── Auth helper ──────────────────────────────────────────────

/// Verify caller owns the schedule. Admins bypass.
async fn assert_owns_schedule(
    pool: &crate::db::Db,
    schedule_id: &str,
    caller: &AuthUser,
) -> AppResult<()> {
    if caller.role == UserRole::Admin {
        return Ok(());
    }
    let is_mine: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM schedules WHERE id = ? AND owner_id = ?)",
    )
    .bind(schedule_id)
    .bind(&caller.user_id)
    .fetch_one(pool)
    .await?;
    if !is_mine {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

/// Validate that selected child belongs to caller (unless admin).
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

// ── Handlers ─────────────────────────────────────────────────

async fn list_schedules(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> AppResult<Json<Vec<ScheduleListItem>>> {
    let pool = &state.pool;
    let rows: Vec<ScheduleListRow> = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ScheduleListRow>(
            "SELECT
                s.id,
                s.owner_id,
                s.child_id,
                s.name,
                s.status,
                s.is_template,
                (
                    SELECT COUNT(*)
                    FROM schedule_items si
                    WHERE si.schedule_id = s.id
                ) AS item_count,
                (
                    SELECT GROUP_CONCAT(DISTINCT cp.display_name ORDER BY cp.display_name SEPARATOR '||')
                    FROM child_profiles cp
                    LEFT JOIN schedule_day_assignments a ON a.child_id = cp.id AND a.schedule_id = s.id
                    WHERE cp.parent_id = s.owner_id
                      AND (cp.id = s.child_id OR a.id IS NOT NULL)
                ) AS used_by_children
             FROM schedules s
             WHERE s.is_template = 0
             ORDER BY s.name",
        )
        .fetch_all(pool).await?
    } else {
        sqlx::query_as::<_, ScheduleListRow>(
            "SELECT
                s.id,
                s.owner_id,
                s.child_id,
                s.name,
                s.status,
                s.is_template,
                (
                    SELECT COUNT(*)
                    FROM schedule_items si
                    WHERE si.schedule_id = s.id
                ) AS item_count,
                (
                    SELECT GROUP_CONCAT(DISTINCT cp.display_name ORDER BY cp.display_name SEPARATOR '||')
                    FROM child_profiles cp
                    LEFT JOIN schedule_day_assignments a ON a.child_id = cp.id AND a.schedule_id = s.id
                    WHERE cp.parent_id = s.owner_id
                      AND (cp.id = s.child_id OR a.id IS NOT NULL)
                ) AS used_by_children
             FROM schedules s
             WHERE s.owner_id = ? AND s.is_template = 0
             ORDER BY s.name",
        )
        .bind(&user.user_id)
        .fetch_all(pool).await?
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
            item_count: r.item_count,
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
    sqlx::query(
        "INSERT INTO schedules (id, owner_id, child_id, name, status, is_template)
         VALUES (?, ?, ?, ?, 'inactive', 0)",
    )
    .bind(&id).bind(&user.user_id).bind(&body.child_id).bind(&body.name)
    .execute(pool).await?;

    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        "SELECT id, owner_id, child_id, name, status, is_template FROM schedules WHERE id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
    Ok((StatusCode::CREATED, Json(row)))
}

async fn list_templates(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> AppResult<Json<Vec<ScheduleRow>>> {
    let pool = &state.pool;
    let rows: Vec<ScheduleRow> = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT id, owner_id, child_id, name, status, is_template
             FROM schedules WHERE is_template = 1 ORDER BY name",
        )
        .fetch_all(pool).await?
    } else {
        // Parents see their own templates + system templates (owner is admin)
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT s.id, s.owner_id, s.child_id, s.name, s.status, s.is_template
             FROM schedules s
             JOIN users u ON u.id = s.owner_id
             WHERE s.is_template = 1
               AND (s.owner_id = ? OR u.role = 'admin')
             ORDER BY s.name",
        )
        .bind(&user.user_id)
        .fetch_all(pool).await?
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
            "SELECT id, owner_id, child_id, name, status, is_template
             FROM schedules WHERE id = ? AND is_template = 1",
        )
        .bind(&template_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    } else {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT s.id, s.owner_id, s.child_id, s.name, s.status, s.is_template
             FROM schedules s
             JOIN users u ON u.id = s.owner_id
             WHERE s.id = ?
               AND s.is_template = 1
               AND (s.owner_id = ? OR u.role = 'admin')",
        )
        .bind(&template_id)
        .bind(&user.user_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    };

    let new_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO schedules (id, owner_id, child_id, name, status, is_template, source_template_id)
         VALUES (?, ?, NULL, ?, 'inactive', 0, ?)",
    )
    .bind(&new_id).bind(&user.user_id).bind(&tmpl.name).bind(&template_id)
    .execute(pool).await?;

    // Copy items
    let items: Vec<ItemRow> = sqlx::query_as::<_, ItemRow>(
        "SELECT id, schedule_id, title, description, picture_path,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                sort_order
         FROM schedule_items WHERE schedule_id = ? ORDER BY sort_order",
    )
    .bind(&template_id).fetch_all(pool).await?;

    for item in &items {
        sqlx::query(
            "INSERT INTO schedule_items (id, schedule_id, title, description, picture_path, start_time, end_time, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(Uuid::new_v4().to_string()).bind(&new_id)
        .bind(&item.title).bind(&item.description).bind(&item.picture_path)
        .bind(&item.start_time).bind(&item.end_time).bind(item.sort_order)
        .execute(pool).await?;
    }

    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        "SELECT id, owner_id, child_id, name, status, is_template FROM schedules WHERE id = ?",
    )
    .bind(&new_id).fetch_one(pool).await?;
    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_template(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<ScheduleWithItems>> {
    let pool = &state.pool;
    let sched: ScheduleRow = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT id, owner_id, child_id, name, status, is_template
             FROM schedules WHERE id = ? AND is_template = 1",
        )
        .bind(&id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    } else {
        sqlx::query_as::<_, ScheduleRow>(
            "SELECT s.id, s.owner_id, s.child_id, s.name, s.status, s.is_template
             FROM schedules s
             JOIN users u ON u.id = s.owner_id
             WHERE s.id = ?
               AND s.is_template = 1
               AND (s.owner_id = ? OR u.role = 'admin')",
        )
        .bind(&id)
        .bind(&user.user_id)
        .fetch_optional(pool)
        .await?
        .ok_or(AppError::NotFound)?
    };

    let items: Vec<ItemRow> = sqlx::query_as::<_, ItemRow>(
        "SELECT id, schedule_id, title, description, picture_path,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                sort_order
         FROM schedule_items WHERE schedule_id = ? ORDER BY sort_order",
    )
    .bind(&id).fetch_all(pool).await?;

    Ok(Json(ScheduleWithItems { schedule: sched, items }))
}

async fn get_schedule(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<ScheduleWithItems>> {
    let pool = &state.pool;
    let sched: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        "SELECT id, owner_id, child_id, name, status, is_template FROM schedules WHERE id = ?",
    )
    .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    // Ownership: admin sees all; others can only see their own
    if user.role != UserRole::Admin && sched.owner_id != user.user_id {
        return Err(AppError::Forbidden);
    }

    let items: Vec<ItemRow> = sqlx::query_as::<_, ItemRow>(
        "SELECT id, schedule_id, title, description, picture_path,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                sort_order
         FROM schedule_items WHERE schedule_id = ? ORDER BY sort_order",
    )
    .bind(&id).fetch_all(pool).await?;

    Ok(Json(ScheduleWithItems { schedule: sched, items }))
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
        sqlx::query("UPDATE schedules SET name = ? WHERE id = ?")
            .bind(name).bind(&id).execute(pool).await?;
    }
    if let Some(child_id) = &body.child_id {
        sqlx::query("UPDATE schedules SET child_id = ? WHERE id = ?")
            .bind(child_id).bind(&id).execute(pool).await?;
    }

    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        "SELECT id, owner_id, child_id, name, status, is_template FROM schedules WHERE id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
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
    sqlx::query("UPDATE schedules SET status = 'archived' WHERE id = ?")
        .bind(&id).execute(pool).await?;
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

    let pool = &state.pool;
    assert_owns_schedule(pool, &id, &user).await?;

    let valid = matches!(body.status.as_str(), "active" | "inactive" | "archived");
    if !valid {
        return Err(AppError::BadRequest("Invalid status value".into()));
    }

    sqlx::query("UPDATE schedules SET status = ? WHERE id = ?")
        .bind(&body.status).bind(&id).execute(pool).await?;

    let row: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        "SELECT id, owner_id, child_id, name, status, is_template FROM schedules WHERE id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
    Ok(Json(row))
}

async fn list_items(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<ItemRow>>> {
    let pool = &state.pool;
    // Verify access
    let sched: ScheduleRow = sqlx::query_as::<_, ScheduleRow>(
        "SELECT id, owner_id, child_id, name, status, is_template FROM schedules WHERE id = ?",
    )
    .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;
    if user.role != UserRole::Admin && sched.owner_id != user.user_id {
        return Err(AppError::Forbidden);
    }

    let items: Vec<ItemRow> = sqlx::query_as::<_, ItemRow>(
        "SELECT id, schedule_id, title, description, picture_path,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                sort_order
         FROM schedule_items WHERE schedule_id = ? ORDER BY sort_order",
    )
    .bind(&id).fetch_all(pool).await?;
    Ok(Json(items))
}

async fn add_item(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(schedule_id): Path<String>,
    Json(body): Json<CreateItemBody>,
) -> AppResult<(StatusCode, Json<ItemRow>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &schedule_id, &user).await?;

    let sort_order = if let Some(o) = body.sort_order {
        o
    } else {
        let max: Option<i32> = sqlx::query_scalar(
            "SELECT MAX(sort_order) FROM schedule_items WHERE schedule_id = ?",
        )
        .bind(&schedule_id).fetch_one(pool).await?;
        max.unwrap_or(-1) + 1
    };

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO schedule_items (id, schedule_id, title, description, picture_path, start_time, end_time, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id).bind(&schedule_id).bind(&body.title).bind(&body.description)
    .bind(&body.picture_path).bind(&body.start_time).bind(&body.end_time).bind(sort_order)
    .execute(pool).await?;

    let item: ItemRow = sqlx::query_as::<_, ItemRow>(
        "SELECT id, schedule_id, title, description, picture_path,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                sort_order
         FROM schedule_items WHERE id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
    Ok((StatusCode::CREATED, Json(item)))
}

async fn reorder_items(
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

    for (i, item_id) in body.item_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE schedule_items SET sort_order = ? WHERE id = ? AND schedule_id = ?",
        )
        .bind(i as i32).bind(item_id).bind(&schedule_id)
        .execute(pool).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn update_item(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((schedule_id, item_id)): Path<(String, String)>,
    Json(body): Json<UpdateItemBody>,
) -> AppResult<Json<ItemRow>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &schedule_id, &user).await?;

    if let Some(v) = &body.title        { sqlx::query("UPDATE schedule_items SET title = ? WHERE id = ? AND schedule_id = ?").bind(v).bind(&item_id).bind(&schedule_id).execute(pool).await?; }
    if let Some(v) = &body.description  { sqlx::query("UPDATE schedule_items SET description = ? WHERE id = ? AND schedule_id = ?").bind(v).bind(&item_id).bind(&schedule_id).execute(pool).await?; }
    if let Some(v) = &body.picture_path { sqlx::query("UPDATE schedule_items SET picture_path = ? WHERE id = ? AND schedule_id = ?").bind(v).bind(&item_id).bind(&schedule_id).execute(pool).await?; }
    if let Some(v) = &body.start_time   { sqlx::query("UPDATE schedule_items SET start_time = ? WHERE id = ? AND schedule_id = ?").bind(v).bind(&item_id).bind(&schedule_id).execute(pool).await?; }
    if let Some(v) = &body.end_time     { sqlx::query("UPDATE schedule_items SET end_time = ? WHERE id = ? AND schedule_id = ?").bind(v).bind(&item_id).bind(&schedule_id).execute(pool).await?; }
    if let Some(v) = body.sort_order    { sqlx::query("UPDATE schedule_items SET sort_order = ? WHERE id = ? AND schedule_id = ?").bind(v).bind(&item_id).bind(&schedule_id).execute(pool).await?; }

    let item: ItemRow = sqlx::query_as::<_, ItemRow>(
        "SELECT id, schedule_id, title, description, picture_path,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                sort_order
         FROM schedule_items WHERE id = ? AND schedule_id = ?",
    )
    .bind(&item_id).bind(&schedule_id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;
    Ok(Json(item))
}

async fn delete_item(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((schedule_id, item_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_schedule(pool, &schedule_id, &user).await?;
    sqlx::query("DELETE FROM schedule_items WHERE id = ? AND schedule_id = ?")
        .bind(&item_id).bind(&schedule_id).execute(pool).await?;
    Ok(StatusCode::NO_CONTENT)
}
