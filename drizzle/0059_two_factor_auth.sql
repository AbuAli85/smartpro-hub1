-- TOTP / backup-code 2FA (post-OAuth challenge)
ALTER TABLE `users`
  ADD COLUMN `two_factor_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `lastSignedIn`,
  ADD COLUMN `two_factor_secret_encrypted` TEXT NULL DEFAULT NULL AFTER `two_factor_enabled`,
  ADD COLUMN `two_factor_backup_codes_json` TEXT NULL DEFAULT NULL AFTER `two_factor_secret_encrypted`,
  ADD COLUMN `two_factor_verified_at` TIMESTAMP NULL DEFAULT NULL AFTER `two_factor_backup_codes_json`;

CREATE TABLE IF NOT EXISTS `mfa_challenges` (
  `id` CHAR(36) NOT NULL,
  `user_id` INT NOT NULL,
  `return_path` VARCHAR(2048) NOT NULL DEFAULT '/',
  `status` ENUM('pending','consumed','expired') NOT NULL DEFAULT 'pending',
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mfa_challenges_user` (`user_id`),
  CONSTRAINT `fk_mfa_challenges_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
