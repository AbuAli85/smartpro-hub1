--> statement-breakpoint
-- Migration 0069: Fix 3 schema drift warnings
-- Adds columns present in Drizzle schema but missing from the live DB.
-- All changes are additive/nullable-safe and zero-downtime.

-- 1. attendance_sessions.promoter_assignment_id
--    CHAR(36) nullable FK to promoter_assignments.id
--    Mirrors the pattern used in attendance_records.promoter_assignment_id (added in an earlier migration).
ALTER TABLE `attendance_sessions`
  ADD COLUMN `promoter_assignment_id` CHAR(36) NULL AFTER `site_id`,
  ADD INDEX `idx_att_sess_promoter_assignment` (`promoter_assignment_id`);

--> statement-breakpoint
-- 2. outsourcing_contracts.required_headcount
--    INT nullable — commercial target promoter count under this agreement.
--    No FK; used as a planning/metadata field only.
ALTER TABLE `outsourcing_contracts`
  ADD COLUMN `required_headcount` INT NULL AFTER `metadata`;

--> statement-breakpoint
-- 3. promoter_payroll_runs.export_generation
--    INT NOT NULL DEFAULT 0 — increments on each successful stored export for audit trail.
ALTER TABLE `promoter_payroll_runs`
  ADD COLUMN `export_generation` INT NOT NULL DEFAULT 0 AFTER `exported_by_user_id`;
