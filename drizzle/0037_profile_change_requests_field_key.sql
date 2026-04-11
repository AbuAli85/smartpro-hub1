-- Canonical logical field for profile change requests; `fieldLabel` remains employee-facing display text.
-- Backfill uses conservative LIKE rules; rows that stay `other` keep identity via label normalization at submit time.

ALTER TABLE `profile_change_requests`
  ADD COLUMN `fieldKey` varchar(64) NOT NULL DEFAULT 'other' AFTER `fieldLabel`;

CREATE INDEX `idx_pcr_employee_status_fieldkey` ON `profile_change_requests` (`employeeId`, `status`, `fieldKey`);

-- Backfill (order: more specific patterns first where relevant)
UPDATE `profile_change_requests` SET `fieldKey` = 'bank_details' WHERE `fieldKey` = 'other' AND (
  LOWER(`fieldLabel`) LIKE '%bank%' OR LOWER(`fieldLabel`) LIKE '%iban%' OR LOWER(`fieldLabel`) LIKE '%payroll%'
  OR LOWER(`fieldLabel`) LIKE '%salary%' OR LOWER(`fieldLabel`) LIKE '%account number%'
);

UPDATE `profile_change_requests` SET `fieldKey` = 'emergency_contact' WHERE `fieldKey` = 'other' AND LOWER(`fieldLabel`) LIKE '%emergency%';

UPDATE `profile_change_requests` SET `fieldKey` = 'legal_name' WHERE `fieldKey` = 'other' AND (
  LOWER(`fieldLabel`) LIKE '%legal name%' OR LOWER(`fieldLabel`) LIKE '%full name%' OR LOWER(`fieldLabel`) LIKE '%arabic name%'
  OR LOWER(`fieldLabel`) LIKE '%name in arabic%'
);

UPDATE `profile_change_requests` SET `fieldKey` = 'contact_phone' WHERE `fieldKey` = 'other' AND (
  LOWER(`fieldLabel`) LIKE '% phone%' OR LOWER(`fieldLabel`) LIKE 'phone %' OR LOWER(`fieldLabel`) = 'phone'
  OR LOWER(`fieldLabel`) LIKE '%mobile%' OR LOWER(`fieldLabel`) LIKE '%contact number%'
  OR LOWER(`fieldLabel`) LIKE 'tel %' OR LOWER(`fieldLabel`) LIKE '% tel %'
);

UPDATE `profile_change_requests` SET `fieldKey` = 'date_of_birth' WHERE `fieldKey` = 'other' AND (
  LOWER(`fieldLabel`) LIKE '%date of birth%' OR LOWER(`fieldLabel`) LIKE '%birthday%' OR LOWER(`fieldLabel`) LIKE '%birth date%'
  OR LOWER(`fieldLabel`) = 'dob'
);

UPDATE `profile_change_requests` SET `fieldKey` = 'nationality' WHERE `fieldKey` = 'other' AND LOWER(`fieldLabel`) LIKE '%nationality%';

UPDATE `profile_change_requests` SET `fieldKey` = 'employment_details' WHERE `fieldKey` = 'other' AND (
  LOWER(`fieldLabel`) LIKE '%employment%' OR LOWER(`fieldLabel`) LIKE '%department%' OR LOWER(`fieldLabel`) LIKE '%position%'
  OR LOWER(`fieldLabel`) LIKE '%manager%' OR LOWER(`fieldLabel`) LIKE '%job title%' OR LOWER(`fieldLabel`) LIKE '%hire date%'
  OR LOWER(`fieldLabel`) LIKE '%employment type%' OR LOWER(`fieldLabel`) LIKE '%company%'
);
