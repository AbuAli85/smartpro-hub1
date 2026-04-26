-- Add commission_pay to payroll_line_items
-- Stores KPI commission earned in the period, auto-populated by createRun.
ALTER TABLE `payroll_line_items`
  ADD COLUMN `commission_pay` DECIMAL(12,3) NOT NULL DEFAULT 0
  AFTER `overtime_pay`;
