/// Role-based authorization guard.
/// TODO: Wrap routes that require specific roles.

use axum::{
    extract::{Extension, Request},
    middleware::Next,
    response::Response,
};

use crate::errors::AppError;
use crate::middleware::auth_guard::AuthUser;
use crate::models::UserRole;

/// Middleware: require the `admin` role.
pub async fn require_admin(
    Extension(user): Extension<AuthUser>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    if user.role != UserRole::Admin {
        return Err(AppError::Forbidden);
    }
    Ok(next.run(req).await)
}

/// Middleware: require the `parent` or `admin` role.
#[allow(dead_code)]
pub async fn require_parent(
    Extension(user): Extension<AuthUser>,
    req: Request,
    next: Next,
) -> Result<Response, AppError> {
    match user.role {
        UserRole::Admin | UserRole::Parent => Ok(next.run(req).await),
        _ => Err(AppError::Forbidden),
    }
}
