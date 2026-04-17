-- Link client-facing engagement tasks back to internal employee_tasks (optional FK).
ALTER TABLE `engagement_tasks`
  ADD COLUMN `linked_employee_task_id` int NULL AFTER `sort_order`;

CREATE INDEX `idx_engagement_tasks_linked_employee_task`
  ON `engagement_tasks` (`linked_employee_task_id`);

ALTER TABLE `engagement_tasks`
  ADD CONSTRAINT `fk_engagement_tasks_linked_employee_task`
  FOREIGN KEY (`linked_employee_task_id`) REFERENCES `employee_tasks` (`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
