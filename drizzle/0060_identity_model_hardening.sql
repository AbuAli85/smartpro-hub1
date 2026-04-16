-- Identity model hardening (SmartPRO)
-- See server/identity/authority.ts for in-code rationale and phased rollout notes.
-- Phases:
--   1) Additive tables + columns; backfill from legacy users.* fields.
--   2) Application uses platform_user_roles + company_members as sources of truth; users.platformRole retained as cache (see sync helpers).
--   3) Deferred: UNIQUE(email_normalized) once duplicate rows are remediated (partial unique N/A in MySQL; use email_unique_key pattern later).

-- ─── users: identity + lifecycle ──────────────────────────────────────────────
ALTER TABLE `users`
  ADD COLUMN `primary_email` VARCHAR(320) NULL DEFAULT NULL AFTER `email`,
  ADD COLUMN `email_normalized` VARCHAR(320) NULL DEFAULT NULL AFTER `primary_email`,
  ADD COLUMN `display_name` TEXT NULL DEFAULT NULL AFTER `email_normalized`,
  ADD COLUMN `account_status` ENUM('active','invited','suspended','merged','archived') NOT NULL DEFAULT 'active' AFTER `isActive`,
  ADD COLUMN `merged_into_user_id` INT NULL DEFAULT NULL AFTER `account_status`;

CREATE INDEX `idx_users_email_normalized` ON `users` (`email_normalized`);
CREATE INDEX `idx_users_account_status` ON `users` (`account_status`);

ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_merged_into`
  FOREIGN KEY (`merged_into_user_id`) REFERENCES `users` (`id`)
  ON DELETE SET NULL;

-- Backfill from legacy columns (idempotent assumptions: single run per deploy)
UPDATE `users` SET `primary_email` = `email` WHERE `primary_email` IS NULL AND `email` IS NOT NULL;
UPDATE `users` SET `email_normalized` = LOWER(TRIM(`email`)) WHERE `email` IS NOT NULL AND TRIM(`email`) <> '';
UPDATE `users` SET `display_name` = `name` WHERE `display_name` IS NULL AND `name` IS NOT NULL;
UPDATE `users` SET `account_status` = CASE WHEN `isActive` = 0 THEN 'suspended' ELSE 'active' END;

-- ─── user_profiles (contact / PII split from core account) ─────────────────────
CREATE TABLE IF NOT EXISTS `user_profiles` (
  `user_id` INT NOT NULL,
  `first_name` VARCHAR(255) NULL DEFAULT NULL,
  `last_name` VARCHAR(255) NULL DEFAULT NULL,
  `phone` VARCHAR(32) NULL DEFAULT NULL,
  `avatar_url` TEXT NULL DEFAULT NULL,
  `locale` VARCHAR(32) NULL DEFAULT NULL,
  `timezone` VARCHAR(64) NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `user_profiles` (`user_id`, `phone`, `avatar_url`)
SELECT `id`, `phone`, `avatarUrl` FROM `users`
WHERE NOT EXISTS (SELECT 1 FROM `user_profiles` up WHERE up.`user_id` = `users`.`id`);

-- ─── user_auth_identities (linked OAuth / SSO subjects) ───────────────────────
CREATE TABLE IF NOT EXISTS `user_auth_identities` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `user_id` INT NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `provider_subject_id` VARCHAR(255) NOT NULL,
  `provider_email` VARCHAR(320) NULL DEFAULT NULL,
  `is_primary` TINYINT(1) NOT NULL DEFAULT 0,
  `linked_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_used_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_provider_subject` (`provider`, `provider_subject_id`),
  KEY `idx_auth_user` (`user_id`),
  CONSTRAINT `fk_user_auth_identities_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `user_auth_identities` (`user_id`, `provider`, `provider_subject_id`, `provider_email`, `is_primary`, `linked_at`)
SELECT
  `id`,
  COALESCE(NULLIF(TRIM(`loginMethod`), ''), 'oauth'),
  `openId`,
  `email`,
  1,
  `createdAt`
FROM `users`;

-- ─── platform_user_roles (global platform authority — not tenant membership) ─
CREATE TABLE IF NOT EXISTS `platform_user_roles` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `user_id` INT NOT NULL,
  `role` ENUM(
    'super_admin',
    'platform_admin',
    'regional_manager',
    'client_services',
    'sanad_network_admin',
    'sanad_compliance_reviewer'
  ) NOT NULL,
  `granted_by` INT NULL DEFAULT NULL,
  `granted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pur_user` (`user_id`),
  KEY `idx_pur_user_active` (`user_id`, `revoked_at`),
  CONSTRAINT `fk_platform_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_platform_user_roles_granter` FOREIGN KEY (`granted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `platform_user_roles` (`user_id`, `role`, `granted_at`, `revoked_at`)
SELECT `id`, `platformRole`, `createdAt`, NULL
FROM `users`
WHERE `platformRole` IN (
  'super_admin',
  'platform_admin',
  'regional_manager',
  'client_services',
  'sanad_network_admin',
  'sanad_compliance_reviewer'
)
AND NOT EXISTS (
  SELECT 1 FROM `platform_user_roles` pur
  WHERE pur.`user_id` = `users`.`id` AND pur.`role` = `users`.`platformRole` AND pur.`revoked_at` IS NULL
);

-- Legacy template admin flag → treat as platform-level admin access (mirrors shared/rbac legacy behaviour).
INSERT INTO `platform_user_roles` (`user_id`, `role`, `granted_at`, `revoked_at`)
SELECT `id`, 'platform_admin', `createdAt`, NULL
FROM `users`
WHERE `role` = 'admin'
AND NOT EXISTS (
  SELECT 1 FROM `platform_user_roles` pur
  WHERE pur.`user_id` = `users`.`id` AND pur.`role` IN ('super_admin','platform_admin') AND pur.`revoked_at` IS NULL
);

-- ─── user_security_settings (2FA / step-up policy home) ───────────────────────
CREATE TABLE IF NOT EXISTS `user_security_settings` (
  `user_id` INT NOT NULL,
  `two_factor_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `two_factor_verified_at` TIMESTAMP NULL DEFAULT NULL,
  `recovery_codes_hash` TEXT NULL DEFAULT NULL,
  `requires_step_up_auth` TINYINT(1) NOT NULL DEFAULT 0,
  `password_last_changed_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_user_security_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `user_security_settings` (`user_id`, `two_factor_enabled`, `two_factor_verified_at`, `recovery_codes_hash`)
SELECT `id`, `two_factor_enabled`, `two_factor_verified_at`, NULL
FROM `users`
WHERE NOT EXISTS (SELECT 1 FROM `user_security_settings` s WHERE s.`user_id` = `users`.`id`);

-- ─── company_members lifecycle fields (additive) ─────────────────────────────
ALTER TABLE `company_members`
  ADD COLUMN `invited_at` TIMESTAMP NULL DEFAULT NULL AFTER `invitedBy`,
  ADD COLUMN `accepted_at` TIMESTAMP NULL DEFAULT NULL AFTER `invited_at`,
  ADD COLUMN `removed_at` TIMESTAMP NULL DEFAULT NULL AFTER `joinedAt`;

UPDATE `company_members` SET `accepted_at` = `joinedAt` WHERE `accepted_at` IS NULL AND `isActive` = 1;
