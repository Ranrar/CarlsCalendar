-- Migration 004: schedule_items table
CREATE TABLE IF NOT EXISTS schedule_items (
    id           CHAR(36)     NOT NULL PRIMARY KEY,
    schedule_id  CHAR(36)     NOT NULL,
    title        VARCHAR(200) NOT NULL,
    description  TEXT         NULL,
    picture_path VARCHAR(500) NULL,
    start_time   TIME         NOT NULL,
    end_time     TIME         NULL,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_items_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
