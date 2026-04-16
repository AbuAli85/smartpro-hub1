-- Phase 1 deployment economics: billing customers, customer deployments, rate rules.
-- FK to business_parties for party_id (canonical identity); Drizzle omits this reference to avoid schema order issues.

CREATE TABLE IF NOT EXISTS `billing_customers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `party_id` CHAR(36) NULL,
  `display_name` VARCHAR(255) NOT NULL,
  `legal_name` VARCHAR(255) NULL,
  `tax_registration` VARCHAR(100) NULL,
  `vat_treatment` VARCHAR(64) NULL,
  `payment_terms_days` INT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_bc_company` (`company_id`),
  KEY `idx_bc_company_status` (`company_id`, `status`),
  KEY `idx_bc_party` (`party_id`),
  UNIQUE KEY `uq_bc_company_party` (`company_id`, `party_id`),
  CONSTRAINT `fk_bc_party` FOREIGN KEY (`party_id`) REFERENCES `business_parties` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_contracts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `billing_customer_id` INT NOT NULL,
  `reference` VARCHAR(128) NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_cc_company` (`company_id`),
  KEY `idx_cc_billing_customer` (`billing_customer_id`),
  CONSTRAINT `fk_cc_billing_customer` FOREIGN KEY (`billing_customer_id`) REFERENCES `billing_customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `attendance_sites`
  ADD COLUMN `billing_customer_id` INT NULL AFTER `daily_rate_omr`,
  ADD KEY `idx_as_billing_customer` (`billing_customer_id`),
  ADD CONSTRAINT `fk_as_billing_customer` FOREIGN KEY (`billing_customer_id`) REFERENCES `billing_customers` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `customer_deployments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `billing_customer_id` INT NOT NULL,
  `customer_contract_id` INT NULL,
  `primary_attendance_site_id` INT NULL,
  `outsourcing_contract_id` CHAR(36) NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'draft',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_cdep_company` (`company_id`),
  KEY `idx_cdep_billing_customer` (`billing_customer_id`),
  KEY `idx_cdep_contract` (`customer_contract_id`),
  KEY `idx_cdep_site` (`primary_attendance_site_id`),
  KEY `idx_cdep_outsourcing` (`outsourcing_contract_id`),
  CONSTRAINT `fk_cdep_billing_customer` FOREIGN KEY (`billing_customer_id`) REFERENCES `billing_customers` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_cdep_customer_contract` FOREIGN KEY (`customer_contract_id`) REFERENCES `customer_contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cdep_site` FOREIGN KEY (`primary_attendance_site_id`) REFERENCES `attendance_sites` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_cdep_outsourcing` FOREIGN KEY (`outsourcing_contract_id`) REFERENCES `outsourcing_contracts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_deployment_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `customer_deployment_id` INT NOT NULL,
  `employee_id` INT NOT NULL,
  `role` VARCHAR(64) NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_cda_company` (`company_id`),
  KEY `idx_cda_deployment` (`customer_deployment_id`),
  KEY `idx_cda_employee` (`employee_id`),
  CONSTRAINT `fk_cda_deployment` FOREIGN KEY (`customer_deployment_id`) REFERENCES `customer_deployments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_cda_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billing_rate_rules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `customer_deployment_id` INT NOT NULL,
  `unit` VARCHAR(32) NOT NULL,
  `amount_omr` DECIMAL(14, 3) NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `rule_meta_json` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_brr_company` (`company_id`),
  KEY `idx_brr_deployment` (`customer_deployment_id`),
  KEY `idx_brr_effective` (`effective_from`, `effective_to`),
  CONSTRAINT `fk_brr_deployment` FOREIGN KEY (`customer_deployment_id`) REFERENCES `customer_deployments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
