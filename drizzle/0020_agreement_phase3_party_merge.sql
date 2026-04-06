-- Phase 3: safe party merge audit trail (retain source row, point to canonical party)
ALTER TABLE `business_parties`
  ADD COLUMN `merged_into_party_id` CHAR(36) NULL COMMENT 'Set when this row was merged into another party; source stays for audit.';

CREATE INDEX `idx_bp_merged_into` ON `business_parties` (`merged_into_party_id`);
