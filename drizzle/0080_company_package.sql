-- Migration 0080: Add SaaS package tier column to companies
-- Stores the assigned package (starter/professional/business/enterprise).
-- Drives enabledModules on provisioning and billing classification.
-- null = legacy company — treat as enterprise semantics (no module gating).

ALTER TABLE `companies`
  ADD COLUMN `package` ENUM('starter','professional','business','enterprise') NULL
  AFTER `enabledModules`;
