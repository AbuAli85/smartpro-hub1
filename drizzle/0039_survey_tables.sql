-- Migration: 0039_survey_tables
-- Creates all survey-related tables for the Business Sector Survey feature

CREATE TABLE IF NOT EXISTS `surveys` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `slug` varchar(100) NOT NULL UNIQUE,
  `title_en` varchar(255) NOT NULL,
  `title_ar` varchar(255) NOT NULL,
  `description_en` text,
  `description_ar` text,
  `status` enum('draft','active','paused','closed') NOT NULL DEFAULT 'draft',
  `welcome_message_en` text,
  `welcome_message_ar` text,
  `thank_you_message_en` text,
  `thank_you_message_ar` text,
  `allow_anonymous` boolean NOT NULL DEFAULT true,
  `estimated_minutes` int NOT NULL DEFAULT 12,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_surveys_status` (`status`)
);

CREATE TABLE IF NOT EXISTS `survey_sections` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `survey_id` int NOT NULL,
  `slug` varchar(100) NOT NULL,
  `title_en` varchar(255) NOT NULL,
  `title_ar` varchar(255) NOT NULL,
  `description_en` text,
  `description_ar` text,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_survey_sections_survey` (`survey_id`),
  UNIQUE `uq_survey_sections_survey_slug` (`survey_id`, `slug`),
  CONSTRAINT `fk_survey_sections_survey` FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `survey_questions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `section_id` int NOT NULL,
  `question_key` varchar(100) NOT NULL,
  `type` enum('text','textarea','single_choice','multi_choice','rating','number','dropdown','yes_no') NOT NULL,
  `label_en` text NOT NULL,
  `label_ar` text NOT NULL,
  `hint_en` text,
  `hint_ar` text,
  `is_required` boolean NOT NULL DEFAULT true,
  `sort_order` int NOT NULL DEFAULT 0,
  `settings` json,
  `scoring_rule` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_survey_questions_section` (`section_id`),
  CONSTRAINT `fk_survey_questions_section` FOREIGN KEY (`section_id`) REFERENCES `survey_sections`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `survey_options` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `question_id` int NOT NULL,
  `value` varchar(100) NOT NULL,
  `label_en` varchar(500) NOT NULL,
  `label_ar` varchar(500) NOT NULL,
  `score` int NOT NULL DEFAULT 0,
  `sort_order` int NOT NULL DEFAULT 0,
  `tags` json,
  INDEX `idx_survey_options_question` (`question_id`),
  CONSTRAINT `fk_survey_options_question` FOREIGN KEY (`question_id`) REFERENCES `survey_questions`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `survey_tags` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `slug` varchar(100) NOT NULL UNIQUE,
  `label_en` varchar(255) NOT NULL,
  `label_ar` varchar(255) NOT NULL,
  `category` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `survey_responses` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `survey_id` int NOT NULL,
  `resume_token` varchar(64) NOT NULL UNIQUE,
  `language` enum('en','ar') NOT NULL DEFAULT 'en',
  `status` enum('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress',
  `current_section_id` int,
  `respondent_name` varchar(255),
  `respondent_email` varchar(320),
  `respondent_phone` varchar(32),
  `company_name` varchar(255),
  `company_sector` varchar(128),
  `company_size` varchar(64),
  `company_governorate` varchar(128),
  `scores` json,
  `completed_at` timestamp,
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_survey_responses_survey` (`survey_id`),
  INDEX `idx_survey_responses_status` (`status`),
  CONSTRAINT `fk_survey_responses_survey` FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `survey_answers` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `response_id` int NOT NULL,
  `question_id` int NOT NULL,
  `answer_value` text,
  `selected_options` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE `uq_survey_answers_response_question` (`response_id`, `question_id`),
  INDEX `idx_survey_answers_response` (`response_id`),
  CONSTRAINT `fk_survey_answers_response` FOREIGN KEY (`response_id`) REFERENCES `survey_responses`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_survey_answers_question` FOREIGN KEY (`question_id`) REFERENCES `survey_questions`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `survey_response_tags` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `response_id` int NOT NULL,
  `tag_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE `uq_survey_response_tags` (`response_id`, `tag_id`),
  INDEX `idx_survey_response_tags_response` (`response_id`),
  CONSTRAINT `fk_survey_response_tags_response` FOREIGN KEY (`response_id`) REFERENCES `survey_responses`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_survey_response_tags_tag` FOREIGN KEY (`tag_id`) REFERENCES `survey_tags`(`id`) ON DELETE CASCADE
);
