CREATE TABLE IF NOT EXISTS `performance_interventions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `manager_user_id` int NOT NULL,
  `status` enum('open','closed','escalated') NOT NULL DEFAULT 'open',
  `kind` enum('request_update','corrective_task','follow_up','under_review','escalate') NOT NULL,
  `follow_up_at` timestamp NULL,
  `linked_task_id` int NULL,
  `note` text,
  `closed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `performance_interventions_id` PRIMARY KEY(`id`),
  KEY `idx_pi_company` (`company_id`),
  KEY `idx_pi_employee` (`employee_id`),
  KEY `idx_pi_employee_open` (`company_id`,`employee_id`,`status`)
);
