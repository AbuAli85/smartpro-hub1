-- Migration 0084: Attendance billing candidates (Phase 12B)
--
-- Creates a lightweight draft billing artifact table for finance review.
-- One row per approved attendance client approval batch.
-- Populated by onClientApprovalComplete hook after batch approval.
-- Used by finance to review and manually issue final invoices.
--
-- Replaces nothing: promoter_invoices / promoter_invoice_lines are retained for
-- their own monthly promoter billing flow; this table is attendance-specific.

CREATE TABLE `attendance_billing_candidates` (
  `id`                     int          NOT NULL AUTO_INCREMENT,
  `batch_id`               int          NOT NULL,
  `company_id`             int          NOT NULL,
  `client_company_id`      int                   DEFAULT NULL,
  `period_start`           varchar(10)  NOT NULL,
  `period_end`             varchar(10)  NOT NULL,
  `source`                 varchar(32)  NOT NULL,
  `status`                 enum('draft','review_ready','cancelled') NOT NULL DEFAULT 'draft',
  `approved_item_count`    int          NOT NULL DEFAULT 0,
  `snapshot_missing_count` int          NOT NULL DEFAULT 0,
  `total_duration_minutes` int                   DEFAULT NULL,
  `billing_lines_json`     json         NOT NULL,
  `created_at`             timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`             timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_abc_batch_id` (`batch_id`),
  KEY `idx_abc_company` (`company_id`),
  KEY `idx_abc_status` (`company_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
