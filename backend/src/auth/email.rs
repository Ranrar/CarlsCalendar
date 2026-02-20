//! Email sending helpers.
//!
//! If SMTP is not configured (empty `smtp_host`), the token/link is logged to
//! stdout instead — useful during development without a mail server.

use lettre::{
    message::header::ContentType,
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

use crate::config::Config;
use crate::errors::{AppError, AppResult};

// ── Public helpers ────────────────────────────────────────────

pub async fn send_verification_email(config: &Config, to: &str, token: &str) -> AppResult<()> {
    let link = format!("{}/verify-email?token={token}", config.app_base_url);

    if config.smtp_host.is_empty() {
        tracing::warn!(to, %link, "SMTP not configured — email verification link printed here");
        return Ok(());
    }

    let body = format!(
        "Hi,\n\nPlease verify your email address by visiting:\n\n{link}\n\nThis link expires in 24 hours.\n\nCarls Calendar"
    );

    send(config, to, "Verify your email — Carls Calendar", &body).await
}

pub async fn send_password_reset_email(config: &Config, to: &str, token: &str) -> AppResult<()> {
    let link = format!("{}/reset-password?token={token}", config.app_base_url);

    if config.smtp_host.is_empty() {
        tracing::warn!(to, %link, "SMTP not configured — password reset link printed here");
        return Ok(());
    }

    let body = format!(
        "Hi,\n\nYou requested a password reset. Visit the link below to set a new password:\n\n{link}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.\n\nCarls Calendar"
    );

    send(config, to, "Password reset — Carls Calendar", &body).await
}

// ── Internal ──────────────────────────────────────────────────

async fn send(config: &Config, to: &str, subject: &str, body: &str) -> AppResult<()> {
    let email = Message::builder()
        .from(
            config.smtp_from.parse()
                .map_err(|_| AppError::Internal(anyhow::anyhow!("Invalid SMTP_FROM address")))?,
        )
        .to(to.parse().map_err(|_| AppError::BadRequest("Invalid email address".into()))?)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_owned())
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to build email: {e}")))?;

    let creds = Credentials::new(config.smtp_user.clone(), config.smtp_password.clone());

    let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("SMTP relay error: {e}")))?
        .port(config.smtp_port)
        .credentials(creds)
        .build();

    transport
        .send(email)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Failed to send email: {e}")))?;

    Ok(())
}
