-- Audit: assignment time, completer, blocked reason; overdue notification dedupe
ALTER TABLE `employee_tasks`
  ADD COLUMN `assigned_at` timestamp NULL DEFAULT NULL AFTER `assigned_by_user_id`;

UPDATE `employee_tasks` SET `assigned_at` = `created_at` WHERE `assigned_at` IS NULL;

ALTER TABLE `employee_tasks`
  MODIFY COLUMN `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `employee_tasks`
  ADD COLUMN `completed_by_user_id` int NULL DEFAULT NULL AFTER `completed_at`;

ALTER TABLE `employee_tasks`
  ADD COLUMN `blocked_reason` text NULL DEFAULT NULL AFTER `notes`;

ALTER TABLE `employee_tasks`
  ADD COLUMN `notified_overdue` boolean NOT NULL DEFAULT false AFTER `blocked_reason`;
