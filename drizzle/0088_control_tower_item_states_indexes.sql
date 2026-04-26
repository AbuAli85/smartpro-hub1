-- Phase CT: Production-safety indexes for control_tower_item_states.
--
-- The table was created in 0070_drizzle_baseline_schema_recovery.sql without
-- the unique constraint and indexes defined in the Drizzle schema.  This
-- migration adds them. Idempotency is handled by the migration runner
-- (ER_DUP_KEYNAME is always treated as a safe skip).
--
-- Constraints added:
--   uq_ct_state_company_item    UNIQUE (company_id, item_key)   — upsert correctness
--   idx_ct_state_company_status INDEX  (company_id, status)     — active-queue filter
--   idx_ct_state_domain         INDEX  (company_id, domain)     — domain-scoped queries
--   idx_ct_state_last_seen      INDEX  (company_id, last_seen_at) — re-emergence/cleanup

ALTER TABLE `control_tower_item_states`
  ADD UNIQUE INDEX `uq_ct_state_company_item` (`company_id`, `item_key`);

--> statement-breakpoint

CREATE INDEX `idx_ct_state_company_status`
  ON `control_tower_item_states` (`company_id`, `status`);

--> statement-breakpoint

CREATE INDEX `idx_ct_state_domain`
  ON `control_tower_item_states` (`company_id`, `domain`);

--> statement-breakpoint

CREATE INDEX `idx_ct_state_last_seen`
  ON `control_tower_item_states` (`company_id`, `last_seen_at`);
