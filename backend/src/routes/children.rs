//! `/children` routes — CRUD for child profiles and QR tokens.

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Serializer;
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
        .route("/children",         get(list_children).post(create_child))
        .route("/children/{id}",     get(get_child).put(update_child).delete(delete_child))
    .route("/children/{id}/devices", get(list_child_devices).delete(revoke_all_child_devices))
    .route("/children/{id}/devices/{device_id}", axum::routing::delete(revoke_child_device))
        .route("/children/{id}/qr",  get(get_qr).post(regenerate_qr))
}

// ── Row / payload types ──────────────────────────────────────

#[derive(sqlx::FromRow, Serialize)]
struct ChildRow {
    id:           String,
    parent_id:    Option<String>,
    display_name: String,
    avatar_path:  Option<String>,
}

#[derive(Deserialize)]
struct CreateChildBody {
    display_name: String,
}

#[derive(Deserialize)]
struct UpdateChildBody {
    display_name: Option<String>,
    avatar_path:  Option<String>,
}

#[derive(sqlx::FromRow, Serialize)]
struct QrRow {
    id:        String,
    token:     String,
    is_active: bool,
}

#[derive(sqlx::FromRow, Serialize)]
struct ChildDeviceRow {
    id: String,
    parent_user_id: String,
    child_id: String,
    #[serde(serialize_with = "serialize_naive_datetime_utc")]
    created_at: chrono::NaiveDateTime,
    #[serde(serialize_with = "serialize_option_naive_datetime_utc")]
    last_used_at: Option<chrono::NaiveDateTime>,
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

// ── Auth helper ───────────────────────────────────────────────

/// Verify the caller owns the child profile. Admins bypass.
async fn assert_owns_child(
    pool: &crate::db::Db,
    child_id: &str,
    caller: &AuthUser,
) -> AppResult<()> {
    if caller.role == UserRole::Admin {
        return Ok(());
    }
    let is_mine: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM child_profiles WHERE id = ? AND parent_id = ?)",
    )
    .bind(child_id)
    .bind(&caller.user_id)
    .fetch_one(pool)
    .await?;
    if !is_mine {
        return Err(AppError::Forbidden);
    }
    Ok(())
}

// ── Handlers ─────────────────────────────────────────────────

async fn list_children(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> AppResult<Json<Vec<ChildRow>>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    let pool = &state.pool;
    let rows: Vec<ChildRow> = match user.role {
        UserRole::Admin => sqlx::query_as::<_, ChildRow>(
            "SELECT cp.id, cp.parent_id, cp.display_name, cp.avatar_path
             FROM child_profiles cp
             ORDER BY cp.display_name",
        )
        .fetch_all(pool)
        .await?,
        _ => sqlx::query_as::<_, ChildRow>(
            "SELECT cp.id, cp.parent_id, cp.display_name, cp.avatar_path
             FROM child_profiles cp
             WHERE cp.parent_id = ?
             ORDER BY cp.display_name",
        )
        .bind(&user.user_id)
        .fetch_all(pool)
        .await?,
    };
    Ok(Json(rows))
}

async fn create_child(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<CreateChildBody>,
) -> AppResult<(StatusCode, Json<ChildRow>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    if body.display_name.trim().is_empty() {
        return Err(AppError::BadRequest("display_name is required".into()));
    }
    let pool = &state.pool;

    let profile_id = Uuid::new_v4().to_string();
    let parent_id: Option<String> = if user.role == UserRole::Admin {
        None
    } else {
        Some(user.user_id.clone())
    };

    sqlx::query(
        "INSERT INTO child_profiles (id, parent_id, display_name) VALUES (?, ?, ?)",
    )
    .bind(&profile_id).bind(&parent_id).bind(&body.display_name)
    .execute(pool).await?;

    let row: ChildRow = sqlx::query_as::<_, ChildRow>(
        "SELECT cp.id, cp.parent_id, cp.display_name, cp.avatar_path
         FROM child_profiles cp
         WHERE cp.id = ?",
    )
    .bind(&profile_id)
    .fetch_one(pool)
    .await?;

    Ok((StatusCode::CREATED, Json(row)))
}

async fn get_child(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<ChildRow>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    let pool = &state.pool;
    let row: ChildRow = sqlx::query_as::<_, ChildRow>(
        "SELECT cp.id, cp.parent_id, cp.display_name, cp.avatar_path
         FROM child_profiles cp
         WHERE cp.id = ?",
    )
    .bind(&id)
    .fetch_optional(pool).await?
    .ok_or(AppError::NotFound)?;

    match &user.role {
        UserRole::Admin  => {}
        UserRole::Parent => assert_owns_child(pool, &row.id, &user).await?,
        UserRole::Child => return Err(AppError::Forbidden),
    }
    Ok(Json(row))
}

async fn update_child(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateChildBody>,
) -> AppResult<Json<ChildRow>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    let pool = &state.pool;
    assert_owns_child(pool, &id, &user).await?;

    if let Some(name) = &body.display_name {
        sqlx::query("UPDATE child_profiles SET display_name = ? WHERE id = ?")
            .bind(name).bind(&id).execute(pool).await?;
    }
    if let Some(av) = &body.avatar_path {
        sqlx::query("UPDATE child_profiles SET avatar_path = ? WHERE id = ?")
            .bind(av).bind(&id).execute(pool).await?;
    }

    let row: ChildRow = sqlx::query_as::<_, ChildRow>(
        "SELECT cp.id, cp.parent_id, cp.display_name, cp.avatar_path
         FROM child_profiles cp
         WHERE cp.id = ?",
    )
    .bind(&id).fetch_one(pool).await?;
    Ok(Json(row))
}

async fn delete_child(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }
    let pool = &state.pool;
    assert_owns_child(pool, &id, &user).await?;

    let affected = sqlx::query("DELETE FROM child_profiles WHERE id = ?")
        .bind(&id).execute(pool).await?
        .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn get_qr(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<QrRow>> {
    if user.role != UserRole::Parent {
        return Err(AppError::Forbidden);
    }
    let pool = &state.pool;
    assert_owns_child(pool, &id, &user).await?;

    // Return existing active token if present, otherwise generate one
    if let Some(row) = sqlx::query_as::<_, QrRow>(
        "SELECT id, token, is_active FROM qr_tokens
         WHERE child_id = ? AND is_active = 1 LIMIT 1",
    )
    .bind(&id)
    .fetch_optional(pool).await? {
        return Ok(Json(row));
    }

    let qr_id = Uuid::new_v4().to_string();
    let token = crate::auth::generate_token();
    sqlx::query(
        "INSERT INTO qr_tokens (id, child_id, token, is_active) VALUES (?, ?, ?, 1)",
    )
    .bind(&qr_id).bind(&id).bind(&token)
    .execute(pool).await?;

    Ok(Json(QrRow { id: qr_id, token, is_active: true }))
}

async fn regenerate_qr(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<QrRow>> {
    if user.role != UserRole::Parent {
        return Err(AppError::Forbidden);
    }
    let pool = &state.pool;
    assert_owns_child(pool, &id, &user).await?;

    sqlx::query("UPDATE qr_tokens SET is_active = 0 WHERE child_id = ?")
        .bind(&id).execute(pool).await?;

    let qr_id = Uuid::new_v4().to_string();
    let token = crate::auth::generate_token();
    sqlx::query(
        "INSERT INTO qr_tokens (id, child_id, token, is_active) VALUES (?, ?, ?, 1)",
    )
    .bind(&qr_id).bind(&id).bind(&token)
    .execute(pool).await?;

    Ok(Json(QrRow { id: qr_id, token, is_active: true }))
}

async fn list_child_devices(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<ChildDeviceRow>>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_child(pool, &id, &user).await?;

    let rows: Vec<ChildDeviceRow> = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ChildDeviceRow>(
            "SELECT id, parent_user_id, child_id, created_at, last_used_at, user_agent_hash, ip_range
             FROM child_device_tokens
             WHERE child_id = ? AND revoked_at IS NULL
             ORDER BY created_at DESC",
        )
        .bind(&id)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, ChildDeviceRow>(
            "SELECT id, parent_user_id, child_id, created_at, last_used_at, user_agent_hash, ip_range
             FROM child_device_tokens
             WHERE child_id = ? AND parent_user_id = ? AND revoked_at IS NULL
             ORDER BY created_at DESC",
        )
        .bind(&id)
        .bind(&user.user_id)
        .fetch_all(pool)
        .await?
    };

    Ok(Json(rows))
}

async fn revoke_child_device(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((id, device_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_child(pool, &id, &user).await?;

    let affected = if user.role == UserRole::Admin {
        sqlx::query(
            "UPDATE child_device_tokens
             SET revoked_at = NOW()
             WHERE id = ? AND child_id = ? AND revoked_at IS NULL",
        )
        .bind(&device_id)
        .bind(&id)
        .execute(pool)
        .await?
        .rows_affected()
    } else {
        sqlx::query(
            "UPDATE child_device_tokens
             SET revoked_at = NOW()
             WHERE id = ? AND child_id = ? AND parent_user_id = ? AND revoked_at IS NULL",
        )
        .bind(&device_id)
        .bind(&id)
        .bind(&user.user_id)
        .execute(pool)
        .await?
        .rows_affected()
    };

    if affected == 0 {
        return Err(AppError::NotFound);
    }

    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_all_child_devices(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    assert_owns_child(pool, &id, &user).await?;

    if user.role == UserRole::Admin {
        sqlx::query(
            "UPDATE child_device_tokens SET revoked_at = NOW() WHERE child_id = ? AND revoked_at IS NULL",
        )
        .bind(&id)
        .execute(pool)
        .await?;
    } else {
        sqlx::query(
            "UPDATE child_device_tokens
             SET revoked_at = NOW()
             WHERE child_id = ? AND parent_user_id = ? AND revoked_at IS NULL",
        )
        .bind(&id)
        .bind(&user.user_id)
        .execute(pool)
        .await?;
    }

    Ok(StatusCode::NO_CONTENT)
}
