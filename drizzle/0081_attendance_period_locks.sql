-- Migration 0081: Attendance period lock state machine (Phase 5B)
--
-- 1. Extend attendance_audit.aa_action_type enum with period-lock events.
--    MySQL requires a full MODIFY COLUMN re-declaration of all enum values.
-- 2. Create attendance_period_locks table.

-- ─── 1. Extend attendance_audit action type enum ──────────────────────────────
ALTER TABLE `attendance_audit`
  MODIFY COLUMN `aa_action_type` ENUM(
    'hr_attendance_create',
    'hr_attendance_update',
    'hr_attendance_delete',
    'correction_approve',
    'correction_reject',
    'correction_submitted',
    'manual_checkin_approve',
    'manual_checkin_reject',
    'self_checkin_allowed',
    'self_checkin_denied',
    'self_checkout',
    'manual_checkin_submit',
    'force_checkout',
    'operational_issue_acknowledge',
    'operational_issue_resolve',
    'operational_issue_assign',
    'attendance_period_lock',
    'attendance_period_reopen',
    'attendance_period_export'
  ) NOT NULL;

-- ─── 2. Create attendance_period_locks ───────────────────────────────────────
CREATE TABLE `attendance_period_locks` (
  `id`                    int           NOT NULL AUTO_INCREMENT,
  `company_id`            int           NOT NULL,
  `year`                  int           NOT NULL,
  `month`                 int           NOT NULL,
  `status`                ENUM('open','locked','exported','reopened') NOT NULL DEFAULT 'open',
  `locked_at`             timestamp     NULL,
  `locked_by_user_id`     int           NULL,
  `unlocked_at`           timestamp     NULL,
  `unlocked_by_user_id`   int           NULL,
  `exported_at`           timestamp     NULL,
  `exported_by_user_id`   int           NULL,
  `last_readiness_status` varchar(32)   NULL,
  `last_blocker_count`    int           NOT NULL DEFAULT 0,
  `last_review_count`     int           NOT NULL DEFAULT 0,
  `reason`                text          NULL,
  `created_at`            timestamp     NOT NULL DEFAULT (now()),
  `updated_at`            timestamp     NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_apl_company_period` (`company_id`, `year`, `month`),
  KEY `idx_apl_company_status` (`company_id`, `status`),
  KEY `idx_apl_company_period` (`company_id`, `year`, `month`),
  CONSTRAINT `chk_apl_year`  CHECK (`year`  BETWEEN 2020 AND 2100),
  CONSTRAINT `chk_apl_month` CHECK (`month` BETWEEN 1 AND 12)
);
