-- Operational issue resolution + force checkout audit
-- Extends attendance_audit action enum; adds attendance_operational_issues

ALTER TABLE `attendance_audit` MODIFY COLUMN `aa_action_type` enum(
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
  'operational_issue_assign'
) NOT NULL;

CREATE TABLE IF NOT EXISTS `attendance_operational_issues` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_id` int NOT NULL,
  `business_date_ymd` varchar(10) NOT NULL,
  `issue_kind` enum(
    'overdue_checkout',
    'missed_shift',
    'correction_pending',
    'manual_pending'
  ) NOT NULL,
  `issue_key` varchar(160) NOT NULL,
  `attendance_record_id` int,
  `schedule_id` int,
  `correction_id` int,
  `manual_checkin_request_id` int,
  `employee_id` int,
  `status` enum('open', 'acknowledged', 'resolved') NOT NULL DEFAULT 'open',
  `assigned_to_user_id` int,
  `acknowledged_by_user_id` int,
  `acknowledged_at` timestamp,
  `reviewed_by_user_id` int,
  `reviewed_at` timestamp,
  `resolution_note` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_operational_issues_id` PRIMARY KEY(`id`),
  UNIQUE KEY `uq_aoi_company_issue_key` (`company_id`, `issue_key`),
  INDEX `idx_aoi_company_date` (`company_id`, `business_date_ymd`),
  INDEX `idx_aoi_employee` (`employee_id`),
  INDEX `idx_aoi_record` (`attendance_record_id`),
  INDEX `idx_aoi_status` (`company_id`, `status`)
);
