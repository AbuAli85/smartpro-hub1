CREATE TABLE IF NOT EXISTS `promoter_assignments` (
  `id` char(36) NOT NULL PRIMARY KEY,
  `company_id` int NOT NULL,
  `first_party_company_id` int NOT NULL,
  `second_party_company_id` int NOT NULL,
  `promoter_employee_id` int NOT NULL,
  `location_ar` varchar(500),
  `location_en` varchar(500),
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'active',
  `contract_reference_number` varchar(100),
  `issue_date` date,
  `created_at` timestamp DEFAULT (now()) NOT NULL,
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_pa_company` (`company_id`),
  INDEX `idx_pa_first_party` (`first_party_company_id`),
  INDEX `idx_pa_second_party` (`second_party_company_id`),
  INDEX `idx_pa_employee` (`promoter_employee_id`)
);

CREATE TABLE IF NOT EXISTS `document_templates` (
  `id` char(36) NOT NULL PRIMARY KEY,
  `company_id` int NOT NULL DEFAULT 0,
  `key` varchar(191) NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` varchar(100) NOT NULL,
  `entity_type` varchar(100) NOT NULL,
  `document_source` varchar(50) NOT NULL DEFAULT 'google_docs',
  `google_doc_id` varchar(255),
  `language` varchar(32) NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `status` varchar(32) NOT NULL DEFAULT 'draft',
  `output_formats` json NOT NULL DEFAULT (json_array('pdf')),
  `created_at` timestamp DEFAULT (now()) NOT NULL,
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX `idx_dt_company` (`company_id`),
  INDEX `idx_dt_entity` (`entity_type`),
  UNIQUE `uq_document_templates_key_company` (`key`, `company_id`)
);

CREATE TABLE IF NOT EXISTS `document_template_placeholders` (
  `id` char(36) NOT NULL PRIMARY KEY,
  `template_id` char(36) NOT NULL,
  `placeholder` varchar(191) NOT NULL,
  `label` varchar(255) NOT NULL,
  `source_path` varchar(255) NOT NULL,
  `data_type` varchar(32) NOT NULL DEFAULT 'string',
  `required` boolean NOT NULL DEFAULT true,
  `default_value` text,
  `created_at` timestamp DEFAULT (now()) NOT NULL,
  INDEX `idx_dtp_template` (`template_id`),
  UNIQUE `uq_dtp_template_placeholder` (`template_id`, `placeholder`),
  CONSTRAINT `fk_dtp_tmpl_document_templates`
    FOREIGN KEY (`template_id`) REFERENCES `document_templates`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `generated_documents` (
  `id` char(36) NOT NULL PRIMARY KEY,
  `template_id` char(36) NOT NULL,
  `entity_type` varchar(100) NOT NULL,
  `entity_id` char(36) NOT NULL,
  `output_format` varchar(32) NOT NULL,
  `source_google_doc_id` varchar(255),
  `generated_google_doc_id` varchar(255),
  `file_url` text,
  `file_path` varchar(1024),
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `generated_by` int,
  `company_id` int NOT NULL,
  `metadata` json NOT NULL DEFAULT (json_object()),
  `created_at` timestamp DEFAULT (now()) NOT NULL,
  INDEX `idx_gd_company` (`company_id`),
  INDEX `idx_gd_template` (`template_id`),
  INDEX `idx_gd_entity` (`entity_type`, `entity_id`),
  CONSTRAINT `generated_documents_template_id_document_templates_id_fk`
    FOREIGN KEY (`template_id`) REFERENCES `document_templates`(`id`)
);

CREATE TABLE IF NOT EXISTS `document_generation_audit_logs` (
  `id` char(36) NOT NULL PRIMARY KEY,
  `generated_document_id` char(36) NOT NULL,
  `action` varchar(100) NOT NULL,
  `actor_id` int,
  `details` json NOT NULL DEFAULT (json_object()),
  `created_at` timestamp DEFAULT (now()) NOT NULL,
  INDEX `idx_dgal_doc` (`generated_document_id`),
  CONSTRAINT `document_generation_audit_logs_generated_document_id_fk`
    FOREIGN KEY (`generated_document_id`) REFERENCES `generated_documents`(`id`) ON DELETE CASCADE
);
