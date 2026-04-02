-- Custom SQL migration file, put your code below! --
CREATE TABLE `company_documents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `company_id` int NOT NULL,
  `doc_type` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `doc_number` varchar(128),
  `issuing_authority` varchar(255),
  `issue_date` date,
  `expiry_date` date,
  `file_url` text,
  `file_key` varchar(512),
  `mime_type` varchar(64),
  `file_size` int,
  `notes` text,
  `is_deleted` boolean NOT NULL DEFAULT false,
  `uploaded_by` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `company_documents_id` PRIMARY KEY(`id`)
);