CREATE TABLE `profile_change_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `employeeId` int NOT NULL,
  `submittedByUserId` int NOT NULL,
  `fieldLabel` varchar(100) NOT NULL,
  `requestedValue` varchar(500) NOT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `status` enum('pending','resolved','rejected') NOT NULL DEFAULT 'pending',
  `submittedAt` timestamp NOT NULL DEFAULT (now()),
  `resolvedAt` timestamp NULL DEFAULT NULL,
  `resolvedByUserId` int DEFAULT NULL,
  `resolutionNote` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pcr_company_employee` (`companyId`,`employeeId`),
  KEY `idx_pcr_company_status` (`companyId`,`status`)
);
