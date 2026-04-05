-- Task engine: blocked status + started_at for lifecycle / SLA timeline
ALTER TABLE `employee_tasks`
  MODIFY COLUMN `status` ENUM('pending','in_progress','completed','cancelled','blocked') NOT NULL DEFAULT 'pending';

ALTER TABLE `employee_tasks`
  ADD COLUMN `started_at` timestamp NULL DEFAULT NULL AFTER `due_date`;
