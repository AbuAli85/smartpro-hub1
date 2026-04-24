-- Migration: Add enabledModules column to companies
-- null = all modules active (legacy / unlimited plan)
-- string[] = explicit allowlist of active CompanyModule keys

ALTER TABLE `companies`
  ADD COLUMN `enabledModules` json DEFAULT NULL;
