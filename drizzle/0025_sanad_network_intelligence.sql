CREATE TABLE IF NOT EXISTS `sanad_intel_import_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batch_key` varchar(64) NOT NULL,
  `source_files` json NOT NULL DEFAULT ('[]'),
  `row_counts` json NOT NULL DEFAULT ('{}'),
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_intel_import_batches_id` PRIMARY KEY(`id`),
  CONSTRAINT `sanad_intel_import_batches_batch_key_unique` UNIQUE(`batch_key`),
  KEY `idx_sanad_intel_batch_created` (`created_at`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_governorate_year_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `import_batch_id` int,
  `year` int NOT NULL,
  `governorate_key` varchar(128) NOT NULL,
  `governorate_label` varchar(255) NOT NULL,
  `transaction_count` int NOT NULL DEFAULT 0,
  `income_amount` decimal(18,2) NOT NULL DEFAULT '0',
  `source_ref` varchar(128),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_intel_governorate_year_metrics_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sanad_intel_gov_year` UNIQUE(`year`,`governorate_key`),
  KEY `idx_sanad_intel_gov_year_y` (`year`),
  KEY `idx_sanad_intel_gov_year_k` (`governorate_key`),
  CONSTRAINT `sanad_intel_governorate_year_metrics_import_batch_id_sanad_intel_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `sanad_intel_import_batches`(`id`) ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `sanad_intel_workforce_governorate` (
  `id` int AUTO_INCREMENT NOT NULL,
  `import_batch_id` int,
  `governorate_key` varchar(128) NOT NULL,
  `governorate_label` varchar(255) NOT NULL,
  `owner_count` int NOT NULL DEFAULT 0,
  `staff_count` int NOT NULL DEFAULT 0,
  `total_workforce` int NOT NULL DEFAULT 0,
  `as_of_year` int,
  `source_ref` varchar(128),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_intel_workforce_governorate_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sanad_intel_workforce_gov` UNIQUE(`governorate_key`),
  KEY `idx_sanad_intel_wf_k` (`governorate_key`),
  CONSTRAINT `sanad_intel_workforce_governorate_import_batch_id_sanad_intel_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `sanad_intel_import_batches`(`id`) ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `sanad_intel_geography_stats` (
  `id` int AUTO_INCREMENT NOT NULL,
  `import_batch_id` int,
  `governorate_key` varchar(128) NOT NULL,
  `governorate_label` varchar(255) NOT NULL,
  `wilayat` varchar(255),
  `village` varchar(255),
  `center_count` int NOT NULL DEFAULT 0,
  `source_ref` varchar(128),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_intel_geography_stats_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sanad_intel_geo` UNIQUE(`governorate_key`,`wilayat`,`village`),
  KEY `idx_sanad_intel_geo_gov` (`governorate_key`),
  CONSTRAINT `sanad_intel_geography_stats_import_batch_id_sanad_intel_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `sanad_intel_import_batches`(`id`) ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `sanad_intel_service_usage_year` (
  `id` int AUTO_INCREMENT NOT NULL,
  `import_batch_id` int,
  `year` int NOT NULL,
  `rank_order` int NOT NULL,
  `service_name_ar` text,
  `service_name_en` varchar(512),
  `authority_name_ar` text,
  `authority_name_en` varchar(512),
  `demand_volume` int NOT NULL DEFAULT 0,
  `source_ref` varchar(128),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_intel_service_usage_year_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sanad_intel_svc_year_rank` UNIQUE(`year`,`rank_order`),
  KEY `idx_sanad_intel_svc_year` (`year`),
  CONSTRAINT `sanad_intel_service_usage_year_import_batch_id_sanad_intel_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `sanad_intel_import_batches`(`id`) ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `sanad_intel_centers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `import_batch_id` int,
  `source_fingerprint` varchar(64) NOT NULL,
  `center_name` varchar(512) NOT NULL,
  `responsible_person` varchar(255),
  `contact_number` varchar(64),
  `governorate_key` varchar(128) NOT NULL,
  `governorate_label_raw` varchar(255) NOT NULL,
  `wilayat` varchar(255),
  `village` varchar(255),
  `raw_row` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `sanad_intel_centers_id` PRIMARY KEY(`id`),
  CONSTRAINT `sanad_intel_centers_source_fingerprint_unique` UNIQUE(`source_fingerprint`),
  KEY `idx_sanad_intel_centers_gov` (`governorate_key`),
  KEY `idx_sanad_intel_centers_name` (`center_name`),
  CONSTRAINT `sanad_intel_centers_import_batch_id_sanad_intel_import_batches_id_fk` FOREIGN KEY (`import_batch_id`) REFERENCES `sanad_intel_import_batches`(`id`) ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `sanad_intel_center_operations` (
  `center_id` int NOT NULL,
  `partner_status` enum('unknown','prospect','active','suspended','churned') NOT NULL DEFAULT 'unknown',
  `onboarding_status` enum('not_started','intake','documentation','licensing_review','licensed','blocked') NOT NULL DEFAULT 'not_started',
  `compliance_overall` enum('not_assessed','partial','complete','at_risk') NOT NULL DEFAULT 'not_assessed',
  `internal_tags` json NOT NULL DEFAULT ('[]'),
  `notes` text,
  `internal_review_notes` text,
  `assigned_manager_user_id` int,
  `latitude` decimal(10,7),
  `longitude` decimal(10,7),
  `coverage_radius_km` int,
  `target_sla_hours` int,
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `sanad_intel_center_operations_center_id` PRIMARY KEY(`center_id`),
  KEY `idx_sanad_intel_ops_partner` (`partner_status`),
  KEY `idx_sanad_intel_ops_onb` (`onboarding_status`),
  CONSTRAINT `sanad_intel_center_operations_center_id_sanad_intel_centers_id_fk` FOREIGN KEY (`center_id`) REFERENCES `sanad_intel_centers`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `sanad_intel_center_operations_assigned_manager_user_id_users_id_fk` FOREIGN KEY (`assigned_manager_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `sanad_intel_license_requirements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `code` varchar(64) NOT NULL,
  `category` varchar(64) NOT NULL,
  `onboarding_stage` enum('intake','documentation','premises','staffing','licensing_review','go_live') NOT NULL,
  `title_ar` varchar(512),
  `title_en` varchar(512) NOT NULL,
  `description` text,
  `sort_order` int NOT NULL DEFAULT 0,
  `required_document_codes` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_intel_license_requirements_id` PRIMARY KEY(`id`),
  CONSTRAINT `sanad_intel_license_requirements_code_unique` UNIQUE(`code`),
  KEY `idx_sanad_intel_lic_cat` (`category`),
  KEY `idx_sanad_intel_lic_stage` (`onboarding_stage`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_center_compliance_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `center_id` int NOT NULL,
  `requirement_id` int NOT NULL,
  `status` enum('pending','submitted','verified','rejected','waived','not_applicable') NOT NULL DEFAULT 'pending',
  `evidence_note` text,
  `reviewed_by_user_id` int,
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `sanad_intel_center_compliance_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sanad_intel_cc_center_req` UNIQUE(`center_id`,`requirement_id`),
  KEY `idx_sanad_intel_cc_center` (`center_id`),
  CONSTRAINT `sanad_intel_center_compliance_items_center_id_sanad_intel_centers_id_fk` FOREIGN KEY (`center_id`) REFERENCES `sanad_intel_centers`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `sanad_intel_center_compliance_items_requirement_id_sanad_intel_license_requirements_id_fk` FOREIGN KEY (`requirement_id`) REFERENCES `sanad_intel_license_requirements`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `sanad_intel_center_compliance_items_reviewed_by_user_id_users_id_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS `sanad_intel_center_metrics_yearly` (
  `id` int AUTO_INCREMENT NOT NULL,
  `center_id` int NOT NULL,
  `year` int NOT NULL,
  `transaction_count` int,
  `income_amount` decimal(18,2),
  `source_ref` varchar(128),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_intel_center_metrics_yearly_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_sanad_intel_cm_center_year` UNIQUE(`center_id`,`year`),
  CONSTRAINT `sanad_intel_center_metrics_yearly_center_id_sanad_intel_centers_id_fk` FOREIGN KEY (`center_id`) REFERENCES `sanad_intel_centers`(`id`) ON DELETE cascade ON UPDATE no action
);
