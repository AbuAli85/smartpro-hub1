CREATE TABLE `analytics_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`createdBy` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(100) NOT NULL,
	`config` json,
	`schedule` varchar(100),
	`lastRunAt` timestamp,
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analytics_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`companyId` int,
	`action` varchar(128) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` int,
	`oldValues` json,
	`newValues` json,
	`ipAddress` varchar(64),
	`userAgent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`nameAr` varchar(255),
	`slug` varchar(100) NOT NULL,
	`industry` varchar(100),
	`country` varchar(10) DEFAULT 'OM',
	`city` varchar(100),
	`address` text,
	`phone` varchar(32),
	`email` varchar(320),
	`website` varchar(255),
	`logoUrl` text,
	`registrationNumber` varchar(100),
	`taxNumber` varchar(100),
	`status` enum('active','suspended','pending','cancelled') NOT NULL DEFAULT 'active',
	`subscriptionPlanId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `company_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('company_admin','company_member','reviewer','client') NOT NULL DEFAULT 'company_member',
	`permissions` json DEFAULT ('[]'),
	`isActive` boolean NOT NULL DEFAULT true,
	`invitedBy` int,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `company_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`planId` int NOT NULL,
	`status` enum('active','cancelled','past_due','trialing','expired') NOT NULL DEFAULT 'active',
	`billingCycle` enum('monthly','annual') NOT NULL DEFAULT 'monthly',
	`currentPeriodStart` timestamp NOT NULL,
	`currentPeriodEnd` timestamp NOT NULL,
	`cancelAtPeriodEnd` boolean DEFAULT false,
	`stripeSubscriptionId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_signatures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`signerName` varchar(255) NOT NULL,
	`signerEmail` varchar(320) NOT NULL,
	`signerRole` varchar(100),
	`status` enum('pending','signed','declined','expired') DEFAULT 'pending',
	`signedAt` timestamp,
	`ipAddress` varchar(64),
	`signatureUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_signatures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int,
	`name` varchar(255) NOT NULL,
	`type` varchar(100) NOT NULL,
	`content` text,
	`variables` json DEFAULT ('[]'),
	`isGlobal` boolean DEFAULT false,
	`isActive` boolean DEFAULT true,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`createdBy` int NOT NULL,
	`contractNumber` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`titleAr` varchar(255),
	`type` enum('employment','service','nda','partnership','vendor','lease','other') NOT NULL,
	`status` enum('draft','pending_review','pending_signature','signed','active','expired','terminated','cancelled') NOT NULL DEFAULT 'draft',
	`partyAName` varchar(255),
	`partyBName` varchar(255),
	`value` decimal(15,2),
	`currency` varchar(10) DEFAULT 'OMR',
	`startDate` timestamp,
	`endDate` timestamp,
	`signedAt` timestamp,
	`content` text,
	`templateId` int,
	`googleDocId` varchar(255),
	`pdfUrl` text,
	`version` int DEFAULT 1,
	`tags` json DEFAULT ('[]'),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_contractNumber_unique` UNIQUE(`contractNumber`)
);
--> statement-breakpoint
CREATE TABLE `crm_communications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`contactId` int,
	`dealId` int,
	`userId` int NOT NULL,
	`type` enum('email','call','meeting','note','sms','whatsapp') NOT NULL,
	`subject` varchar(255),
	`content` text,
	`direction` enum('inbound','outbound') DEFAULT 'outbound',
	`duration` int,
	`scheduledAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `crm_communications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`ownerId` int,
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`email` varchar(320),
	`phone` varchar(32),
	`company` varchar(255),
	`position` varchar(100),
	`country` varchar(10),
	`city` varchar(100),
	`source` varchar(100),
	`status` enum('lead','prospect','customer','inactive') NOT NULL DEFAULT 'lead',
	`tags` json DEFAULT ('[]'),
	`notes` text,
	`avatarUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `crm_deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`contactId` int,
	`ownerId` int,
	`title` varchar(255) NOT NULL,
	`value` decimal(15,2),
	`currency` varchar(10) DEFAULT 'OMR',
	`stage` enum('lead','qualified','proposal','negotiation','closed_won','closed_lost') NOT NULL DEFAULT 'lead',
	`probability` int DEFAULT 0,
	`expectedCloseDate` timestamp,
	`closedAt` timestamp,
	`source` varchar(100),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `crm_deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int,
	`employeeNumber` varchar(50),
	`firstName` varchar(100) NOT NULL,
	`lastName` varchar(100) NOT NULL,
	`firstNameAr` varchar(100),
	`lastNameAr` varchar(100),
	`email` varchar(320),
	`phone` varchar(32),
	`nationality` varchar(100),
	`passportNumber` varchar(50),
	`nationalId` varchar(50),
	`department` varchar(100),
	`position` varchar(100),
	`managerId` int,
	`employmentType` enum('full_time','part_time','contract','intern') DEFAULT 'full_time',
	`status` enum('active','on_leave','terminated','resigned') NOT NULL DEFAULT 'active',
	`hireDate` timestamp,
	`terminationDate` timestamp,
	`salary` decimal(12,2),
	`currency` varchar(10) DEFAULT 'OMR',
	`avatarUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`companyId` int NOT NULL,
	`applicantName` varchar(255) NOT NULL,
	`applicantEmail` varchar(320) NOT NULL,
	`applicantPhone` varchar(32),
	`resumeUrl` text,
	`coverLetter` text,
	`stage` enum('applied','screening','interview','assessment','offer','hired','rejected') NOT NULL DEFAULT 'applied',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `job_postings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`department` varchar(100),
	`location` varchar(255),
	`type` enum('full_time','part_time','contract','intern') DEFAULT 'full_time',
	`status` enum('draft','open','closed','on_hold') NOT NULL DEFAULT 'draft',
	`description` text,
	`requirements` text,
	`salaryMin` decimal(10,2),
	`salaryMax` decimal(10,2),
	`currency` varchar(10) DEFAULT 'OMR',
	`applicationDeadline` timestamp,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `job_postings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`approvedBy` int,
	`leaveType` enum('annual','sick','emergency','maternity','paternity','unpaid','other') NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`days` decimal(4,1),
	`reason` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leave_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketplace_bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`clientId` int NOT NULL,
	`providerId` int NOT NULL,
	`serviceId` int NOT NULL,
	`bookingNumber` varchar(50) NOT NULL,
	`status` enum('pending','confirmed','in_progress','completed','cancelled','refunded') NOT NULL DEFAULT 'pending',
	`scheduledAt` timestamp,
	`completedAt` timestamp,
	`amount` decimal(10,2),
	`currency` varchar(10) DEFAULT 'OMR',
	`notes` text,
	`rating` int,
	`review` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplace_bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketplace_bookings_bookingNumber_unique` UNIQUE(`bookingNumber`)
);
--> statement-breakpoint
CREATE TABLE `marketplace_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int,
	`businessName` varchar(255) NOT NULL,
	`businessNameAr` varchar(255),
	`category` varchar(100) NOT NULL,
	`description` text,
	`descriptionAr` text,
	`logoUrl` text,
	`coverUrl` text,
	`phone` varchar(32),
	`email` varchar(320),
	`website` varchar(255),
	`location` varchar(255),
	`city` varchar(100),
	`country` varchar(10) DEFAULT 'OM',
	`rating` decimal(3,2) DEFAULT '0.00',
	`reviewCount` int DEFAULT 0,
	`completedJobs` int DEFAULT 0,
	`isVerified` boolean DEFAULT false,
	`isFeatured` boolean DEFAULT false,
	`status` enum('active','inactive','pending_review','suspended') NOT NULL DEFAULT 'pending_review',
	`tags` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplace_providers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketplace_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`nameAr` varchar(255),
	`description` text,
	`category` varchar(100),
	`price` decimal(10,2),
	`priceType` enum('fixed','hourly','daily','custom') DEFAULT 'fixed',
	`currency` varchar(10) DEFAULT 'OMR',
	`duration` int,
	`isActive` boolean DEFAULT true,
	`tags` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplace_services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int,
	`type` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`link` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payroll_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`periodMonth` int NOT NULL,
	`periodYear` int NOT NULL,
	`basicSalary` decimal(12,2) NOT NULL,
	`allowances` decimal(12,2) DEFAULT '0',
	`deductions` decimal(12,2) DEFAULT '0',
	`taxAmount` decimal(12,2) DEFAULT '0',
	`netSalary` decimal(12,2) NOT NULL,
	`currency` varchar(10) DEFAULT 'OMR',
	`status` enum('draft','approved','paid') NOT NULL DEFAULT 'draft',
	`paidAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `performance_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`reviewerId` int NOT NULL,
	`period` varchar(50) NOT NULL,
	`overallScore` decimal(4,2),
	`status` enum('draft','submitted','acknowledged') NOT NULL DEFAULT 'draft',
	`strengths` text,
	`improvements` text,
	`goals` text,
	`comments` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performance_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pro_services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`requestedBy` int NOT NULL,
	`assignedProId` int,
	`serviceNumber` varchar(50) NOT NULL,
	`serviceType` enum('visa_processing','work_permit','labor_card','emirates_id','oman_id','residence_renewal','visa_renewal','permit_renewal','document_attestation','company_registration','other') NOT NULL,
	`status` enum('pending','assigned','in_progress','awaiting_documents','submitted_to_authority','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` enum('low','normal','high','urgent') DEFAULT 'normal',
	`employeeName` varchar(255),
	`employeeNameAr` varchar(255),
	`nationality` varchar(100),
	`passportNumber` varchar(50),
	`passportExpiry` timestamp,
	`visaNumber` varchar(50),
	`permitNumber` varchar(50),
	`expiryDate` timestamp,
	`renewalAlertDays` int DEFAULT 30,
	`notes` text,
	`fees` decimal(10,2),
	`documents` json DEFAULT ('[]'),
	`completedAt` timestamp,
	`dueDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pro_services_id` PRIMARY KEY(`id`),
	CONSTRAINT `pro_services_serviceNumber_unique` UNIQUE(`serviceNumber`)
);
--> statement-breakpoint
CREATE TABLE `sanad_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`officeId` int,
	`applicantId` int NOT NULL,
	`assignedToId` int,
	`applicationNumber` varchar(50) NOT NULL,
	`type` enum('visa','labor_card','commercial_registration','work_permit','residence_permit','business_license','other') NOT NULL,
	`status` enum('draft','submitted','under_review','awaiting_documents','processing','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'draft',
	`priority` enum('low','normal','high','urgent') DEFAULT 'normal',
	`applicantName` varchar(255),
	`applicantNameAr` varchar(255),
	`nationality` varchar(100),
	`passportNumber` varchar(50),
	`notes` text,
	`rejectionReason` text,
	`submittedAt` timestamp,
	`completedAt` timestamp,
	`dueDate` timestamp,
	`fees` decimal(10,2),
	`documents` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `sanad_applications_applicationNumber_unique` UNIQUE(`applicationNumber`)
);
--> statement-breakpoint
CREATE TABLE `sanad_offices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`nameAr` varchar(255),
	`licenseNumber` varchar(100),
	`location` varchar(255),
	`city` varchar(100),
	`governorate` varchar(100),
	`phone` varchar(32),
	`email` varchar(320),
	`managerId` int,
	`status` enum('active','inactive','pending_approval','suspended') NOT NULL DEFAULT 'pending_approval',
	`openingHours` json,
	`services` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_offices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`subscriptionId` int NOT NULL,
	`invoiceNumber` varchar(50) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(10) DEFAULT 'OMR',
	`status` enum('draft','issued','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
	`dueDate` timestamp,
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`nameAr` varchar(100),
	`slug` varchar(50) NOT NULL,
	`description` text,
	`priceMonthly` decimal(10,2) NOT NULL,
	`priceAnnual` decimal(10,2) NOT NULL,
	`currency` varchar(10) DEFAULT 'OMR',
	`maxUsers` int DEFAULT 5,
	`maxContracts` int DEFAULT 50,
	`maxStorage` int DEFAULT 5120,
	`features` json DEFAULT ('[]'),
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_plans_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `platformRole` enum('super_admin','platform_admin','company_admin','company_member','reviewer','client') DEFAULT 'client' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_audit_user` ON `audit_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_audit_company` ON `audit_logs` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_audit_entity` ON `audit_logs` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `idx_cm_company` ON `company_members` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_cm_user` ON `company_members` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_sub_company` ON `company_subscriptions` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_contract_company` ON `contracts` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_contract_status` ON `contracts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_contract_type` ON `contracts` (`type`);--> statement-breakpoint
CREATE INDEX `idx_comm_company` ON `crm_communications` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_comm_contact` ON `crm_communications` (`contactId`);--> statement-breakpoint
CREATE INDEX `idx_crm_company` ON `crm_contacts` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_crm_status` ON `crm_contacts` (`status`);--> statement-breakpoint
CREATE INDEX `idx_deal_company` ON `crm_deals` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_deal_stage` ON `crm_deals` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_emp_company` ON `employees` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_emp_status` ON `employees` (`status`);--> statement-breakpoint
CREATE INDEX `idx_emp_dept` ON `employees` (`department`);--> statement-breakpoint
CREATE INDEX `idx_ja_job` ON `job_applications` (`jobId`);--> statement-breakpoint
CREATE INDEX `idx_ja_company` ON `job_applications` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_ja_stage` ON `job_applications` (`stage`);--> statement-breakpoint
CREATE INDEX `idx_jp_company` ON `job_postings` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_lr_company` ON `leave_requests` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_lr_employee` ON `leave_requests` (`employeeId`);--> statement-breakpoint
CREATE INDEX `idx_mb_company` ON `marketplace_bookings` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_mb_client` ON `marketplace_bookings` (`clientId`);--> statement-breakpoint
CREATE INDEX `idx_mb_provider` ON `marketplace_bookings` (`providerId`);--> statement-breakpoint
CREATE INDEX `idx_mp_category` ON `marketplace_providers` (`category`);--> statement-breakpoint
CREATE INDEX `idx_mp_status` ON `marketplace_providers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_mp_rating` ON `marketplace_providers` (`rating`);--> statement-breakpoint
CREATE INDEX `idx_mps_provider` ON `marketplace_services` (`providerId`);--> statement-breakpoint
CREATE INDEX `idx_notif_user` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_pr_company` ON `payroll_records` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_pr_employee` ON `payroll_records` (`employeeId`);--> statement-breakpoint
CREATE INDEX `idx_pr_period` ON `payroll_records` (`periodYear`,`periodMonth`);--> statement-breakpoint
CREATE INDEX `idx_pro_company` ON `pro_services` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_pro_status` ON `pro_services` (`status`);--> statement-breakpoint
CREATE INDEX `idx_pro_expiry` ON `pro_services` (`expiryDate`);--> statement-breakpoint
CREATE INDEX `idx_sanad_company` ON `sanad_applications` (`companyId`);--> statement-breakpoint
CREATE INDEX `idx_sanad_status` ON `sanad_applications` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sanad_type` ON `sanad_applications` (`type`);--> statement-breakpoint
CREATE INDEX `idx_inv_company` ON `subscription_invoices` (`companyId`);