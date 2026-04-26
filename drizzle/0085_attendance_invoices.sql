-- Phase 12D: Attendance invoice table.
-- One draft invoice per attendance billing candidate (candidate_id UNIQUE).
-- No payment records, no PDF artifacts, no issuance in this phase.
-- Invoice number format: ABIN-{companyId}-{clientCompanyId}-{YYYYMMDD}-{candidateId}
-- YYYYMMDD is derived from period_start for human readability; candidateId prevents collisions on cancel/re-convert.

CREATE TABLE IF NOT EXISTS `attendance_invoices` (
  `id`                                 int NOT NULL AUTO_INCREMENT,
  `candidate_id`                       int NOT NULL,
  `company_id`                         int NOT NULL,
  `client_company_id`                  int NOT NULL,
  `client_display_name`                varchar(255) NOT NULL,
  `invoice_number`                     varchar(64) NOT NULL,
  `period_start`                       varchar(10) NOT NULL,
  `period_end`                         varchar(10) NOT NULL,
  `currency_code`                      varchar(3) NOT NULL DEFAULT 'OMR',
  `rate_per_hour_omr`                  decimal(14,3) NOT NULL,
  `total_duration_minutes`             int DEFAULT NULL,
  `subtotal_omr`                       decimal(14,3) NOT NULL DEFAULT '0.000',
  `vat_rate_pct`                       decimal(5,2) NOT NULL DEFAULT '0.00',
  `vat_omr`                            decimal(14,3) NOT NULL DEFAULT '0.000',
  `total_omr`                          decimal(14,3) NOT NULL DEFAULT '0.000',
  `billing_lines_json`                 json NOT NULL,
  `status`                             enum('draft','review_ready','issued','sent','paid','cancelled')
                                       NOT NULL DEFAULT 'draft',
  `due_date_ymd`                       varchar(10) DEFAULT NULL,
  `notes`                              text DEFAULT NULL,
  `snapshot_warning_override_reason`   text DEFAULT NULL,
  `issued_at`                          timestamp NULL DEFAULT NULL,
  `issued_by_user_id`                  int DEFAULT NULL,
  `created_by_user_id`                 int NOT NULL,
  `created_at`                         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_candidate`   (`candidate_id`),
  UNIQUE KEY `uq_ai_inv_number`  (`invoice_number`),
  KEY `idx_ai_company`           (`company_id`),
  KEY `idx_ai_status`            (`company_id`, `status`),
  KEY `idx_ai_client`            (`company_id`, `client_company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
