//! `/children` routes — CRUD for child profiles and QR tokens.

use axum::{
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    auth::hash_password,
    errors::{AppError, AppResult},
    middleware::auth_guard::AuthUser,
    models::UserRole,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/children",         get(list_children).post(create_child))
        .route("/children/{id}",     get(get_child).put(update_child).delete(delete_child))
        .route("/children/{id}/qr",  get(get_qr).post(regenerate_qr))
}

// ── Row / payload types ──────────────────────────────────────

#[derive(sqlx::FromRow, Serialize)]
struct ChildRow {
    id:           String,
    user_id:      String,
    display_name: String,
    avatar_path:  Option<String>,
    username:     Option<String>,
    is_active:    bool,
}

#[derive(Deserialize)]
struct CreateChildBody {
    username:     String,
    display_name: String,
    password:     String,
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

// ── Auth helper ───────────────────────────────────────────────

/// Verify the caller owns the child (by `child_user_id`). Admins bypass.
async fn assert_owns_child(
    pool: &crate::db::Db,
    child_user_id: &str,
    caller: &AuthUser,
) -> AppResult<()> {
    if caller.role == UserRole::Admin {
        return Ok(());
    }
    let is_mine: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND parent_id = ?)",
    )
    .bind(child_user_id)
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
    let pool = &state.pool;
    let rows: Vec<ChildRow> = match user.role {
        UserRole::Admin => sqlx::query_as::<_, ChildRow>(
            "SELECT cp.id, cp.user_id, cp.display_name, cp.avatar_path,
                    u.username, u.is_active
             FROM child_profiles cp
             JOIN users u ON u.id = cp.user_id
             WHERE u.deleted_at IS NULL
             ORDER BY cp.display_name",
        )
        .fetch_all(pool)
        .await?,
        _ => sqlx::query_as::<_, ChildRow>(
            "SELECT cp.id, cp.user_id, cp.display_name, cp.avatar_path,
                    u.username, u.is_active
             FROM child_profiles cp
             JOIN users u ON u.id = cp.user_id
             WHERE u.parent_id = ?
               AND u.deleted_at IS NULL
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
    let pool = &state.pool;

    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM users WHERE username = ?)",
    )
    .bind(&body.username)
    .fetch_one(pool)
    .await?;
    if exists {
        return Err(AppError::Conflict("Username already taken".into()));
    }

    let hash       = hash_password(&body.password)?;
    let user_id    = Uuid::new_v4().to_string();
    let profile_id = Uuid::new_v4().to_string();
    let parent_id: Option<String> = if user.role == UserRole::Admin {
        None
    } else {
        Some(user.user_id.clone())
    };

    sqlx::query(
        "INSERT INTO users (id, username, password_hash, role, language, parent_id, is_verified, is_active)
         VALUES (?, ?, ?, 'child', 'en', ?, 1, 1)",
    )
    .bind(&user_id).bind(&body.username).bind(&hash).bind(&parent_id)
    .execute(pool).await?;

    sqlx::query(
        "INSERT INTO child_profiles (id, user_id, display_name) VALUES (?, ?, ?)",
    )
    .bind(&profile_id).bind(&user_id).bind(&body.display_name)
    .execute(pool).await?;

    let row: ChildRow = sqlx::query_as::<_, ChildRow>(
        "SELECT cp.id, cp.user_id, cp.display_name, cp.avatar_path,
                u.username, u.is_active
         FROM child_profiles cp
         JOIN users u ON u.id = cp.user_id
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
    let pool = &state.pool;
    let row: ChildRow = sqlx::query_as::<_, ChildRow>(
        "SELECT cp.id, cp.user_id, cp.display_name, cp.avatar_path,
                u.username, u.is_active
         FROM child_profiles cp
         JOIN users u ON u.id = cp.user_id
         WHERE cp.id = ? AND u.deleted_at IS NULL",
    )
    .bind(&id)
    .fetch_optional(pool).await?
    .ok_or(AppError::NotFound)?;

    match &user.role {
        UserRole::Admin  => {}
        UserRole::Child  => {
            if row.user_id != user.user_id { return Err(AppError::Forbidden); }
        }
        UserRole::Parent => assert_owns_child(pool, &row.user_id, &user).await?,
    }
    Ok(Json(row))
}

async fn update_child(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateChildBody>,
) -> AppResult<Json<ChildRow>> {
    let pool = &state.pool;
    #[derive(sqlx::FromRow)] struct UidRow { user_id: String }
    let p: UidRow = sqlx::query_as::<_, UidRow>("SELECT user_id FROM child_profiles WHERE id = ?")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    assert_owns_child(pool, &p.user_id, &user).await?;

    if let Some(name) = &body.display_name {
        sqlx::query("UPDATE child_profiles SET display_name = ? WHERE id = ?")
            .bind(name).bind(&id).execute(pool).await?;
    }
    if let Some(av) = &body.avatar_path {
        sqlx::query("UPDATE child_profiles SET avatar_path = ? WHERE id = ?")
            .bind(av).bind(&id).execute(pool).await?;
    }

    let row: ChildRow = sqlx::query_as::<_, ChildRow>(
        "SELECT cp.id, cp.user_id, cp.display_name, cp.avatar_path,
                u.username, u.is_active
         FROM child_profiles cp
         JOIN users u ON u.id = cp.user_id
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
    let pool = &state.pool;
    #[derive(sqlx::FromRow)] struct UidRow { user_id: String }
    let p: UidRow = sqlx::query_as::<_, UidRow>("SELECT user_id FROM child_profiles WHERE id = ?")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    assert_owns_child(pool, &p.user_id, &user).await?;
    sqlx::query("UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ?")
        .bind(&p.user_id).execute(pool).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_qr(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<QrRow>> {
    let pool = &state.pool;
    #[derive(sqlx::FromRow)] struct UidRow { user_id: String }
    let p: UidRow = sqlx::query_as::<_, UidRow>("SELECT user_id FROM child_profiles WHERE id = ?")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    // Child can view own QR; parent can view their children's QR; admin sees all
    if user.role != UserRole::Admin {
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM users WHERE id = ? AND (parent_id = ? OR id = ?))",
        )
        .bind(&p.user_id).bind(&user.user_id).bind(&user.user_id)
        .fetch_one(pool).await?;
        if !ok { return Err(AppError::Forbidden); }
    }

    // Return existing active token if present, otherwise generate one
    if let Some(row) = sqlx::query_as::<_, QrRow>(
        "SELECT id, token, is_active FROM qr_tokens
         WHERE child_user_id = ? AND is_active = 1 LIMIT 1",
    )
    .bind(&p.user_id)
    .fetch_optional(pool).await? {
        return Ok(Json(row));
    }

    let qr_id = Uuid::new_v4().to_string();
    let token = crate::auth::generate_token();
    sqlx::query(
        "INSERT INTO qr_tokens (id, child_user_id, token, is_active) VALUES (?, ?, ?, 1)",
    )
    .bind(&qr_id).bind(&p.user_id).bind(&token)
    .execute(pool).await?;

    Ok(Json(QrRow { id: qr_id, token, is_active: true }))
}

async fn regenerate_qr(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<QrRow>> {
    let pool = &state.pool;
    #[derive(sqlx::FromRow)] struct UidRow { user_id: String }
    let p: UidRow = sqlx::query_as::<_, UidRow>("SELECT user_id FROM child_profiles WHERE id = ?")
        .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    assert_owns_child(pool, &p.user_id, &user).await?;

    sqlx::query("UPDATE qr_tokens SET is_active = 0 WHERE child_user_id = ?")
        .bind(&p.user_id).execute(pool).await?;

    let qr_id = Uuid::new_v4().to_string();
    let token = crate::auth::generate_token();
    sqlx::query(
        "INSERT INTO qr_tokens (id, child_user_id, token, is_active) VALUES (?, ?, ?, 1)",
    )
    .bind(&qr_id).bind(&p.user_id).bind(&token)
    .execute(pool).await?;

    Ok(Json(QrRow { id: qr_id, token, is_active: true }))
}
