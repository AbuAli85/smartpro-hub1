CREATE TABLE IF NOT EXISTS `collection_work_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_id` int NOT NULL,
  `source_type` enum('pro_billing_cycle','subscription_invoice') NOT NULL,
  `source_id` int NOT NULL,
  `workflow_status` enum('needs_follow_up','promised_to_pay','escalated','disputed','resolved') NOT NULL DEFAULT 'needs_follow_up',
  `note` text,
  `updated_by_user_id` int,
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `collection_work_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_collection_work_source` UNIQUE(`source_type`,`source_id`),
  KEY `idx_cwi_company` (`company_id`)
);
