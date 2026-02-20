-- Migration 001: users table
CREATE TABLE IF NOT EXISTS users (
    id                   CHAR(36)     NOT NULL PRIMARY KEY,
    email                VARCHAR(255) NULL UNIQUE,
    username             VARCHAR(100) NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    role                 ENUM('admin','parent','child') NOT NULL DEFAULT 'parent',
    language             VARCHAR(5)   NOT NULL DEFAULT 'en',
    parent_id            CHAR(36)     NULL,
    is_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at           DATETIME     NULL,

    CONSTRAINT fk_users_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
