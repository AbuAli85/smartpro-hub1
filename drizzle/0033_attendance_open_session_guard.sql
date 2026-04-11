-- P0 — One open (unchecked-out) session per (employee, schedule) at DB level.
--
-- The virtual generated column `open_session_key` is non-null ONLY when:
--   • check_out IS NULL  (session is still open)
--   • schedule_id IS NOT NULL  (session is attributed to a known shift)
--
-- MySQL treats two NULL values as non-equal inside unique indexes, so:
--   • Closed sessions (check_out IS NOT NULL) → key = NULL → no conflict
--   • Unattributed sessions (schedule_id IS NULL) → key = NULL → no conflict
--   • Two concurrent open sessions for the same shift → DUPLICATE KEY error
--
-- This emulates a partial unique index (PostgreSQL "WHERE check_out IS NULL")
-- for MySQL 5.7.8+ which supports virtual generated columns and indexes on them.

ALTER TABLE `attendance_records`
  ADD COLUMN `open_session_key` varchar(64) GENERATED ALWAYS AS (
    IF(`check_out` IS NULL AND `schedule_id` IS NOT NULL,
       CONCAT(`employee_id`, '-', `schedule_id`),
       NULL)
  ) VIRTUAL;

CREATE UNIQUE INDEX `uniq_att_rec_open_session`
  ON `attendance_records` (`open_session_key`);
