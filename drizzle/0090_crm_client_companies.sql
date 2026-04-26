-- ─── Phase CRM-WaaS: Client Companies + CRM Schema Extensions ─────────────────
--
-- Creates the central B2B entity (client_companies) and extends existing CRM,
-- quotation, deployment, attendance, and invoice tables so the full
-- Client Company → Contact → Deal → Quotation → Deployment → Attendance → Invoice
-- flow is traceable end-to-end.

-- ── 1. client_companies ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `client_companies` (
  `id`                 INT            NOT NULL AUTO_INCREMENT,
  `company_id`         INT            NOT NULL,
  `name`               VARCHAR(255)   NOT NULL,
  `industry`           VARCHAR(100)   NULL,
  `cr_number`          VARCHAR(100)   NULL,
  `billing_address`    TEXT           NULL,
  `primary_contact_id` INT            NULL,
  `account_manager_id` INT            NULL,
  `status`             ENUM('lead','active','inactive','archived') NOT NULL DEFAULT 'lead',
  `notes`              TEXT           NULL,
  `created_at`         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cc_company` (`company_id`),
  INDEX `idx_cc_status`  (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. crm_contacts: add clientCompanyId + roleType ───────────────────────────
ALTER TABLE `crm_contacts`
  ADD COLUMN IF NOT EXISTS `client_company_id` INT NULL AFTER `company`,
  ADD COLUMN IF NOT EXISTS `role_type` ENUM('decision_maker','influencer','finance','operations','other') NULL AFTER `position`;

CREATE INDEX IF NOT EXISTS `idx_crmc_client_company` ON `crm_contacts` (`client_company_id`);

-- ── 3. crm_deals: extend stage enum + add serviceType / expectedStartDate ──────
-- Extend enum to include workforce-pipeline stages while keeping legacy values
ALTER TABLE `crm_deals`
  MODIFY COLUMN `stage` ENUM(
    'lead','qualified','proposal','quotation_sent',
    'negotiation','closed_won','closed_lost','won','lost'
  ) NOT NULL DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS `client_company_id` INT NULL AFTER `companyId`,
  ADD COLUMN IF NOT EXISTS `service_type`       VARCHAR(50) NULL AFTER `title`,
  ADD COLUMN IF NOT EXISTS `expected_start_date` DATE NULL AFTER `expectedCloseDate`;

CREATE INDEX IF NOT EXISTS `idx_crmd_client_company` ON `crm_deals` (`client_company_id`);

-- ── 4. service_quotations: add workforce billing fields ───────────────────────
ALTER TABLE `service_quotations`
  ADD COLUMN IF NOT EXISTS `client_company_id`  INT             NULL AFTER `crm_contact_id`,
  ADD COLUMN IF NOT EXISTS `workers_count`       INT             NULL,
  ADD COLUMN IF NOT EXISTS `duration_days`       INT             NULL,
  ADD COLUMN IF NOT EXISTS `duration_months`     INT             NULL,
  ADD COLUMN IF NOT EXISTS `rate_per_day_omr`    DECIMAL(10,3)  NULL,
  ADD COLUMN IF NOT EXISTS `rate_per_month_omr`  DECIMAL(10,3)  NULL,
  ADD COLUMN IF NOT EXISTS `fixed_amount_omr`    DECIMAL(10,3)  NULL,
  ADD COLUMN IF NOT EXISTS `valid_until`         DATE           NULL;

CREATE INDEX IF NOT EXISTS `idx_sq_client_company` ON `service_quotations` (`client_company_id`);

-- ── 5. customer_deployments: add CRM linkage ──────────────────────────────────
ALTER TABLE `customer_deployments`
  ADD COLUMN IF NOT EXISTS `client_company_id` INT NULL AFTER `company_id`,
  ADD COLUMN IF NOT EXISTS `deal_id`           INT NULL,
  ADD COLUMN IF NOT EXISTS `quotation_id`      INT NULL;

CREATE INDEX IF NOT EXISTS `idx_cdep_client_company` ON `customer_deployments` (`client_company_id`);
CREATE INDEX IF NOT EXISTS `idx_cdep_deal`           ON `customer_deployments` (`deal_id`);
CREATE INDEX IF NOT EXISTS `idx_cdep_quotation`      ON `customer_deployments` (`quotation_id`);

-- ── 6. attendance_records: add deployment link ────────────────────────────────
ALTER TABLE `attendance_records`
  ADD COLUMN IF NOT EXISTS `customer_deployment_id` INT NULL AFTER `promoter_assignment_id`;

CREATE INDEX IF NOT EXISTS `idx_att_rec_deployment` ON `attendance_records` (`customer_deployment_id`);

-- ── 7. client_service_invoices: add CRM linkage ───────────────────────────────
ALTER TABLE `client_service_invoices`
  ADD COLUMN IF NOT EXISTS `client_company_id`      INT NULL AFTER `client_display_name`,
  ADD COLUMN IF NOT EXISTS `customer_deployment_id` INT NULL,
  ADD COLUMN IF NOT EXISTS `quotation_id`           INT NULL;

CREATE INDEX IF NOT EXISTS `idx_csi_client_company` ON `client_service_invoices` (`client_company_id`);
CREATE INDEX IF NOT EXISTS `idx_csi_deployment`     ON `client_service_invoices` (`customer_deployment_id`);
CREATE INDEX IF NOT EXISTS `idx_csi_quotation`      ON `client_service_invoices` (`quotation_id`);
