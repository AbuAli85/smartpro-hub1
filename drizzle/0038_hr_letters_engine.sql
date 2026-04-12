-- HR Letters: template-first engine — signatories, issuance metadata, snapshots

CREATE TABLE IF NOT EXISTS `company_signatories` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `company_id` int NOT NULL,
  `name_en` varchar(255) NOT NULL,
  `name_ar` varchar(255),
  `title_en` varchar(255) NOT NULL,
  `title_ar` varchar(255),
  `is_default` boolean NOT NULL DEFAULT false,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp DEFAULT (now()) NOT NULL,
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_company_signatories_company` (`company_id`)
);

ALTER TABLE `hr_letters`
  ADD COLUMN `letter_status` enum('draft','issued','voided') NOT NULL DEFAULT 'issued' AFTER `language`,
  ADD COLUMN `template_version` varchar(32) NOT NULL DEFAULT 'v1' AFTER `letter_status`,
  ADD COLUMN `field_payload` json NULL AFTER `additional_notes`,
  ADD COLUMN `data_snapshot` json NULL AFTER `field_payload`,
  ADD COLUMN `issued_at` timestamp NULL AFTER `data_snapshot`,
  ADD COLUMN `issued_by_user_id` int NULL AFTER `issued_at`,
  ADD COLUMN `signatory_id` int NULL AFTER `issued_by_user_id`,
  ADD COLUMN `export_count` int NOT NULL DEFAULT 0 AFTER `signatory_id`,
  ADD COLUMN `email_sent_at` timestamp NULL AFTER `export_count`;
