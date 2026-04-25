-- Phase 12E: Add HTML artifact storage columns to attendance_invoices.
-- These are populated when finance issues the invoice via issueAttendanceInvoice.
ALTER TABLE attendance_invoices
  ADD COLUMN html_artifact_key VARCHAR(500) NULL AFTER issued_by_user_id,
  ADD COLUMN html_artifact_url VARCHAR(1000) NULL AFTER html_artifact_key;
