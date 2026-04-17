-- Add period scope to WPS validation history for period-aware finance trust.
ALTER TABLE `employee_wps_validations`
  ADD COLUMN `period_year` SMALLINT NULL AFTER `salary_present`,
  ADD COLUMN `period_month` TINYINT NULL AFTER `period_year`;

CREATE INDEX `idx_ewv_company_period_result`
  ON `employee_wps_validations` (`company_id`, `period_year`, `period_month`, `result`);
