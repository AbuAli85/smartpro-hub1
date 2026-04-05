-- Normalized actor identity for e-sign audit (unified timeline / future filtering).
ALTER TABLE `contract_signature_audit`
  ADD COLUMN `actor_user_id` INT NULL AFTER `actor_email`,
  ADD COLUMN `actor_type` ENUM('user', 'external', 'system') NOT NULL DEFAULT 'external' AFTER `actor_user_id`;
