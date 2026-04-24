-- Migration 0082: Attendance client approval workflow foundation (Phase 10A)
--
-- 1. Extend attendance_audit.aa_action_type enum with 5 client approval events.
--    MySQL requires a full MODIFY COLUMN re-declaration of all enum values.
-- 2. Create attendance_client_approval_batches table.
-- 3. Create attendance_client_approval_items table.

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
    'attendance_period_export',
    'client_approval_batch_created',
    'client_approval_batch_submitted',
    'client_approval_batch_approved',
    'client_approval_batch_rejected',
    'client_approval_batch_cancelled'
  ) NOT NULL;

-- ─── 2. Create attendance_client_approval_batches ─────────────────────────────
CREATE TABLE `attendance_client_approval_batches` (
  `id`                      int           NOT NULL AUTO_INCREMENT,
  `company_id`              int           NOT NULL,
  `site_id`                 int           NULL,
  `client_company_id`       int           NULL,
  `promoter_assignment_id`  int           NULL,
  `period_start`            date          NOT NULL,
  `period_end`              date          NOT NULL,
  `status`                  ENUM('draft','submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
  `submitted_at`            timestamp     NULL,
  `submitted_by_user_id`    int           NULL,
  `approved_at`             timestamp     NULL,
  `approved_by_user_id`     int           NULL,
  `rejected_at`             timestamp     NULL,
  `rejected_by_user_id`     int           NULL,
  `rejection_reason`        text          NULL,
  `client_comment`          text          NULL,
  `created_at`              timestamp     NOT NULL DEFAULT (now()),
  `updated_at`              timestamp     NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_acab_company` (`company_id`),
  KEY `idx_acab_site` (`company_id`, `site_id`),
  KEY `idx_acab_status` (`company_id`, `status`),
  KEY `idx_acab_period` (`company_id`, `period_start`, `period_end`),
  KEY `idx_acab_client` (`company_id`, `client_company_id`)
);

-- ─── 3. Create attendance_client_approval_items ───────────────────────────────
CREATE TABLE `attendance_client_approval_items` (
  `id`                    int           NOT NULL AUTO_INCREMENT,
  `batch_id`              int           NOT NULL,
  `company_id`            int           NOT NULL,
  `employee_id`           int           NOT NULL,
  `attendance_date`       date          NOT NULL,
  `attendance_record_id`  int           NULL,
  `attendance_session_id` int           NULL,
  `daily_state_json`      json          NULL,
  `status`                ENUM('pending','approved','rejected','disputed') NOT NULL DEFAULT 'pending',
  `client_comment`        text          NULL,
  `created_at`            timestamp     NOT NULL DEFAULT (now()),
  `updated_at`            timestamp     NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_acai_batch_employee_date` (`batch_id`, `employee_id`, `attendance_date`),
  KEY `idx_acai_batch` (`batch_id`),
  KEY `idx_acai_company` (`company_id`),
  KEY `idx_acai_employee` (`company_id`, `employee_id`),
  KEY `idx_acai_status` (`batch_id`, `status`)
);
