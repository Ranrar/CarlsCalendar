-- Consolidated baseline migration (fresh install)
-- Includes all schema currently required by backend + Phase A visual supports.

CREATE TABLE IF NOT EXISTS users (
    id            CHAR(36) NOT NULL PRIMARY KEY,
    email         VARCHAR(255) NULL UNIQUE,
    username      VARCHAR(100) NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('admin','parent','child') NOT NULL DEFAULT 'parent',
    language      VARCHAR(5) NOT NULL DEFAULT 'en',
    timezone      VARCHAR(64) NOT NULL DEFAULT 'UTC',
    locale        VARCHAR(16) NOT NULL DEFAULT 'en-GB',
    date_format   ENUM('locale','dd-mm-yyyy','dd_month_yyyy','mm/dd/yyyy') NOT NULL DEFAULT 'locale',
    time_format   ENUM('24h','12h') NOT NULL DEFAULT '24h',
    week_start    TINYINT NOT NULL DEFAULT 1 COMMENT '1=Monday ... 7=Sunday',
    parent_id     CHAR(36) NULL,
    is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at    DATETIME NULL,

    CONSTRAINT fk_users_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_users_role_active (role, is_active),
    INDEX idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS child_profiles (
    id           CHAR(36) NOT NULL PRIMARY KEY,
    parent_id    CHAR(36) NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_path  VARCHAR(500) NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_child_profiles_parent FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_child_profiles_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qr_tokens (
    id         CHAR(36) NOT NULL PRIMARY KEY,
    child_id   CHAR(36) NOT NULL,
    token      VARCHAR(128) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT fk_qr_child FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE,
    INDEX idx_qr_child_active (child_id, is_active),
    INDEX idx_qr_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS image_library (
    id         CHAR(36) NOT NULL PRIMARY KEY,
    owner_id   CHAR(36) NULL COMMENT 'NULL = system image',
    filename   VARCHAR(255) NOT NULL,
    path       VARCHAR(500) NOT NULL,
    alt_text   VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_image_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_image_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pictograms (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Persisted admin controls for idle pictogram prefetch worker.
CREATE TABLE IF NOT EXISTS pictogram_prefetch_settings (
    id                TINYINT NOT NULL PRIMARY KEY,
    enabled           BOOLEAN NOT NULL DEFAULT FALSE,
    idle_minutes      INT NOT NULL DEFAULT 20,
    batch_size        INT NOT NULL DEFAULT 50,
    last_run_at       DATETIME NULL,
    last_result_json  JSON NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO pictogram_prefetch_settings (id, enabled, idle_minutes, batch_size)
VALUES (1, FALSE, 20, 50)
ON DUPLICATE KEY UPDATE
    id = VALUES(id);

CREATE TABLE IF NOT EXISTS saved_pictograms (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     CHAR(36)        NOT NULL,
    arasaac_id  INT             NOT NULL,
    label       VARCHAR(120)    NULL,
    used_count  INT             NOT NULL DEFAULT 0,
    saved_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_saved (user_id, arasaac_id),
    INDEX idx_saved_user (user_id),
    INDEX idx_saved_used (user_id, used_count DESC),

    CONSTRAINT fk_saved_pictograms_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
    id         CHAR(36) NOT NULL PRIMARY KEY,
    user_id    CHAR(36) NOT NULL,
    token      CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_sessions_user (user_id),
    INDEX idx_user_sessions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_tokens (
    id         CHAR(36) NOT NULL PRIMARY KEY,
    user_id    CHAR(36) NOT NULL,
    token      CHAR(64) NOT NULL UNIQUE,
    kind       ENUM('verify_email','reset_password') NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_emailtoken_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_email_tokens_user_kind (user_id, kind),
    INDEX idx_email_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS child_device_tokens (
    id              CHAR(36) NOT NULL PRIMARY KEY,
    parent_user_id  CHAR(36) NOT NULL,
    child_id        CHAR(36) NOT NULL,
    token_hash      CHAR(64) NOT NULL UNIQUE,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at    DATETIME NULL,
    revoked_at      DATETIME NULL,
    user_agent_hash CHAR(64) NULL,
    ip_range        VARCHAR(64) NULL,

    CONSTRAINT fk_cdt_parent FOREIGN KEY (parent_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cdt_child  FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE CASCADE,

    INDEX idx_cdt_child_active (child_id, revoked_at),
    INDEX idx_cdt_parent_active (parent_user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dsr_audit_logs (
    id            CHAR(36) PRIMARY KEY,
    request_id    VARCHAR(64) NOT NULL,
    user_id       CHAR(36) NULL,
    action        ENUM('export', 'delete') NOT NULL,
    status        ENUM('started', 'completed', 'failed') NOT NULL,
    requested_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at  TIMESTAMP NULL,
    error_message TEXT NULL,
    actor_user_id CHAR(36) NULL,
    metadata      JSON NULL,
    INDEX idx_dsr_requested_at (requested_at),
    INDEX idx_dsr_request_id (request_id),
    INDEX idx_dsr_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deletion_logs (
    id            CHAR(36) PRIMARY KEY,
    table_name    VARCHAR(128) NOT NULL,
    record_id     VARCHAR(128) NULL,
    deleted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason        VARCHAR(255) NOT NULL,
    details       JSON NULL,
    actor_user_id CHAR(36) NULL,
    INDEX idx_deletion_deleted_at (deleted_at),
    INDEX idx_deletion_table_name (table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS retention_rules (
    id               CHAR(36) PRIMARY KEY,
    name             VARCHAR(128) NOT NULL,
    table_name       VARCHAR(128) NOT NULL,
    timestamp_column VARCHAR(128) NOT NULL,
    retention_days   INT NOT NULL,
    enabled          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_retention_target (table_name, timestamp_column)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS breach_logs (
    id                     CHAR(36) PRIMARY KEY,
    detected_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reported_at            TIMESTAMP NULL,
    severity               ENUM('low', 'medium', 'high', 'critical') NOT NULL,
    status                 ENUM('open', 'investigating', 'contained', 'resolved') NOT NULL DEFAULT 'open',
    title                  VARCHAR(255) NOT NULL,
    description            TEXT NULL,
    affected_records       BIGINT NULL,
    authority_notified     BOOLEAN NOT NULL DEFAULT FALSE,
    data_subjects_notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_by             CHAR(36) NULL,
    created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_breach_detected_at (detected_at),
    INDEX idx_breach_severity_status (severity, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subprocessor_register (
    id             CHAR(36) PRIMARY KEY,
    provider       VARCHAR(255) NOT NULL,
    purpose        VARCHAR(255) NOT NULL,
    location       VARCHAR(255) NOT NULL,
    dpa_signed_date DATE NULL,
    transfer_basis VARCHAR(255) NOT NULL,
    notes          TEXT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_subprocessor_provider (provider),
    INDEX idx_subprocessor_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Phase A visual supports (consolidated naming)
CREATE TABLE IF NOT EXISTS visual_support_documents_templates (
    id               CHAR(36) NOT NULL PRIMARY KEY,
    owner_id         CHAR(36) NULL,
    name             VARCHAR(200) NOT NULL,
    description      TEXT NULL,
    document_type    ENUM('DAILY_SCHEDULE','WEEKLY_SCHEDULE','FIRST_THEN','CHOICE_BOARD','ROUTINE_STEPS','EMOTION_CARDS','AAC_BOARD','REWARD_TRACKER') NOT NULL,
    scenario_type    VARCHAR(120) NOT NULL DEFAULT 'CUSTOM',
    language         VARCHAR(8) NOT NULL DEFAULT 'en',
    is_system        BOOLEAN NOT NULL DEFAULT FALSE,
    metadata_json    JSON NOT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_vsd_template_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_vsd_template_owner_type (owner_id, document_type),
    INDEX idx_vsd_template_system_type (is_system, document_type),
    INDEX idx_vsd_template_language (language),
    INDEX idx_vsd_template_scenario (scenario_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visual_support_documents (
    id               CHAR(36) NOT NULL PRIMARY KEY,
    owner_id         CHAR(36) NOT NULL,
    child_id         CHAR(36) NULL,
    template_id      CHAR(36) NULL,
    title            VARCHAR(200) NOT NULL,
    document_type    ENUM('DAILY_SCHEDULE','WEEKLY_SCHEDULE','FIRST_THEN','CHOICE_BOARD','ROUTINE_STEPS','EMOTION_CARDS','AAC_BOARD','REWARD_TRACKER') NOT NULL,
    locale           VARCHAR(8) NOT NULL DEFAULT 'en',
    layout_spec_json LONGTEXT NOT NULL,
    content_json     LONGTEXT NOT NULL,
    version          INT NOT NULL DEFAULT 1,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_vsd_owner    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_vsd_child    FOREIGN KEY (child_id) REFERENCES child_profiles(id) ON DELETE SET NULL,
    CONSTRAINT fk_vsd_template FOREIGN KEY (template_id) REFERENCES visual_support_documents_templates(id) ON DELETE SET NULL,

    INDEX idx_vsd_owner_type (owner_id, document_type),
    INDEX idx_vsd_owner_child (owner_id, child_id),
    INDEX idx_vsd_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visual_support_activity_library (
    id            CHAR(36) NOT NULL PRIMARY KEY,
    owner_id      CHAR(36) NULL COMMENT 'NULL = system default card',
    language      VARCHAR(8) NOT NULL DEFAULT 'en',
    label_text    VARCHAR(120) NOT NULL,
    pictogram_id  VARCHAR(120) NULL,
    category      VARCHAR(120) NULL,
    priority_order INT NOT NULL DEFAULT 0,
    color_token   VARCHAR(64) NULL,
    audio_prompt  VARCHAR(500) NULL,
    keyword_tags  JSON NULL,
    arasaac_id    INT NULL,
    local_image_path VARCHAR(500) NULL,
    svg_content   LONGTEXT NOT NULL DEFAULT '',
    is_system     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_vs_activity_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_vs_activity_owner_language (owner_id, language),
    INDEX idx_vs_activity_system_language (is_system, language),
    INDEX idx_vs_activity_category (category),
    INDEX idx_vs_activity_arasaac_id (arasaac_id),
    UNIQUE KEY uq_vs_activity_owner_label_language (owner_id, label_text, language)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visual_support_template_activities (
    id              CHAR(36) NOT NULL PRIMARY KEY,
    template_id     CHAR(36) NULL,
    activity_order  INT NOT NULL,
    activity_card_id CHAR(36) NULL,
    pictogram_id    VARCHAR(120) NULL,
    text_label      VARCHAR(200) NOT NULL,
    optional_notes  TEXT NULL,
    metadata_json   JSON NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_vs_template_activity_template
        FOREIGN KEY (template_id) REFERENCES visual_support_documents_templates(id) ON DELETE CASCADE,
    CONSTRAINT fk_vs_template_activity_card
        FOREIGN KEY (activity_card_id) REFERENCES visual_support_activity_library(id) ON DELETE SET NULL,

    UNIQUE KEY uq_vs_template_activity_order (template_id, activity_order),
    INDEX idx_vs_template_activity_card (activity_card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

