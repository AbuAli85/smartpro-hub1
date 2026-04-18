-- Widen SANAD centre invite token column so hashed-at-rest values (v2: + SHA-256 hex)
-- fit while preserving the unique index semantics for non-null tokens.

ALTER TABLE `sanad_intel_center_operations`
  MODIFY `invite_token` VARCHAR(96) NULL;
