-- Migration 003: schedules table
CREATE TABLE IF NOT EXISTS schedules (
    id                  CHAR(36)     NOT NULL PRIMARY KEY,
    owner_id            CHAR(36)     NOT NULL,
    child_id            CHAR(36)     NULL,
    name                VARCHAR(200) NOT NULL,
    status              ENUM('active','inactive','archived') NOT NULL DEFAULT 'inactive',
    is_template         BOOLEAN      NOT NULL DEFAULT FALSE,
    source_template_id  CHAR(36)     NULL,
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_schedules_owner  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_schedules_child  FOREIGN KEY (child_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_schedules_source FOREIGN KEY (source_template_id) REFERENCES schedules(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
