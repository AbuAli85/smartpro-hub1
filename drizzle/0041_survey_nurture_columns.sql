-- Nurture follow-up tracking for anonymous survey respondents.
-- Applied automatically on server boot via server/runPendingMigrations.ts (PENDING_COLUMNS).
-- Or run: npm run db:run-pending (requires DATABASE_URL).

ALTER TABLE `survey_responses` ADD COLUMN `nurture_followup_count` int NOT NULL DEFAULT 0;
ALTER TABLE `survey_responses` ADD COLUMN `nurture_last_sent_at` timestamp NULL;
ALTER TABLE `survey_responses` ADD COLUMN `nurture_stopped_at` timestamp NULL;
ALTER TABLE `survey_responses` ADD COLUMN `nurture_stopped_reason` varchar(32) NULL;
