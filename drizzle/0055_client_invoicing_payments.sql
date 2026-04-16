-- Client service invoicing (tenant bills external clients from site attendance / rates)
CREATE TABLE IF NOT EXISTS `client_service_invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `client_key` VARCHAR(255) NOT NULL,
  `client_display_name` VARCHAR(255) NOT NULL,
  `invoice_number` VARCHAR(64) NOT NULL,
  `period_year` INT NOT NULL,
  `period_month` INT NOT NULL,
  `issue_date` DATE NOT NULL,
  `due_date` DATE NOT NULL,
  `subtotal_omr` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `vat_omr` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `total_omr` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `amount_paid_omr` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `balance_omr` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `status` ENUM('draft', 'sent', 'partial', 'paid', 'overdue', 'void') NOT NULL DEFAULT 'draft',
  `notes` TEXT,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_client_service_invoices_number` (`invoice_number`),
  UNIQUE KEY `uq_client_invoice_period` (`company_id`, `client_key`, `period_year`, `period_month`),
  KEY `idx_csi_company_status` (`company_id`, `status`),
  KEY `idx_csi_company_due` (`company_id`, `due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `client_invoice_line_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` INT NOT NULL,
  `attendance_site_id` INT,
  `description` VARCHAR(512) NOT NULL,
  `quantity` DECIMAL(12, 3) NOT NULL,
  `unit_rate_omr` DECIMAL(14, 3) NOT NULL,
  `line_total_omr` DECIMAL(14, 3) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_cili_invoice` (`invoice_id`),
  CONSTRAINT `fk_cili_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `client_service_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoice_payment_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoice_id` INT NOT NULL,
  `amount_omr` DECIMAL(14, 3) NOT NULL,
  `paid_at` TIMESTAMP NOT NULL,
  `payment_method` ENUM('bank', 'cash', 'card', 'other') NOT NULL DEFAULT 'bank',
  `reference` VARCHAR(255),
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_ipr_invoice` (`invoice_id`),
  CONSTRAINT `fk_ipr_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `client_service_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
