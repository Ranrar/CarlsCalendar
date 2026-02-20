-- Migration 007: image_library table
CREATE TABLE IF NOT EXISTS image_library (
    id         CHAR(36)     NOT NULL PRIMARY KEY,
    owner_id   CHAR(36)     NULL COMMENT 'NULL = system image',
    filename   VARCHAR(255) NOT NULL,
    path       VARCHAR(500) NOT NULL,
    alt_text   VARCHAR(255) NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_image_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
