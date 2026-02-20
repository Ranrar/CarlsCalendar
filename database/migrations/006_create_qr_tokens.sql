-- Migration 006: qr_tokens table
CREATE TABLE IF NOT EXISTS qr_tokens (
    id            CHAR(36)     NOT NULL PRIMARY KEY,
    child_user_id CHAR(36)     NOT NULL,
    token         VARCHAR(128) NOT NULL UNIQUE,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_qr_child FOREIGN KEY (child_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
