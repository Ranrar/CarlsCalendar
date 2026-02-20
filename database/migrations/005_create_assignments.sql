-- Migration 005: schedule_day_assignments table
CREATE TABLE IF NOT EXISTS schedule_day_assignments (
    id           CHAR(36) NOT NULL PRIMARY KEY,
    schedule_id  CHAR(36) NOT NULL,
    child_id     CHAR(36) NOT NULL,
    day_of_week  TINYINT  NOT NULL COMMENT '1=Monday, 7=Sunday (ISO 8601)',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_assignment (schedule_id, child_id, day_of_week),

    CONSTRAINT fk_assign_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_child    FOREIGN KEY (child_id)    REFERENCES users(id)      ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
