-- Agreement / party foundation — incremental layer on top of outsourcing_contracts.
-- See docs/AGREEMENT_PARTY_FOUNDATION.md

-- Canonical business counterparty (platform-linked and/or employer-managed external).
CREATE TABLE IF NOT EXISTS `business_parties` (
  `id`                    CHAR(36)     NOT NULL PRIMARY KEY,
  `display_name_en`       VARCHAR(255) NOT NULL,
  `display_name_ar`       VARCHAR(255),
  `legal_name_en`         VARCHAR(255),
  `legal_name_ar`         VARCHAR(255),
  `status`                VARCHAR(50)  NOT NULL DEFAULT 'active',
  `linked_company_id`     INT          NULL,
  `managed_by_company_id` INT          NULL,
  `registration_number`   VARCHAR(100),
  `phone`                 VARCHAR(64),
  `email`                 VARCHAR(320),
  `created_by`            INT          NULL,
  `created_at`            TIMESTAMP    DEFAULT (now()) NOT NULL,
  `updated_at`            TIMESTAMP    DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  INDEX `idx_bp_linked_co` (`linked_company_id`),
  INDEX `idx_bp_managed_by` (`managed_by_company_id`),

  CONSTRAINT `bp_linked_co_fk`
    FOREIGN KEY (`linked_company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL,
  CONSTRAINT `bp_managed_by_fk`
    FOREIGN KEY (`managed_by_company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL
);

-- Audit trail for party lifecycle (create, link to platform company, etc.)
CREATE TABLE IF NOT EXISTS `business_party_events` (
  `id`         CHAR(36)     NOT NULL PRIMARY KEY,
  `party_id`   CHAR(36)     NOT NULL,
  `action`     VARCHAR(100) NOT NULL,
  `actor_id`   INT          NULL,
  `actor_name` VARCHAR(255),
  `details`    JSON,
  `created_at` TIMESTAMP    DEFAULT (now()) NOT NULL,

  INDEX `idx_bpe_party` (`party_id`),
  CONSTRAINT `bpe_party_fk`
    FOREIGN KEY (`party_id`) REFERENCES `business_parties`(`id`) ON DELETE CASCADE
);

-- External-first contracts: header tenant anchor may be unknown until client joins platform.
ALTER TABLE `outsourcing_contracts`
  MODIFY COLUMN `company_id` INT NULL;

-- Link contract party snapshot rows to canonical party (optional; backfill later).
ALTER TABLE `outsourcing_contract_parties`
  ADD COLUMN `party_id` CHAR(36) NULL,
  ADD INDEX `idx_ocp_party` (`party_id`),
  ADD CONSTRAINT `ocp_party_fk`
    FOREIGN KEY (`party_id`) REFERENCES `business_parties`(`id`) ON DELETE SET NULL;
