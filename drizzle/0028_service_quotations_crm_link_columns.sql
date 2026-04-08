-- Link service quotations to CRM (optional columns). Run once on legacy DBs where
-- drizzle push has not applied these yet. If columns already exist, skip or ignore duplicate-column errors.
ALTER TABLE `service_quotations` ADD COLUMN `crm_deal_id` INT NULL;
ALTER TABLE `service_quotations` ADD COLUMN `crm_contact_id` INT NULL;
