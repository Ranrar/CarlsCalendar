use std::{
    path::Path,
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppResult};

const ARASAAC_API_BASE: &str = "https://api.arasaac.org/v1";
const ARASAAC_STATIC_BASE: &str = "https://static.arasaac.org/pictograms";
const DEFAULT_LICENSE: &str = "CC BY-NC-SA 4.0 (ARASAAC / Gobierno de Aragón; author Sergio Palao)";
const STORE_ROOT: &str = "backend/assets_seed/pictograms";

static LAST_PICTOGRAM_ACTIVITY_UNIX: OnceLock<AtomicU64> = OnceLock::new();

#[derive(Debug, Serialize, Clone)]
pub struct PictogramPrefetchSettingsDto {
    pub enabled: bool,
    pub idle_minutes: u64,
    pub batch_size: u64,
    pub last_run_at: Option<String>,
    pub last_result: Option<serde_json::Value>,
    pub idle_seconds: u64,
}

#[derive(Debug, Serialize, Clone)]
pub struct PictogramPrefetchRunResultDto {
    pub processed_ids: u64,
    pub downloaded: u64,
    pub already_cached: u64,
    pub hydrated_seeded: u64,
    pub idle_seconds: u64,
}

#[derive(sqlx::FromRow)]
struct PrefetchSettingsRow {
    enabled: bool,
    idle_minutes: i32,
    batch_size: i32,
    last_run_at: Option<chrono::NaiveDateTime>,
    last_result_json: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ArasaacIdRow {
    arasaac_id: i32,
}

#[derive(Debug, Serialize, Clone)]
pub struct PictogramDto {
    pub arasaac_id: i32,
    pub keywords: Vec<String>,
    pub category: Option<String>,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub language: String,
    pub image_url: Option<String>,
    pub local_file_path: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub license: String,
    pub description: Option<String>,
}

/// A saved pictogram entry returned to the client, enriching the bookmark record
/// with the underlying pictogram details.
#[derive(Debug, Serialize, Clone)]
pub struct SavedPictogramDto {
    pub arasaac_id: i32,
    pub label: Option<String>,
    pub used_count: i32,
    pub keywords: Vec<String>,
    pub categories: Vec<String>,
    pub tags: Vec<String>,
    pub language: String,
    pub image_url: Option<String>,
    pub local_file_path: Option<String>,
    pub license: String,
    pub description: Option<String>,
}

#[derive(sqlx::FromRow)]
struct PictogramRow {
    arasaac_id: i32,
    keywords_text: String,
    category: Option<String>,
    categories_text: Option<String>,
    tags_text: Option<String>,
    language: String,
    image_url: Option<String>,
    local_file_path: Option<String>,
    width: Option<i32>,
    height: Option<i32>,
    license: String,
    description: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ExistingLocalFile {
    local_file_path: Option<String>,
}

#[derive(sqlx::FromRow)]
struct SavedRow {
    arasaac_id: i32,
    label: Option<String>,
    used_count: i32,
    keywords_text: Option<String>,
    categories_text: Option<String>,
    tags_text: Option<String>,
    language: Option<String>,
    image_url: Option<String>,
    local_file_path: Option<String>,
    license: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ArasaacKeyword {
    keyword: Option<String>,
    plural: Option<String>,
    meaning: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct ArasaacPictogram {
    #[serde(rename = "_id")]
    id: i32,
    #[serde(default)]
    keywords: Vec<ArasaacKeyword>,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
    desc: Option<String>,
}

pub async fn search_local_first(
    pool: &crate::db::Db,
    language: &str,
    query: &str,
) -> AppResult<Vec<PictogramDto>> {
    let local_db_ready = match ensure_pictograms_table(pool).await {
        Ok(_) => true,
        Err(err) => {
            tracing::warn!(error = ?err, "Pictograms table ensure failed; continuing with remote-only search");
            false
        }
    };

    let language = normalize_language(language);
    let query = query.trim();
    if query.is_empty() {
        return Err(AppError::BadRequest("Query cannot be empty".into()));
    }

    if local_db_ready {
        let mut local = query_local(pool, &language, query).await?;
        if !local.is_empty() {
            sort_by_fuzzy_score(&mut local, query);
            return Ok(local);
        }
    }

    let remote = fetch_remote_search(&language, query).await?;
    if remote.is_empty() {
        return Ok(vec![]);
    }

    if local_db_ready {
        for p in &remote {
            if let Err(err) = upsert_remote_pictogram(pool, &language, p).await {
                tracing::warn!(error = ?err, arasaac_id = p.id, "Failed caching pictogram locally");
            }
        }
    }

    if !local_db_ready {
        let mut mapped = remote.into_iter().map(|p| remote_to_dto(&language, &p)).collect::<Vec<_>>();
        sort_by_fuzzy_score(&mut mapped, query);
        return Ok(mapped);
    }

    let mut hydrated = query_local(pool, &language, query).await?;
    if hydrated.is_empty() {
        hydrated = query_local_by_ids(pool, &remote.iter().map(|p| p.id).collect::<Vec<_>>()).await?;
    }
    sort_by_fuzzy_score(&mut hydrated, query);
    Ok(hydrated)
}

pub async fn get_or_fetch_by_id(
    pool: &crate::db::Db,
    language: &str,
    arasaac_id: i32,
) -> AppResult<PictogramDto> {
    let local_db_ready = match ensure_pictograms_table(pool).await {
        Ok(_) => true,
        Err(err) => {
            tracing::warn!(error = ?err, "Pictograms table ensure failed; continuing with remote-only fetch");
            false
        }
    };

    if arasaac_id <= 0 {
        return Err(AppError::BadRequest("Invalid pictogram id".into()));
    }

    if local_db_ready {
        if let Some(local) = query_local_by_id(pool, arasaac_id).await? {
            if let Some(path) = local.local_file_path.as_deref() {
                if local_path_exists(path).await {
                    return Ok(local);
                }
                tracing::debug!(arasaac_id, path, "Local pictogram DB row exists but file is missing; refetching");
            }
        }
    }

    let language = normalize_language(language);
    let remote = fetch_remote_by_id(&language, arasaac_id).await?;
    if local_db_ready {
        if let Err(err) = upsert_remote_pictogram(pool, &language, &remote).await {
            tracing::warn!(error = ?err, arasaac_id, "Failed caching pictogram locally");
            return Ok(remote_to_dto(&language, &remote));
        }

        return query_local_by_id(pool, arasaac_id)
            .await?
            .ok_or_else(|| AppError::NotFound);
    }

    Ok(remote_to_dto(&language, &remote))
}

async fn query_local(pool: &crate::db::Db, language: &str, query: &str) -> AppResult<Vec<PictogramDto>> {
    // MySQL FULLTEXT requires words ≥ ft_min_word_len (default 4).
    // For very short queries fall back to a LIKE scan so single words like "eat"
    // still find results.
    if query.len() < 4 || to_fulltext_boolean(query).is_empty() {
        return query_local_like(pool, language, query).await;
    }

    let ft_query = to_fulltext_boolean(query);
    let rows: Vec<PictogramRow> = sqlx::query_as::<_, PictogramRow>(
        "SELECT arasaac_id, keywords_text, category, categories_text, tags_text, language,
                image_url, local_file_path, width, height, license, description
         FROM pictograms
         WHERE language = ?
           AND MATCH(keywords_text, categories_text, tags_text, description)
               AGAINST (? IN BOOLEAN MODE)
         LIMIT 60",
    )
    .bind(language)
    .bind(&ft_query)
    .fetch_all(pool)
    .await?;

    // If FULLTEXT returned nothing (e.g. all stop-words), retry with LIKE
    if rows.is_empty() {
        return query_local_like(pool, language, query).await;
    }

    Ok(rows.into_iter().map(row_to_dto).collect())
}

async fn query_local_like(pool: &crate::db::Db, language: &str, query: &str) -> AppResult<Vec<PictogramDto>> {
    let like = format!("%{}%", query.to_lowercase());
    let rows: Vec<PictogramRow> = sqlx::query_as::<_, PictogramRow>(
        "SELECT arasaac_id, keywords_text, category, categories_text, tags_text, language,
                image_url, local_file_path, width, height, license, description
         FROM pictograms
         WHERE language = ?
           AND (
                LOWER(keywords_text)   LIKE ?
             OR LOWER(categories_text) LIKE ?
             OR LOWER(tags_text)       LIKE ?
             OR LOWER(description)     LIKE ?
           )
         ORDER BY updated_at DESC
         LIMIT 60",
    )
    .bind(language)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .bind(&like)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(row_to_dto).collect())
}

/// Convert a free-text query into a MySQL FULLTEXT BOOLEAN MODE expression.
/// Each token becomes a prefix-search term (`word*`).
fn to_fulltext_boolean(query: &str) -> String {
    // Remove characters that carry special meaning in FULLTEXT BOOLEAN MODE
    let stripped: String = query
        .chars()
        .map(|c| if matches!(c, '+' | '-' | '>' | '<' | '(' | ')' | '~' | '*' | '"' | '@' | '\\') {
            ' '
        } else {
            c
        })
        .collect();

    stripped
        .split_whitespace()
        .filter(|t| t.len() >= 2)
        .map(|t| format!("{}*", t))
        .collect::<Vec<_>>()
        .join(" ")
}

async fn ensure_pictograms_table(pool: &crate::db::Db) -> AppResult<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS pictograms (
            id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            arasaac_id      INT NOT NULL,
            keywords_json   JSON NOT NULL,
            category        VARCHAR(120) NULL,
            categories_json JSON NULL,
            tags_json       JSON NULL,
            keywords_text   TEXT NOT NULL,
            categories_text TEXT NULL,
            tags_text       TEXT NULL,
            description     TEXT NULL,
            language        VARCHAR(8) NOT NULL DEFAULT 'en',
            image_url       VARCHAR(500) NULL,
            local_file_path VARCHAR(500) NULL,
            width           INT NULL,
            height          INT NULL,
            license         VARCHAR(255) NOT NULL DEFAULT 'CC BY-NC-SA 4.0 (ARASAAC / Gobierno de Aragón; author Sergio Palao)',
            metadata_json   JSON NULL,
            created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pictograms_arasaac_id (arasaac_id),
            INDEX idx_pictograms_language (language),
            INDEX idx_pictograms_category (category),
            FULLTEXT KEY ft_pictograms_search (keywords_text, categories_text, tags_text, description)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn query_local_by_ids(pool: &crate::db::Db, ids: &[i32]) -> AppResult<Vec<PictogramDto>> {
    if ids.is_empty() {
        return Ok(vec![]);
    }

    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(row) = query_local_by_id(pool, *id).await? {
            out.push(row);
        }
    }
    Ok(out)
}

async fn query_local_by_id(pool: &crate::db::Db, arasaac_id: i32) -> AppResult<Option<PictogramDto>> {
    let row: Option<PictogramRow> = sqlx::query_as::<_, PictogramRow>(
        "SELECT arasaac_id, keywords_text, category, categories_text, tags_text, language,
                image_url, local_file_path, width, height, license, description
         FROM pictograms
         WHERE arasaac_id = ?
         LIMIT 1",
    )
    .bind(arasaac_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(row_to_dto))
}

fn row_to_dto(row: PictogramRow) -> PictogramDto {
    PictogramDto {
        arasaac_id: row.arasaac_id,
        keywords: split_tokens(&row.keywords_text),
        category: row.category,
        categories: split_tokens(row.categories_text.as_deref().unwrap_or_default()),
        tags: split_tokens(row.tags_text.as_deref().unwrap_or_default()),
        language: row.language,
        image_url: row.image_url,
        local_file_path: row.local_file_path,
        width: row.width,
        height: row.height,
        license: row.license,
        description: row.description,
    }
}

fn split_tokens(s: &str) -> Vec<String> {
    s.split("||")
        .map(str::trim)
        .filter(|x| !x.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn join_tokens(values: &[String]) -> String {
    values
        .iter()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>()
        .join("||")
}

fn normalize_language(language: &str) -> String {
    let l = language.trim().to_ascii_lowercase();
    if l.len() >= 2 {
        l
    } else {
        "en".to_string()
    }
}

fn sanitize_segment(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c.to_ascii_lowercase());
        } else if c.is_whitespace() {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() { "uncategorized".to_string() } else { out }
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn activity_clock() -> &'static AtomicU64 {
    LAST_PICTOGRAM_ACTIVITY_UNIX.get_or_init(|| AtomicU64::new(now_unix_seconds()))
}

pub fn mark_activity() {
    activity_clock().store(now_unix_seconds(), Ordering::Relaxed);
}

pub fn idle_seconds() -> u64 {
    let last = activity_clock().load(Ordering::Relaxed);
    now_unix_seconds().saturating_sub(last)
}

pub fn spawn_idle_prefetch_worker(state: crate::state::AppState) {
    let interval_secs = state.config.pictogram_prefetch_interval_seconds.max(10);
    tracing::info!(
        interval_secs,
        "Pictogram prefetch worker started (admin-toggle controlled)",
    );

    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(interval_secs));
        ticker.tick().await;

        loop {
            ticker.tick().await;

            let settings = match get_prefetch_settings_internal(&state.pool, &state.config).await {
                Ok(s) => s,
                Err(err) => {
                    tracing::warn!(error = ?err, "Unable to load pictogram prefetch settings");
                    continue;
                }
            };

            if !settings.enabled {
                continue;
            }

            let required_idle_secs = (settings.idle_minutes.max(1) as u64).saturating_mul(60);
            let current_idle = idle_seconds();
            if current_idle < required_idle_secs {
                continue;
            }

            if let Err(err) = prefetch_once_internal(&state.pool, settings.batch_size as u64, current_idle).await {
                tracing::warn!(error = ?err, "Idle pictogram prefetch run failed");
            }
        }
    });
}

pub async fn get_prefetch_settings(
    pool: &crate::db::Db,
    config: &crate::config::Config,
) -> AppResult<PictogramPrefetchSettingsDto> {
    let row = get_prefetch_settings_internal(pool, config).await?;
    Ok(prefetch_row_to_dto(row))
}

pub async fn update_prefetch_settings(
    pool: &crate::db::Db,
    config: &crate::config::Config,
    enabled: Option<bool>,
    idle_minutes: Option<u64>,
    batch_size: Option<u64>,
) -> AppResult<PictogramPrefetchSettingsDto> {
    ensure_prefetch_settings_row(pool, config).await?;

    if let Some(v) = enabled {
        sqlx::query("UPDATE pictogram_prefetch_settings SET enabled = ? WHERE id = 1")
            .bind(v)
            .execute(pool)
            .await?;
    }

    if let Some(v) = idle_minutes {
        let v = v.clamp(1, 24 * 60) as i32;
        sqlx::query("UPDATE pictogram_prefetch_settings SET idle_minutes = ? WHERE id = 1")
            .bind(v)
            .execute(pool)
            .await?;
    }

    if let Some(v) = batch_size {
        let v = v.clamp(1, 2_000) as i32;
        sqlx::query("UPDATE pictogram_prefetch_settings SET batch_size = ? WHERE id = 1")
            .bind(v)
            .execute(pool)
            .await?;
    }

    get_prefetch_settings(pool, config).await
}

pub async fn run_prefetch_now(
    pool: &crate::db::Db,
    config: &crate::config::Config,
) -> AppResult<PictogramPrefetchRunResultDto> {
    let settings = get_prefetch_settings_internal(pool, config).await?;
    prefetch_once_internal(pool, settings.batch_size as u64, idle_seconds()).await
}

async fn prefetch_once_internal(
    pool: &crate::db::Db,
    batch_size: u64,
    current_idle_seconds: u64,
) -> AppResult<PictogramPrefetchRunResultDto> {
    let hydrated_seeded = ensure_seeded_activity_assets(pool).await.unwrap_or(0) as u64;
    let ids = load_prefetch_candidate_ids(pool, batch_size).await?;

    let mut processed_ids = 0u64;
    let mut downloaded = 0u64;
    let mut already_cached = 0u64;

    for id in ids {
        processed_ids += 1;

        if is_arasaac_id_cached_locally(pool, id).await? {
            already_cached += 1;
            continue;
        }

        match get_or_fetch_by_id(pool, "en", id).await {
            Ok(dto) => {
                if let Some(path) = dto.local_file_path {
                    if local_path_exists(&path).await {
                        downloaded += 1;
                    }
                }
            }
            Err(err) => {
                tracing::debug!(error = ?err, arasaac_id = id, "Prefetch skipped due to fetch error");
            }
        }
    }

    let result = PictogramPrefetchRunResultDto {
        processed_ids,
        downloaded,
        already_cached,
        hydrated_seeded,
        idle_seconds: current_idle_seconds,
    };

    sqlx::query(
        "UPDATE pictogram_prefetch_settings
         SET last_run_at = UTC_TIMESTAMP(),
             last_result_json = ?
         WHERE id = 1",
    )
    .bind(serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string()))
    .execute(pool)
    .await?;

    Ok(result)
}

async fn load_prefetch_candidate_ids(pool: &crate::db::Db, batch_size: u64) -> AppResult<Vec<i32>> {
    let limit = batch_size.clamp(1, 2_000) as i64;
    let rows: Vec<ArasaacIdRow> = sqlx::query_as::<_, ArasaacIdRow>(
        "SELECT DISTINCT t.arasaac_id
         FROM (
            SELECT arasaac_id FROM visual_support_activity_library WHERE arasaac_id IS NOT NULL
            UNION
            SELECT arasaac_id FROM saved_pictograms WHERE arasaac_id IS NOT NULL
            UNION
            SELECT arasaac_id FROM pictograms WHERE arasaac_id IS NOT NULL
         ) t
         ORDER BY t.arasaac_id ASC
         LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(|r| r.arasaac_id).collect())
}

async fn is_arasaac_id_cached_locally(pool: &crate::db::Db, arasaac_id: i32) -> AppResult<bool> {
    let existing: Option<ExistingLocalFile> = sqlx::query_as::<_, ExistingLocalFile>(
        "SELECT local_file_path FROM pictograms WHERE arasaac_id = ? LIMIT 1",
    )
    .bind(arasaac_id)
    .fetch_optional(pool)
    .await?;

    if let Some(path) = existing.and_then(|r| r.local_file_path) {
        return Ok(local_path_exists(&path).await);
    }
    Ok(false)
}

async fn ensure_prefetch_settings_table(pool: &crate::db::Db) -> AppResult<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS pictogram_prefetch_settings (
            id                TINYINT NOT NULL PRIMARY KEY,
            enabled           BOOLEAN NOT NULL DEFAULT FALSE,
            idle_minutes      INT NOT NULL DEFAULT 20,
            batch_size        INT NOT NULL DEFAULT 50,
            last_run_at       DATETIME NULL,
            last_result_json  JSON NULL,
            created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn ensure_prefetch_settings_row(
    pool: &crate::db::Db,
    config: &crate::config::Config,
) -> AppResult<()> {
    ensure_prefetch_settings_table(pool).await?;

    sqlx::query(
        "INSERT INTO pictogram_prefetch_settings (id, enabled, idle_minutes, batch_size)
         VALUES (1, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = VALUES(id)",
    )
    .bind(config.pictogram_prefetch_default_enabled)
    .bind(config.pictogram_prefetch_idle_minutes.clamp(1, 24 * 60) as i32)
    .bind(config.pictogram_prefetch_batch_size.clamp(1, 2_000) as i32)
    .execute(pool)
    .await?;

    Ok(())
}

async fn get_prefetch_settings_internal(
    pool: &crate::db::Db,
    config: &crate::config::Config,
) -> AppResult<PrefetchSettingsRow> {
    ensure_prefetch_settings_row(pool, config).await?;

    sqlx::query_as::<_, PrefetchSettingsRow>(
        "SELECT
            enabled,
            idle_minutes,
            batch_size,
            last_run_at,
            CAST(last_result_json AS CHAR) AS last_result_json
         FROM pictogram_prefetch_settings
         WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(AppError::from)
}

fn prefetch_row_to_dto(row: PrefetchSettingsRow) -> PictogramPrefetchSettingsDto {
    let last_run_at = row.last_run_at.map(|dt| {
        chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(dt, chrono::Utc)
            .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
    });

    let last_result = row
        .last_result_json
        .as_deref()
        .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok());

    PictogramPrefetchSettingsDto {
        enabled: row.enabled,
        idle_minutes: row.idle_minutes.max(1) as u64,
        batch_size: row.batch_size.max(1) as u64,
        last_run_at,
        last_result,
        idle_seconds: idle_seconds(),
    }
}

fn disk_path_from_public_path(public_path: &str) -> Option<String> {
    let suffix = public_path.strip_prefix("/assets/pictograms/")?;
    Some(format!("{}/{}", STORE_ROOT, suffix))
}

fn extract_keyword_tokens(p: &ArasaacPictogram) -> Vec<String> {
    let mut out = Vec::new();
    for k in &p.keywords {
        for cand in [k.keyword.as_ref(), k.plural.as_ref(), k.meaning.as_ref()] {
            if let Some(v) = cand {
                let v = v.trim();
                if !v.is_empty() {
                    out.push(v.to_string());
                }
            }
        }
    }
    out.sort();
    out.dedup();
    out
}

fn fuzzy_score(query: &str, haystack: &str) -> i32 {
    let q = query.to_ascii_lowercase();
    let h = haystack.to_ascii_lowercase();

    if h == q {
        return 1000;
    }
    if h.starts_with(&q) {
        return 700;
    }
    if h.contains(&q) {
        return 400;
    }

    let q_tokens: Vec<&str> = q.split_whitespace().collect();
    let mut hits = 0;
    for t in q_tokens {
        if !t.is_empty() && h.contains(t) {
            hits += 1;
        }
    }
    hits * 80
}

fn sort_by_fuzzy_score(items: &mut [PictogramDto], query: &str) {
    items.sort_by(|a, b| {
        let ah = format!(
            "{} {} {} {}",
            a.keywords.join(" "),
            a.categories.join(" "),
            a.tags.join(" "),
            a.description.clone().unwrap_or_default()
        );
        let bh = format!(
            "{} {} {} {}",
            b.keywords.join(" "),
            b.categories.join(" "),
            b.tags.join(" "),
            b.description.clone().unwrap_or_default()
        );
        fuzzy_score(query, &bh).cmp(&fuzzy_score(query, &ah))
    });
}

fn http_client() -> AppResult<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("CarlsCalendar/1.0 (+https://localhost)")
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create HTTP client: {e}")))
}

async fn fetch_remote_search(language: &str, query: &str) -> AppResult<Vec<ArasaacPictogram>> {
    let client = http_client()?;
    let encoded = urlencoding::encode(query);

    let best_url = format!("{ARASAAC_API_BASE}/pictograms/{language}/bestsearch/{encoded}");
    let search_url = format!("{ARASAAC_API_BASE}/pictograms/{language}/search/{encoded}");

    let best = fetch_remote_vec(&client, &best_url).await?;
    if !best.is_empty() {
        return Ok(best);
    }
    fetch_remote_vec(&client, &search_url).await
}

async fn fetch_remote_by_id(language: &str, arasaac_id: i32) -> AppResult<ArasaacPictogram> {
    let client = http_client()?;
    let url = format!("{ARASAAC_API_BASE}/pictograms/{language}/{arasaac_id}");
    let mut list = fetch_remote_vec(&client, &url).await?;
    list.pop().ok_or(AppError::NotFound)
}

async fn fetch_remote_vec(client: &reqwest::Client, url: &str) -> AppResult<Vec<ArasaacPictogram>> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("ARASAAC request failed: {e}")))?;

    let status = resp.status();
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AppError::BadRequest("ARASAAC rate limit reached. Please retry shortly.".into()));
    }
    // ARASAAC returns 404 - not an empty array - when no pictograms match the query.
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(vec![]);
    }
    if !status.is_success() {
        return Err(AppError::Internal(anyhow::anyhow!("ARASAAC request failed with status {status}")));
    }

    resp.json::<Vec<ArasaacPictogram>>()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to parse ARASAAC response: {e}")))
}

async fn upsert_remote_pictogram(
    pool: &crate::db::Db,
    language: &str,
    p: &ArasaacPictogram,
) -> AppResult<()> {
    let keywords = extract_keyword_tokens(p);
    let categories = p.categories.clone();
    let tags = p.tags.clone();
    let category = categories.first().cloned();

    let existing_local: Option<ExistingLocalFile> = sqlx::query_as::<_, ExistingLocalFile>(
        "SELECT local_file_path FROM pictograms WHERE arasaac_id = ? LIMIT 1",
    )
    .bind(p.id)
    .fetch_optional(pool)
    .await?;

    let (image_url, local_file_path) = match existing_local.and_then(|r| r.local_file_path) {
        Some(path) if local_path_exists(&path).await => (Some(build_remote_png_url(p.id)), Some(path)),
        _ => download_pictogram_asset(p.id, category.clone()).await?,
    };

    let metadata_json = serde_json::to_string(p)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to serialize pictogram metadata: {e}")))?;
    let keywords_json = serde_json::to_string(&keywords)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to serialize keywords: {e}")))?;
    let categories_json = serde_json::to_string(&categories)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to serialize categories: {e}")))?;
    let tags_json = serde_json::to_string(&tags)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to serialize tags: {e}")))?;

    sqlx::query(
        "INSERT INTO pictograms (
            arasaac_id, keywords_json, category, categories_json, tags_json,
            keywords_text, categories_text, tags_text, description,
            language, image_url, local_file_path, width, height, license, metadata_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            keywords_json = VALUES(keywords_json),
            category = VALUES(category),
            categories_json = VALUES(categories_json),
            tags_json = VALUES(tags_json),
            keywords_text = VALUES(keywords_text),
            categories_text = VALUES(categories_text),
            tags_text = VALUES(tags_text),
            description = VALUES(description),
            language = VALUES(language),
            image_url = VALUES(image_url),
            local_file_path = VALUES(local_file_path),
            width = VALUES(width),
            height = VALUES(height),
            license = VALUES(license),
            metadata_json = VALUES(metadata_json),
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(p.id)
    .bind(keywords_json)
    .bind(&category)
    .bind(categories_json)
    .bind(tags_json)
    .bind(join_tokens(&keywords))
    .bind(join_tokens(&categories))
    .bind(join_tokens(&tags))
    .bind(&p.desc)
    .bind(language)
    .bind(image_url)
    .bind(local_file_path)
    .bind(Option::<i32>::None)
    .bind(Option::<i32>::None)
    .bind(DEFAULT_LICENSE)
    .bind(metadata_json)
    .execute(pool)
    .await?;

    Ok(())
}

async fn local_path_exists(public_path: &str) -> bool {
    let Some(disk) = disk_path_from_public_path(public_path) else {
        return false;
    };
    tokio::fs::metadata(disk).await.is_ok()
}

fn build_remote_png_url(arasaac_id: i32) -> String {
    format!("{ARASAAC_STATIC_BASE}/{arasaac_id}/{arasaac_id}_500.png")
}

fn remote_to_dto(language: &str, p: &ArasaacPictogram) -> PictogramDto {
    let keywords = extract_keyword_tokens(p);
    let categories = p.categories.clone();
    let tags = p.tags.clone();
    PictogramDto {
        arasaac_id: p.id,
        keywords,
        category: categories.first().cloned(),
        categories,
        tags,
        language: language.to_string(),
        image_url: Some(build_remote_png_url(p.id)),
        local_file_path: None,
        width: None,
        height: None,
        license: DEFAULT_LICENSE.to_string(),
        description: p.desc.clone(),
    }
}

async fn download_pictogram_asset(
    arasaac_id: i32,
    category: Option<String>,
) -> AppResult<(Option<String>, Option<String>)> {
    let category_slug = sanitize_segment(category.as_deref().unwrap_or("uncategorized"));
    let dir = format!("{STORE_ROOT}/{category_slug}");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create pictogram directory: {e}")))?;

    let client = http_client()?;

    let svg_url = format!("{ARASAAC_STATIC_BASE}/{arasaac_id}/{arasaac_id}.svg");
    let png_url = build_remote_png_url(arasaac_id);

    // Prefer SVG if available.
    if let Ok(resp) = client.get(&svg_url).send().await {
        if resp.status().is_success() {
            let content_type = resp
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|h| h.to_str().ok())
                .unwrap_or("")
                .to_ascii_lowercase();
            if content_type.contains("svg") || content_type.contains("xml") {
                let bytes = resp
                    .bytes()
                    .await
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed reading ARASAAC SVG bytes: {e}")))?;
                let disk = format!("{dir}/{arasaac_id}.svg");
                tokio::fs::write(&disk, bytes)
                    .await
                    .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed writing SVG pictogram file: {e}")))?;
                let public = format!("/assets/pictograms/{category_slug}/{arasaac_id}.svg");
                return Ok((Some(svg_url), Some(public)));
            }
        }
    }

    // PNG fallback.
    let png_resp = client
        .get(&png_url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed downloading ARASAAC PNG: {e}")))?;

    if !png_resp.status().is_success() {
        return Ok((Some(png_url), None));
    }

    let png = png_resp
        .bytes()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed reading ARASAAC PNG bytes: {e}")))?;
    let disk = format!("{dir}/{arasaac_id}.png");
    tokio::fs::write(&disk, png)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed writing PNG pictogram file: {e}")))?;
    let public = format!("/assets/pictograms/{category_slug}/{arasaac_id}.png");

    Ok((Some(png_url), Some(public)))
}

#[derive(sqlx::FromRow)]
struct SeedActivityAssetRow {
    arasaac_id: i32,
    local_image_path: String,
}

/// Ensure seeded/system visual support cards have their referenced pictogram files
/// materialized under `/assets/pictograms/...` on disk.
///
/// This is used at backend startup so default cards keep working after DB resets,
/// while assets persist in `backend/assets_seed/pictograms` (bind-mounted host path).
pub async fn ensure_seeded_activity_assets(pool: &crate::db::Db) -> AppResult<usize> {
    let rows: Vec<SeedActivityAssetRow> = sqlx::query_as::<_, SeedActivityAssetRow>(
        "SELECT arasaac_id, local_image_path
         FROM visual_support_activity_library
         WHERE is_system = 1
           AND arasaac_id IS NOT NULL
           AND local_image_path IS NOT NULL
           AND local_image_path LIKE '/assets/pictograms/%'",
    )
    .fetch_all(pool)
    .await?;

    let mut hydrated = 0usize;
    for row in rows {
        if local_path_exists(&row.local_image_path).await {
            continue;
        }

        match download_to_public_path(row.arasaac_id, &row.local_image_path).await {
            Ok(true) => hydrated += 1,
            Ok(false) => {
                tracing::warn!(
                    arasaac_id = row.arasaac_id,
                    path = %row.local_image_path,
                    "Seeded pictogram asset could not be hydrated",
                );
            }
            Err(err) => {
                tracing::warn!(
                    error = ?err,
                    arasaac_id = row.arasaac_id,
                    path = %row.local_image_path,
                    "Failed hydrating seeded pictogram asset",
                );
            }
        }
    }

    Ok(hydrated)
}

async fn download_to_public_path(arasaac_id: i32, public_path: &str) -> AppResult<bool> {
    if !public_path.starts_with("/assets/pictograms/") {
        return Ok(false);
    }

    let Some(disk_path) = disk_path_from_public_path(public_path) else {
        return Ok(false);
    };
    let disk = Path::new(&disk_path);
    if let Some(parent) = disk.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to create seeded pictogram directory: {e}")))?;
    }

    let ext = disk
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();

    let client = http_client()?;

    if ext == "svg" {
        let svg_url = format!("{ARASAAC_STATIC_BASE}/{arasaac_id}/{arasaac_id}.svg");
        let svg_resp = client
            .get(&svg_url)
            .send()
            .await
            .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed downloading seeded ARASAAC SVG: {e}")))?;
        if svg_resp.status().is_success() {
            let bytes = svg_resp
                .bytes()
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed reading seeded ARASAAC SVG bytes: {e}")))?;
            tokio::fs::write(disk, bytes)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed writing seeded SVG pictogram file: {e}")))?;
            return Ok(true);
        }
        return Ok(false);
    }

    let png_url = build_remote_png_url(arasaac_id);
    let png_resp = client
        .get(&png_url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed downloading seeded ARASAAC PNG: {e}")))?;

    if !png_resp.status().is_success() {
        return Ok(false);
    }

    let png = png_resp
        .bytes()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed reading seeded ARASAAC PNG bytes: {e}")))?;
    tokio::fs::write(disk, png)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed writing seeded PNG pictogram file: {e}")))?;

    Ok(true)
}

// ── Browse helpers ────────────────────────────────────────────────────────────

/// Fetch the latest `n` pictograms from ARASAAC (newest/most-recently-updated).
/// Results are cached locally so subsequent views come from the local DB.
/// `n` is clamped to 1-100.
pub async fn get_new_pictograms(
    pool: &crate::db::Db,
    language: &str,
    n: u32,
) -> AppResult<Vec<PictogramDto>> {
    let language = normalize_language(language);
    let n = n.clamp(1, 100);

    let local_db_ready = match ensure_pictograms_table(pool).await {
        Ok(_) => true,
        Err(err) => {
            tracing::warn!(error = ?err, "Pictograms table ensure failed; skipping cache for new pictograms");
            false
        }
    };

    let client = http_client()?;
    let url = format!("{ARASAAC_API_BASE}/pictograms/{language}/new/{n}");
    let remote = fetch_remote_vec(&client, &url).await?;

    if remote.is_empty() {
        return Ok(vec![]);
    }

    if local_db_ready {
        for p in &remote {
            if let Err(err) = upsert_remote_pictogram(pool, &language, p).await {
                tracing::warn!(error = ?err, arasaac_id = p.id, "Failed caching new pictogram locally");
            }
        }
        let ids: Vec<i32> = remote.iter().map(|p| p.id).collect();
        let hydrated = query_local_by_ids(pool, &ids).await?;
        if !hydrated.is_empty() {
            return Ok(hydrated);
        }
    }

    Ok(remote.iter().map(|p| remote_to_dto(&language, p)).collect())
}

/// Return the full keyword list for the given language from ARASAAC.
/// Used to populate datalist autocomplete on the search page.
pub async fn get_keywords(language: &str) -> AppResult<Vec<String>> {
    let language = normalize_language(language);
    let client = http_client()?;
    let url = format!("{ARASAAC_API_BASE}/keywords/{language}");

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("ARASAAC keywords request failed: {e}")))?;

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(vec![]);
    }
    if !status.is_success() {
        return Err(AppError::Internal(anyhow::anyhow!(
            "ARASAAC keywords request failed with status {status}"
        )));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to parse ARASAAC keywords response: {e}")))?;

    let words = body["words"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    Ok(words)
}

// ── Saved pictogram library ───────────────────────────────────────────────────

/// Return all pictograms bookmarked by `user_id`, enriched with pictogram data,
/// ordered by most-used first then most-recently-saved.
pub async fn list_saved_pictograms(
    pool: &crate::db::Db,
    user_id: &str,
    language: &str,
) -> AppResult<Vec<SavedPictogramDto>> {
    let language = normalize_language(language);
    let rows: Vec<SavedRow> = sqlx::query_as::<_, SavedRow>(
        "SELECT
            sp.arasaac_id,
            sp.label,
            sp.used_count,
            p.keywords_text,
            p.categories_text,
            p.tags_text,
            COALESCE(p.language, ?) AS language,
            p.image_url,
            p.local_file_path,
            p.license,
            p.description
         FROM saved_pictograms sp
         LEFT JOIN pictograms p
            ON p.arasaac_id = sp.arasaac_id
         WHERE sp.user_id = ?
         ORDER BY sp.used_count DESC, sp.saved_at DESC
         LIMIT 200",
    )
    .bind(&language)
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(saved_row_to_dto).collect())
}

/// Bookmark a pictogram for a user. Idempotent — calling it again merely updates
/// the optional label without resetting `used_count`.
pub async fn save_pictogram(
    pool: &crate::db::Db,
    user_id: &str,
    arasaac_id: i32,
    label: Option<String>,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO saved_pictograms (user_id, arasaac_id, label)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE label = COALESCE(VALUES(label), label)",
    )
    .bind(user_id)
    .bind(arasaac_id)
    .bind(label)
    .execute(pool)
    .await?;
    Ok(())
}

/// Remove a bookmark.  Returns `Ok(())` whether or not the row existed.
pub async fn unsave_pictogram(
    pool: &crate::db::Db,
    user_id: &str,
    arasaac_id: i32,
) -> AppResult<()> {
    sqlx::query("DELETE FROM saved_pictograms WHERE user_id = ? AND arasaac_id = ?")
        .bind(user_id)
        .bind(arasaac_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Increment `used_count` for a saved pictogram.  Silently ignored if the
/// pictogram has not been saved (the row doesn't exist).
pub async fn record_pictogram_use(
    pool: &crate::db::Db,
    user_id: &str,
    arasaac_id: i32,
) -> AppResult<()> {
    sqlx::query(
        "UPDATE saved_pictograms
            SET used_count = used_count + 1
          WHERE user_id = ? AND arasaac_id = ?",
    )
    .bind(user_id)
    .bind(arasaac_id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Return the set of `arasaac_id`s the user has saved (for UI star state).
pub async fn saved_ids_for_user(pool: &crate::db::Db, user_id: &str) -> AppResult<Vec<i32>> {
    let ids: Vec<(i32,)> = sqlx::query_as("SELECT arasaac_id FROM saved_pictograms WHERE user_id = ?")
        .bind(user_id)
        .fetch_all(pool)
        .await?;
    Ok(ids.into_iter().map(|(id,)| id).collect())
}

fn saved_row_to_dto(row: SavedRow) -> SavedPictogramDto {
    SavedPictogramDto {
        arasaac_id: row.arasaac_id,
        label: row.label,
        used_count: row.used_count,
        keywords: split_tokens(row.keywords_text.as_deref().unwrap_or_default()),
        categories: split_tokens(row.categories_text.as_deref().unwrap_or_default()),
        tags: split_tokens(row.tags_text.as_deref().unwrap_or_default()),
        language: row.language.unwrap_or_else(|| "en".to_string()),
        image_url: row.image_url,
        local_file_path: row.local_file_path,
        license: row.license.unwrap_or_else(|| DEFAULT_LICENSE.to_string()),
        description: row.description,
    }
}
