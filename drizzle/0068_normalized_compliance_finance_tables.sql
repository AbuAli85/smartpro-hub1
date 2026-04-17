-- Migration 0068: New Normalized Tables — Omanization Snapshots, WPS Validation Log, Revenue Records
-- Option B safe migration: creates new tables only, no existing tables modified.
-- Rollback: DROP the tables created below (listed at end of file).

-- ── A. Omanization Compliance Snapshots ───────────────────────────────────────
-- Monthly point-in-time record of a company's Omanization ratio.
-- Powers compliance dashboards and MoL reporting without touching live employee rows.
CREATE TABLE IF NOT EXISTS `company_omanization_snapshots` (
  `id`                    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `company_id`            INT           NOT NULL,
  `snapshot_month`        TINYINT       NOT NULL COMMENT '1–12',
  `snapshot_year`         SMALLINT      NOT NULL,
  `total_employees`       INT           NOT NULL DEFAULT 0,
  `omani_employees`       INT           NOT NULL DEFAULT 0,
  `omani_ratio`           DECIMAL(5,2)  NOT NULL DEFAULT 0.00 COMMENT 'omani_employees / total_employees * 100',
  `required_ratio`        DECIMAL(5,2)  NULL COMMENT 'Required ratio at snapshot time (from companies.omanization_ratio)',
  `compliance_status`     ENUM('compliant','warning','non_compliant') NOT NULL DEFAULT 'non_compliant',
  `notes`                 TEXT          NULL,
  `created_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_cos_company_period` (`company_id`, `snapshot_year`, `snapshot_month`),
  INDEX `idx_cos_status`         (`compliance_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── B. Employee WPS Validation Log ───────────────────────────────────────────
-- Audit trail of WPS field validation checks per employee.
-- Keeps history without polluting the employees row.
CREATE TABLE IF NOT EXISTS `employee_wps_validations` (
  `id`                    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `company_id`            INT           NOT NULL,
  `employee_id`           INT           NOT NULL,
  `validated_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `validated_by_user_id`  INT           NULL COMMENT 'NULL = system auto-validation',
  `iban_present`          BOOLEAN       NOT NULL DEFAULT FALSE,
  `iban_valid_format`     BOOLEAN       NOT NULL DEFAULT FALSE COMMENT 'Passes Oman IBAN checksum',
  `bank_name_present`     BOOLEAN       NOT NULL DEFAULT FALSE,
  `salary_present`        BOOLEAN       NOT NULL DEFAULT FALSE,
  `result`                ENUM('ready','invalid','missing') NOT NULL,
  `failure_reasons`       JSON          NULL COMMENT 'Array of string failure codes',
  INDEX `idx_ewv_employee`        (`employee_id`),
  INDEX `idx_ewv_company_result`  (`company_id`, `result`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── C. Company Revenue Records ────────────────────────────────────────────────
-- Monthly revenue recognised per company (SmartPRO side).
-- Feeds the margin engine: Revenue − employee_cost_to_company = Margin.
CREATE TABLE IF NOT EXISTS `company_revenue_records` (
  `id`                    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `company_id`            INT           NOT NULL,
  `period_month`          TINYINT       NOT NULL COMMENT '1–12',
  `period_year`           SMALLINT      NOT NULL,
  `revenue_type`          ENUM('subscription','deployment_fee','per_transaction','setup_fee','other') NOT NULL DEFAULT 'subscription',
  `amount_omr`            DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `currency`              VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  `source_ref`            VARCHAR(255)  NULL COMMENT 'Invoice number or contract reference',
  `notes`                 TEXT          NULL,
  `recorded_by_user_id`   INT           NULL,
  `created_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_crr_company_period`  (`company_id`, `period_year`, `period_month`),
  INDEX `idx_crr_revenue_type`    (`revenue_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── D. Employee Cost Records ──────────────────────────────────────────────────
-- Monthly cost snapshot per employee (salary + overhead).
-- Combined with company_revenue_records to compute per-employee margin.
CREATE TABLE IF NOT EXISTS `employee_cost_records` (
  `id`                    INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `company_id`            INT           NOT NULL,
  `employee_id`           INT           NOT NULL,
  `period_month`          TINYINT       NOT NULL,
  `period_year`           SMALLINT      NOT NULL,
  `basic_salary`          DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `housing_allowance`     DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `transport_allowance`   DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `other_allowances`      DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  `pasi_contribution`     DECIMAL(12,3) NOT NULL DEFAULT 0.000 COMMENT 'Employer PASI/social insurance contribution',
  `overhead_allocation`   DECIMAL(12,3) NOT NULL DEFAULT 0.000 COMMENT 'Platform overhead allocated to this employee',
  `total_cost`            DECIMAL(12,3) NOT NULL DEFAULT 0.000 COMMENT 'Sum of all cost components',
  `currency`              VARCHAR(10)   NOT NULL DEFAULT 'OMR',
  `notes`                 TEXT          NULL,
  `created_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_ecr_emp_period` (`employee_id`, `period_year`, `period_month`),
  INDEX `idx_ecr_company_period`  (`company_id`, `period_year`, `period_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Rollback (run these to undo) ──────────────────────────────────────────────
-- DROP TABLE IF EXISTS `employee_cost_records`;
-- DROP TABLE IF EXISTS `company_revenue_records`;
-- DROP TABLE IF EXISTS `employee_wps_validations`;
-- DROP TABLE IF EXISTS `company_omanization_snapshots`;
