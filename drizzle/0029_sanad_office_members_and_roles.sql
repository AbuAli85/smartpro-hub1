-- SANAD partner office membership (per-office RBAC) + platform roles for network ops.

CREATE TABLE IF NOT EXISTS `sanad_office_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sanad_office_id` int NOT NULL,
  `user_id` int NOT NULL,
  `role` enum('owner','manager','staff') NOT NULL DEFAULT 'staff',
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `sanad_office_members_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_sanad_office_member` UNIQUE (`sanad_office_id`, `user_id`),
  KEY `idx_sanad_office_members_user` (`user_id`),
  CONSTRAINT `fk_sanad_office_members_office` FOREIGN KEY (`sanad_office_id`) REFERENCES `sanad_offices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sanad_office_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

-- Extend platform roles for SANAD network administration (MySQL requires full enum list).
ALTER TABLE `users` MODIFY COLUMN `platformRole` ENUM(
  'super_admin',
  'platform_admin',
  'regional_manager',
  'client_services',
  'finance_admin',
  'hr_admin',
  'company_admin',
  'company_member',
  'reviewer',
  'client',
  'external_auditor',
  'sanad_network_admin',
  'sanad_compliance_reviewer'
) NOT NULL DEFAULT 'client';

-- Backfill owners from intel bridge (idempotent: unique constraint skips duplicates).
INSERT IGNORE INTO `sanad_office_members` (`sanad_office_id`, `user_id`, `role`)
SELECT `linked_sanad_office_id`, `registered_user_id`, 'owner'
FROM `sanad_intel_center_operations`
WHERE `linked_sanad_office_id` IS NOT NULL AND `registered_user_id` IS NOT NULL;
