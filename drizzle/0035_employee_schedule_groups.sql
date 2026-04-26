-- 0035: employee_schedule_groups
-- Introduces a parent-group table for multi-shift roster assignments.
-- One group row = one employee + site + working-day pattern + date range.
-- Each child employee_schedules row gets an optional group_id FK.
-- Legacy rows (group_id IS NULL) remain fully functional.

CREATE TABLE IF NOT EXISTS `employee_schedule_groups` (
  `id`                 INT          NOT NULL AUTO_INCREMENT,
  `company_id`         INT          NOT NULL,
  `employee_user_id`   INT          NOT NULL,
  `site_id`            INT          NOT NULL,
  `working_days`       VARCHAR(20)  NOT NULL DEFAULT '0,1,2,3,4',
  `start_date`         DATE         NOT NULL,
  `end_date`           DATE         NULL,
  `is_active`          BOOLEAN      NOT NULL DEFAULT TRUE,
  `notes`              TEXT         NULL,
  `created_by_user_id` INT          NOT NULL,
  `created_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_esg_company_emp_active`   (`company_id`, `employee_user_id`, `is_active`),
  INDEX `idx_esg_company_active_dates` (`company_id`, `is_active`, `start_date`, `end_date`)
);

-- Nullable back-reference so all legacy rows remain valid
ALTER TABLE `employee_schedules`
  ADD COLUMN `group_id` INT NULL AFTER `shift_template_id`;

ALTER TABLE `employee_schedules`
  ADD INDEX `idx_emp_sched_group_id` (`group_id`);
