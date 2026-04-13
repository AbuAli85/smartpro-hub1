-- Lead / onboarding pipeline for imported Sanad directory centres (CRM-style funnel).

CREATE TABLE IF NOT EXISTS `sanad_centres_pipeline` (
  `center_id` INT NOT NULL,
  `pipeline_status` ENUM(
    'imported',
    'contacted',
    'prospect',
    'invited',
    'registered',
    'active'
  ) NOT NULL DEFAULT 'imported',
  `owner_user_id` INT NULL,
  `last_contacted_at` TIMESTAMP NULL,
  `next_action` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`center_id`),
  CONSTRAINT `fk_sanad_centres_pipeline_center` FOREIGN KEY (`center_id`) REFERENCES `sanad_intel_centers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sanad_centres_pipeline_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`),
  KEY `idx_sanad_centres_pipe_status` (`pipeline_status`),
  KEY `idx_sanad_centres_pipe_owner` (`owner_user_id`)
);

INSERT INTO `sanad_centres_pipeline` (
  `center_id`,
  `pipeline_status`,
  `owner_user_id`,
  `last_contacted_at`,
  `next_action`
)
SELECT
  c.id,
  CASE
    WHEN o.`linked_sanad_office_id` IS NOT NULL THEN 'active'
    WHEN o.`registered_user_id` IS NOT NULL THEN 'registered'
    WHEN o.`invite_sent_at` IS NOT NULL THEN 'invited'
    WHEN o.`last_contacted_at` IS NOT NULL THEN 'contacted'
    WHEN o.`partner_status` = 'prospect' THEN 'prospect'
    ELSE 'imported'
  END,
  o.`assigned_manager_user_id`,
  o.`last_contacted_at`,
  NULL
FROM `sanad_intel_centers` c
LEFT JOIN `sanad_intel_center_operations` o ON o.`center_id` = c.id;
