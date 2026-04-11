-- P1 — Authoritative session model for attendance.
--
-- Each row represents one uninterrupted work session (check-in → check-out).
-- `business_date` is the Muscat calendar date (Asia/Muscat, UTC+4) stored
-- explicitly — unlike attendance_records where it must be re-derived every query.
--
-- Uniqueness guarantee (open session per shift):
--   `open_key` is non-null only when status = 'open' AND schedule_id IS NOT NULL.
--   MySQL treats two NULLs as non-equal in unique indexes, so closed sessions
--   and unattributed sessions never violate the constraint.
--
-- `source_record_id` back-links to the attendance_records row that originated
-- this session (dual-write transition period). May be null for sessions created
-- directly without a backing attendance_records row.

CREATE TABLE `attendance_sessions` (
  `id`                int          AUTO_INCREMENT NOT NULL,
  `company_id`        int          NOT NULL,
  `employee_id`       int          NOT NULL,
  `schedule_id`       int,
  `business_date`     varchar(10)  NOT NULL COMMENT 'Muscat calendar date YYYY-MM-DD',
  `status`            enum('open','closed') NOT NULL DEFAULT 'open',
  `check_in_at`       timestamp    NOT NULL,
  `check_out_at`      timestamp,
  `site_id`           int,
  `site_name`         varchar(128),
  `method`            enum('qr_scan','manual','admin') NOT NULL DEFAULT 'qr_scan',
  `source`            enum('employee_portal','admin_panel','system') NOT NULL DEFAULT 'employee_portal',
  `check_in_lat`      decimal(10,7),
  `check_in_lng`      decimal(10,7),
  `check_out_lat`     decimal(10,7),
  `check_out_lng`     decimal(10,7),
  `notes`             text,
  `source_record_id`  int COMMENT 'FK to attendance_records.id (dual-write era)',
  -- MySQL partial-index emulation: non-null only for open, shift-attributed sessions
  `open_key`          varchar(64) GENERATED ALWAYS AS (
                        IF(`status` = 'open' AND `schedule_id` IS NOT NULL,
                           CONCAT(`employee_id`, '-', `schedule_id`, '-', `business_date`),
                           NULL)
                      ) VIRTUAL,
  `created_at`        timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_sessions_id` PRIMARY KEY (`id`),
  UNIQUE INDEX `uniq_att_sess_open_key` (`open_key`),
  INDEX `idx_att_sess_company_date`   (`company_id`, `business_date`),
  INDEX `idx_att_sess_employee_date`  (`employee_id`, `business_date`),
  INDEX `idx_att_sess_schedule`       (`schedule_id`),
  INDEX `idx_att_sess_source_record`  (`source_record_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
