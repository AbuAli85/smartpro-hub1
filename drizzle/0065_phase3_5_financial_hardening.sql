-- Phase 3.5: export versioning, issued invoice immutable snapshot

ALTER TABLE `promoter_payroll_runs`
  ADD COLUMN `export_generation` INT NOT NULL DEFAULT 0 AFTER `exported_by_user_id`;

ALTER TABLE `promoter_invoices`
  ADD COLUMN `issued_snapshot_json` JSON NULL AFTER `html_artifact_url`;
