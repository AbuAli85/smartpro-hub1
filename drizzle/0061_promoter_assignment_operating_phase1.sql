-- Phase 1: promoter assignment operating model — lifecycle, commercial fields, indexes.
-- Replaces legacy `status` (active/inactive/expired) with `assignment_status` enum.

ALTER TABLE `promoter_assignments`
  ADD COLUMN `assignment_status` ENUM('draft','active','suspended','completed','terminated') NOT NULL DEFAULT 'draft' AFTER `promoter_employee_id`;

UPDATE `promoter_assignments` SET `assignment_status` = CASE `status`
  WHEN 'active' THEN 'active'
  WHEN 'inactive' THEN 'suspended'
  WHEN 'expired' THEN 'completed'
  WHEN 'draft' THEN 'draft'
  WHEN 'suspended' THEN 'suspended'
  WHEN 'completed' THEN 'completed'
  WHEN 'terminated' THEN 'terminated'
  ELSE 'active'
END;

ALTER TABLE `promoter_assignments`
  DROP COLUMN `status`,
  MODIFY `end_date` DATE NULL;

ALTER TABLE `promoter_assignments`
  ADD COLUMN `expected_monthly_hours` INT NULL AFTER `end_date`,
  ADD COLUMN `shift_type` VARCHAR(32) NULL AFTER `expected_monthly_hours`,
  ADD COLUMN `supervisor_user_id` INT NULL AFTER `shift_type`,
  ADD COLUMN `suspension_reason` TEXT NULL AFTER `supervisor_user_id`,
  ADD COLUMN `termination_reason` TEXT NULL AFTER `suspension_reason`,
  ADD COLUMN `notes` TEXT NULL AFTER `termination_reason`,
  ADD COLUMN `billing_model` ENUM('per_month','per_day','per_hour','fixed_term') NULL AFTER `notes`,
  ADD COLUMN `billing_rate` DECIMAL(15,4) NULL AFTER `billing_model`,
  ADD COLUMN `currency_code` VARCHAR(3) NOT NULL DEFAULT 'OMR' AFTER `billing_rate`,
  ADD COLUMN `rate_source` ENUM('assignment_override','contract_default','client_default') NOT NULL DEFAULT 'assignment_override' AFTER `currency_code`;

ALTER TABLE `promoter_assignments`
  ADD CONSTRAINT `fk_pa_supervisor_user` FOREIGN KEY (`supervisor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `idx_pa_company_status` ON `promoter_assignments` (`company_id`, `assignment_status`);
CREATE INDEX `idx_pa_company_second` ON `promoter_assignments` (`company_id`, `second_party_company_id`);
CREATE INDEX `idx_pa_company_site` ON `promoter_assignments` (`company_id`, `client_site_id`);
CREATE INDEX `idx_pa_employee_status` ON `promoter_assignments` (`promoter_employee_id`, `assignment_status`);
CREATE INDEX `idx_pa_dates` ON `promoter_assignments` (`start_date`, `end_date`);
