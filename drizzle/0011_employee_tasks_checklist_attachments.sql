-- Task orchestration: estimate, checklist, reference links
ALTER TABLE `employee_tasks`
  ADD COLUMN `estimated_duration_minutes` int NULL DEFAULT NULL AFTER `due_date`;

ALTER TABLE `employee_tasks`
  ADD COLUMN `checklist` json NULL DEFAULT NULL AFTER `blocked_reason`;

ALTER TABLE `employee_tasks`
  ADD COLUMN `attachment_links` json NULL DEFAULT NULL AFTER `checklist`;
