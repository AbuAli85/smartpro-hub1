-- Payroll execution / WPS workflow: extra run statuses + audit column
ALTER TABLE `payroll_runs`
  MODIFY COLUMN `status` ENUM(
    'draft',
    'processing',
    'approved',
    'paid',
    'cancelled',
    'pending_execution',
    'locked',
    'wps_generated',
    'ready_for_upload'
  ) NOT NULL DEFAULT 'draft';

ALTER TABLE `payroll_runs`
  ADD COLUMN `created_by_user_id` INT NULL AFTER `notes`;
