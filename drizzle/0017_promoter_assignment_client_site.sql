ALTER TABLE `promoter_assignments`
  ADD COLUMN `client_site_id` int NULL,
  ADD CONSTRAINT `promoter_assignments_client_site_id_attendance_sites_id_fk`
    FOREIGN KEY (`client_site_id`) REFERENCES `attendance_sites`(`id`),
  ADD INDEX `idx_pa_client_site` (`client_site_id`);
