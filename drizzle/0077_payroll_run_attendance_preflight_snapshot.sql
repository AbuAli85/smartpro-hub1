-- Persist attendance reconciliation summary on payroll runs (governance / audit).
ALTER TABLE `payroll_runs`
  ADD COLUMN `attendance_preflight_snapshot` TEXT NULL AFTER `notes`;
