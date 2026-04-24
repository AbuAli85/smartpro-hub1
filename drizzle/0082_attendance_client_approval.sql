-- Migration 0082: Attendance Client Approval (Phase 10A)
-- Creates attendance_client_approval_batches and attendance_client_approval_items tables
-- Also adds 5 new enum values to attendance_audit action type

CREATE TABLE IF NOT EXISTS `attendance_client_approval_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_id` int NOT NULL,
  `site_id` int,
  `client_company_id` int,
  `promoter_assignment_id` int,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` enum('draft','submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
  `submitted_at` timestamp,
  `submitted_by_user_id` int,
  `approved_at` timestamp,
  `approved_by_user_id` int,
  `rejected_at` timestamp,
  `rejected_by_user_id` int,
  `rejection_reason` text,
  `client_comment` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_client_approval_batches_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_acab_company` ON `attendance_client_approval_batches` (`company_id`);
CREATE INDEX `idx_acab_site` ON `attendance_client_approval_batches` (`company_id`,`site_id`);
CREATE INDEX `idx_acab_status` ON `attendance_client_approval_batches` (`company_id`,`status`);
CREATE INDEX `idx_acab_period` ON `attendance_client_approval_batches` (`company_id`,`period_start`,`period_end`);
CREATE INDEX `idx_acab_client` ON `attendance_client_approval_batches` (`company_id`,`client_company_id`);

CREATE TABLE IF NOT EXISTS `attendance_client_approval_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batch_id` int NOT NULL,
  `company_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `attendance_date` date NOT NULL,
  `attendance_record_id` int,
  `attendance_session_id` int,
  `daily_state_json` json,
  `status` enum('pending','approved','rejected','disputed') NOT NULL DEFAULT 'pending',
  `client_comment` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_client_approval_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_acai_batch_employee_date` UNIQUE(`batch_id`,`employee_id`,`attendance_date`)
);

CREATE INDEX `idx_acai_batch` ON `attendance_client_approval_items` (`batch_id`);
CREATE INDEX `idx_acai_company` ON `attendance_client_approval_items` (`company_id`);
CREATE INDEX `idx_acai_employee` ON `attendance_client_approval_items` (`company_id`,`employee_id`);
CREATE INDEX `idx_acai_status` ON `attendance_client_approval_items` (`batch_id`,`status`);
