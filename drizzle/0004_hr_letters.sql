CREATE TABLE IF NOT EXISTS `hr_letters` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `company_id` int NOT NULL,
  `employee_id` int NOT NULL,
  `letter_type` varchar(64) NOT NULL,
  `language` varchar(8) NOT NULL DEFAULT 'en',
  `reference_number` varchar(64),
  `subject` varchar(512),
  `body_en` text,
  `body_ar` text,
  `issued_to` varchar(255),
  `purpose` text,
  `additional_notes` text,
  `is_deleted` boolean NOT NULL DEFAULT false,
  `created_by` int,
  `created_at` timestamp DEFAULT (now()) NOT NULL,
  `updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
