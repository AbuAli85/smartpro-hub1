-- Cleanup stale invite fields for SANAD centres that are already linked to a sanad_offices record.
-- Once a centre has a linked_sanad_office_id the invite lifecycle is closed; the token, sent-at,
-- and expires-at columns serve no further purpose and should be NULL so they do not mislead
-- future queries or CRM tooling.
--
-- Safe to run multiple times (idempotent): the WHERE clause limits writes to rows that still
-- have at least one stale invite field populated.
-- Does NOT touch: registered_user_id, activated_at, outreach fields, or lead-capture fields.

UPDATE `sanad_intel_center_operations`
SET
  `invite_token`     = NULL,
  `invite_sent_at`   = NULL,
  `invite_expires_at` = NULL
WHERE
  `linked_sanad_office_id` IS NOT NULL
  AND (
    `invite_token`      IS NOT NULL
    OR `invite_sent_at`  IS NOT NULL
    OR `invite_expires_at` IS NOT NULL
  );
