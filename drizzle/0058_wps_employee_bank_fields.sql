-- Employee IBAN for WPS (fallback when payroll line snapshot has no IBAN)
ALTER TABLE `employees`
  ADD COLUMN `iban_number` VARCHAR(34) NULL DEFAULT NULL AFTER `bankAccountNumber`;
