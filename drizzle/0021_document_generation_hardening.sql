-- Speed idempotency / fingerprint lookups for generated_documents
CREATE INDEX `idx_gd_fingerprint_created` ON `generated_documents` (
  `company_id`,
  `template_id`,
  `entity_type`,
  `entity_id`,
  `output_format`,
  `created_at`
);
