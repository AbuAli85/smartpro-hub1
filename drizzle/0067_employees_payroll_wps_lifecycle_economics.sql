-- Migration 0067: Employees — Payroll Structure, WPS Compliance, Lifecycle & Deployment Economics
-- Option B safe migration: all columns are nullable with sensible defaults.
-- No existing columns are altered or dropped.
-- Rollback: DROP the columns added below (listed at end of file).

-- ── A. Payroll Structure ──────────────────────────────────────────────────────
-- Note: employee_salary_configs table already exists for detailed salary history.
-- These columns on employees hold the CURRENT / effective salary snapshot for
-- fast reads (reports, payroll staging) without always joining salary_configs.
ALTER TABLE `employees`
  ADD COLUMN `basic_salary`           DECIMAL(12,3)  NULL COMMENT 'Current basic salary (snapshot; authoritative source: employee_salary_configs)',
  ADD COLUMN `housing_allowance`      DECIMAL(12,3)  NULL DEFAULT 0 COMMENT 'Monthly housing allowance',
  ADD COLUMN `transport_allowance`    DECIMAL(12,3)  NULL DEFAULT 0 COMMENT 'Monthly transport allowance',
  ADD COLUMN `other_allowances`       DECIMAL(12,3)  NULL DEFAULT 0 COMMENT 'Other monthly allowances',
  ADD COLUMN `total_salary`           DECIMAL(12,3)  NULL COMMENT 'Computed: basic + housing + transport + other (denormalised for performance)';

-- ── B. WPS Compliance Layer (Oman mandatory) ──────────────────────────────────
ALTER TABLE `employees`
  ADD COLUMN `wps_status`             ENUM('ready','invalid','missing','exempt') NOT NULL DEFAULT 'missing' COMMENT 'Wage Protection System readiness',
  ADD COLUMN `wps_last_validated_at`  TIMESTAMP      NULL COMMENT 'Last time WPS fields were validated';

-- ── C. Employment Lifecycle Enhancements ──────────────────────────────────────
-- status and hireDate already exist; these add the missing lifecycle fields
ALTER TABLE `employees`
  ADD COLUMN `probation_end_date`     DATE           NULL COMMENT 'End of probation period',
  ADD COLUMN `contract_type`          ENUM('limited','unlimited','part_time','secondment') NULL DEFAULT 'unlimited' COMMENT 'Oman Labour Law contract classification',
  ADD COLUMN `notice_period_days`     INT            NULL DEFAULT 30 COMMENT 'Notice period in calendar days',
  ADD COLUMN `last_working_day`       DATE           NULL COMMENT 'Actual last day worked (populated on termination/resignation)';

-- ── D. SmartPRO Deployment Economics ─────────────────────────────────────────
-- Core to the promoter/outsourcing business model: 1 Omani → multiple companies
ALTER TABLE `employees`
  ADD COLUMN `deployment_type`        ENUM('dedicated','shared','internal')   NULL DEFAULT 'internal' COMMENT 'How this employee is deployed across companies',
  ADD COLUMN `cost_to_company`        DECIMAL(12,3)  NULL COMMENT 'Total monthly cost SmartPRO bears for this employee (salary + overhead)',
  ADD COLUMN `salary_cost`            DECIMAL(12,3)  NULL COMMENT 'Direct salary cost component',
  ADD COLUMN `margin_omr`             DECIMAL(12,3)  NULL COMMENT 'Monthly margin: revenue billed − cost_to_company',
  ADD COLUMN `is_omani`               BOOLEAN        NOT NULL DEFAULT FALSE COMMENT 'Whether employee is an Omani national (for Omanization calculations)';

-- ── E. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX `idx_emp_wps_status`       ON `employees` (`companyId`, `wps_status`);
CREATE INDEX `idx_emp_deployment_type`  ON `employees` (`deployment_type`);
CREATE INDEX `idx_emp_is_omani`         ON `employees` (`companyId`, `is_omani`);
CREATE INDEX `idx_emp_contract_type`    ON `employees` (`companyId`, `contract_type`);

-- ── F. Backfill: derive is_omani from existing nationality field ───────────────
UPDATE `employees`
  SET `is_omani` = TRUE
  WHERE LOWER(TRIM(`nationality`)) IN ('omani', 'oman', 'عماني', 'عمانية');

-- ── G. Backfill: copy existing salary → basic_salary snapshot ─────────────────
UPDATE `employees`
  SET `basic_salary` = `salary`,
      `total_salary` = `salary`
  WHERE `salary` IS NOT NULL AND `basic_salary` IS NULL;

-- ── H. Backfill: set wps_status = 'ready' where IBAN is present ───────────────
UPDATE `employees`
  SET `wps_status` = 'ready'
  WHERE `iban_number` IS NOT NULL
    AND TRIM(`iban_number`) != ''
    AND `wps_status` = 'missing';

-- ── Rollback (run these to undo) ──────────────────────────────────────────────
-- DROP INDEX `idx_emp_wps_status`      ON `employees`;
-- DROP INDEX `idx_emp_deployment_type` ON `employees`;
-- DROP INDEX `idx_emp_is_omani`        ON `employees`;
-- DROP INDEX `idx_emp_contract_type`   ON `employees`;
-- ALTER TABLE `employees`
--   DROP COLUMN `basic_salary`,
--   DROP COLUMN `housing_allowance`,
--   DROP COLUMN `transport_allowance`,
--   DROP COLUMN `other_allowances`,
--   DROP COLUMN `total_salary`,
--   DROP COLUMN `wps_status`,
--   DROP COLUMN `wps_last_validated_at`,
--   DROP COLUMN `probation_end_date`,
--   DROP COLUMN `contract_type`,
--   DROP COLUMN `notice_period_days`,
--   DROP COLUMN `last_working_day`,
--   DROP COLUMN `deployment_type`,
--   DROP COLUMN `cost_to_company`,
--   DROP COLUMN `salary_cost`,
--   DROP COLUMN `margin_omr`,
--   DROP COLUMN `is_omani`;
