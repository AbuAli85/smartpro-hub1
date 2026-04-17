-- Client Engagement workspace: orchestration over existing tenant tables (polymorphic entity_id has no FK).

CREATE TABLE `engagements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_id` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `engagement_type` enum(
    'workspace',
    'pro_service',
    'government_case',
    'marketplace_booking',
    'contract',
    'pro_billing_cycle',
    'client_service_invoice',
    'staffing_month',
    'work_permit_renewal',
    'service_request'
  ) NOT NULL,
  `status` enum(
    'draft',
    'active',
    'waiting_client',
    'waiting_platform',
    'blocked',
    'completed',
    'archived'
  ) NOT NULL DEFAULT 'active',
  `health` enum('on_track', 'at_risk', 'blocked', 'unknown') NOT NULL DEFAULT 'unknown',
  `due_date` timestamp NULL,
  `current_stage` varchar(255),
  `summary` text,
  `metadata` json NOT NULL DEFAULT ('{}'),
  `created_by_user_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_engagements_company` (`company_id`),
  KEY `idx_engagements_company_type` (`company_id`, `engagement_type`),
  KEY `idx_engagements_company_status` (`company_id`, `status`),
  CONSTRAINT `engagements_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagements_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE `engagement_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `engagement_id` int NOT NULL,
  `company_id` int NOT NULL,
  `link_type` enum(
    'pro_service',
    'government_case',
    'marketplace_booking',
    'contract',
    'pro_billing_cycle',
    'client_service_invoice',
    'staffing_month',
    'work_permit',
    'employee_document',
    'service_request'
  ) NOT NULL,
  `entity_id` int,
  `entity_key` varchar(128),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_engagement_links_engagement` (`engagement_id`),
  KEY `idx_engagement_links_company` (`company_id`),
  KEY `idx_engagement_links_lookup` (`company_id`, `link_type`, `entity_id`),
  CONSTRAINT `engagement_links_engagement_id_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_links_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
);

CREATE TABLE `engagement_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `engagement_id` int NOT NULL,
  `company_id` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `status` enum('pending', 'in_progress', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
  `due_date` timestamp NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_engagement_tasks_engagement` (`engagement_id`),
  KEY `idx_engagement_tasks_company` (`company_id`),
  CONSTRAINT `engagement_tasks_engagement_id_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_tasks_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
);

CREATE TABLE `engagement_messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `engagement_id` int NOT NULL,
  `company_id` int NOT NULL,
  `author` enum('client', 'platform', 'system') NOT NULL,
  `author_user_id` int,
  `subject` varchar(255),
  `body` text NOT NULL,
  `read_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_engagement_messages_engagement` (`engagement_id`),
  KEY `idx_engagement_messages_company` (`company_id`),
  KEY `idx_engagement_messages_created` (`created_at`),
  CONSTRAINT `engagement_messages_engagement_id_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_messages_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_messages_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE `engagement_documents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `engagement_id` int NOT NULL,
  `company_id` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `file_url` varchar(2048),
  `status` enum('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  `uploaded_by_user_id` int,
  `reviewed_by_user_id` int,
  `reviewed_at` timestamp NULL,
  `review_note` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_engagement_documents_engagement` (`engagement_id`),
  KEY `idx_engagement_documents_company` (`company_id`),
  CONSTRAINT `engagement_documents_engagement_id_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_documents_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_documents_uploaded_by_user_id_users_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `engagement_documents_reviewed_by_user_id_users_id_fk` FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE TABLE `engagement_activity_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `engagement_id` int NOT NULL,
  `company_id` int NOT NULL,
  `actor_user_id` int,
  `action` varchar(128) NOT NULL,
  `payload` json NOT NULL DEFAULT ('{}'),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `idx_engagement_activity_engagement` (`engagement_id`),
  KEY `idx_engagement_activity_company` (`company_id`),
  CONSTRAINT `engagement_activity_log_engagement_id_engagements_id_fk` FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_activity_log_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `engagement_activity_log_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
