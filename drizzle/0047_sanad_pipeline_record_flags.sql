-- Record-quality flags for directory pipeline (invalid / duplicate / archive from ops workflow).
ALTER TABLE `sanad_centres_pipeline`
  ADD COLUMN `is_archived` tinyint(1) NOT NULL DEFAULT 0 AFTER `latest_note_preview`,
  ADD COLUMN `is_invalid` tinyint(1) NOT NULL DEFAULT 0 AFTER `is_archived`,
  ADD COLUMN `is_duplicate` tinyint(1) NOT NULL DEFAULT 0 AFTER `is_invalid`,
  ADD INDEX `idx_sanad_centres_pipe_archived` (`is_archived`);
