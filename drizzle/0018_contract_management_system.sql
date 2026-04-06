-- ─── CONTRACT MANAGEMENT SYSTEM — Foundation Migration ──────────────────────
-- Phase 1: Additive only. Zero breaking changes. All new tables.
-- The existing `promoter_assignments` table is untouched.
-- Migration strategy: dual-write → backfill → switch reads → retire legacy.

-- ─── A. CONTRACT TYPE REGISTRY ───────────────────────────────────────────────
-- System-defined, extensible. First entry: promoter_assignment.
-- Future: offer_letter, employment_contract, service_agreement, manpower_supply.

CREATE TABLE IF NOT EXISTS `contract_type_defs` (
  `id`          varchar(50)  NOT NULL PRIMARY KEY,
  `label_en`    varchar(255) NOT NULL,
  `label_ar`    varchar(255),
  `description` text,
  `is_active`   boolean      NOT NULL DEFAULT true,
  `sort_order`  int          NOT NULL DEFAULT 0,
  `created_at`  timestamp    DEFAULT (now()) NOT NULL
);

INSERT INTO `contract_type_defs` (`id`, `label_en`, `label_ar`, `description`, `is_active`, `sort_order`)
VALUES (
  'promoter_assignment',
  'Promoter Assignment',
  'تكليف مروج',
  'Contract placing a promoter employee (supplied by the second party / employer) at a client work site (owned by the first party / client). Location belongs to the first party. Promoter belongs to the second party.',
  true,
  1
) ON DUPLICATE KEY UPDATE `label_en` = `label_en`;

-- ─── B. OUTSOURCING CONTRACTS — HEADER ────────────────────────────────────────
-- One row per contract. Type-agnostic. The UUID `id` can match the legacy
-- `promoter_assignments.id` during the dual-write/backfill phase for easy lookup.

CREATE TABLE IF NOT EXISTS `outsourcing_contracts` (
  `id`                      char(36)     NOT NULL PRIMARY KEY,
  -- Tenant scope: always the FIRST PARTY company id (the client / work-site owner).
  -- Visibility for second party is handled in queries via outsourcing_contract_parties.
  `company_id`              int          NOT NULL,
  `contract_type_id`        varchar(50)  NOT NULL,
  `contract_number`         varchar(100),
  -- draft | active | expired | terminated | renewed | suspended
  `status`                  varchar(50)  NOT NULL DEFAULT 'draft',
  `issue_date`              date,
  `effective_date`          date         NOT NULL,
  `expiry_date`             date         NOT NULL,
  `template_version`        int          NOT NULL DEFAULT 1,
  -- Latest generated PDF (overwritten on each generation)
  `generated_pdf_url`       text,
  -- Uploaded signed copy
  `signed_pdf_url`          text,
  -- Self-referencing FK for renewals: points to the contract this one renews
  `renewal_of_contract_id`  char(36)     NULL,
  -- Contract-type-specific extras that don't warrant their own column yet
  `metadata`                json,
  `created_by`              int,
  `created_at`              timestamp    DEFAULT (now()) NOT NULL,
  `updated_at`              timestamp    DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  INDEX `idx_oc_company`    (`company_id`),
  INDEX `idx_oc_type`       (`contract_type_id`),
  INDEX `idx_oc_status`     (`status`),
  INDEX `idx_oc_expiry`     (`expiry_date`),
  INDEX `idx_oc_number`     (`contract_number`),
  INDEX `idx_oc_renewal`    (`renewal_of_contract_id`),

  CONSTRAINT `oc_type_fk`
    FOREIGN KEY (`contract_type_id`) REFERENCES `contract_type_defs`(`id`),
  CONSTRAINT `oc_renewal_fk`
    FOREIGN KEY (`renewal_of_contract_id`) REFERENCES `outsourcing_contracts`(`id`)
);

-- ─── C. CONTRACT PARTIES ──────────────────────────────────────────────────────
-- Normalized party snapshot per contract. `company_id` links to the companies
-- table when the party is a known tenant; can be NULL for external parties.
-- party_role: 'first_party' | 'second_party' | 'third_party'

CREATE TABLE IF NOT EXISTS `outsourcing_contract_parties` (
  `id`                  char(36)     NOT NULL PRIMARY KEY,
  `contract_id`         char(36)     NOT NULL,
  `party_role`          varchar(50)  NOT NULL,
  -- Optional reference to existing company record. NULL = external party.
  `company_id`          int          NULL,
  -- Snapshot of company name at contract creation time (for PDF + display stability)
  `display_name_en`     varchar(255) NOT NULL,
  `display_name_ar`     varchar(255),
  -- CR number / commercial registration for use in contracts
  `registration_number` varchar(100),
  `created_at`          timestamp    DEFAULT (now()) NOT NULL,

  INDEX `idx_ocp_contract` (`contract_id`),
  INDEX `idx_ocp_role`     (`party_role`),
  INDEX `idx_ocp_company`  (`company_id`),

  CONSTRAINT `ocp_contract_fk`
    FOREIGN KEY (`contract_id`) REFERENCES `outsourcing_contracts`(`id`) ON DELETE CASCADE
);

-- ─── D. CONTRACT LOCATIONS ────────────────────────────────────────────────────
-- Work site details. For promoter_assignment, location ALWAYS belongs to
-- the first_party (client). The FK to attendance_sites is optional; free-text
-- location fields always contain the authoritative display value.

CREATE TABLE IF NOT EXISTS `outsourcing_contract_locations` (
  `id`                    char(36)     NOT NULL PRIMARY KEY,
  `contract_id`           char(36)     NOT NULL,
  -- Which party owns this location (always 'first_party' for promoter contracts)
  `belongs_to_party_role` varchar(50)  NOT NULL DEFAULT 'first_party',
  `site_name_en`          varchar(500),
  `site_name_ar`          varchar(500),
  `location_en`           varchar(500),
  `location_ar`           varchar(500),
  -- Optional link to attendance_sites for auto-fill from saved sites
  `client_site_id`        int          NULL,
  `site_code`             varchar(50),
  `created_at`            timestamp    DEFAULT (now()) NOT NULL,

  INDEX `idx_ocl_contract` (`contract_id`),

  CONSTRAINT `ocl_contract_fk`
    FOREIGN KEY (`contract_id`) REFERENCES `outsourcing_contracts`(`id`) ON DELETE CASCADE,
  CONSTRAINT `ocl_site_fk`
    FOREIGN KEY (`client_site_id`) REFERENCES `attendance_sites`(`id`)
);

-- ─── E. PROMOTER CONTRACT DETAILS ─────────────────────────────────────────────
-- Promoter-assignment-specific. One row per outsourcing_contract (UNIQUE).
-- Stores identity snapshot at contract time — required for bilingual PDF and
-- compliance. passport_number + civil_id are now mandatory on the form.

CREATE TABLE IF NOT EXISTS `outsourcing_promoter_details` (
  `id`                    char(36)     NOT NULL PRIMARY KEY,
  -- 1:1 with outsourcing_contracts
  `contract_id`           char(36)     NOT NULL UNIQUE,
  -- Live link to employees table (nullable if employee is later deleted)
  `promoter_employee_id`  int          NOT NULL,
  -- Second party / employer company (denormalized for fast querying)
  `employer_company_id`   int          NOT NULL,
  -- Name snapshot at contract time
  `full_name_en`          varchar(255) NOT NULL,
  `full_name_ar`          varchar(255),
  -- Identity documents — both required for promoter contracts
  `civil_id`              varchar(50),
  `passport_number`       varchar(50),
  `passport_expiry`       date,
  `nationality`           varchar(100),
  -- Job classification at contract time
  `job_title_en`          varchar(255),
  `job_title_ar`          varchar(255),
  `created_at`            timestamp    DEFAULT (now()) NOT NULL,
  `updated_at`            timestamp    DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  INDEX `idx_opd_contract`  (`contract_id`),
  INDEX `idx_opd_employee`  (`promoter_employee_id`),
  INDEX `idx_opd_employer`  (`employer_company_id`),

  CONSTRAINT `opd_contract_fk`
    FOREIGN KEY (`contract_id`) REFERENCES `outsourcing_contracts`(`id`) ON DELETE CASCADE
);

-- ─── F. CONTRACT DOCUMENTS ────────────────────────────────────────────────────
-- File store per contract. document_kind:
--   generated_pdf | signed_pdf | passport_copy | id_copy | attachment

CREATE TABLE IF NOT EXISTS `outsourcing_contract_documents` (
  `id`            char(36)     NOT NULL PRIMARY KEY,
  `contract_id`   char(36)     NOT NULL,
  `document_kind` varchar(50)  NOT NULL,
  `file_url`      text,
  `file_path`     varchar(1024),
  `file_name`     varchar(500),
  `mime_type`     varchar(100),
  `uploaded_by`   int,
  `metadata`      json,
  `uploaded_at`   timestamp    DEFAULT (now()) NOT NULL,

  INDEX `idx_ocd_contract` (`contract_id`),
  INDEX `idx_ocd_kind`     (`document_kind`),

  CONSTRAINT `ocd_contract_fk`
    FOREIGN KEY (`contract_id`) REFERENCES `outsourcing_contracts`(`id`) ON DELETE CASCADE
);

-- ─── G. CONTRACT AUDIT EVENTS — TIMELINE ──────────────────────────────────────
-- Append-only. One row per action. Used for timeline UI and compliance audit.
-- action examples: created | activated | edited | pdf_generated | signed_uploaded
--                  renewed | terminated | suspended | expiry_alerted

CREATE TABLE IF NOT EXISTS `outsourcing_contract_events` (
  `id`              char(36)     NOT NULL PRIMARY KEY,
  `contract_id`     char(36)     NOT NULL,
  `action`          varchar(100) NOT NULL,
  `actor_id`        int,
  `actor_name`      varchar(255),
  -- Optional before/after JSON snapshot of changed fields
  `snapshot_before` json,
  `snapshot_after`  json,
  `details`         json,
  `created_at`      timestamp    DEFAULT (now()) NOT NULL,

  INDEX `idx_oce_contract` (`contract_id`),
  INDEX `idx_oce_created`  (`created_at`),

  CONSTRAINT `oce_contract_fk`
    FOREIGN KEY (`contract_id`) REFERENCES `outsourcing_contracts`(`id`) ON DELETE CASCADE
);
