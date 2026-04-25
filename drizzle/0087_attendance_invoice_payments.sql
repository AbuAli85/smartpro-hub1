-- Phase 12F: Add sent/payment tracking columns to attendance_invoices,
--            and create the attendance_invoice_payment_records table.

-- Part A: columns on attendance_invoices
ALTER TABLE attendance_invoices
  ADD COLUMN sent_at           TIMESTAMP NULL                            AFTER html_artifact_url,
  ADD COLUMN sent_by_user_id   INT NULL                                  AFTER sent_at,
  ADD COLUMN amount_paid_omr   DECIMAL(14,3) NOT NULL DEFAULT '0.000'   AFTER sent_by_user_id;

-- Part B: payment records table (RESTRICT delete to protect financial audit trail)
CREATE TABLE attendance_invoice_payment_records (
  id                      INT          AUTO_INCREMENT PRIMARY KEY,
  attendance_invoice_id   INT          NOT NULL,
  company_id              INT          NOT NULL,
  amount_omr              DECIMAL(14,3) NOT NULL,
  paid_at                 TIMESTAMP    NOT NULL,
  payment_method          ENUM('bank','cash','card','other') NOT NULL DEFAULT 'bank',
  reference               VARCHAR(255) NULL,
  notes                   TEXT         NULL,
  created_by_user_id      INT          NOT NULL,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_aipr_invoice  (attendance_invoice_id),
  INDEX idx_aipr_company  (company_id),

  CONSTRAINT fk_aipr_invoice
    FOREIGN KEY (attendance_invoice_id)
    REFERENCES attendance_invoices (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
