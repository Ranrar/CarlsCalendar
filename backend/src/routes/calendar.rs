//! `/calendar` routes — weekly view and schedule day-assignment management.
//!
//! * `GET  /calendar/:child_id/week/:iso_week` — fetch the week's items for a child
//!   `:iso_week` format: `YYYY-Wnn`  (e.g. `2025-W07`)
//! * `POST /calendar/:child_id/assign`          — assign a schedule to a weekday
//! * `DELETE /calendar/:child_id/assign/:id`    — remove an assignment

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{NaiveDate, Weekday};
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
        .route("/calendar/{child_id}/week/{iso_week}",        get(get_week))
        .route("/calendar/{child_id}/assign",                post(assign))
        .route("/calendar/{child_id}/assign/{assignment_id}", delete(unassign))
}

// ── Row types ────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct AssignmentRow {
    schedule_id: String,
    day_of_week: i8,   // MariaDB TINYINT is signed
}

#[derive(sqlx::FromRow, Serialize, Clone)]
struct ItemRow {
    id:           String,
    title:        String,
    description:  Option<String>,
    picture_path: Option<String>,
    start_time:   String,
    end_time:     Option<String>,
    sort_order:   i32,
}

#[derive(Serialize, Clone)]
struct DayView {
    date:          String, // "YYYY-MM-DD"
    day_of_week:   u8,     // 1=Mon … 7=Sun
    schedule_id:   Option<String>,
    schedule_name: Option<String>,
    items:         Vec<ItemRow>,
}

#[derive(Serialize)]
struct WeekResponse {
    year:   i32,
    week:   u32,
    monday: String,
    days:   Vec<DayView>,
}

// ── Request bodies ───────────────────────────────────────────

#[derive(Deserialize)]
struct AssignBody {
    schedule_id: String,
    day_of_week: u8,
}

// ── Auth helper ──────────────────────────────────────────────

/// Verify the caller may access this child's calendar.
async fn assert_calendar_access(
    pool: &crate::db::Db,
    child_user_id: &str,
    caller: &AuthUser,
) -> AppResult<()> {
    if caller.role == UserRole::Admin {
        return Ok(());
    }
    // Parents own the child; child can view their own calendar
    let ok: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND (parent_id = ? OR id = ?))",
    )
    .bind(child_user_id)
    .bind(&caller.user_id)
    .bind(&caller.user_id)
    .fetch_one(pool)
    .await?;
    if !ok {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

// ── Handlers ─────────────────────────────────────────────────

async fn get_week(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((child_profile_id, iso_week)): Path<(String, String)>,
) -> AppResult<Json<WeekResponse>> {
    let pool = &state.pool;

    // Resolve profile → user_id
    #[derive(sqlx::FromRow)] struct UidRow { user_id: String }
    let p: UidRow = sqlx::query_as::<_, UidRow>(
        "SELECT user_id FROM child_profiles WHERE id = ?",
    )
    .bind(&child_profile_id)
    .fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    assert_calendar_access(pool, &p.user_id, &user).await?;

    // Parse "YYYY-Wnn"
    let (year, week) = parse_iso_week(&iso_week)
        .ok_or_else(|| AppError::BadRequest("Expected format YYYY-Wnn".into()))?;

    // Monday of that ISO week
    let monday = NaiveDate::from_isoywd_opt(year, week, Weekday::Mon)
        .ok_or_else(|| AppError::BadRequest("Invalid ISO week".into()))?;

    // Fetch assignments for this child (all days, not week-specific — assignments are recurring)
    let assignments: Vec<AssignmentRow> = sqlx::query_as::<_, AssignmentRow>(
        "SELECT schedule_id, day_of_week
         FROM schedule_day_assignments
         WHERE child_id = ?",
    )
    .bind(&p.user_id)
    .fetch_all(pool).await?;

    let mut days: Vec<DayView> = Vec::new();
    for dow in 1u8..=7 {
        let date = monday + chrono::Duration::days((dow - 1) as i64);
        let assignment = assignments.iter().find(|a| a.day_of_week == dow as i8);

        let (schedule_id, schedule_name, items) = if let Some(a) = assignment {
            #[derive(sqlx::FromRow)] struct NameRow { name: String }
            let s: Option<NameRow> = sqlx::query_as::<_, NameRow>(
                "SELECT name FROM schedules WHERE id = ?",
            )
            .bind(&a.schedule_id)
            .fetch_optional(pool).await?;

            let items: Vec<ItemRow> = sqlx::query_as::<_, ItemRow>(
                "SELECT id, title, description, picture_path,
                        TIME_FORMAT(start_time, '%H:%i') AS start_time,
                        TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                        sort_order
                 FROM schedule_items WHERE schedule_id = ? ORDER BY sort_order",
            )
            .bind(&a.schedule_id)
            .fetch_all(pool).await?;

            (Some(a.schedule_id.clone()), s.map(|r| r.name), items)
        } else {
            (None, None, vec![])
        };

        days.push(DayView {
            date: date.format("%Y-%m-%d").to_string(),
            day_of_week: dow,
            schedule_id,
            schedule_name,
            items,
        });
    }

    Ok(Json(WeekResponse {
        year,
        week,
        monday: monday.format("%Y-%m-%d").to_string(),
        days,
    }))
}

async fn assign(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(child_profile_id): Path<String>,
    Json(body): Json<AssignBody>,
) -> AppResult<StatusCode> {
    if !(1..=7).contains(&body.day_of_week) {
        return Err(AppError::BadRequest("day_of_week must be 1–7".into()));
    }
    let pool = &state.pool;

    #[derive(sqlx::FromRow)] struct UidRow { user_id: String }
    let p: UidRow = sqlx::query_as::<_, UidRow>(
        "SELECT user_id FROM child_profiles WHERE id = ?",
    )
    .bind(&child_profile_id)
    .fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    // Only parent/admin can assign
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    assert_calendar_access(pool, &p.user_id, &user).await?;

    let id = Uuid::new_v4().to_string();
    // REPLACE to handle the UNIQUE KEY (schedule_id, child_id, day_of_week)
    sqlx::query(
        "INSERT INTO schedule_day_assignments (id, schedule_id, child_id, day_of_week)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE schedule_id = VALUES(schedule_id), id = VALUES(id)",
    )
    .bind(&id).bind(&body.schedule_id).bind(&p.user_id).bind(body.day_of_week)
    .execute(pool).await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn unassign(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((child_profile_id, assignment_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    let pool = &state.pool;

    #[derive(sqlx::FromRow)] struct UidRow { user_id: String }
    let p: UidRow = sqlx::query_as::<_, UidRow>(
        "SELECT user_id FROM child_profiles WHERE id = ?",
    )
    .bind(&child_profile_id)
    .fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    assert_calendar_access(pool, &p.user_id, &user).await?;

    sqlx::query(
        "DELETE FROM schedule_day_assignments WHERE id = ? AND child_id = ?",
    )
    .bind(&assignment_id).bind(&p.user_id)
    .execute(pool).await?;

    Ok(StatusCode::NO_CONTENT)
}

// ── Helpers ──────────────────────────────────────────────────

fn parse_iso_week(s: &str) -> Option<(i32, u32)> {
    // Expected: "YYYY-Wnn"  e.g. "2025-W07"
    let s = s.trim();
    let (year_str, week_str) = s.split_once('-')?;
    let year: i32 = year_str.parse().ok()?;
    let week: u32 = week_str.strip_prefix('W')?.parse().ok()?;
    if week == 0 || week > 53 { return None; }
    Some((year, week))
}
