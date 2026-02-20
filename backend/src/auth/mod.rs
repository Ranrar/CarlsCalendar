pub mod email;
pub mod seed;

use argon2::{
    password_hash::{rand_core::OsRng, SaltString},
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
};
use uuid::Uuid;

use crate::errors::{AppError, AppResult};

// ── Password helpers ──────────────────────────────────────────

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt    = SaltString::generate(&mut OsRng);
    let argon2  = Argon2::default();
    let hash    = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Hashing failed: {e}")))?;
    Ok(hash.to_string())
}

pub fn verify_password(password: &str, hash: &str) -> AppResult<()> {
    let parsed = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid hash: {e}")))?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .map_err(|_| AppError::Unauthorized)
}

// ── Token helper ──────────────────────────────────────────────

/// Generate a 64-char hex token from two UUIDs (256 bits of entropy).
pub fn generate_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

// ── Password validation ───────────────────────────────────────

// NOTE for production: this function is only called when APP_ENV != "development".
// Before going live, remove the dev guard in routes/auth.rs (both register and
// reset_password handlers) so all passwords are validated regardless of environment.
pub fn validate_password_strength(password: &str) -> AppResult<()> {
    if password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        return Err(AppError::BadRequest(
            "Password must contain at least one uppercase letter".into(),
        ));
    }
    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err(AppError::BadRequest(
            "Password must contain at least one number".into(),
        ));
    }
    Ok(())
}
