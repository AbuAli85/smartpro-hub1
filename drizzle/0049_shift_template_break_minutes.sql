-- Payroll: shift break deduction (minutes), default 0 for existing rows
ALTER TABLE `shift_templates` ADD COLUMN `break_minutes` INT NOT NULL DEFAULT 0;
