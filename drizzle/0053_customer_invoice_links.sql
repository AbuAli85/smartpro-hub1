-- Buyer Portal: link provider PRO billing invoices to external customer accounts.
CREATE TABLE IF NOT EXISTS `customer_invoice_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customer_account_id` int NOT NULL,
  `invoice_id` int NOT NULL COMMENT 'pro_billing_cycles.id',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `customer_invoice_links_id` PRIMARY KEY(`id`),
  UNIQUE KEY `uq_cil_account_invoice` (`customer_account_id`,`invoice_id`),
  KEY `idx_cil_account` (`customer_account_id`),
  KEY `idx_cil_invoice` (`invoice_id`)
);
