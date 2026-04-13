-- Log bulk survey invites to Sanad offices (email / WhatsApp API) for follow-up dashboards.
CREATE TABLE IF NOT EXISTS `survey_sanad_office_outreach` (
  `id` int NOT NULL AUTO_INCREMENT,
  `survey_id` int NOT NULL,
  `sanad_office_id` int NOT NULL,
  `batch_id` varchar(36) NOT NULL,
  `channel` enum('email','whatsapp_api') NOT NULL,
  `outcome` enum('sent','failed','skipped_no_email','skipped_no_phone') NOT NULL,
  `detail` varchar(500) DEFAULT NULL,
  `actor_user_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_survey_outreach_survey_office` (`survey_id`,`sanad_office_id`),
  KEY `idx_survey_outreach_batch` (`batch_id`),
  KEY `idx_survey_outreach_created` (`created_at`),
  CONSTRAINT `fk_survey_outreach_survey` FOREIGN KEY (`survey_id`) REFERENCES `surveys` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_survey_outreach_office` FOREIGN KEY (`sanad_office_id`) REFERENCES `sanad_offices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_survey_outreach_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
