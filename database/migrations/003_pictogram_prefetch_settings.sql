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
