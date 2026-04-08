-- Bridge SANAD network intelligence (directory / CRM) to operational sanad_offices and user registration.
ALTER TABLE `sanad_intel_center_operations`
  ADD COLUMN `invite_token` varchar(64) NULL,
  ADD COLUMN `invite_sent_at` timestamp NULL,
  ADD COLUMN `invite_expires_at` timestamp NULL,
  ADD COLUMN `registered_user_id` int NULL,
  ADD COLUMN `linked_sanad_office_id` int NULL,
  ADD COLUMN `activated_at` timestamp NULL,
  ADD COLUMN `activation_source` enum('manual','invite','admin_created') NULL,
  ADD COLUMN `last_contacted_at` timestamp NULL,
  ADD COLUMN `contact_method` varchar(64) NULL,
  ADD COLUMN `follow_up_due_at` timestamp NULL,
  ADD COLUMN `invite_accept_name` varchar(255) NULL,
  ADD COLUMN `invite_accept_phone` varchar(64) NULL,
  ADD COLUMN `invite_accept_email` varchar(320) NULL,
  ADD COLUMN `invite_accept_at` timestamp NULL;

CREATE UNIQUE INDEX `uq_sanad_intel_ops_invite_token` ON `sanad_intel_center_operations` (`invite_token`);

ALTER TABLE `sanad_intel_center_operations`
  ADD CONSTRAINT `fk_sanad_intel_ops_registered_user` FOREIGN KEY (`registered_user_id`) REFERENCES `users`(`id`),
  ADD CONSTRAINT `fk_sanad_intel_ops_linked_office` FOREIGN KEY (`linked_sanad_office_id`) REFERENCES `sanad_offices`(`id`);

CREATE INDEX `idx_sanad_intel_ops_followup` ON `sanad_intel_center_operations` (`follow_up_due_at`);
