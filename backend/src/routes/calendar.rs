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
use sha2::{Digest, Sha256};
use tower_cookies::Cookies;
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

pub fn public_router() -> Router<AppState> {
    Router::new()
    .route("/child/{child_id}/week/{iso_week}", get(get_week_child))
}

// ── Row types ────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct AssignmentRow {
    id:          String,
    schedule_id: String,
    day_of_week: i8,   // MariaDB TINYINT is signed
    start_date:  Option<String>,
    end_date:    Option<String>,
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
    assignment_id: Option<String>,
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
    #[serde(default = "default_true")]
    persistent: bool,
    start_date: Option<String>,
    end_date: Option<String>,
}

fn default_true() -> bool {
    true
}

// ── Auth helper ──────────────────────────────────────────────

/// Verify the caller may access this child's calendar.
async fn assert_calendar_access(
    pool: &crate::db::Db,
    child_profile_id: &str,
    caller: &AuthUser,
) -> AppResult<()> {
    if caller.role == UserRole::Admin {
        return Ok(());
    }

    if caller.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    // Parents own child profiles
    let ok: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM child_profiles WHERE id = ? AND parent_id = ?)",
    )
    .bind(child_profile_id)
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
    assert_calendar_access(pool, &child_profile_id, &user).await?;

    let week_data = load_week_for_child(pool, &child_profile_id, &iso_week).await?;
    Ok(Json(week_data))
}

async fn get_week_child(
    State(state): State<AppState>,
    cookies: Cookies,
    Path((child_id, iso_week)): Path<(String, String)>,
) -> AppResult<Json<WeekResponse>> {
    const CHILD_SESSION_COOKIE: &str = "child_session";

    let pool = &state.pool;
    let raw = cookies
        .get(CHILD_SESSION_COOKIE)
        .map(|c| c.value().to_owned())
        .ok_or(AppError::Unauthorized)?;

    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    let token_hash = format!("{:x}", hasher.finalize());

    #[derive(sqlx::FromRow)]
    struct ChildAccessRow {
        id: String,
        child_id: String,
    }

    let access = sqlx::query_as::<_, ChildAccessRow>(
        "SELECT id, child_id
         FROM child_device_tokens
         WHERE token_hash = ? AND revoked_at IS NULL
         LIMIT 1",
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    if access.child_id != child_id {
        return Err(AppError::Forbidden);
    }

    sqlx::query("UPDATE child_device_tokens SET last_used_at = NOW() WHERE id = ?")
        .bind(&access.id)
        .execute(pool)
        .await?;

    let week_data = load_week_for_child(pool, &child_id, &iso_week).await?;
    Ok(Json(week_data))
}

async fn load_week_for_child(
    pool: &crate::db::Db,
    child_profile_id: &str,
    iso_week: &str,
) -> AppResult<WeekResponse> {

    // Parse "YYYY-Wnn"
    let (year, week) = parse_iso_week(iso_week)
        .ok_or_else(|| AppError::BadRequest("Expected format YYYY-Wnn".into()))?;

    // Monday of that ISO week
    let monday = NaiveDate::from_isoywd_opt(year, week, Weekday::Mon)
        .ok_or_else(|| AppError::BadRequest("Invalid ISO week".into()))?;

    // Fetch assignments for this child and weekday.
    let assignments: Vec<AssignmentRow> = sqlx::query_as::<_, AssignmentRow>(
        "SELECT id, schedule_id, day_of_week,
                DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
         FROM schedule_day_assignments
         WHERE child_id = ?
         ORDER BY created_at DESC",
    )
    .bind(child_profile_id)
    .fetch_all(pool).await?;

    let mut days: Vec<DayView> = Vec::new();
    for dow in 1u8..=7 {
        let date = monday + chrono::Duration::days((dow - 1) as i64);
        let date_s = date.format("%Y-%m-%d").to_string();
        let assignment = assignments
            .iter()
            .filter(|a| a.day_of_week == dow as i8)
            .filter(|a| assignment_applies_to_date(a, &date_s))
            .max_by(|a, b| assignment_priority(a).cmp(&assignment_priority(b)));

        let (assignment_id, schedule_id, schedule_name, items) = if let Some(a) = assignment {
            #[derive(sqlx::FromRow)] struct NameRow { name: String }
            let s: Option<NameRow> = sqlx::query_as::<_, NameRow>(
                "SELECT name FROM schedules WHERE id = ? AND status <> 'archived'",
            )
            .bind(&a.schedule_id)
            .fetch_optional(pool).await?;

            if let Some(s) = s {
                let items: Vec<ItemRow> = sqlx::query_as::<_, ItemRow>(
                    "SELECT id, title, description, picture_path,
                            TIME_FORMAT(start_time, '%H:%i') AS start_time,
                            TIME_FORMAT(end_time,   '%H:%i') AS end_time,
                            sort_order
                     FROM schedule_items WHERE schedule_id = ? ORDER BY sort_order",
                )
                .bind(&a.schedule_id)
                .fetch_all(pool).await?;

                (Some(a.id.clone()), Some(a.schedule_id.clone()), Some(s.name), items)
            } else {
                // Archived or missing schedules are hidden from child-facing reads.
                (None, None, None, vec![])
            }
        } else {
            (None, None, None, vec![])
        };

        days.push(DayView {
            date: date.format("%Y-%m-%d").to_string(),
            day_of_week: dow,
            assignment_id,
            schedule_id,
            schedule_name,
            items,
        });
    }

    Ok(WeekResponse {
        year,
        week,
        monday: monday.format("%Y-%m-%d").to_string(),
        days,
    })
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

    let (start_date, end_date): (Option<NaiveDate>, Option<NaiveDate>) = if body.persistent {
        (None, None)
    } else {
        let start = body
            .start_date
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("start_date is required when assignment is date-limited".into()))?;
        let end = body
            .end_date
            .as_deref()
            .ok_or_else(|| AppError::BadRequest("end_date is required when assignment is date-limited".into()))?;

        let start = NaiveDate::parse_from_str(start, "%Y-%m-%d")
            .map_err(|_| AppError::BadRequest("start_date must be in YYYY-MM-DD format".into()))?;
        let end = NaiveDate::parse_from_str(end, "%Y-%m-%d")
            .map_err(|_| AppError::BadRequest("end_date must be in YYYY-MM-DD format".into()))?;

        if end < start {
            return Err(AppError::BadRequest("end_date must be on or after start_date".into()));
        }

        (Some(start), Some(end))
    };

    let pool = &state.pool;

    // Only parent/admin can assign
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    assert_calendar_access(pool, &child_profile_id, &user).await?;

    // Validate schedule ownership before assignment.
    let schedule_allowed: bool = if user.role == UserRole::Admin {
        sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM schedules WHERE id = ? AND status <> 'archived')",
        )
        .bind(&body.schedule_id)
        .fetch_one(pool)
        .await?
    } else {
        sqlx::query_scalar(
            "SELECT EXISTS(
                 SELECT 1
                 FROM schedules s
                 WHERE s.id = ?
                   AND s.owner_id = ?
                   AND s.status <> 'archived'
             )",
        )
        .bind(&body.schedule_id)
        .bind(&user.user_id)
        .fetch_one(pool)
        .await?
    };
    if !schedule_allowed {
        return Err(AppError::Forbidden);
    }

    let has_items: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM schedule_items WHERE schedule_id = ?)",
    )
    .bind(&body.schedule_id)
    .fetch_one(pool)
    .await?;

    if !has_items {
        return Err(AppError::BadRequest(
            "Cannot assign a schedule with no items. Add at least one item first.".into(),
        ));
    }

    // One active assignment slot per child/weekday.
    sqlx::query(
        "DELETE FROM schedule_day_assignments WHERE child_id = ? AND day_of_week = ?",
    )
    .bind(&child_profile_id)
    .bind(body.day_of_week)
    .execute(pool)
    .await?;

    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO schedule_day_assignments (id, schedule_id, child_id, day_of_week, start_date, end_date)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&body.schedule_id)
    .bind(&child_profile_id)
    .bind(body.day_of_week)
    .bind(start_date)
    .bind(end_date)
    .execute(pool)
    .await?;

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

    assert_calendar_access(pool, &child_profile_id, &user).await?;

    sqlx::query(
        "DELETE FROM schedule_day_assignments WHERE id = ? AND child_id = ?",
    )
    .bind(&assignment_id).bind(&child_profile_id)
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

fn assignment_applies_to_date(a: &AssignmentRow, date: &str) -> bool {
    match (&a.start_date, &a.end_date) {
        (Some(start), Some(end)) => date >= start.as_str() && date <= end.as_str(),
        (Some(start), None) => date >= start.as_str(),
        (None, Some(end)) => date <= end.as_str(),
        (None, None) => true,
    }
}

fn assignment_priority(a: &AssignmentRow) -> (i8, Option<&str>) {
    let bounded = if a.start_date.is_some() || a.end_date.is_some() { 1 } else { 0 };
    (bounded, a.start_date.as_deref())
}
