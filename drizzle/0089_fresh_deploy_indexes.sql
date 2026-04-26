-- Migration 0089: Performance indexes for tables created via 0070 baseline recovery.
--
-- Background:
--   Migrations 0084/0085 use CREATE TABLE IF NOT EXISTS (after the 0084/0085 fix),
--   so on a fresh database they are no-ops (tables already exist from 0070).
--   Their inline index definitions are therefore never applied on fresh databases.
--   The audit_events indexes were never in the numbered migration chain at all
--   (only in drizzle/bootstrap/0070_indexes.sql, which is manually applied).
--
-- Idempotency: the migration runner always treats ER_DUP_KEYNAME as a safe skip,
-- so re-running on a database that already has these indexes is harmless.
-- Note: CREATE INDEX IF NOT EXISTS is not supported in MySQL 8.4.
--
-- Covers:
--   audit_events           (4 indexes — were in bootstrap only)
--   attendance_billing_candidates  (2 performance indexes — were inline in 0084 only)
--   attendance_invoices    (3 performance indexes — were inline in 0085 only)
--   attendance_invoice_payment_records (2 performance indexes — were inline in 0087 Part B only)

CREATE INDEX `idx_ae_company` ON `audit_events` (`companyId`);
--> statement-breakpoint
CREATE INDEX `idx_ae_entity` ON `audit_events` (`entityType`, `entityId`);
--> statement-breakpoint
CREATE INDEX `idx_ae_actor` ON `audit_events` (`actorUserId`);
--> statement-breakpoint
CREATE INDEX `idx_ae_action` ON `audit_events` (`action`);
--> statement-breakpoint
CREATE INDEX `idx_abc_company` ON `attendance_billing_candidates` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_abc_status` ON `attendance_billing_candidates` (`company_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_ai_company` ON `attendance_invoices` (`company_id`);
--> statement-breakpoint
CREATE INDEX `idx_ai_status` ON `attendance_invoices` (`company_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_ai_client` ON `attendance_invoices` (`company_id`, `client_company_id`);
--> statement-breakpoint
CREATE INDEX `idx_aipr_invoice` ON `attendance_invoice_payment_records` (`attendance_invoice_id`);
--> statement-breakpoint
CREATE INDEX `idx_aipr_company` ON `attendance_invoice_payment_records` (`company_id`);
