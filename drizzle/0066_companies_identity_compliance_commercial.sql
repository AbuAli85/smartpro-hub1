-- Migration 0066: Companies — Identity, Compliance & Commercial Layer
-- Option B safe migration: all columns are nullable with sensible defaults.
-- No existing columns are altered or dropped.
-- Rollback: DROP the columns added below (listed at end of file).

-- ── A. Company Identity Hardening ─────────────────────────────────────────────
ALTER TABLE `companies`
  ADD COLUMN `company_size`         INT                                       NULL COMMENT 'Headcount band (used for Omanization tier rules)',
  ADD COLUMN `established_at`       DATE                                      NULL COMMENT 'Official incorporation / establishment date',
  ADD COLUMN `company_type`         ENUM('llc','sole_prop','branch','joint_venture','government','ngo','other') NULL DEFAULT 'llc' COMMENT 'Legal entity type';

-- ── B. Oman Compliance Layer ──────────────────────────────────────────────────
ALTER TABLE `companies`
  ADD COLUMN `omanization_required`   BOOLEAN                                 NOT NULL DEFAULT TRUE  COMMENT 'Whether Omanization quota applies',
  ADD COLUMN `omanization_ratio`      DECIMAL(5,2)                            NULL     COMMENT 'Required Omani national ratio (0–100)',
  ADD COLUMN `mol_compliance_status`  ENUM('compliant','warning','non_compliant','unknown') NOT NULL DEFAULT 'unknown' COMMENT 'Ministry of Labour compliance status',
  ADD COLUMN `mol_last_checked_at`    TIMESTAMP                               NULL     COMMENT 'Last time MoL compliance was verified';

-- ── C. Commercial / Billing Layer ─────────────────────────────────────────────
ALTER TABLE `companies`
  ADD COLUMN `billing_model`          ENUM('subscription','per_transaction','hybrid','custom') NULL DEFAULT 'subscription' COMMENT 'How SmartPRO charges this company',
  ADD COLUMN `subscription_fee`       DECIMAL(10,3)                           NULL     COMMENT 'Monthly subscription fee in OMR',
  ADD COLUMN `contract_start`         DATE                                    NULL     COMMENT 'Service contract start date',
  ADD COLUMN `contract_end`           DATE                                    NULL     COMMENT 'Service contract end date',
  ADD COLUMN `account_manager_id`     INT                                     NULL     COMMENT 'FK → users.id; SmartPRO account manager';

-- ── D. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX `idx_companies_mol_status`    ON `companies` (`mol_compliance_status`);
CREATE INDEX `idx_companies_billing_model` ON `companies` (`billing_model`);
CREATE INDEX `idx_companies_contract_end`  ON `companies` (`contract_end`);

-- ── Rollback (run these to undo) ──────────────────────────────────────────────
-- DROP INDEX `idx_companies_mol_status`    ON `companies`;
-- DROP INDEX `idx_companies_billing_model` ON `companies`;
-- DROP INDEX `idx_companies_contract_end`  ON `companies`;
-- ALTER TABLE `companies`
--   DROP COLUMN `company_size`,
--   DROP COLUMN `established_at`,
--   DROP COLUMN `company_type`,
--   DROP COLUMN `omanization_required`,
--   DROP COLUMN `omanization_ratio`,
--   DROP COLUMN `mol_compliance_status`,
--   DROP COLUMN `mol_last_checked_at`,
--   DROP COLUMN `billing_model`,
--   DROP COLUMN `subscription_fee`,
--   DROP COLUMN `contract_start`,
--   DROP COLUMN `contract_end`,
--   DROP COLUMN `account_manager_id`;
