//! `/images` routes — image library CRUD with multipart file upload.

use axum::{
    extract::{Extension, Multipart, Path, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use serde::Serialize;
use std::path::PathBuf;
use tokio::fs;
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    middleware::auth_guard::AuthUser,
    models::UserRole,
    state::AppState,
};

/// Directory where uploaded images are stored (relative to the binary's cwd).
const UPLOAD_DIR: &str = "uploads/images";

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/images",     get(list_images).post(upload_image))
        .route("/images/{id}", delete(delete_image))
}

// ── Row types ────────────────────────────────────────────────

#[derive(sqlx::FromRow, Serialize)]
struct ImageRow {
    id:       String,
    owner_id: Option<String>,
    filename: String,
    path:     String,
    alt_text: Option<String>,
}

// ── Handlers ─────────────────────────────────────────────────

/// List images owned by the caller (or all images for admin).
async fn list_images(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> AppResult<Json<Vec<ImageRow>>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;
    let rows: Vec<ImageRow> = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ImageRow>(
            "SELECT id, owner_id, filename, path, alt_text FROM image_library ORDER BY created_at DESC",
        )
        .fetch_all(pool).await?
    } else {
        sqlx::query_as::<_, ImageRow>(
            "SELECT id, owner_id, filename, path, alt_text
             FROM image_library WHERE owner_id = ? OR owner_id IS NULL
             ORDER BY created_at DESC",
        )
        .bind(&user.user_id)
        .fetch_all(pool).await?
    };
    Ok(Json(rows))
}

/// Upload an image via `multipart/form-data`.
///
/// Fields:
/// * `file`     — the image file (required)
/// * `alt_text` — optional description
async fn upload_image(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<ImageRow>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;

    let mut file_data: Option<(String, Vec<u8>)> = None; // (original_filename, bytes)
    let mut alt_text: Option<String> = None;

    while let Some(field) = multipart.next_field().await
        .map_err(|e| AppError::BadRequest(e.to_string()))? {
        match field.name() {
            Some("file") => {
                let orig_name = field.file_name()
                    .map(|s| s.to_owned())
                    .unwrap_or_else(|| "upload".into());
                let bytes = field.bytes().await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                file_data = Some((orig_name, bytes.to_vec()));
            }
            Some("alt_text") => {
                alt_text = Some(field.text().await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?);
            }
            _ => {}
        }
    }

    let (orig_name, bytes) = file_data.ok_or_else(|| AppError::BadRequest("Missing file field".into()))?;

    // Derive extension from original filename
    let ext = PathBuf::from(&orig_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase();

    // Validate extension
    if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg") {
        return Err(AppError::BadRequest("Unsupported image type".into()));
    }

    // Ensure upload directory exists
    fs::create_dir_all(UPLOAD_DIR).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Could not create upload dir: {e}")))?;

    let image_id  = Uuid::new_v4().to_string();
    let filename  = format!("{}.{}", image_id, ext);
    let disk_path = format!("{}/{}", UPLOAD_DIR, filename);
    let url_path  = format!("/uploads/images/{}", filename);

    fs::write(&disk_path, &bytes).await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Write failed: {e}")))?;

    let owner: Option<String> = if user.role == UserRole::Admin { None } else { Some(user.user_id.clone()) };

    sqlx::query(
        "INSERT INTO image_library (id, owner_id, filename, path, alt_text) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&image_id).bind(&owner).bind(&filename).bind(&url_path).bind(&alt_text)
    .execute(pool).await?;

    let row: ImageRow = sqlx::query_as::<_, ImageRow>(
        "SELECT id, owner_id, filename, path, alt_text FROM image_library WHERE id = ?",
    )
    .bind(&image_id).fetch_one(pool).await?;

    Ok((StatusCode::CREATED, Json(row)))
}

/// Delete an image (and its file from disk).
async fn delete_image(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let pool = &state.pool;

    let row: ImageRow = sqlx::query_as::<_, ImageRow>(
        "SELECT id, owner_id, filename, path, alt_text FROM image_library WHERE id = ?",
    )
    .bind(&id).fetch_optional(pool).await?.ok_or(AppError::NotFound)?;

    // Only owner or admin may delete
    match &row.owner_id {
        Some(owner) if *owner != user.user_id && user.role != UserRole::Admin => {
            return Err(AppError::Forbidden);
        }
        None if user.role != UserRole::Admin => return Err(AppError::Forbidden),
        _ => {}
    }

    sqlx::query("DELETE FROM image_library WHERE id = ?")
        .bind(&id).execute(pool).await?;

    // Best-effort disk cleanup
    let disk_path = format!("{}/{}", UPLOAD_DIR, row.filename);
    let _ = fs::remove_file(&disk_path).await;

    Ok(StatusCode::NO_CONTENT)
}
