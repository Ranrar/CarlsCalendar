-- Migration 010: email_tokens table
-- Stores one-time tokens for email verification and password reset.
CREATE TABLE IF NOT EXISTS email_tokens (
    id         CHAR(36)                           NOT NULL PRIMARY KEY,
    user_id    CHAR(36)                           NOT NULL,
    token      CHAR(64)                           NOT NULL UNIQUE,
    kind       ENUM('verify_email','reset_password') NOT NULL,
    expires_at DATETIME                           NOT NULL,
    created_at DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_emailtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
