-- Engagements operational layer: top-action fields, ops queue, internal notes, transfer-payment state, document upload metadata.

ALTER TABLE `engagements`
  MODIFY COLUMN `health` enum('on_track', 'at_risk', 'blocked', 'delayed', 'unknown') NOT NULL DEFAULT 'unknown';

ALTER TABLE `engagements`
  ADD COLUMN `health_reason` text,
  ADD COLUMN `sla_due_at` timestamp NULL,
  ADD COLUMN `last_activity_at` timestamp NULL,
  ADD COLUMN `top_action_type` varchar(64),
  ADD COLUMN `top_action_label` varchar(512),
  ADD COLUMN `top_action_status` varchar(64),
  ADD COLUMN `top_action_due_at` timestamp NULL,
  ADD COLUMN `top_action_payload` json NOT NULL DEFAULT ('{}'),
  ADD COLUMN `assigned_owner_user_id` int,
  ADD COLUMN `ops_priority` enum('normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  ADD COLUMN `escalated_at` timestamp NULL,
  ADD COLUMN `workflow_stage` varchar(128),
  ADD KEY `idx_engagements_owner` (`assigned_owner_user_id`),
  ADD KEY `idx_engagements_company_priority` (`company_id`, `ops_priority`),
  ADD CONSTRAINT `engagements_assigned_owner_user_id_users_id_fk` FOREIGN KEY (`assigned_owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;

ALTER TABLE `engagement_documents`
  ADD COLUMN `storage_key` varchar(1024),
  ADD COLUMN `mime_type` varchar(255),
  ADD COLUMN `size_bytes` int,
  ADD COLUMN `scan_status` enum('not_scanned', 'pending', 'clean', 'suspicious', 'failed') NOT NULL DEFAULT 'not_scanned';

CREATE TABLE `engagement_notes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `engagement_id` int NOT NULL,
  `company_id` int NOT NULL,
  `author_user_id` int,
  `body` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_engagement_notes_engagement` (`engagement_id`),
  KEY `idx_engagement_notes_company` (`company_id`),
  CONSTRAINT `engagement_notes_engagement_id_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_notes_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_notes_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE `engagement_payment_transfers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `engagement_id` int NOT NULL,
  `company_id` int NOT NULL,
  `phase` enum('idle', 'instructions_sent', 'proof_submitted', 'verified', 'rejected', 'reconciled') NOT NULL DEFAULT 'idle',
  `instructions_text` text,
  `proof_url` varchar(2048),
  `proof_reference` varchar(255),
  `amount_claimed_omr` decimal(14, 3),
  `client_service_invoice_id` int,
  `submitted_by_user_id` int,
  `verified_by_user_id` int,
  `verified_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_engagement_payment_transfer_engagement` (`engagement_id`),
  KEY `idx_engagement_payment_transfer_company` (`company_id`),
  KEY `idx_engagement_payment_transfer_phase` (`company_id`, `phase`),
  CONSTRAINT `engagement_payment_transfers_engagement_id_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_payment_transfers_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_payment_transfers_submitted_by_user_id_users_id_fk` FOREIGN KEY (`submitted_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `engagement_payment_transfers_verified_by_user_id_users_id_fk` FOREIGN KEY (`verified_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
