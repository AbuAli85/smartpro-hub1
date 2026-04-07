CREATE TABLE IF NOT EXISTS `employee_accountability` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `department_id` int,
  `business_role_key` varchar(64),
  `responsibilities` json,
  `kpi_category_keys` json,
  `review_cadence` enum('daily','weekly','biweekly','monthly') NOT NULL DEFAULT 'weekly',
  `escalation_employee_id` int,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employee_accountability_id` PRIMARY KEY(`id`),
  UNIQUE KEY `uniq_emp_accountability_company_employee` (`company_id`,`employee_id`),
  KEY `idx_ea_company` (`company_id`),
  KEY `idx_ea_employee` (`employee_id`)
);
