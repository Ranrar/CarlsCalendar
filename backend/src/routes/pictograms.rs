use axum::{
    extract::{Extension, Path, Query, State},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::{
    errors::AppResult,
    middleware::auth_guard::AuthUser,
    models::UserRole,
    services::pictograms,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/pictograms/search/{language}/{query}", get(search_pictograms))
        .route("/pictograms/{language}/id/{arasaac_id}", get(get_pictogram_by_id))
        // Browse: latest from ARASAAC + keyword autocomplete list
        .route("/pictograms/new",      get(new_pictograms))
        .route("/pictograms/keywords", get(get_keywords))
        // Saved pictogram library
        .route("/pictograms/saved",              get(list_saved).post(save_pictogram))
        .route("/pictograms/saved/ids",          get(saved_ids))
        .route("/pictograms/saved/{id}",         delete(unsave_pictogram))
        .route("/pictograms/saved/{id}/use",     post(record_use))
}

async fn search_pictograms(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((language, query)): Path<(String, String)>,
) -> AppResult<Json<Vec<pictograms::PictogramDto>>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Ok(Json(vec![]));
    }

    match pictograms::search_local_first(&state.pool, &language, &query).await {
        Ok(list) => Ok(Json(list)),
        Err(err) => {
            tracing::warn!(error = ?err, language, query, "Pictogram search failed; returning empty result set");
            Ok(Json(vec![]))
        }
    }
}

async fn get_pictogram_by_id(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path((language, arasaac_id)): Path<(String, i32)>,
) -> AppResult<Json<pictograms::PictogramDto>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Err(crate::errors::AppError::Forbidden);
    }

    match pictograms::get_or_fetch_by_id(&state.pool, &language, arasaac_id).await {
        Ok(item) => Ok(Json(item)),
        Err(err) => {
            tracing::warn!(error = ?err, language, arasaac_id, "Pictogram fetch failed");
            Err(crate::errors::AppError::NotFound)
        }
    }
}

// ── Saved pictogram handlers ─────────────────────────────────────────────────

#[derive(Deserialize)]
struct LangQuery {
    lang: Option<String>,
}

async fn list_saved(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(q): Query<LangQuery>,
) -> AppResult<Json<Vec<pictograms::SavedPictogramDto>>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Ok(Json(vec![]));
    }
    let lang = q.lang.as_deref().unwrap_or("en");
    let items = pictograms::list_saved_pictograms(&state.pool, &user.user_id, lang).await?;
    Ok(Json(items))
}

async fn saved_ids(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
) -> AppResult<Json<Vec<i32>>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Ok(Json(vec![]));
    }
    let ids = pictograms::saved_ids_for_user(&state.pool, &user.user_id).await?;
    Ok(Json(ids))
}

#[derive(Deserialize)]
struct SaveBody {
    arasaac_id: i32,
    label: Option<String>,
}

async fn save_pictogram(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<SaveBody>,
) -> AppResult<Json<serde_json::Value>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Err(crate::errors::AppError::Forbidden);
    }
    pictograms::save_pictogram(&state.pool, &user.user_id, body.arasaac_id, body.label).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn unsave_pictogram(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(arasaac_id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Err(crate::errors::AppError::Forbidden);
    }
    pictograms::unsave_pictogram(&state.pool, &user.user_id, arasaac_id).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn record_use(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(arasaac_id): Path<i32>,
) -> AppResult<Json<serde_json::Value>> {
    pictograms::mark_activity();

    pictograms::record_pictogram_use(&state.pool, &user.user_id, arasaac_id).await?;
    Ok(Json(json!({ "ok": true })))
}

// ── Browse handlers ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct NewQuery {
    lang: Option<String>,
    n: Option<u32>,
}

async fn new_pictograms(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(q): Query<NewQuery>,
) -> AppResult<Json<Vec<pictograms::PictogramDto>>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Ok(Json(vec![]));
    }
    let lang = q.lang.as_deref().unwrap_or("en");
    let n = q.n.unwrap_or(30);
    match pictograms::get_new_pictograms(&state.pool, lang, n).await {
        Ok(list) => Ok(Json(list)),
        Err(err) => {
            tracing::warn!(error = ?err, lang, "Fetching new pictograms failed");
            Ok(Json(vec![]))
        }
    }
}

async fn get_keywords(
    Extension(user): Extension<AuthUser>,
    Query(q): Query<LangQuery>,
) -> AppResult<Json<Vec<String>>> {
    pictograms::mark_activity();

    if user.role == UserRole::Child {
        return Ok(Json(vec![]));
    }
    let lang = q.lang.as_deref().unwrap_or("en");
    match pictograms::get_keywords(lang).await {
        Ok(words) => Ok(Json(words)),
        Err(err) => {
            tracing::warn!(error = ?err, lang, "Fetching ARASAAC keywords failed");
            Ok(Json(vec![]))
        }
    }
}
