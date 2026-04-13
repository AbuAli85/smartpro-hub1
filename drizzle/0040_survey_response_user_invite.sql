-- Survey responses: optional link to platform user + completion marketing email tracking
-- Applied automatically via server/runPendingMigrations.ts (PENDING_COLUMNS) on boot.

ALTER TABLE `survey_responses`
  ADD COLUMN `user_id` int NULL,
  ADD INDEX `idx_survey_responses_user` (`user_id`),
  ADD CONSTRAINT `fk_survey_responses_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;

ALTER TABLE `survey_responses`
  ADD COLUMN `completion_invite_email_sent_at` timestamp NULL;
