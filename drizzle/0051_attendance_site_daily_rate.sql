-- Add contracted daily billing rate to attendance_sites.
-- Used for per-client invoice summary (client → billable days → OMR).
ALTER TABLE `attendance_sites`
  ADD COLUMN `daily_rate_omr` DECIMAL(10,3) NOT NULL DEFAULT 0.000
  AFTER `client_name`;
