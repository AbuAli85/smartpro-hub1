-- Payment gateway (Thawani + Stripe) — client invoice AR sessions and webhook idempotency
ALTER TABLE `invoice_payment_records`
  ADD COLUMN `gateway` ENUM('thawani','stripe') NULL DEFAULT NULL AFTER `reference`,
  ADD COLUMN `gateway_session_id` VARCHAR(255) NULL DEFAULT NULL AFTER `gateway`,
  ADD COLUMN `gateway_payment_id` VARCHAR(255) NULL DEFAULT NULL AFTER `gateway_session_id`,
  ADD COLUMN `gateway_status` VARCHAR(64) NULL DEFAULT NULL AFTER `gateway_payment_id`;

CREATE INDEX `idx_ipr_gateway_session` ON `invoice_payment_records` (`gateway_session_id`);

CREATE TABLE IF NOT EXISTS `payment_gateway_sessions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `invoice_id` INT NOT NULL,
  `gateway` ENUM('thawani','stripe') NOT NULL,
  `client_reference` VARCHAR(255) NOT NULL,
  `gateway_session_id` VARCHAR(255) NULL,
  `gateway_payment_id` VARCHAR(255) NULL,
  `amount_omr` DECIMAL(14, 3) NOT NULL,
  `status` ENUM('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
  `metadata` JSON NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_pgs_client_reference` (`client_reference`),
  KEY `idx_pgs_company` (`company_id`),
  KEY `idx_pgs_invoice` (`invoice_id`),
  KEY `idx_pgs_gateway_session` (`gateway_session_id`),
  CONSTRAINT `fk_pgs_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `client_service_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payment_webhook_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `gateway` ENUM('thawani','stripe') NOT NULL,
  `external_event_id` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_pwe_gateway_event` (`gateway`, `external_event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
