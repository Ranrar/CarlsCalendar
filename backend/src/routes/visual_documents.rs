use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    routing::{get, post, put},
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
        .route("/visual-documents/templates", get(list_templates).post(create_template))
        .route("/visual-documents/templates/{id}", put(update_template).delete(delete_template))
        .route("/visual-documents/templates/{id}/preview", get(preview_template_document))
        .route("/visual-documents/templates/{id}/copy", post(copy_template_to_document))
        .route("/visual-documents/activity-cards", get(list_activity_cards).post(create_activity_card))
        .route("/visual-documents/activity-cards/{id}", put(update_activity_card).delete(delete_activity_card))
        .route("/visual-documents", get(list_documents).post(create_document))
        .route("/visual-documents/{id}", get(get_document).put(update_document).delete(delete_document))
}

const ALLOWED_DOCUMENT_TYPES: &[&str] = &[
    "DAILY_SCHEDULE",
    "FIRST_THEN",
    "CHOICE_BOARD",
    "ROUTINE_STEPS",
    "EMOTION_CARDS",
    "AAC_BOARD",
    "REWARD_TRACKER",
];

#[derive(sqlx::FromRow)]
struct TemplateRow {
    id: String,
    owner_id: Option<String>,
    name: String,
    description: Option<String>,
    document_type: String,
    scenario_type: String,
    language: String,
    is_system: bool,
    metadata_json: Vec<u8>,
    created_at: chrono::NaiveDateTime,
    updated_at: chrono::NaiveDateTime,
}

#[derive(sqlx::FromRow)]
struct TemplateActivityRow {
    activity_order: i32,
    activity_id: String,
    label: String,
    pictogram_url: Option<String>,
}

#[derive(sqlx::FromRow)]
struct DocumentRow {
    id: String,
    owner_id: String,
    child_id: Option<String>,
    template_id: Option<String>,
    title: String,
    document_type: String,
    locale: String,
    layout_spec_json: String,
    content_json: String,
    version: i32,
    created_at: chrono::NaiveDateTime,
    updated_at: chrono::NaiveDateTime,
}

#[derive(sqlx::FromRow)]
struct ActivityCardRow {
    id: String,
    owner_id: Option<String>,
    language: String,
    label_text: String,
    pictogram_id: Option<String>,
    arasaac_id: Option<i32>,
    local_image_path: Option<String>,
    category: Option<String>,
    is_system: bool,
    created_at: chrono::NaiveDateTime,
    updated_at: chrono::NaiveDateTime,
}

#[derive(Serialize)]
struct TemplateDto {
    id: String,
    owner_id: Option<String>,
    name: String,
    description: Option<String>,
    document_type: String,
    scenario_type: String,
    locale: String,
    is_system: bool,
    layout_spec: serde_json::Value,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
struct DocumentDto {
    id: String,
    owner_id: String,
    child_id: Option<String>,
    template_id: Option<String>,
    title: String,
    document_type: String,
    locale: String,
    layout_spec: serde_json::Value,
    content: serde_json::Value,
    version: i32,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
struct TemplatePreviewDto {
    template_id: String,
    title: String,
    document_type: String,
    locale: String,
    layout_spec: serde_json::Value,
    content: serde_json::Value,
}

#[derive(Serialize)]
struct ActivityCardDto {
    id: String,
    owner_id: Option<String>,
    locale: String,
    label: String,
    pictogram_id: Option<String>,
    arasaac_id: Option<i32>,
    local_image_path: Option<String>,
    category: Option<String>,
    is_system: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct TemplateQuery {
    #[serde(rename = "type")]
    document_type: Option<String>,
    locale: Option<String>,
}

#[derive(Deserialize)]
struct ListDocumentsQuery {
    #[serde(rename = "type")]
    document_type: Option<String>,
    child_id: Option<String>,
}

#[derive(Deserialize)]
struct ActivityCardsQuery {
    locale: Option<String>,
}

#[derive(Deserialize)]
struct CreateTemplateBody {
    name: String,
    document_type: String,
    description: Option<String>,
    scenario_type: Option<String>,
    locale: Option<String>,
    is_system: Option<bool>,
    layout_spec: serde_json::Value,
}

#[derive(Deserialize)]
struct UpdateTemplateBody {
    name: Option<String>,
    description: Option<String>,
    scenario_type: Option<String>,
    locale: Option<String>,
    layout_spec: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct CopyTemplateBody {
    title: Option<String>,
    child_id: Option<String>,
}

#[derive(Deserialize)]
struct CreateDocumentBody {
    title: String,
    document_type: String,
    locale: Option<String>,
    child_id: Option<String>,
    template_id: Option<String>,
    layout_spec: serde_json::Value,
    content: serde_json::Value,
}

#[derive(Deserialize)]
struct UpdateDocumentBody {
    title: Option<String>,
    locale: Option<String>,
    child_id: Option<String>,
    layout_spec: Option<serde_json::Value>,
    content: Option<serde_json::Value>,
    expected_version: Option<i32>,
}

#[derive(Deserialize)]
struct CreateActivityCardBody {
    label: String,
    locale: Option<String>,
    pictogram_id: Option<String>,
    category: Option<String>,
}

#[derive(Deserialize)]
struct UpdateActivityCardBody {
    label: Option<String>,
    locale: Option<String>,
    pictogram_id: Option<String>,
    category: Option<String>,
}

fn is_valid_document_type(value: &str) -> bool {
    ALLOWED_DOCUMENT_TYPES.contains(&value)
}

fn parse_json_safe(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap_or_else(|_| serde_json::json!({}))
}

fn parse_json_safe_bytes(raw: &[u8]) -> serde_json::Value {
    serde_json::from_slice(raw).unwrap_or_else(|_| serde_json::json!({}))
}

fn fmt_dt(dt: chrono::NaiveDateTime) -> String {
    chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt, chrono::Utc)
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

fn to_template_dto(row: TemplateRow) -> TemplateDto {
    let metadata = parse_json_safe_bytes(&row.metadata_json);
    TemplateDto {
        id: row.id,
        owner_id: row.owner_id,
        name: row.name,
        description: row.description,
        document_type: row.document_type,
        scenario_type: row.scenario_type,
        locale: row.language,
        is_system: row.is_system,
        layout_spec: extract_layout_spec(&metadata),
        created_at: fmt_dt(row.created_at),
        updated_at: fmt_dt(row.updated_at),
    }
}

fn to_document_dto(row: DocumentRow) -> DocumentDto {
    DocumentDto {
        id: row.id,
        owner_id: row.owner_id,
        child_id: row.child_id,
        template_id: row.template_id,
        title: row.title,
        document_type: row.document_type,
        locale: row.locale,
        layout_spec: parse_json_safe(&row.layout_spec_json),
        content: parse_json_safe(&row.content_json),
        version: row.version,
        created_at: fmt_dt(row.created_at),
        updated_at: fmt_dt(row.updated_at),
    }
}

fn to_activity_card_dto(row: ActivityCardRow) -> ActivityCardDto {
    ActivityCardDto {
        id: row.id,
        owner_id: row.owner_id,
        locale: row.language,
        label: row.label_text,
        pictogram_id: row.pictogram_id,
        arasaac_id: row.arasaac_id,
        local_image_path: row.local_image_path,
        category: row.category,
        is_system: row.is_system,
        created_at: fmt_dt(row.created_at),
        updated_at: fmt_dt(row.updated_at),
    }
}

fn extract_slot_count(layout_spec: &serde_json::Value) -> Option<u64> {
    if let Some(slot_count) = layout_spec
        .as_object()
        .and_then(|m| m.get("slotCount"))
        .and_then(|v| v.as_u64())
    {
        return Some(slot_count);
    }

    layout_spec
        .as_object()
        .and_then(|m| m.get("layout"))
        .and_then(|v| v.as_object())
        .and_then(|m| m.get("slotCount"))
        .and_then(|v| v.as_u64())
}

fn extract_layout_spec(metadata: &serde_json::Value) -> serde_json::Value {
    metadata
        .as_object()
        .and_then(|m| m.get("layout"))
        .cloned()
        .unwrap_or_else(|| metadata.clone())
}

fn metadata_with_layout(layout_spec: &serde_json::Value) -> serde_json::Value {
    serde_json::json!({ "layout": layout_spec })
}

fn content_slot_len(content: &serde_json::Value) -> Option<usize> {
    if let Some(arr) = content.as_array() {
        return Some(arr.len());
    }

    content
        .as_object()
        .and_then(|m| m.get("slots"))
        .and_then(|v| v.as_array())
        .map(|arr| arr.len())
}

fn validate_layout_for_type(document_type: &str, layout_spec: &serde_json::Value) -> AppResult<()> {
    match document_type {
        "FIRST_THEN" => {
            let slot_count = extract_slot_count(layout_spec)
                .ok_or_else(|| AppError::BadRequest("layout_spec.slotCount is required".into()))?;
            if slot_count != 2 {
                return Err(AppError::BadRequest("FIRST_THEN requires exactly 2 slots".into()));
            }
        }
        "CHOICE_BOARD" => {
            let slot_count = extract_slot_count(layout_spec)
                .ok_or_else(|| AppError::BadRequest("layout_spec.slotCount is required".into()))?;
            if !(2..=4).contains(&slot_count) {
                return Err(AppError::BadRequest("CHOICE_BOARD requires 2 to 4 slots".into()));
            }
        }
        "DAILY_SCHEDULE" => {
            let slot_count = extract_slot_count(layout_spec)
                .ok_or_else(|| AppError::BadRequest("layout_spec.slotCount is required".into()))?;
            if !(1..=10).contains(&slot_count) {
                return Err(AppError::BadRequest("DAILY_SCHEDULE supports at most 10 slots".into()));
            }
        }
        "ROUTINE_STEPS" => {
            let slot_count = extract_slot_count(layout_spec)
                .ok_or_else(|| AppError::BadRequest("layout_spec.slotCount is required".into()))?;
            if !(1..=10).contains(&slot_count) {
                return Err(AppError::BadRequest("ROUTINE_STEPS supports 1 to 10 slots".into()));
            }
        }
        "REWARD_TRACKER" => {
            let slot_count = extract_slot_count(layout_spec)
                .ok_or_else(|| AppError::BadRequest("layout_spec.slotCount is required".into()))?;
            if !(5..=10).contains(&slot_count) {
                return Err(AppError::BadRequest("REWARD_TRACKER requires 5 to 10 slots".into()));
            }
        }
        _ => {}
    }

    Ok(())
}

fn validate_content_matches_layout(content: &serde_json::Value, layout_spec: &serde_json::Value) -> AppResult<()> {
    let Some(expected_slots) = extract_slot_count(layout_spec) else {
        return Ok(());
    };

    if let Some(actual_len) = content_slot_len(content) {
        if actual_len != expected_slots as usize {
            return Err(AppError::BadRequest(format!(
                "content slots ({actual_len}) does not match layout slotCount ({expected_slots})"
            )));
        }
    }

    Ok(())
}

async fn assert_child_access(pool: &crate::db::Db, child_id: &Option<String>, user: &AuthUser) -> AppResult<()> {
    let Some(child_id) = child_id else {
        return Ok(());
    };

    if child_id.trim().is_empty() {
        return Err(AppError::BadRequest("child_id cannot be empty".into()));
    }

    let exists: bool = if user.role == UserRole::Admin {
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM child_profiles WHERE id = ?)")
            .bind(child_id)
            .fetch_one(pool)
            .await?
    } else {
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM child_profiles WHERE id = ? AND parent_id = ?)")
            .bind(child_id)
            .bind(&user.user_id)
            .fetch_one(pool)
            .await?
    };

    if !exists {
        return Err(AppError::Forbidden);
    }

    Ok(())
}

async fn get_document_row_for_user(pool: &crate::db::Db, id: &str, user: &AuthUser) -> AppResult<DocumentRow> {
    let row: Option<DocumentRow> = sqlx::query_as::<_, DocumentRow>(
        "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
         FROM visual_support_documents
         WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;

    let row = row.ok_or(AppError::NotFound)?;
    if user.role != UserRole::Admin && row.owner_id != user.user_id {
        return Err(AppError::Forbidden);
    }
    Ok(row)
}

async fn list_templates(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(q): Query<TemplateQuery>,
) -> AppResult<Json<Vec<TemplateDto>>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    if let Some(t) = q.document_type.as_deref() {
        if !is_valid_document_type(t) {
            return Err(AppError::BadRequest("Invalid document type".into()));
        }
    }

    let pool = &state.pool;

    let rows: Vec<TemplateRow> = if user.role == UserRole::Admin {
        match (&q.document_type, &q.locale) {
            (Some(t), Some(locale)) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     WHERE document_type = ? AND language = ?
                     ORDER BY is_system DESC, name",
                )
                .bind(t)
                .bind(locale)
                .fetch_all(pool)
                .await?
            }
            (Some(t), None) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     WHERE document_type = ?
                     ORDER BY is_system DESC, name",
                )
                .bind(t)
                .fetch_all(pool)
                .await?
            }
            (None, Some(locale)) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     WHERE language = ?
                     ORDER BY is_system DESC, name",
                )
                .bind(locale)
                .fetch_all(pool)
                .await?
            }
            (None, None) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     ORDER BY is_system DESC, name",
                )
                .fetch_all(pool)
                .await?
            }
        }
    } else {
        match (&q.document_type, &q.locale) {
            (Some(t), Some(locale)) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     WHERE (is_system = 1 OR owner_id = ?) AND document_type = ? AND language = ?
                     ORDER BY is_system DESC, name",
                )
                .bind(&user.user_id)
                .bind(t)
                .bind(locale)
                .fetch_all(pool)
                .await?
            }
            (Some(t), None) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     WHERE (is_system = 1 OR owner_id = ?) AND document_type = ?
                     ORDER BY is_system DESC, name",
                )
                .bind(&user.user_id)
                .bind(t)
                .fetch_all(pool)
                .await?
            }
            (None, Some(locale)) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     WHERE (is_system = 1 OR owner_id = ?) AND language = ?
                     ORDER BY is_system DESC, name",
                )
                .bind(&user.user_id)
                .bind(locale)
                .fetch_all(pool)
                .await?
            }
            (None, None) => {
                sqlx::query_as::<_, TemplateRow>(
                    "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
                     FROM visual_support_documents_templates
                     WHERE is_system = 1 OR owner_id = ?
                     ORDER BY is_system DESC, name",
                )
                .bind(&user.user_id)
                .fetch_all(pool)
                .await?
            }
        }
    };

    Ok(Json(rows.into_iter().map(to_template_dto).collect()))
}

async fn create_template(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<CreateTemplateBody>,
) -> AppResult<(StatusCode, Json<TemplateDto>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    if !is_valid_document_type(&body.document_type) {
        return Err(AppError::BadRequest("Invalid document type".into()));
    }

    validate_layout_for_type(&body.document_type, &body.layout_spec)?;

    let is_system = if user.role == UserRole::Admin {
        body.is_system.unwrap_or(true)
    } else {
        if body.is_system.unwrap_or(false) {
            return Err(AppError::Forbidden);
        }
        false
    };

    let owner_id: Option<String> = if is_system {
        None
    } else {
        Some(user.user_id.clone())
    };

    let locale = body.locale.unwrap_or_else(|| "en".to_string());
    let scenario_type = body.scenario_type.unwrap_or_else(|| "CUSTOM".to_string());
    let id = Uuid::new_v4().to_string();
    let metadata_json = serde_json::to_string(&metadata_with_layout(&body.layout_spec))
        .map_err(|_| AppError::BadRequest("Invalid layout_spec JSON".into()))?;

    sqlx::query(
        "INSERT INTO visual_support_documents_templates
         (id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(owner_id)
    .bind(&body.name)
    .bind(body.description)
    .bind(&body.document_type)
    .bind(&scenario_type)
    .bind(&locale)
    .bind(is_system)
    .bind(&metadata_json)
    .execute(&state.pool)
    .await?;

    let row: TemplateRow = sqlx::query_as::<_, TemplateRow>(
        "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
         FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(to_template_dto(row))))
}

async fn update_template(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateTemplateBody>,
) -> AppResult<Json<TemplateDto>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let existing: TemplateRow = sqlx::query_as::<_, TemplateRow>(
           "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
            FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    if user.role != UserRole::Admin {
        let owned = existing.owner_id.as_deref() == Some(&user.user_id);
        if !owned || existing.is_system {
            return Err(AppError::Forbidden);
        }
    }

    if let Some(name) = body.name {
        sqlx::query("UPDATE visual_support_documents_templates SET name = ? WHERE id = ?")
            .bind(name)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(description) = body.description {
        sqlx::query("UPDATE visual_support_documents_templates SET description = ? WHERE id = ?")
            .bind(description)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(scenario_type) = body.scenario_type {
        sqlx::query("UPDATE visual_support_documents_templates SET scenario_type = ? WHERE id = ?")
            .bind(scenario_type)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(locale) = body.locale {
        sqlx::query("UPDATE visual_support_documents_templates SET language = ? WHERE id = ?")
            .bind(locale)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(layout_spec) = body.layout_spec {
        validate_layout_for_type(&existing.document_type, &layout_spec)?;
        let metadata_json = serde_json::to_string(&metadata_with_layout(&layout_spec))
            .map_err(|_| AppError::BadRequest("Invalid layout_spec JSON".into()))?;
        sqlx::query("UPDATE visual_support_documents_templates SET metadata_json = ? WHERE id = ?")
            .bind(metadata_json)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    let row: TemplateRow = sqlx::query_as::<_, TemplateRow>(
        "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
         FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(to_template_dto(row)))
}

async fn delete_template(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if user.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }

    let _existing: TemplateRow = sqlx::query_as::<_, TemplateRow>(
           "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
            FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let in_use: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM visual_support_documents WHERE template_id = ?)")
        .bind(&id)
        .fetch_one(&state.pool)
        .await?;

    if in_use {
        return Err(AppError::Conflict("Template is in use by existing documents".into()));
    }

    sqlx::query("DELETE FROM visual_support_documents_templates WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn copy_template_to_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<CopyTemplateBody>,
) -> AppResult<(StatusCode, Json<DocumentDto>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let template: TemplateRow = sqlx::query_as::<_, TemplateRow>(
           "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
            FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let can_use = if user.role == UserRole::Admin {
        true
    } else {
        template.is_system || template.owner_id.as_deref() == Some(&user.user_id)
    };
    if !can_use {
        return Err(AppError::Forbidden);
    }

    assert_child_access(&state.pool, &body.child_id, &user).await?;

    let template_metadata = parse_json_safe_bytes(&template.metadata_json);
    let template_layout = extract_layout_spec(&template_metadata);
    validate_layout_for_type(&template.document_type, &template_layout)?;

    let initial_content = build_template_initial_content(&state.pool, &id, &template_layout).await?;
    let initial_content_json = serde_json::to_string(&initial_content)
        .map_err(|_| AppError::BadRequest("Invalid initial content JSON".into()))?;

    let layout_spec_json = serde_json::to_string(&template_layout)
        .map_err(|_| AppError::BadRequest("Invalid template layout JSON".into()))?;

    let doc_id = Uuid::new_v4().to_string();
    let title = body.title.unwrap_or_else(|| template.name.clone());

    sqlx::query(
        "INSERT INTO visual_support_documents
         (id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    )
    .bind(&doc_id)
    .bind(&user.user_id)
    .bind(&body.child_id)
    .bind(&id)
    .bind(&title)
    .bind(&template.document_type)
        .bind(&template.language)
        .bind(layout_spec_json)
    .bind(initial_content_json)
    .execute(&state.pool)
    .await?;

    let row: DocumentRow = sqlx::query_as::<_, DocumentRow>(
        "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
            FROM visual_support_documents
         WHERE id = ?",
    )
    .bind(&doc_id)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(to_document_dto(row))))
}

async fn build_template_initial_content(
    pool: &crate::db::Db,
    template_id: &str,
    template_layout: &serde_json::Value,
) -> AppResult<serde_json::Value> {
    let activity_rows: Vec<TemplateActivityRow> = sqlx::query_as::<_, TemplateActivityRow>(
        "SELECT
            ta.activity_order,
            COALESCE(al.id, CONCAT('activity-', ta.activity_order)) AS activity_id,
            COALESCE(NULLIF(ta.text_label, ''), al.label_text, CONCAT('Step ', ta.activity_order)) AS label,
            al.local_image_path AS pictogram_url
         FROM visual_support_template_activities ta
         LEFT JOIN visual_support_activity_library al ON al.id = ta.activity_card_id
         WHERE ta.template_id = ?
         ORDER BY ta.activity_order ASC",
    )
    .bind(template_id)
    .fetch_all(pool)
    .await?;

    let expected_slots = extract_slot_count(template_layout).unwrap_or(0);
    let slot_count = if expected_slots > 0 {
        expected_slots as usize
    } else {
        activity_rows.len()
    };

    let mut slots = vec![serde_json::Value::Null; slot_count];
    for row in &activity_rows {
        let idx = (row.activity_order - 1).max(0) as usize;
        if idx >= slots.len() {
            continue;
        }
        slots[idx] = serde_json::json!({
            "id": row.activity_id,
            "label": row.label,
            "pictogramUrl": row.pictogram_url
        });
    }

    Ok(serde_json::json!({ "slots": slots }))
}

async fn preview_template_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<TemplatePreviewDto>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let template: TemplateRow = sqlx::query_as::<_, TemplateRow>(
        "SELECT id, owner_id, name, description, document_type, scenario_type, language, is_system, metadata_json, created_at, updated_at
         FROM visual_support_documents_templates
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    let can_use = if user.role == UserRole::Admin {
        true
    } else {
        template.is_system || template.owner_id.as_deref() == Some(&user.user_id)
    };
    if !can_use {
        return Err(AppError::Forbidden);
    }

    let template_metadata = parse_json_safe_bytes(&template.metadata_json);
    let template_layout = extract_layout_spec(&template_metadata);
    validate_layout_for_type(&template.document_type, &template_layout)?;

    let content = build_template_initial_content(&state.pool, &id, &template_layout).await?;

    Ok(Json(TemplatePreviewDto {
        template_id: template.id,
        title: template.name,
        document_type: template.document_type,
        locale: template.language,
        layout_spec: template_layout,
        content,
    }))
}

async fn list_activity_cards(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(q): Query<ActivityCardsQuery>,
) -> AppResult<Json<Vec<ActivityCardDto>>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let locale = q.locale.unwrap_or_else(|| "en".to_string());
    let rows: Vec<ActivityCardRow> = if user.role == UserRole::Admin {
        sqlx::query_as::<_, ActivityCardRow>(
            "SELECT id, owner_id, language, label_text, pictogram_id, arasaac_id, local_image_path, category, is_system, created_at, updated_at
             FROM visual_support_activity_library
             WHERE language = ?
             ORDER BY is_system DESC, priority_order ASC, label_text ASC",
        )
        .bind(&locale)
        .fetch_all(&state.pool)
        .await?
    } else {
        sqlx::query_as::<_, ActivityCardRow>(
            "SELECT id, owner_id, language, label_text, pictogram_id, arasaac_id, local_image_path, category, is_system, created_at, updated_at
             FROM visual_support_activity_library
             WHERE language = ? AND (is_system = 1 OR owner_id = ?)
             ORDER BY is_system DESC, priority_order ASC, label_text ASC",
        )
        .bind(&locale)
        .bind(&user.user_id)
        .fetch_all(&state.pool)
        .await?
    };

    Ok(Json(rows.into_iter().map(to_activity_card_dto).collect()))
}

async fn create_activity_card(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<CreateActivityCardBody>,
) -> AppResult<(StatusCode, Json<ActivityCardDto>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let label = body.label.trim();
    if label.is_empty() {
        return Err(AppError::BadRequest("Activity card label is required".into()));
    }

    let id = Uuid::new_v4().to_string();
    let locale = body.locale.unwrap_or_else(|| "en".to_string());
    let pictogram_id = body.pictogram_id.clone();
    let arasaac_id = pictogram_id
        .as_deref()
        .and_then(|value| value.parse::<i32>().ok());

    let local_image_path: Option<String> = if let Some(arasaac_id) = arasaac_id {
        sqlx::query_scalar::<_, String>(
            "SELECT local_file_path FROM pictograms WHERE arasaac_id = ? LIMIT 1",
        )
        .bind(arasaac_id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        None
    };

    sqlx::query(
        "INSERT INTO visual_support_activity_library
         (id, owner_id, language, label_text, pictogram_id, arasaac_id, local_image_path, category, is_system)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
    )
    .bind(&id)
    .bind(&user.user_id)
    .bind(&locale)
    .bind(label)
    .bind(pictogram_id)
    .bind(arasaac_id)
    .bind(local_image_path)
    .bind(body.category)
    .execute(&state.pool)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db_err) if db_err.code().as_deref() == Some("23000") => {
            AppError::Conflict("Activity card already exists for this locale".into())
        }
        _ => AppError::from(e),
    })?;

    let row: ActivityCardRow = sqlx::query_as::<_, ActivityCardRow>(
        "SELECT id, owner_id, language, label_text, pictogram_id, arasaac_id, local_image_path, category, is_system, created_at, updated_at
         FROM visual_support_activity_library
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(to_activity_card_dto(row))))
}

async fn delete_activity_card(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let row: ActivityCardRow = sqlx::query_as::<_, ActivityCardRow>(
        "SELECT id, owner_id, language, label_text, pictogram_id, arasaac_id, local_image_path, category, is_system, created_at, updated_at
         FROM visual_support_activity_library
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    if row.is_system {
        return Err(AppError::Conflict("Default activity cards cannot be deleted".into()));
    }

    if user.role != UserRole::Admin && row.owner_id.as_deref() != Some(&user.user_id) {
        return Err(AppError::Forbidden);
    }

    sqlx::query("DELETE FROM visual_support_activity_library WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn update_activity_card(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateActivityCardBody>,
) -> AppResult<Json<ActivityCardDto>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let existing: ActivityCardRow = sqlx::query_as::<_, ActivityCardRow>(
        "SELECT id, owner_id, language, label_text, pictogram_id, arasaac_id, local_image_path, category, is_system, created_at, updated_at
         FROM visual_support_activity_library
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::NotFound)?;

    if existing.is_system {
        return Err(AppError::Conflict("Default activity cards cannot be edited".into()));
    }

    if user.role != UserRole::Admin && existing.owner_id.as_deref() != Some(&user.user_id) {
        return Err(AppError::Forbidden);
    }

    let label = body
        .label
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .unwrap_or(existing.label_text.clone());

    if label.trim().is_empty() {
        return Err(AppError::BadRequest("Activity card label is required".into()));
    }

    let locale = body.locale.unwrap_or(existing.language.clone());

    // If pictogram_id is present but empty, treat as clear.
    let pictogram_id = match body.pictogram_id {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value),
        None => existing.pictogram_id.clone(),
    };

    let arasaac_id = pictogram_id
        .as_deref()
        .and_then(|value| value.parse::<i32>().ok());

    let local_image_path: Option<String> = if let Some(arasaac_id) = arasaac_id {
        sqlx::query_scalar::<_, String>(
            "SELECT local_file_path FROM pictograms WHERE arasaac_id = ? LIMIT 1",
        )
        .bind(arasaac_id)
        .fetch_optional(&state.pool)
        .await?
    } else {
        None
    };

    let category = body.category.or(existing.category.clone());

    sqlx::query(
        "UPDATE visual_support_activity_library
         SET language = ?, label_text = ?, pictogram_id = ?, arasaac_id = ?, local_image_path = ?, category = ?
         WHERE id = ?",
    )
    .bind(&locale)
    .bind(&label)
    .bind(&pictogram_id)
    .bind(arasaac_id)
    .bind(local_image_path)
    .bind(category)
    .bind(&id)
    .execute(&state.pool)
    .await
    .map_err(|e| match &e {
        sqlx::Error::Database(db_err) if db_err.code().as_deref() == Some("23000") => {
            AppError::Conflict("Activity card already exists for this locale".into())
        }
        _ => AppError::from(e),
    })?;

    let row: ActivityCardRow = sqlx::query_as::<_, ActivityCardRow>(
        "SELECT id, owner_id, language, label_text, pictogram_id, arasaac_id, local_image_path, category, is_system, created_at, updated_at
         FROM visual_support_activity_library
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(to_activity_card_dto(row)))
}

async fn list_documents(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Query(q): Query<ListDocumentsQuery>,
) -> AppResult<Json<Vec<DocumentDto>>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    if let Some(t) = q.document_type.as_deref() {
        if !is_valid_document_type(t) {
            return Err(AppError::BadRequest("Invalid document type".into()));
        }
    }

    assert_child_access(&state.pool, &q.child_id, &user).await?;

    let pool = &state.pool;
    let rows: Vec<DocumentRow> = if user.role == UserRole::Admin {
        match (&q.document_type, &q.child_id) {
            (Some(t), Some(child_id)) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     WHERE document_type = ? AND child_id = ?
                     ORDER BY updated_at DESC",
                )
                .bind(t)
                .bind(child_id)
                .fetch_all(pool)
                .await?
            }
            (Some(t), None) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     WHERE document_type = ?
                     ORDER BY updated_at DESC",
                )
                .bind(t)
                .fetch_all(pool)
                .await?
            }
            (None, Some(child_id)) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     WHERE child_id = ?
                     ORDER BY updated_at DESC",
                )
                .bind(child_id)
                .fetch_all(pool)
                .await?
            }
            (None, None) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     ORDER BY updated_at DESC",
                )
                .fetch_all(pool)
                .await?
            }
        }
    } else {
        match (&q.document_type, &q.child_id) {
            (Some(t), Some(child_id)) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     WHERE owner_id = ? AND document_type = ? AND child_id = ?
                     ORDER BY updated_at DESC",
                )
                .bind(&user.user_id)
                .bind(t)
                .bind(child_id)
                .fetch_all(pool)
                .await?
            }
            (Some(t), None) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     WHERE owner_id = ? AND document_type = ?
                     ORDER BY updated_at DESC",
                )
                .bind(&user.user_id)
                .bind(t)
                .fetch_all(pool)
                .await?
            }
            (None, Some(child_id)) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     WHERE owner_id = ? AND child_id = ?
                     ORDER BY updated_at DESC",
                )
                .bind(&user.user_id)
                .bind(child_id)
                .fetch_all(pool)
                .await?
            }
            (None, None) => {
                sqlx::query_as::<_, DocumentRow>(
                    "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
                     FROM visual_support_documents
                     WHERE owner_id = ?
                     ORDER BY updated_at DESC",
                )
                .bind(&user.user_id)
                .fetch_all(pool)
                .await?
            }
        }
    };

    Ok(Json(rows.into_iter().map(to_document_dto).collect()))
}

async fn create_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Json(body): Json<CreateDocumentBody>,
) -> AppResult<(StatusCode, Json<DocumentDto>)> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    if !is_valid_document_type(&body.document_type) {
        return Err(AppError::BadRequest("Invalid document type".into()));
    }

    validate_layout_for_type(&body.document_type, &body.layout_spec)?;
    validate_content_matches_layout(&body.content, &body.layout_spec)?;

    assert_child_access(&state.pool, &body.child_id, &user).await?;

    if let Some(template_id) = &body.template_id {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM visual_support_documents_templates WHERE id = ?)")
            .bind(template_id)
            .fetch_one(&state.pool)
            .await?;
        if !exists {
            return Err(AppError::BadRequest("template_id does not exist".into()));
        }
    }

    let layout_spec_json = serde_json::to_string(&body.layout_spec)
        .map_err(|_| AppError::BadRequest("Invalid layout_spec JSON".into()))?;
    let content_json = serde_json::to_string(&body.content)
        .map_err(|_| AppError::BadRequest("Invalid content JSON".into()))?;

    let id = Uuid::new_v4().to_string();
    let locale = body.locale.unwrap_or_else(|| "en".to_string());

    sqlx::query(
        "INSERT INTO visual_support_documents
         (id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    )
    .bind(&id)
    .bind(&user.user_id)
    .bind(&body.child_id)
    .bind(&body.template_id)
    .bind(&body.title)
    .bind(&body.document_type)
    .bind(&locale)
    .bind(&layout_spec_json)
    .bind(&content_json)
    .execute(&state.pool)
    .await?;

    let row: DocumentRow = sqlx::query_as::<_, DocumentRow>(
        "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
         FROM visual_support_documents
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok((StatusCode::CREATED, Json(to_document_dto(row))))
}

async fn get_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<DocumentDto>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let row = get_document_row_for_user(&state.pool, &id, &user).await?;

    Ok(Json(to_document_dto(row)))
}

async fn update_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(body): Json<UpdateDocumentBody>,
) -> AppResult<Json<DocumentDto>> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let row = get_document_row_for_user(&state.pool, &id, &user).await?;

    if body.layout_spec.is_some() || body.content.is_some() {
        let existing_layout = parse_json_safe(&row.layout_spec_json);
        let effective_layout = body.layout_spec.as_ref().unwrap_or(&existing_layout);
        validate_layout_for_type(&row.document_type, effective_layout)?;

        let existing_content = parse_json_safe(&row.content_json);
        let effective_content = body.content.as_ref().unwrap_or(&existing_content);
        validate_content_matches_layout(effective_content, effective_layout)?;
    }

    if let Some(expected) = body.expected_version {
        if expected != row.version {
            return Err(AppError::Conflict("Version conflict. Reload and retry.".into()));
        }
    }

    if let Some(child_id) = &body.child_id {
        let tmp = Some(child_id.clone());
        assert_child_access(&state.pool, &tmp, &user).await?;
    }

    if let Some(title) = body.title {
        sqlx::query("UPDATE visual_support_documents SET title = ? WHERE id = ?")
            .bind(title)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(locale) = body.locale {
        sqlx::query("UPDATE visual_support_documents SET locale = ? WHERE id = ?")
            .bind(locale)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(child_id) = body.child_id {
        sqlx::query("UPDATE visual_support_documents SET child_id = ? WHERE id = ?")
            .bind(child_id)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(layout_spec) = body.layout_spec {
        let layout_spec_json = serde_json::to_string(&layout_spec)
            .map_err(|_| AppError::BadRequest("Invalid layout_spec JSON".into()))?;
        sqlx::query("UPDATE visual_support_documents SET layout_spec_json = ? WHERE id = ?")
            .bind(layout_spec_json)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    if let Some(content) = body.content {
        let content_json = serde_json::to_string(&content)
            .map_err(|_| AppError::BadRequest("Invalid content JSON".into()))?;
        sqlx::query("UPDATE visual_support_documents SET content_json = ? WHERE id = ?")
            .bind(content_json)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }

    sqlx::query("UPDATE visual_support_documents SET version = version + 1 WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    let updated: DocumentRow = sqlx::query_as::<_, DocumentRow>(
        "SELECT id, owner_id, child_id, template_id, title, document_type, locale, layout_spec_json, content_json, version, created_at, updated_at
         FROM visual_support_documents
         WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(to_document_dto(updated)))
}

async fn delete_document(
    State(state): State<AppState>,
    Extension(user): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    if user.role == UserRole::Child {
        return Err(AppError::Forbidden);
    }

    let _ = get_document_row_for_user(&state.pool, &id, &user).await?;

    sqlx::query("DELETE FROM visual_support_documents WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
