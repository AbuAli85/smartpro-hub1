-- Non-authoritative payroll preview flag (createRun). Authoritative executeMonthlyPayroll sets preview_only = 0.
ALTER TABLE `payroll_runs`
  ADD COLUMN `preview_only` TINYINT(1) NOT NULL DEFAULT 0
  AFTER `attendance_preflight_snapshot`;
