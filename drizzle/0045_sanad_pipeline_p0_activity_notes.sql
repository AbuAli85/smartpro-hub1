-- P0: next-action scheduling, assignment audit, activity log, notes.

ALTER TABLE `sanad_centres_pipeline`
  ADD COLUMN `next_action_type` VARCHAR(32) NULL AFTER `next_action`,
  ADD COLUMN `next_action_due_at` TIMESTAMP NULL AFTER `next_action_type`,
  ADD COLUMN `assigned_at` TIMESTAMP NULL AFTER `next_action_due_at`,
  ADD COLUMN `assigned_by_user_id` INT NULL AFTER `assigned_at`,
  ADD COLUMN `latest_note_preview` VARCHAR(512) NULL AFTER `assigned_by_user_id`,
  ADD KEY `idx_sanad_centres_pipe_due` (`next_action_due_at`),
  ADD CONSTRAINT `fk_sanad_centres_pipeline_assigned_by` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`);

CREATE TABLE IF NOT EXISTS `sanad_centre_activity_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `center_id` INT NOT NULL,
  `actor_user_id` INT NULL,
  `activity_type` VARCHAR(64) NOT NULL,
  `note` TEXT NULL,
  `metadata_json` JSON NULL,
  `occurred_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sanad_act_center_time` (`center_id`, `occurred_at`),
  CONSTRAINT `fk_sanad_act_center` FOREIGN KEY (`center_id`) REFERENCES `sanad_intel_centers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sanad_act_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_centre_notes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `center_id` INT NOT NULL,
  `author_user_id` INT NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sanad_notes_center` (`center_id`, `created_at`),
  CONSTRAINT `fk_sanad_notes_center` FOREIGN KEY (`center_id`) REFERENCES `sanad_intel_centers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sanad_notes_author` FOREIGN KEY (`author_user_id`) REFERENCES `users` (`id`)
);
