-- Persist last engagement roll-up recompute time (health / top action / SLA fields).
ALTER TABLE `engagements`
  ADD COLUMN `derived_state_synced_at` timestamp NULL
  AFTER `updated_at`;
