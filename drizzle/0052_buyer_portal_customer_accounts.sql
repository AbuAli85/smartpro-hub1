-- Buyer Portal foundation: external customer accounts and memberships (scoped by customer_account_id in app layer).
-- See docs/architecture/buyer-portal-foundation-spec.md

CREATE TABLE IF NOT EXISTS `customer_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `provider_company_id` int NOT NULL,
  `display_name` varchar(255) NOT NULL,
  `legal_name` varchar(255),
  `slug` varchar(100),
  `status` enum('draft','active','suspended','closed') NOT NULL DEFAULT 'active',
  `country` varchar(10) DEFAULT 'OM',
  `primary_contact_email` varchar(320),
  `primary_contact_phone` varchar(32),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `customer_accounts_id` PRIMARY KEY(`id`),
  KEY `idx_ca_provider` (`provider_company_id`)
);

CREATE TABLE IF NOT EXISTS `customer_account_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customer_account_id` int NOT NULL,
  `user_id` int NOT NULL,
  `role` enum('buyer_admin','buyer_finance','buyer_operations','buyer_viewer') NOT NULL,
  `status` enum('invited','active','revoked') NOT NULL DEFAULT 'active',
  `invited_at` timestamp,
  `accepted_at` timestamp,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `customer_account_members_id` PRIMARY KEY(`id`),
  UNIQUE KEY `uq_cam_account_user` (`customer_account_id`,`user_id`),
  KEY `idx_cam_account` (`customer_account_id`),
  KEY `idx_cam_user` (`user_id`)
);
