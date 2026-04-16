-- Phase 1.5: CMS sync visibility, contract deployment target (required headcount).

ALTER TABLE `outsourcing_contracts`
  ADD COLUMN `required_headcount` INT NULL AFTER `metadata`;

ALTER TABLE `promoter_assignments`
  ADD COLUMN `cms_sync_state` VARCHAR(32) NOT NULL DEFAULT 'not_required'
    COMMENT 'not_required|pending|synced|skipped|failed — assignment is source of truth; CMS is best-effort mirror'
    AFTER `issue_date`,
  ADD COLUMN `last_sync_error` TEXT NULL AFTER `cms_sync_state`,
  ADD COLUMN `last_synced_at` TIMESTAMP NULL AFTER `last_sync_error`;

CREATE INDEX `idx_pa_cms_sync` ON `promoter_assignments` (`company_id`, `cms_sync_state`);
