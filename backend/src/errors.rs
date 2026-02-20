use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Not found")]
    NotFound,

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden")]
    Forbidden,

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound       => (StatusCode::NOT_FOUND,            self.to_string()),
            AppError::Unauthorized   => (StatusCode::UNAUTHORIZED,         self.to_string()),
            AppError::Forbidden      => (StatusCode::FORBIDDEN,            self.to_string()),
            AppError::BadRequest(m)  => (StatusCode::BAD_REQUEST,          m.clone()),
            AppError::Conflict(m)    => (StatusCode::CONFLICT,             m.clone()),
            AppError::Internal(_)    => (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".into()),
            AppError::Database(_)    => (StatusCode::INTERNAL_SERVER_ERROR, "Database error".into()),
        };

        // Log 5xx errors
        if status.is_server_error() {
            tracing::error!(error = %self, "Server error");
        }

        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
