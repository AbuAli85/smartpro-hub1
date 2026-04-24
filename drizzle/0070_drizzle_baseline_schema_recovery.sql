-- Migration 0070 — Baseline schema recovery (tables only, generated)
-- Source: drizzle-kit export from drizzle/schema.ts (authoritative).
-- Contains ONLY CREATE TABLE IF NOT EXISTS — safe to re-run when a subset of
-- tables is missing. Foreign keys and indexes live in drizzle/bootstrap/*.sql
-- (not journaled) because MySQL cannot guard ADD CONSTRAINT / CREATE INDEX
-- with IF NOT EXISTS.
-- Regenerate: pnpm run db:build-baseline-0070

CREATE TABLE IF NOT EXISTS `analytics_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`createdBy` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(100) NOT NULL,
	`config` json,
	`frequency` enum('daily','weekly','monthly','quarterly') DEFAULT 'weekly',
	`channel` enum('email','dashboard','email_dashboard') DEFAULT 'dashboard',
	`recipients` text,
	`nextRunAt` timestamp,
	`lastRunAt` timestamp,
	`status` enum('active','paused') NOT NULL DEFAULT 'active',
	`isActive` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analytics_reports_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `announcement_reads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`announcement_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`read_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `announcement_reads_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`created_by_user_id` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text NOT NULL,
	`type` enum('announcement','request','alert','reminder') NOT NULL DEFAULT 'announcement',
	`target_employee_id` int,
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`date` timestamp NOT NULL,
	`checkIn` timestamp,
	`checkOut` timestamp,
	`status` enum('present','absent','late','half_day','remote') NOT NULL DEFAULT 'present',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int,
	`hr_attendance_id` int,
	`attendance_record_id` int,
	`correction_id` int,
	`manual_checkin_request_id` int,
	`actor_user_id` int NOT NULL,
	`actor_role` varchar(64),
	`aa_action_type` enum('hr_attendance_create','hr_attendance_update','hr_attendance_delete','correction_approve','correction_reject','correction_submitted','manual_checkin_approve','manual_checkin_reject','self_checkin_allowed','self_checkin_denied','self_checkout','manual_checkin_submit','force_checkout','operational_issue_acknowledge','operational_issue_resolve','operational_issue_assign') NOT NULL,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` int,
	`before_payload` json,
	`after_payload` json,
	`reason` text,
	`aa_source` enum('hr_panel','employee_portal','admin_panel','system') NOT NULL DEFAULT 'hr_panel',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_audit_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance_period_locks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`status` enum('open','locked','exported','reopened') NOT NULL DEFAULT 'open',
	`locked_at` timestamp,
	`locked_by_user_id` int,
	`unlocked_at` timestamp,
	`unlocked_by_user_id` int,
	`exported_at` timestamp,
	`exported_by_user_id` int,
	`last_readiness_status` varchar(32),
	`last_blocker_count` int NOT NULL DEFAULT 0,
	`last_review_count` int NOT NULL DEFAULT 0,
	`reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_period_locks_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance_client_approval_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`site_id` int,
	`client_company_id` int,
	`promoter_assignment_id` int,
	`period_start` date NOT NULL,
	`period_end` date NOT NULL,
	`status` enum('draft','submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
	`submitted_at` timestamp,
	`submitted_by_user_id` int,
	`approved_at` timestamp,
	`approved_by_user_id` int,
	`rejected_at` timestamp,
	`rejected_by_user_id` int,
	`rejection_reason` text,
	`client_comment` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_client_approval_batches_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance_client_approval_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`attendance_date` date NOT NULL,
	`attendance_record_id` int,
	`attendance_session_id` int,
	`daily_state_json` json,
	`status` enum('pending','approved','rejected','disputed') NOT NULL DEFAULT 'pending',
	`client_comment` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_client_approval_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_acai_batch_employee_date` UNIQUE(`batch_id`,`employee_id`,`attendance_date`)
);

CREATE TABLE IF NOT EXISTS `attendance_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`attendance_record_id` int,
	`requested_date` varchar(10) NOT NULL,
	`requested_check_in` varchar(8),
	`requested_check_out` varchar(8),
	`reason` text NOT NULL,
	`ac_status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`admin_note` text,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_corrections_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance_operational_issues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`business_date_ymd` varchar(10) NOT NULL,
	`issue_kind` enum('overdue_checkout','missed_shift','correction_pending','manual_pending') NOT NULL,
	`issue_key` varchar(160) NOT NULL,
	`attendance_record_id` int,
	`schedule_id` int,
	`correction_id` int,
	`manual_checkin_request_id` int,
	`employee_id` int,
	`status` enum('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
	`assigned_to_user_id` int,
	`acknowledged_by_user_id` int,
	`acknowledged_at` timestamp,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`resolution_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_operational_issues_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_aoi_company_issue_key` UNIQUE(`company_id`,`issue_key`)
);

CREATE TABLE IF NOT EXISTS `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`schedule_id` int,
	`site_id` int,
	`promoter_assignment_id` char(36),
	`site_name` varchar(128),
	`check_in` timestamp NOT NULL,
	`check_out` timestamp,
	`check_in_lat` decimal(10,7),
	`check_in_lng` decimal(10,7),
	`check_out_lat` decimal(10,7),
	`check_out_lng` decimal(10,7),
	`method` enum('qr_scan','manual','admin') NOT NULL DEFAULT 'qr_scan',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`schedule_id` int,
	`business_date` varchar(10) NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`check_in_at` timestamp NOT NULL,
	`check_out_at` timestamp,
	`site_id` int,
	`promoter_assignment_id` char(36),
	`site_name` varchar(128),
	`method` enum('qr_scan','manual','admin') NOT NULL DEFAULT 'qr_scan',
	`source` enum('employee_portal','admin_panel','system') NOT NULL DEFAULT 'employee_portal',
	`check_in_lat` decimal(10,7),
	`check_in_lng` decimal(10,7),
	`check_out_lat` decimal(10,7),
	`check_out_lng` decimal(10,7),
	`notes` text,
	`source_record_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_sessions_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `attendance_sites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`location` varchar(255),
	`lat` decimal(10,7),
	`lng` decimal(10,7),
	`radius_meters` int NOT NULL DEFAULT 200,
	`enforce_geofence` boolean NOT NULL DEFAULT false,
	`site_type` varchar(50) NOT NULL DEFAULT 'office',
	`client_name` varchar(255),
	`daily_rate_omr` decimal(10,3) DEFAULT '0.000',
	`billing_customer_id` int,
	`operating_hours_start` varchar(5),
	`operating_hours_end` varchar(5),
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Muscat',
	`enforce_hours` boolean NOT NULL DEFAULT false,
	`qr_token` varchar(64) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_sites_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_sites_qr_token_unique` UNIQUE(`qr_token`)
);

CREATE TABLE IF NOT EXISTS `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`actorUserId` int,
	`entityType` varchar(100) NOT NULL,
	`entityId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`beforeState` json,
	`afterState` json,
	`ipAddress` varchar(64),
	`userAgent` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `audit_logs` (
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

CREATE TABLE IF NOT EXISTS `automation_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_id` int NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int,
	`trigger_type` varchar(100) NOT NULL,
	`action_type` varchar(100) NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'success',
	`message` text,
	`metadata` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automation_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `automation_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`trigger_type` varchar(100) NOT NULL,
	`condition_value` varchar(255),
	`action_type` varchar(100) NOT NULL,
	`action_payload` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`last_run_at` timestamp,
	`run_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automation_rules_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `billing_customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`party_id` char(36),
	`display_name` varchar(255) NOT NULL,
	`legal_name` varchar(255),
	`tax_registration` varchar(100),
	`vat_treatment` varchar(64),
	`payment_terms_days` int,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billing_customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_bc_company_party` UNIQUE(`company_id`,`party_id`)
);

CREATE TABLE IF NOT EXISTS `billing_rate_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`customer_deployment_id` int NOT NULL,
	`unit` varchar(32) NOT NULL,
	`amount_omr` decimal(14,3) NOT NULL,
	`effective_from` date NOT NULL,
	`effective_to` date,
	`rule_meta_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billing_rate_rules_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `business_parties` (
	`id` char(36) NOT NULL,
	`display_name_en` varchar(255) NOT NULL,
	`display_name_ar` varchar(255),
	`legal_name_en` varchar(255),
	`legal_name_ar` varchar(255),
	`status` varchar(50) NOT NULL DEFAULT 'active',
	`linked_company_id` int,
	`managed_by_company_id` int,
	`registration_number` varchar(100),
	`phone` varchar(64),
	`email` varchar(320),
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`merged_into_party_id` char(36),
	CONSTRAINT `business_parties_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `business_party_events` (
	`id` char(36) NOT NULL,
	`party_id` char(36) NOT NULL,
	`action` varchar(100) NOT NULL,
	`actor_id` int,
	`actor_name` varchar(255),
	`details` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_party_events_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `case_sla_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`case_id` int NOT NULL,
	`rule_id` int,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`due_at` timestamp NOT NULL,
	`breached_at` timestamp,
	`resolved_at` timestamp,
	`breach_notified` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `case_sla_tracking_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `case_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caseId` int NOT NULL,
	`taskType` varchar(100) NOT NULL,
	`taskStatus` enum('pending','in_progress','completed','skipped','blocked') NOT NULL DEFAULT 'pending',
	`title` varchar(255) NOT NULL,
	`description` text,
	`ownerUserId` int,
	`dueAt` timestamp,
	`completedAt` timestamp,
	`sortOrder` int DEFAULT 0,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `case_tasks_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `client_invoice_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`attendance_site_id` int,
	`description` varchar(512) NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`unit_rate_omr` decimal(14,3) NOT NULL,
	`line_total_omr` decimal(14,3) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_invoice_line_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `client_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`sender_user_id` int,
	`sender_name` varchar(255),
	`message` text NOT NULL,
	`is_read` boolean NOT NULL DEFAULT false,
	`is_from_client` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_messages_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `client_portal_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`label` varchar(255),
	`created_by` int NOT NULL,
	`expires_at` timestamp,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `client_portal_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_portal_tokens_token_unique` UNIQUE(`token`)
);

CREATE TABLE IF NOT EXISTS `client_service_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`client_key` varchar(255) NOT NULL,
	`client_display_name` varchar(255) NOT NULL,
	`invoice_number` varchar(64) NOT NULL,
	`period_year` int NOT NULL,
	`period_month` int NOT NULL,
	`issue_date` date NOT NULL,
	`due_date` date NOT NULL,
	`subtotal_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`vat_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`total_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`amount_paid_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`balance_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`status` enum('draft','sent','partial','paid','overdue','void') NOT NULL DEFAULT 'draft',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `client_service_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `client_service_invoices_invoice_number_unique` UNIQUE(`invoice_number`),
	CONSTRAINT `uq_client_invoice_period` UNIQUE(`company_id`,`client_key`,`period_year`,`period_month`)
);

CREATE TABLE IF NOT EXISTS `collection_work_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`source_type` enum('pro_billing_cycle','subscription_invoice') NOT NULL,
	`source_id` int NOT NULL,
	`workflow_status` enum('needs_follow_up','promised_to_pay','escalated','disputed','resolved') NOT NULL DEFAULT 'needs_follow_up',
	`note` text,
	`updated_by_user_id` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collection_work_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_collection_work_source` UNIQUE(`source_type`,`source_id`)
);

CREATE TABLE IF NOT EXISTS `companies` (
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
	`crNumber` varchar(100),
	`occiNumber` varchar(100),
	`municipalityLicenceNumber` varchar(100),
	`laborCardNumber` varchar(100),
	`pasiNumber` varchar(100),
	`bankName` varchar(255),
	`bankAccountNumber` varchar(100),
	`bankIban` varchar(50),
	`omanisationTarget` decimal(5,2),
	`foundedYear` int,
	`description` text,
	`status` enum('active','suspended','pending','cancelled') NOT NULL DEFAULT 'active',
	`subscriptionPlanId` int,
	`expiryWarningDays` int NOT NULL DEFAULT 30,
	`roleRedirectSettings` json DEFAULT ('{}'),
	`roleNavExtensions` json DEFAULT ('{}'),
	`leavePolicyCaps` json,
	`company_size` int,
	`established_at` date,
	`company_type` enum('llc','sole_prop','branch','joint_venture','government','ngo','other') DEFAULT 'llc',
	`omanization_required` boolean NOT NULL DEFAULT true,
	`omanization_ratio` decimal(5,2),
	`mol_compliance_status` enum('compliant','warning','non_compliant','unknown') NOT NULL DEFAULT 'unknown',
	`mol_last_checked_at` timestamp,
	`billing_model` enum('subscription','per_transaction','hybrid','custom') DEFAULT 'subscription',
	`subscription_fee` decimal(10,3),
	`contract_start` date,
	`contract_end` date,
	`account_manager_id` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `companies_slug_unique` UNIQUE(`slug`)
);

CREATE TABLE IF NOT EXISTS `company_branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`governmentBranchCode` varchar(100),
	`branchNameEn` varchar(255),
	`branchNameAr` varchar(255),
	`governorate` varchar(100),
	`wilayat` varchar(100),
	`locality` varchar(255),
	`phone` varchar(32),
	`address` text,
	`isHeadquarters` boolean NOT NULL DEFAULT false,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_branches_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `company_documents` (
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

CREATE TABLE IF NOT EXISTS `company_government_access` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`provider` varchar(50) NOT NULL DEFAULT 'mol',
	`accessMode` enum('api','rpa','manual') NOT NULL DEFAULT 'manual',
	`credentialRef` varchar(255),
	`authorizedSignatoryName` varchar(255),
	`authorizedSignatoryCivilId` varchar(50),
	`establishmentNumber` varchar(100),
	`status` enum('active','inactive','pending_verification','suspended') NOT NULL DEFAULT 'pending_verification',
	`lastVerifiedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_government_access_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `company_holidays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`holiday_date` date NOT NULL,
	`holiday_type` enum('public','company','optional') NOT NULL DEFAULT 'public',
	`is_recurring_yearly` boolean NOT NULL DEFAULT false,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_holidays_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `company_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` enum('company_admin','company_member','finance_admin','hr_admin','reviewer','client','external_auditor') NOT NULL DEFAULT 'company_member',
	`token` varchar(128) NOT NULL,
	`invited_by` int NOT NULL,
	`expires_at` timestamp NOT NULL,
	`accepted_at` timestamp,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_invites_token_unique` UNIQUE(`token`)
);

CREATE TABLE IF NOT EXISTS `company_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('company_admin','company_member','finance_admin','hr_admin','reviewer','client','external_auditor') NOT NULL DEFAULT 'company_member',
	`permissions` json DEFAULT ('[]'),
	`isActive` boolean NOT NULL DEFAULT true,
	`invitedBy` int,
	`invited_at` timestamp,
	`accepted_at` timestamp,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`removed_at` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_members_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `company_omanization_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`snapshot_month` tinyint NOT NULL,
	`snapshot_year` smallint NOT NULL,
	`total_employees` int NOT NULL DEFAULT 0,
	`omani_employees` int NOT NULL DEFAULT 0,
	`omani_ratio` decimal(5,2) NOT NULL DEFAULT '0.00',
	`required_ratio` decimal(5,2),
	`compliance_status` enum('compliant','warning','non_compliant') NOT NULL DEFAULT 'non_compliant',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `company_omanization_snapshots_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `company_revenue_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`period_month` tinyint NOT NULL,
	`period_year` smallint NOT NULL,
	`revenue_type` enum('subscription','deployment_fee','per_transaction','setup_fee','other') NOT NULL DEFAULT 'subscription',
	`amount_omr` decimal(12,3) NOT NULL DEFAULT '0.000',
	`currency` varchar(10) NOT NULL DEFAULT 'OMR',
	`source_ref` varchar(255),
	`notes` text,
	`recorded_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_revenue_records_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `company_signatories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name_en` varchar(255) NOT NULL,
	`name_ar` varchar(255),
	`title_en` varchar(255) NOT NULL,
	`title_ar` varchar(255),
	`is_default` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_signatories_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `company_subscriptions` (
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

CREATE TABLE IF NOT EXISTS `compliance_certificates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`officer_id` int NOT NULL,
	`period_month` int NOT NULL,
	`period_year` int NOT NULL,
	`pdf_url` varchar(1024),
	`certificate_number` varchar(100),
	`work_order_count` int NOT NULL DEFAULT 0,
	`generated_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `compliance_certificates_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `contract_signature_audit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contract_id` int NOT NULL,
	`signature_id` int,
	`event` enum('requested','viewed','signed','declined','expired','reminder_sent','completed') NOT NULL,
	`actor_name` varchar(255),
	`actor_email` varchar(320),
	`actor_user_id` int,
	`actor_type` enum('user','external','system') NOT NULL DEFAULT 'external',
	`ip_address` varchar(64),
	`user_agent` varchar(512),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_signature_audit_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `contract_signatures` (
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

CREATE TABLE IF NOT EXISTS `contract_templates` (
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

CREATE TABLE IF NOT EXISTS `contract_type_defs` (
	`id` varchar(50) NOT NULL,
	`label_en` varchar(255) NOT NULL,
	`label_ar` varchar(255),
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contract_type_defs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `contracts` (
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

CREATE TABLE IF NOT EXISTS `crm_communications` (
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

CREATE TABLE IF NOT EXISTS `crm_contacts` (
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

CREATE TABLE IF NOT EXISTS `crm_deals` (
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

CREATE TABLE IF NOT EXISTS `customer_account_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_account_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('buyer_admin','buyer_finance','buyer_operations','buyer_viewer') NOT NULL,
	`status` enum('invited','active','revoked') NOT NULL DEFAULT 'active',
	`invited_at` timestamp,
	`accepted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_account_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cam_account_user` UNIQUE(`customer_account_id`,`user_id`)
);

CREATE TABLE IF NOT EXISTS `customer_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_company_id` int NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`legal_name` varchar(255),
	`slug` varchar(100),
	`status` enum('draft','active','suspended','closed') NOT NULL DEFAULT 'active',
	`country` varchar(10) DEFAULT 'OM',
	`primary_contact_email` varchar(320),
	`primary_contact_phone` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_accounts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `customer_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`billing_customer_id` int NOT NULL,
	`reference` varchar(128),
	`effective_from` date NOT NULL,
	`effective_to` date NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_contracts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `customer_deployment_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`customer_deployment_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`role` varchar(64),
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_deployment_assignments_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `customer_deployments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`billing_customer_id` int NOT NULL,
	`customer_contract_id` int,
	`primary_attendance_site_id` int,
	`outsourcing_contract_id` char(36),
	`effective_from` date NOT NULL,
	`effective_to` date NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_deployments_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `customer_invoice_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customer_account_id` int NOT NULL,
	`invoice_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_invoice_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_cil_account_invoice` UNIQUE(`customer_account_id`,`invoice_id`)
);

CREATE TABLE IF NOT EXISTS `departments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`name_ar` varchar(128),
	`description` text,
	`head_employee_id` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `departments_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `document_generation_audit_logs` (
	`id` char(36) NOT NULL,
	`generated_document_id` char(36) NOT NULL,
	`action` varchar(100) NOT NULL,
	`actor_id` int,
	`details` json NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_generation_audit_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `document_template_placeholders` (
	`id` char(36) NOT NULL,
	`template_id` char(36) NOT NULL,
	`placeholder` varchar(191) NOT NULL,
	`label` varchar(255) NOT NULL,
	`source_path` varchar(255) NOT NULL,
	`data_type` varchar(32) NOT NULL DEFAULT 'string',
	`required` boolean NOT NULL DEFAULT true,
	`default_value` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `document_template_placeholders_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_dtp_template_placeholder` UNIQUE(`template_id`,`placeholder`)
);

CREATE TABLE IF NOT EXISTS `document_templates` (
	`id` char(36) NOT NULL,
	`company_id` int NOT NULL DEFAULT 0,
	`key` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(100) NOT NULL,
	`entity_type` varchar(100) NOT NULL,
	`document_source` varchar(50) NOT NULL DEFAULT 'google_docs',
	`google_doc_id` varchar(255),
	`language` varchar(32) NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`output_formats` json NOT NULL DEFAULT ('["pdf"]'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `document_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_document_templates_key_company` UNIQUE(`key`,`company_id`)
);

CREATE TABLE IF NOT EXISTS `employee_accountability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`department_id` int,
	`business_role_key` varchar(64),
	`responsibilities` json DEFAULT ('[]'),
	`kpi_category_keys` json DEFAULT ('[]'),
	`review_cadence` enum('daily','weekly','biweekly','monthly') NOT NULL DEFAULT 'weekly',
	`escalation_employee_id` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_accountability_id` PRIMARY KEY(`id`),
	CONSTRAINT `uniq_emp_accountability_company_employee` UNIQUE(`company_id`,`employee_id`)
);

CREATE TABLE IF NOT EXISTS `employee_cost_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`period_month` tinyint NOT NULL,
	`period_year` smallint NOT NULL,
	`basic_salary` decimal(12,3) NOT NULL DEFAULT '0.000',
	`housing_allowance` decimal(12,3) NOT NULL DEFAULT '0.000',
	`transport_allowance` decimal(12,3) NOT NULL DEFAULT '0.000',
	`other_allowances` decimal(12,3) NOT NULL DEFAULT '0.000',
	`pasi_contribution` decimal(12,3) NOT NULL DEFAULT '0.000',
	`overhead_allocation` decimal(12,3) NOT NULL DEFAULT '0.000',
	`total_cost` decimal(12,3) NOT NULL DEFAULT '0.000',
	`currency` varchar(10) NOT NULL DEFAULT 'OMR',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_cost_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ecr_emp_period` UNIQUE(`employee_id`,`period_year`,`period_month`)
);

CREATE TABLE IF NOT EXISTS `employee_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`workPermitId` int,
	`documentType` enum('mol_work_permit_certificate','passport','visa','resident_card','labour_card','employment_contract','civil_id','medical_certificate','photo','other') NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`mimeType` varchar(100),
	`fileSizeBytes` int,
	`issuedAt` timestamp,
	`expiresAt` timestamp,
	`verificationStatus` enum('pending','verified','rejected','expired') NOT NULL DEFAULT 'pending',
	`source` enum('uploaded','government','smartpro') NOT NULL DEFAULT 'uploaded',
	`metadata` json,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_documents_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_government_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`provider` varchar(50) NOT NULL DEFAULT 'mol',
	`civilId` varchar(50),
	`visaNumber` varchar(100),
	`visaIssueDate` timestamp,
	`visaExpiryDate` timestamp,
	`visaType` varchar(100),
	`residentCardNumber` varchar(100),
	`residentCardExpiryDate` timestamp,
	`labourCardNumber` varchar(100),
	`labourCardExpiryDate` timestamp,
	`rawPayload` json,
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_government_profiles_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`type` enum('leave','document','overtime','expense','equipment','training','other') NOT NULL,
	`status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`subject` varchar(255) NOT NULL,
	`details` json,
	`admin_note` text,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_salary_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`company_id` int NOT NULL,
	`basic_salary` decimal(10,3) NOT NULL DEFAULT '0.000',
	`housing_allowance` decimal(10,3) NOT NULL DEFAULT '0.000',
	`transport_allowance` decimal(10,3) NOT NULL DEFAULT '0.000',
	`other_allowances` decimal(10,3) NOT NULL DEFAULT '0.000',
	`pasi_rate` decimal(5,2) NOT NULL DEFAULT '11.50',
	`income_tax_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
	`effective_from` date NOT NULL,
	`effective_to` date,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_salary_configs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_schedule_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`site_id` int NOT NULL,
	`working_days` varchar(20) NOT NULL DEFAULT '0,1,2,3,4',
	`start_date` date NOT NULL,
	`end_date` date,
	`is_active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_schedule_groups_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`site_id` int NOT NULL,
	`shift_template_id` int NOT NULL,
	`group_id` int,
	`working_days` varchar(20) NOT NULL DEFAULT '0,1,2,3,4',
	`start_date` date NOT NULL,
	`end_date` date,
	`is_active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`created_by_user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_schedules_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_self_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`review_period` varchar(50) NOT NULL,
	`self_rating` int,
	`manager_rating` int,
	`self_achievements` text,
	`self_goals` text,
	`manager_feedback` text,
	`goals_next_period` text,
	`review_status` enum('draft','submitted','reviewed','acknowledged') NOT NULL DEFAULT 'draft',
	`submitted_at` timestamp,
	`reviewed_at` timestamp,
	`reviewed_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_self_reviews_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`assigned_to_employee_id` int NOT NULL,
	`assigned_by_user_id` int NOT NULL,
	`assigned_at` timestamp NOT NULL DEFAULT (now()),
	`title` varchar(255) NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_progress','completed','cancelled','blocked') NOT NULL DEFAULT 'pending',
	`due_date` date,
	`estimated_duration_minutes` int,
	`started_at` timestamp,
	`completed_at` timestamp,
	`completed_by_user_id` int,
	`notes` text,
	`blocked_reason` text,
	`checklist` json,
	`attachment_links` json,
	`notified_overdue` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_tasks_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employee_wps_validations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`validated_at` timestamp NOT NULL DEFAULT (now()),
	`validated_by_user_id` int,
	`iban_present` boolean NOT NULL DEFAULT false,
	`iban_valid_format` boolean NOT NULL DEFAULT false,
	`bank_name_present` boolean NOT NULL DEFAULT false,
	`salary_present` boolean NOT NULL DEFAULT false,
	`period_month` tinyint,
	`period_year` smallint,
	`result` enum('ready','invalid','missing') NOT NULL,
	`failure_reasons` json,
	CONSTRAINT `employee_wps_validations_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `employees` (
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
	`dateOfBirth` date,
	`gender` enum('male','female'),
	`maritalStatus` enum('single','married','divorced','widowed'),
	`profession` varchar(150),
	`visaNumber` varchar(50),
	`visaExpiryDate` date,
	`workPermitNumber` varchar(50),
	`workPermitExpiryDate` date,
	`pasiNumber` varchar(50),
	`bankName` varchar(255),
	`bankAccountNumber` varchar(100),
	`iban_number` varchar(34),
	`emergencyContactName` varchar(255),
	`emergencyContactPhone` varchar(32),
	`basic_salary` decimal(12,3),
	`housing_allowance` decimal(12,3) DEFAULT '0',
	`transport_allowance` decimal(12,3) DEFAULT '0',
	`other_allowances` decimal(12,3) DEFAULT '0',
	`total_salary` decimal(12,3),
	`wps_status` enum('ready','invalid','missing','exempt') NOT NULL DEFAULT 'missing',
	`wps_last_validated_at` timestamp,
	`probation_end_date` date,
	`contract_type` enum('limited','unlimited','part_time','secondment') DEFAULT 'unlimited',
	`notice_period_days` int DEFAULT 30,
	`last_working_day` date,
	`deployment_type` enum('dedicated','shared','internal') DEFAULT 'internal',
	`cost_to_company` decimal(12,3),
	`salary_cost` decimal(12,3),
	`margin_omr` decimal(12,3),
	`is_omani` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `engagement_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagement_id` int NOT NULL,
	`company_id` int NOT NULL,
	`actor_user_id` int,
	`action` varchar(128) NOT NULL,
	`payload` json DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `engagement_activity_log_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `engagement_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagement_id` int NOT NULL,
	`company_id` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`file_url` varchar(2048),
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`uploaded_by_user_id` int,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`review_note` text,
	`storage_key` varchar(1024),
	`mime_type` varchar(255),
	`size_bytes` int,
	`scan_status` enum('not_scanned','pending','clean','suspicious','failed') NOT NULL DEFAULT 'not_scanned',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `engagement_documents_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `engagement_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagement_id` int NOT NULL,
	`company_id` int NOT NULL,
	`link_type` enum('pro_service','government_case','marketplace_booking','contract','pro_billing_cycle','client_service_invoice','staffing_month','work_permit','employee_document','service_request') NOT NULL,
	`entity_id` int,
	`entity_key` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `engagement_links_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `engagement_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagement_id` int NOT NULL,
	`company_id` int NOT NULL,
	`author` enum('client','platform','system') NOT NULL,
	`author_user_id` int,
	`subject` varchar(255),
	`body` text NOT NULL,
	`read_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `engagement_messages_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `engagement_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagement_id` int NOT NULL,
	`company_id` int NOT NULL,
	`author_user_id` int,
	`body` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `engagement_notes_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `engagement_payment_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagement_id` int NOT NULL,
	`company_id` int NOT NULL,
	`phase` enum('idle','instructions_sent','proof_submitted','verified','rejected','reconciled') NOT NULL DEFAULT 'idle',
	`instructions_text` text,
	`proof_url` varchar(2048),
	`proof_reference` varchar(255),
	`amount_claimed_omr` decimal(14,3),
	`client_service_invoice_id` int,
	`submitted_by_user_id` int,
	`verified_by_user_id` int,
	`verified_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engagement_payment_transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_engagement_payment_transfer_engagement` UNIQUE(`engagement_id`)
);

CREATE TABLE IF NOT EXISTS `engagement_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`engagement_id` int NOT NULL,
	`company_id` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`status` enum('pending','in_progress','done','cancelled') NOT NULL DEFAULT 'pending',
	`due_date` timestamp,
	`sort_order` int NOT NULL DEFAULT 0,
	`linked_employee_task_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `engagement_tasks_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `engagements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`engagement_type` enum('workspace','pro_service','government_case','marketplace_booking','contract','pro_billing_cycle','client_service_invoice','staffing_month','work_permit_renewal','service_request') NOT NULL,
	`status` enum('draft','active','waiting_client','waiting_platform','blocked','completed','archived') NOT NULL DEFAULT 'active',
	`health` enum('on_track','at_risk','blocked','delayed','unknown') NOT NULL DEFAULT 'unknown',
	`health_reason` text,
	`due_date` timestamp,
	`sla_due_at` timestamp,
	`last_activity_at` timestamp,
	`top_action_type` varchar(64),
	`top_action_label` varchar(512),
	`top_action_status` varchar(64),
	`top_action_due_at` timestamp,
	`top_action_payload` json DEFAULT ('{}'),
	`assigned_owner_user_id` int,
	`ops_priority` enum('normal','high','urgent') NOT NULL DEFAULT 'normal',
	`escalated_at` timestamp,
	`workflow_stage` varchar(128),
	`current_stage` varchar(255),
	`summary` text,
	`metadata` json DEFAULT ('{}'),
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`derived_state_synced_at` timestamp,
	CONSTRAINT `engagements_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `expense_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`claim_date` date NOT NULL,
	`expense_category` enum('travel','meals','accommodation','equipment','communication','training','medical','other') NOT NULL,
	`amount` varchar(20) NOT NULL,
	`currency` varchar(5) NOT NULL DEFAULT 'OMR',
	`description` text NOT NULL,
	`receipt_url` varchar(1000),
	`expense_status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`admin_notes` text,
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expense_claims_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `generated_documents` (
	`id` char(36) NOT NULL,
	`template_id` char(36) NOT NULL,
	`entity_type` varchar(100) NOT NULL,
	`entity_id` char(36) NOT NULL,
	`output_format` varchar(32) NOT NULL,
	`source_google_doc_id` varchar(255),
	`generated_google_doc_id` varchar(255),
	`file_url` text,
	`file_path` varchar(1024),
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`generated_by` int,
	`company_id` int NOT NULL,
	`metadata` json NOT NULL DEFAULT ('{}'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `generated_documents_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `government_service_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int,
	`workPermitId` int,
	`branchId` int,
	`caseType` enum('renewal','amendment','cancellation','contract_registration','employee_update','document_update','new_permit','transfer') NOT NULL,
	`caseStatus` enum('draft','awaiting_documents','ready_for_submission','submitted','in_review','action_required','approved','rejected','completed','cancelled') NOT NULL DEFAULT 'draft',
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`provider` varchar(50) NOT NULL DEFAULT 'mol',
	`governmentReference` varchar(255),
	`requestedBy` int,
	`assignedTo` int,
	`submittedAt` timestamp,
	`completedAt` timestamp,
	`dueDate` timestamp,
	`notes` text,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `government_service_cases_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `government_sync_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`provider` varchar(50) NOT NULL DEFAULT 'mol',
	`jobType` enum('full_sync','delta_sync','single_permit','employee_sync') NOT NULL,
	`syncStatus` enum('pending','running','success','partial_success','failed') NOT NULL DEFAULT 'pending',
	`mode` enum('full','delta','single') NOT NULL DEFAULT 'delta',
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`recordsFetched` int NOT NULL DEFAULT 0,
	`recordsChanged` int NOT NULL DEFAULT 0,
	`recordsFailed` int NOT NULL DEFAULT 0,
	`errorCode` varchar(100),
	`errorMessage` text,
	`triggeredBy` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `government_sync_jobs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `hr_letters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`letter_type` varchar(64) NOT NULL,
	`language` varchar(8) NOT NULL DEFAULT 'en',
	`letter_status` enum('draft','issued','voided') NOT NULL DEFAULT 'issued',
	`template_version` varchar(32) NOT NULL DEFAULT 'v1',
	`reference_number` varchar(64),
	`subject` varchar(512),
	`body_en` text,
	`body_ar` text,
	`issued_to` varchar(255),
	`purpose` text,
	`additional_notes` text,
	`field_payload` json,
	`data_snapshot` json,
	`issued_at` timestamp,
	`issued_by_user_id` int,
	`signatory_id` int,
	`export_count` int NOT NULL DEFAULT 0,
	`email_sent_at` timestamp,
	`email_send_count` int NOT NULL DEFAULT 0,
	`email_last_sent_to` varchar(255),
	`is_deleted` boolean NOT NULL DEFAULT false,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hr_letters_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `interview_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int NOT NULL,
	`company_id` int NOT NULL,
	`interview_type` enum('phone','video','in_person','technical','panel') NOT NULL DEFAULT 'video',
	`scheduled_at` timestamp NOT NULL,
	`duration_minutes` int DEFAULT 60,
	`location` varchar(512),
	`meeting_link` varchar(1024),
	`interviewer_names` text,
	`status` enum('scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`feedback` text,
	`rating` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `interview_schedules_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `invoice_payment_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`amount_omr` decimal(14,3) NOT NULL,
	`paid_at` timestamp NOT NULL,
	`payment_method` enum('bank','cash','card','other') NOT NULL DEFAULT 'bank',
	`reference` varchar(255),
	`gateway` enum('thawani','stripe'),
	`gateway_session_id` varchar(255),
	`gateway_payment_id` varchar(255),
	`gateway_status` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_payment_records_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `job_applications` (
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

CREATE TABLE IF NOT EXISTS `job_postings` (
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

CREATE TABLE IF NOT EXISTS `kpi_achievements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`period_year` int NOT NULL,
	`period_month` int NOT NULL,
	`metric_name` varchar(200) NOT NULL,
	`target_value` decimal(15,2) NOT NULL,
	`achieved_value` decimal(15,2) NOT NULL DEFAULT '0',
	`achievement_pct` decimal(6,2) NOT NULL DEFAULT '0',
	`commission_earned` decimal(15,2) NOT NULL DEFAULT '0',
	`currency` varchar(5) NOT NULL DEFAULT 'OMR',
	`kpi_target_id` int,
	`last_updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_achievements_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `kpi_daily_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`log_date` date NOT NULL,
	`metric_name` varchar(200) NOT NULL,
	`metric_type` enum('sales_amount','client_count','leads_count','calls_count','meetings_count','proposals_count','revenue','units_sold','custom') NOT NULL DEFAULT 'custom',
	`value_achieved` decimal(15,2) NOT NULL,
	`client_name` varchar(300),
	`notes` text,
	`attachment_url` varchar(1000),
	`kpi_target_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_daily_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `kpi_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`period_year` int NOT NULL,
	`period_month` int NOT NULL,
	`metric_name` varchar(200) NOT NULL,
	`metric_type` enum('sales_amount','client_count','leads_count','calls_count','meetings_count','proposals_count','revenue','units_sold','custom') NOT NULL DEFAULT 'custom',
	`target_value` decimal(15,2) NOT NULL,
	`commission_rate` decimal(5,2) DEFAULT '0',
	`commission_type` enum('percentage','fixed_per_unit','tiered') DEFAULT 'percentage',
	`currency` varchar(5) NOT NULL DEFAULT 'OMR',
	`notes` text,
	`set_by_user_id` int,
	`target_status` enum('draft','active','completed','archived','cancelled') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_targets_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `leave_requests` (
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

CREATE TABLE IF NOT EXISTS `manual_checkin_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`site_id` int NOT NULL,
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`requested_business_date` varchar(10),
	`requested_schedule_id` int,
	`justification` text NOT NULL,
	`lat` decimal(10,7),
	`lng` decimal(10,7),
	`distance_meters` int,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`admin_note` text,
	`attendance_record_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `manual_checkin_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `marketplace_bookings` (
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

CREATE TABLE IF NOT EXISTS `marketplace_providers` (
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

CREATE TABLE IF NOT EXISTS `marketplace_services` (
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

CREATE TABLE IF NOT EXISTS `mfa_challenges` (
	`id` varchar(36) NOT NULL,
	`user_id` int NOT NULL,
	`return_path` varchar(2048) NOT NULL DEFAULT '/',
	`status` enum('pending','consumed','expired') NOT NULL DEFAULT 'pending',
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mfa_challenges_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `notifications` (
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

CREATE TABLE IF NOT EXISTS `offer_letters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`application_id` int NOT NULL,
	`company_id` int NOT NULL,
	`job_id` int NOT NULL,
	`applicant_name` varchar(255) NOT NULL,
	`applicant_email` varchar(320) NOT NULL,
	`position` varchar(255) NOT NULL,
	`department` varchar(100),
	`start_date` timestamp,
	`basic_salary` decimal(12,3) NOT NULL,
	`housing_allowance` decimal(12,3) DEFAULT '0',
	`transport_allowance` decimal(12,3) DEFAULT '0',
	`other_allowances` decimal(12,3) DEFAULT '0',
	`total_package` decimal(12,3) NOT NULL,
	`probation_months` int DEFAULT 3,
	`annual_leave` int DEFAULT 21,
	`additional_terms` text,
	`status` enum('draft','sent','accepted','rejected','expired') NOT NULL DEFAULT 'draft',
	`sent_at` timestamp,
	`responded_at` timestamp,
	`expires_at` timestamp,
	`letter_url` varchar(1024),
	`letter_key` varchar(512),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `offer_letters_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `officer_company_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`officer_id` int NOT NULL,
	`company_id` int NOT NULL,
	`monthly_fee` decimal(10,3) NOT NULL DEFAULT '100.000',
	`status` enum('active','suspended','terminated') NOT NULL DEFAULT 'active',
	`assigned_at` timestamp NOT NULL DEFAULT (now()),
	`terminated_at` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `officer_company_assignments_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `officer_payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`officer_id` int NOT NULL,
	`payout_month` int NOT NULL,
	`payout_year` int NOT NULL,
	`employment_track` enum('platform','sanad') NOT NULL DEFAULT 'platform',
	`total_collected_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`commission_pct` decimal(5,2) DEFAULT '12.50',
	`commission_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`fixed_salary_omr` decimal(10,3) DEFAULT '600.000',
	`gross_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`deductions_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`net_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`status` enum('pending','approved','paid','on_hold') NOT NULL DEFAULT 'pending',
	`paid_at` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `officer_payouts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `omani_pro_officers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(255) NOT NULL,
	`full_name_ar` varchar(255),
	`civil_id` varchar(50),
	`pasi_number` varchar(100),
	`phone` varchar(30),
	`email` varchar(255),
	`sanad_office_id` int,
	`employment_track` enum('platform','sanad') NOT NULL DEFAULT 'platform',
	`monthly_salary` decimal(10,3) NOT NULL DEFAULT '500.000',
	`max_companies` int NOT NULL DEFAULT 10,
	`status` enum('active','inactive','on_leave','terminated') NOT NULL DEFAULT 'active',
	`qualifications` text,
	`notes` text,
	`hired_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `omani_pro_officers_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `onboarding_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`step_key` varchar(64) NOT NULL,
	`category` enum('profile','company','team','services','compliance','explore') NOT NULL,
	`title_en` varchar(256) NOT NULL,
	`title_ar` varchar(256),
	`description_en` text,
	`description_ar` text,
	`action_label` varchar(128),
	`action_url` varchar(256),
	`icon_name` varchar(64),
	`sort_order` int NOT NULL DEFAULT 0,
	`is_required` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `onboarding_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `onboarding_steps_step_key_unique` UNIQUE(`step_key`)
);

CREATE TABLE IF NOT EXISTS `outsourcing_contract_documents` (
	`id` char(36) NOT NULL,
	`contract_id` char(36) NOT NULL,
	`document_kind` varchar(50) NOT NULL,
	`file_url` text,
	`file_path` varchar(1024),
	`file_name` varchar(500),
	`mime_type` varchar(100),
	`uploaded_by` int,
	`metadata` json,
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outsourcing_contract_documents_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `outsourcing_contract_events` (
	`id` char(36) NOT NULL,
	`contract_id` char(36) NOT NULL,
	`action` varchar(100) NOT NULL,
	`actor_id` int,
	`actor_name` varchar(255),
	`snapshot_before` json,
	`snapshot_after` json,
	`details` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outsourcing_contract_events_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `outsourcing_contract_locations` (
	`id` char(36) NOT NULL,
	`contract_id` char(36) NOT NULL,
	`belongs_to_party_role` varchar(50) NOT NULL DEFAULT 'first_party',
	`site_name_en` varchar(500),
	`site_name_ar` varchar(500),
	`location_en` varchar(500),
	`location_ar` varchar(500),
	`client_site_id` int,
	`site_code` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outsourcing_contract_locations_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `outsourcing_contract_parties` (
	`id` char(36) NOT NULL,
	`contract_id` char(36) NOT NULL,
	`party_role` varchar(50) NOT NULL,
	`company_id` int,
	`party_id` char(36),
	`display_name_en` varchar(255) NOT NULL,
	`display_name_ar` varchar(255),
	`registration_number` varchar(100),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outsourcing_contract_parties_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `outsourcing_contracts` (
	`id` char(36) NOT NULL,
	`company_id` int,
	`contract_type_id` varchar(50) NOT NULL,
	`contract_number` varchar(100),
	`status` varchar(50) NOT NULL DEFAULT 'draft',
	`issue_date` date,
	`effective_date` date NOT NULL,
	`expiry_date` date NOT NULL,
	`template_version` int NOT NULL DEFAULT 1,
	`generated_pdf_url` text,
	`signed_pdf_url` text,
	`renewal_of_contract_id` char(36),
	`metadata` json,
	`required_headcount` int,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outsourcing_contracts_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `outsourcing_promoter_details` (
	`id` char(36) NOT NULL,
	`contract_id` char(36) NOT NULL,
	`promoter_employee_id` int NOT NULL,
	`employer_company_id` int NOT NULL,
	`full_name_en` varchar(255) NOT NULL,
	`full_name_ar` varchar(255),
	`civil_id` varchar(50),
	`passport_number` varchar(50),
	`passport_expiry` date,
	`nationality` varchar(100),
	`job_title_en` varchar(255),
	`job_title_ar` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outsourcing_promoter_details_id` PRIMARY KEY(`id`),
	CONSTRAINT `outsourcing_promoter_details_contract_id_unique` UNIQUE(`contract_id`)
);

CREATE TABLE IF NOT EXISTS `payment_gateway_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`invoice_id` int NOT NULL,
	`gateway` enum('thawani','stripe') NOT NULL,
	`client_reference` varchar(255) NOT NULL,
	`gateway_session_id` varchar(255),
	`gateway_payment_id` varchar(255),
	`amount_omr` decimal(14,3) NOT NULL,
	`status` enum('pending','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_gateway_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_pgs_client_reference` UNIQUE(`client_reference`)
);

CREATE TABLE IF NOT EXISTS `payment_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateway` enum('thawani','stripe') NOT NULL,
	`external_event_id` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_pwe_gateway_event` UNIQUE(`gateway`,`external_event_id`)
);

CREATE TABLE IF NOT EXISTS `payroll_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payroll_run_id` int NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`basic_salary` decimal(12,3) NOT NULL,
	`housing_allowance` decimal(12,3) DEFAULT '0',
	`transport_allowance` decimal(12,3) DEFAULT '0',
	`other_allowances` decimal(12,3) DEFAULT '0',
	`overtime_pay` decimal(12,3) DEFAULT '0',
	`commission_pay` decimal(12,3) DEFAULT '0',
	`gross_salary` decimal(12,3) NOT NULL,
	`pasi_deduction` decimal(12,3) DEFAULT '0',
	`income_tax` decimal(12,3) DEFAULT '0',
	`loan_deduction` decimal(12,3) DEFAULT '0',
	`absence_deduction` decimal(12,3) DEFAULT '0',
	`other_deductions` decimal(12,3) DEFAULT '0',
	`total_deductions` decimal(12,3) NOT NULL,
	`net_salary` decimal(12,3) NOT NULL,
	`bank_account` varchar(50),
	`bank_name` varchar(100),
	`iban_number` varchar(34),
	`payslip_url` varchar(1024),
	`payslip_key` varchar(512),
	`status` enum('pending','paid','failed','on_hold') NOT NULL DEFAULT 'pending',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payroll_line_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `payroll_records` (
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

CREATE TABLE IF NOT EXISTS `payroll_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`period_month` int NOT NULL,
	`period_year` int NOT NULL,
	`run_date` timestamp NOT NULL DEFAULT (now()),
	`status` enum('draft','processing','approved','paid','cancelled','pending_execution','locked','wps_generated','ready_for_upload') NOT NULL DEFAULT 'draft',
	`total_gross` decimal(14,3) DEFAULT '0',
	`total_deductions` decimal(14,3) DEFAULT '0',
	`total_net` decimal(14,3) DEFAULT '0',
	`employee_count` int DEFAULT 0,
	`notes` text,
	`attendance_preflight_snapshot` text,
	`preview_only` tinyint(1) NOT NULL DEFAULT 0,
	`created_by_user_id` int,
	`approved_by_user_id` int,
	`approved_at` timestamp,
	`paid_at` timestamp,
	`wps_file_url` varchar(1024),
	`wps_file_key` varchar(512),
	`wps_submitted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payroll_runs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `performance_interventions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`manager_user_id` int NOT NULL,
	`status` enum('open','closed','escalated') NOT NULL DEFAULT 'open',
	`kind` enum('request_update','corrective_task','follow_up','under_review','escalate') NOT NULL,
	`follow_up_at` timestamp,
	`linked_task_id` int,
	`note` text,
	`closed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performance_interventions_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `performance_reviews` (
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

CREATE TABLE IF NOT EXISTS `platform_user_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('super_admin','platform_admin','regional_manager','client_services','sanad_network_admin','sanad_compliance_reviewer') NOT NULL,
	`granted_by` int,
	`granted_at` timestamp NOT NULL DEFAULT (now()),
	`revoked_at` timestamp,
	CONSTRAINT `platform_user_roles_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`department_id` int,
	`title` varchar(128) NOT NULL,
	`title_ar` varchar(128),
	`description` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `positions_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `pro_billing_cycles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`officer_id` int NOT NULL,
	`company_id` int NOT NULL,
	`assignment_id` int NOT NULL,
	`billing_month` int NOT NULL,
	`billing_year` int NOT NULL,
	`amount_omr` decimal(10,3) NOT NULL DEFAULT '100.000',
	`status` enum('pending','paid','overdue','cancelled','waived') NOT NULL DEFAULT 'pending',
	`invoice_number` varchar(100) NOT NULL,
	`paid_at` timestamp,
	`due_date` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pro_billing_cycles_id` PRIMARY KEY(`id`),
	CONSTRAINT `pro_billing_cycles_invoice_number_unique` UNIQUE(`invoice_number`)
);

CREATE TABLE IF NOT EXISTS `pro_services` (
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

CREATE TABLE IF NOT EXISTS `profile_change_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`submittedByUserId` int NOT NULL,
	`fieldLabel` varchar(100) NOT NULL,
	`fieldKey` varchar(64) NOT NULL DEFAULT 'other',
	`requestedValue` varchar(500) NOT NULL,
	`notes` varchar(500),
	`status` enum('pending','resolved','rejected') NOT NULL DEFAULT 'pending',
	`submittedAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	`resolvedByUserId` int,
	`resolutionNote` varchar(500),
	CONSTRAINT `profile_change_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `promoter_assignments` (
	`id` char(36) NOT NULL,
	`company_id` int NOT NULL,
	`first_party_company_id` int NOT NULL,
	`second_party_company_id` int NOT NULL,
	`client_site_id` int,
	`promoter_employee_id` int NOT NULL,
	`assignment_status` enum('draft','active','suspended','completed','terminated') NOT NULL DEFAULT 'draft',
	`location_ar` varchar(500),
	`location_en` varchar(500),
	`start_date` date NOT NULL,
	`end_date` date,
	`expected_monthly_hours` int,
	`shift_type` varchar(32),
	`supervisor_user_id` int,
	`suspension_reason` text,
	`termination_reason` text,
	`notes` text,
	`billing_model` enum('per_month','per_day','per_hour','fixed_term'),
	`billing_rate` decimal(15,4),
	`currency_code` varchar(3) NOT NULL DEFAULT 'OMR',
	`rate_source` enum('assignment_override','contract_default','client_default') NOT NULL DEFAULT 'assignment_override',
	`contract_reference_number` varchar(100),
	`issue_date` date,
	`cms_sync_state` enum('not_required','pending','synced','skipped','failed') NOT NULL DEFAULT 'not_required',
	`last_sync_error` text,
	`last_synced_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promoter_assignments_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `promoter_invoice_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`invoice_id` int NOT NULL,
	`assignment_id` char(36) NOT NULL,
	`employee_id` int NOT NULL,
	`brand_company_id` int NOT NULL,
	`client_site_id` int,
	`billing_model` varchar(32),
	`billable_units` decimal(18,6),
	`unit_rate_omr` decimal(14,3),
	`line_total_omr` decimal(14,3) NOT NULL,
	`monthly_billing_mode` varchar(32),
	`monthly_proration_sensitive` boolean NOT NULL DEFAULT false,
	`monthly_estimate_only` boolean NOT NULL DEFAULT false,
	`readiness_snapshot` varchar(32) NOT NULL,
	`blockers_json` json NOT NULL,
	`warnings_json` json NOT NULL,
	`staging_row_snapshot_json` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promoter_invoice_lines_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `promoter_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`invoice_number` varchar(64) NOT NULL,
	`client_company_id` int NOT NULL,
	`period_start_ymd` date NOT NULL,
	`period_end_ymd` date NOT NULL,
	`currency_code` varchar(3) NOT NULL DEFAULT 'OMR',
	`subtotal_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`total_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`status` enum('draft','review_ready','issued','sent','partially_paid','paid','cancelled') NOT NULL DEFAULT 'draft',
	`monthly_billing_mode` varchar(32),
	`warning_ack_json` json,
	`html_artifact_key` varchar(512),
	`html_artifact_url` varchar(1024),
	`issued_snapshot_json` json,
	`pdf_artifact_key` varchar(512),
	`pdf_artifact_url` varchar(1024),
	`issued_at` timestamp,
	`issued_by_user_id` int,
	`created_by_user_id` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promoter_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `promoter_invoices_invoice_number_unique` UNIQUE(`invoice_number`),
	CONSTRAINT `uq_promoter_inv_period_client` UNIQUE(`company_id`,`client_company_id`,`period_start_ymd`,`period_end_ymd`)
);

CREATE TABLE IF NOT EXISTS `promoter_payroll_run_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`run_id` int NOT NULL,
	`assignment_id` char(36) NOT NULL,
	`employee_id` int NOT NULL,
	`brand_company_id` int NOT NULL,
	`client_site_id` int,
	`readiness_snapshot` varchar(32) NOT NULL,
	`blockers_json` json NOT NULL,
	`warnings_json` json NOT NULL,
	`payroll_note` text,
	`monthly_salary_basis_omr` decimal(14,3),
	`period_calendar_days` int NOT NULL,
	`overlap_days` int NOT NULL,
	`accrued_pay_omr` decimal(14,3) NOT NULL,
	`staging_row_snapshot_json` json NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `promoter_payroll_run_lines_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `promoter_payroll_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`period_start_ymd` date NOT NULL,
	`period_end_ymd` date NOT NULL,
	`status` enum('draft','review_ready','approved','exported','paid','cancelled') NOT NULL DEFAULT 'draft',
	`total_accrued_omr` decimal(14,3) NOT NULL DEFAULT '0',
	`line_count` int NOT NULL DEFAULT 0,
	`staging_snapshot_json` json,
	`warning_ack_json` json,
	`export_csv_key` varchar(512),
	`export_csv_url` varchar(1024),
	`exported_at` timestamp,
	`exported_by_user_id` int,
	`export_generation` int NOT NULL DEFAULT 0,
	`created_by_user_id` int,
	`approved_by_user_id` int,
	`approved_at` timestamp,
	`paid_at` timestamp,
	`paid_by_user_id` int,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promoter_payroll_runs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `quotation_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`quotation_id` int NOT NULL,
	`service_name` varchar(255) NOT NULL,
	`description` text,
	`qty` int NOT NULL DEFAULT 1,
	`unit_price_omr` decimal(10,3) NOT NULL,
	`discount_pct` decimal(5,2) NOT NULL DEFAULT '0',
	`line_total_omr` decimal(10,3) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quotation_line_items_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `renewal_workflow_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int,
	`name` varchar(255) NOT NULL,
	`description` text,
	`entity_type` enum('work_permit','visa','resident_card','labour_card','sanad_licence','officer_document','employee_document','pro_service') NOT NULL,
	`trigger_days_before` int NOT NULL DEFAULT 30,
	`auto_create_case` boolean NOT NULL DEFAULT true,
	`auto_assign_officer` boolean NOT NULL DEFAULT false,
	`notify_client` boolean NOT NULL DEFAULT true,
	`notify_owner` boolean NOT NULL DEFAULT true,
	`case_type` enum('renewal','amendment','cancellation','contract_registration','employee_update','document_update','new_permit','transfer') NOT NULL DEFAULT 'renewal',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `renewal_workflow_rules_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `renewal_workflow_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rule_id` int NOT NULL,
	`company_id` int NOT NULL,
	`entity_type` varchar(50) NOT NULL,
	`entity_id` int NOT NULL,
	`entity_label` varchar(255),
	`expiry_date` timestamp NOT NULL,
	`days_before_expiry` int NOT NULL,
	`status` enum('pending','triggered','case_created','skipped','failed') NOT NULL DEFAULT 'pending',
	`case_id` int,
	`assigned_officer_id` int,
	`triggered_at` timestamp,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `renewal_workflow_runs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `salary_loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`company_id` int NOT NULL,
	`loan_amount` decimal(10,3) NOT NULL,
	`monthly_deduction` decimal(10,3) NOT NULL,
	`balance_remaining` decimal(10,3) NOT NULL,
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`start_month` int NOT NULL,
	`start_year` int NOT NULL,
	`reason` varchar(500),
	`approved_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `salary_loans_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`providerId` int,
	`requestedById` int NOT NULL,
	`assignedToId` int,
	`referenceNumber` varchar(50) NOT NULL,
	`serviceType` enum('work_permit','work_permit_renewal','work_permit_cancellation','labor_card','labor_card_renewal','residence_visa','residence_visa_renewal','visit_visa','exit_reentry','commercial_registration','commercial_registration_renewal','business_license','document_typing','document_translation','document_attestation','pasi_registration','omanisation_report','other') NOT NULL,
	`title` varchar(255),
	`status` enum('draft','submitted','in_progress','awaiting_documents','awaiting_payment','completed','rejected','cancelled') NOT NULL DEFAULT 'draft',
	`priority` enum('low','normal','high','urgent') DEFAULT 'normal',
	`beneficiaryName` varchar(255),
	`beneficiaryNameAr` varchar(255),
	`nationality` varchar(100),
	`passportNumber` varchar(50),
	`employeeId` int,
	`notes` text,
	`providerNotes` text,
	`rejectionReason` text,
	`submittedAt` timestamp,
	`completedAt` timestamp,
	`dueDate` timestamp,
	`fees` decimal(10,2),
	`rating` int,
	`ratingComment` text,
	`documents` json DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `sanad_applications_referenceNumber_unique` UNIQUE(`referenceNumber`)
);

CREATE TABLE IF NOT EXISTS `sanad_centre_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`center_id` int NOT NULL,
	`actor_user_id` int,
	`activity_type` varchar(64) NOT NULL,
	`note` text,
	`metadata_json` json,
	`occurred_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_centre_activity_log_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_centre_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`center_id` int NOT NULL,
	`author_user_id` int NOT NULL,
	`body` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_centre_notes_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_centres_pipeline` (
	`center_id` int NOT NULL,
	`pipeline_status` enum('imported','contacted','prospect','invited','registered','active') NOT NULL DEFAULT 'imported',
	`owner_user_id` int,
	`last_contacted_at` timestamp,
	`next_action` text,
	`next_action_type` varchar(32),
	`next_action_due_at` timestamp,
	`assigned_at` timestamp,
	`assigned_by_user_id` int,
	`latest_note_preview` varchar(512),
	`is_archived` int NOT NULL DEFAULT 0,
	`is_invalid` int NOT NULL DEFAULT 0,
	`is_duplicate` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_centres_pipeline_center_id` PRIMARY KEY(`center_id`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_center_compliance_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`center_id` int NOT NULL,
	`requirement_id` int NOT NULL,
	`status` enum('pending','submitted','verified','rejected','waived','not_applicable') NOT NULL DEFAULT 'pending',
	`evidence_note` text,
	`reviewed_by_user_id` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_intel_center_compliance_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sanad_intel_cc_center_req` UNIQUE(`center_id`,`requirement_id`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_center_metrics_yearly` (
	`id` int AUTO_INCREMENT NOT NULL,
	`center_id` int NOT NULL,
	`year` int NOT NULL,
	`transaction_count` int,
	`income_amount` decimal(18,2),
	`source_ref` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_intel_center_metrics_yearly_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sanad_intel_cm_center_year` UNIQUE(`center_id`,`year`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_center_operations` (
	`center_id` int NOT NULL,
	`partner_status` enum('unknown','prospect','active','suspended','churned') NOT NULL DEFAULT 'unknown',
	`onboarding_status` enum('not_started','intake','documentation','licensing_review','licensed','blocked') NOT NULL DEFAULT 'not_started',
	`compliance_overall` enum('not_assessed','partial','complete','at_risk') NOT NULL DEFAULT 'not_assessed',
	`internal_tags` json NOT NULL DEFAULT ('[]'),
	`notes` text,
	`internal_review_notes` text,
	`assigned_manager_user_id` int,
	`latitude` decimal(10,7),
	`longitude` decimal(10,7),
	`coverage_radius_km` int,
	`target_sla_hours` int,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`invite_token` varchar(96),
	`invite_sent_at` timestamp,
	`invite_expires_at` timestamp,
	`registered_user_id` int,
	`linked_sanad_office_id` int,
	`activated_at` timestamp,
	`activation_source` enum('manual','invite','admin_created'),
	`last_contacted_at` timestamp,
	`contact_method` varchar(64),
	`follow_up_due_at` timestamp,
	`invite_accept_name` varchar(255),
	`invite_accept_phone` varchar(64),
	`invite_accept_email` varchar(320),
	`survey_outreach_reply_email` varchar(320),
	`invite_accept_at` timestamp,
	CONSTRAINT `sanad_intel_center_operations_center_id` PRIMARY KEY(`center_id`),
	CONSTRAINT `sanad_intel_center_operations_invite_token_unique` UNIQUE(`invite_token`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_centers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`import_batch_id` int,
	`source_fingerprint` varchar(64) NOT NULL,
	`center_name` varchar(512) NOT NULL,
	`responsible_person` varchar(255),
	`contact_number` varchar(64),
	`governorate_key` varchar(128) NOT NULL,
	`governorate_label_raw` varchar(255) NOT NULL,
	`wilayat` varchar(255),
	`village` varchar(255),
	`raw_row` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_intel_centers_id` PRIMARY KEY(`id`),
	CONSTRAINT `sanad_intel_centers_source_fingerprint_unique` UNIQUE(`source_fingerprint`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_geography_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`import_batch_id` int,
	`governorate_key` varchar(128) NOT NULL,
	`governorate_label` varchar(255) NOT NULL,
	`wilayat` varchar(255),
	`village` varchar(255),
	`center_count` int NOT NULL DEFAULT 0,
	`source_ref` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_intel_geography_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sanad_intel_geo` UNIQUE(`governorate_key`,`wilayat`,`village`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_governorate_year_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`import_batch_id` int,
	`year` int NOT NULL,
	`governorate_key` varchar(128) NOT NULL,
	`governorate_label` varchar(255) NOT NULL,
	`transaction_count` int NOT NULL DEFAULT 0,
	`income_amount` decimal(18,2) NOT NULL DEFAULT '0',
	`source_ref` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_intel_governorate_year_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sanad_intel_gov_year` UNIQUE(`year`,`governorate_key`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_import_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_key` varchar(64) NOT NULL,
	`source_files` json NOT NULL DEFAULT ('[]'),
	`row_counts` json NOT NULL DEFAULT ('{}'),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_intel_import_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `sanad_intel_import_batches_batch_key_unique` UNIQUE(`batch_key`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_license_requirements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`category` varchar(64) NOT NULL,
	`onboarding_stage` enum('intake','documentation','premises','staffing','licensing_review','go_live') NOT NULL,
	`title_ar` varchar(512),
	`title_en` varchar(512) NOT NULL,
	`description` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`required_document_codes` json DEFAULT ('[]'),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_intel_license_requirements_id` PRIMARY KEY(`id`),
	CONSTRAINT `sanad_intel_license_requirements_code_unique` UNIQUE(`code`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_service_usage_year` (
	`id` int AUTO_INCREMENT NOT NULL,
	`import_batch_id` int,
	`year` int NOT NULL,
	`rank_order` int NOT NULL,
	`service_name_ar` text,
	`service_name_en` varchar(512),
	`authority_name_ar` text,
	`authority_name_en` varchar(512),
	`demand_volume` int NOT NULL DEFAULT 0,
	`source_ref` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_intel_service_usage_year_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sanad_intel_svc_year_rank` UNIQUE(`year`,`rank_order`)
);

CREATE TABLE IF NOT EXISTS `sanad_intel_workforce_governorate` (
	`id` int AUTO_INCREMENT NOT NULL,
	`import_batch_id` int,
	`governorate_key` varchar(128) NOT NULL,
	`governorate_label` varchar(255) NOT NULL,
	`owner_count` int NOT NULL DEFAULT 0,
	`staff_count` int NOT NULL DEFAULT 0,
	`total_workforce` int NOT NULL DEFAULT 0,
	`as_of_year` int,
	`source_ref` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_intel_workforce_governorate_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sanad_intel_workforce_gov` UNIQUE(`governorate_key`)
);

CREATE TABLE IF NOT EXISTS `sanad_office_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sanad_office_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('owner','manager','staff') NOT NULL DEFAULT 'staff',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sanad_office_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sanad_office_member` UNIQUE(`sanad_office_id`,`user_id`)
);

CREATE TABLE IF NOT EXISTS `sanad_offices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerType` enum('pro_office','typing_centre','admin_bureau','legal_services','attestation','visa_services','business_setup','other') NOT NULL DEFAULT 'pro_office',
	`name` varchar(255) NOT NULL,
	`nameAr` varchar(255),
	`description` text,
	`licenseNumber` varchar(100),
	`location` varchar(255),
	`city` varchar(100),
	`governorate` varchar(100),
	`phone` varchar(32),
	`email` varchar(320),
	`website` varchar(255),
	`contactPerson` varchar(255),
	`status` enum('active','inactive','pending_approval','suspended') NOT NULL DEFAULT 'active',
	`services` json DEFAULT ('[]'),
	`rating` decimal(3,2) DEFAULT '0',
	`totalOrders` int DEFAULT 0,
	`openingHours` varchar(255),
	`isVerified` boolean DEFAULT false,
	`notes` text,
	`is_public_listed` int NOT NULL DEFAULT 0,
	`licence_number` varchar(100),
	`licence_expiry` date,
	`verified_at` timestamp,
	`languages` varchar(255) DEFAULT 'Arabic,English',
	`logo_url` text,
	`description_ar` text,
	`avg_rating` decimal(3,2) DEFAULT '0',
	`total_reviews` int NOT NULL DEFAULT 0,
	`response_time_hours` int DEFAULT 24,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_offices_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_rating_replies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rating_id` int NOT NULL,
	`replied_by_user_id` int NOT NULL,
	`reply_body` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_rating_replies_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`office_id` int NOT NULL,
	`company_id` int NOT NULL,
	`reviewer_user_id` int NOT NULL,
	`service_request_id` int,
	`overall_rating` int NOT NULL,
	`speed_rating` int,
	`quality_rating` int,
	`communication_rating` int,
	`review_title` varchar(255),
	`review_body` text,
	`is_verified` boolean NOT NULL DEFAULT false,
	`is_published` boolean NOT NULL DEFAULT true,
	`moderation_note` text,
	`moderated_by` int,
	`moderated_at` timestamp,
	`helpful_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_ratings_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_service_catalogue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`office_id` int NOT NULL,
	`service_type` varchar(100) NOT NULL,
	`service_name` varchar(255) NOT NULL,
	`service_name_ar` varchar(255),
	`price_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`processing_days` int NOT NULL DEFAULT 3,
	`description` text,
	`description_ar` text,
	`is_active` int NOT NULL DEFAULT 1,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_service_catalogue_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `sanad_service_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`office_id` int NOT NULL,
	`requester_company_id` int,
	`requester_user_id` int,
	`service_type` varchar(100) NOT NULL,
	`service_catalogue_id` int,
	`contact_name` varchar(255) NOT NULL,
	`contact_phone` varchar(50) NOT NULL,
	`contact_email` varchar(255),
	`company_name` varchar(255),
	`company_cr` varchar(100),
	`message` text,
	`status` enum('new','contacted','in_progress','completed','declined') NOT NULL DEFAULT 'new',
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sanad_service_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `service_quotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int,
	`reference_number` varchar(50) NOT NULL,
	`client_name` varchar(255) NOT NULL,
	`client_email` varchar(255),
	`client_phone` varchar(50),
	`subtotal_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`vat_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`total_omr` decimal(10,3) NOT NULL DEFAULT '0',
	`validity_days` int NOT NULL DEFAULT 30,
	`status` enum('draft','sent','accepted','declined','expired') NOT NULL DEFAULT 'draft',
	`notes` text,
	`terms` text,
	`pdf_url` varchar(1024),
	`sent_at` timestamp,
	`accepted_at` timestamp,
	`declined_at` timestamp,
	`decline_reason` text,
	`converted_to_contract_id` int,
	`crm_deal_id` int,
	`crm_contact_id` int,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_quotations_id` PRIMARY KEY(`id`),
	CONSTRAINT `service_quotations_reference_number_unique` UNIQUE(`reference_number`)
);

CREATE TABLE IF NOT EXISTS `service_sla_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`service_type` varchar(100) NOT NULL,
	`priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
	`target_hours` int NOT NULL,
	`escalation_hours` int NOT NULL,
	`breach_action` enum('notify','escalate','auto_reassign') NOT NULL DEFAULT 'notify',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `service_sla_rules_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `shift_change_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`request_type` enum('shift_change','time_off','early_leave','late_arrival','day_swap') NOT NULL,
	`requested_date` date NOT NULL,
	`requested_end_date` date,
	`preferred_shift_id` int,
	`requested_time` varchar(5),
	`reason` text NOT NULL,
	`request_status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`admin_notes` text,
	`attachment_url` varchar(1000),
	`reviewed_by_user_id` int,
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_change_requests_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `shift_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`start_time` varchar(5) NOT NULL,
	`end_time` varchar(5) NOT NULL,
	`break_minutes` int NOT NULL DEFAULT 0,
	`grace_period_minutes` int NOT NULL DEFAULT 15,
	`color` varchar(20) DEFAULT '#ef4444',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shift_templates_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `subscription_invoices` (
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

CREATE TABLE IF NOT EXISTS `subscription_plans` (
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

CREATE TABLE IF NOT EXISTS `survey_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`response_id` int NOT NULL,
	`question_id` int NOT NULL,
	`answer_value` text,
	`selected_options` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `survey_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_survey_answers_response_question` UNIQUE(`response_id`,`question_id`)
);

CREATE TABLE IF NOT EXISTS `survey_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`question_id` int NOT NULL,
	`value` varchar(100) NOT NULL,
	`label_en` varchar(500) NOT NULL,
	`label_ar` varchar(500) NOT NULL,
	`score` int NOT NULL DEFAULT 0,
	`sort_order` int NOT NULL DEFAULT 0,
	`tags` json,
	CONSTRAINT `survey_options_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `survey_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
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
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `survey_questions_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `survey_response_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`response_id` int NOT NULL,
	`tag_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `survey_response_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_survey_response_tags` UNIQUE(`response_id`,`tag_id`)
);

CREATE TABLE IF NOT EXISTS `survey_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`survey_id` int NOT NULL,
	`user_id` int,
	`sanad_office_id` int,
	`resume_token` varchar(64) NOT NULL,
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
	`completion_invite_email_sent_at` timestamp,
	`nurture_followup_count` int NOT NULL DEFAULT 0,
	`nurture_last_sent_at` timestamp,
	`nurture_stopped_at` timestamp,
	`nurture_stopped_reason` varchar(32),
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `survey_responses_id` PRIMARY KEY(`id`),
	CONSTRAINT `survey_responses_resume_token_unique` UNIQUE(`resume_token`)
);

CREATE TABLE IF NOT EXISTS `survey_sanad_office_outreach` (
	`id` int AUTO_INCREMENT NOT NULL,
	`survey_id` int NOT NULL,
	`sanad_office_id` int NOT NULL,
	`batch_id` varchar(36) NOT NULL,
	`channel` enum('email','whatsapp_api') NOT NULL,
	`outcome` enum('sent','failed','skipped_no_email','skipped_no_phone') NOT NULL,
	`detail` varchar(500),
	`actor_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `survey_sanad_office_outreach_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `survey_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`survey_id` int NOT NULL,
	`slug` varchar(100) NOT NULL,
	`title_en` varchar(255) NOT NULL,
	`title_ar` varchar(255) NOT NULL,
	`description_en` text,
	`description_ar` text,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `survey_sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_survey_sections_survey_slug` UNIQUE(`survey_id`,`slug`)
);

CREATE TABLE IF NOT EXISTS `survey_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`label_en` varchar(255) NOT NULL,
	`label_ar` varchar(255) NOT NULL,
	`category` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `survey_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `survey_tags_slug_unique` UNIQUE(`slug`)
);

CREATE TABLE IF NOT EXISTS `surveys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
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
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `surveys_id` PRIMARY KEY(`id`),
	CONSTRAINT `surveys_slug_unique` UNIQUE(`slug`)
);

CREATE TABLE IF NOT EXISTS `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` text,
	`category` varchar(50) NOT NULL DEFAULT 'general',
	`description` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);

CREATE TABLE IF NOT EXISTS `training_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`title` varchar(300) NOT NULL,
	`provider` varchar(200),
	`description` text,
	`start_date` date,
	`end_date` date,
	`due_date` date,
	`duration_hours` int,
	`training_category` enum('technical','compliance','leadership','safety','soft_skills','other') NOT NULL DEFAULT 'other',
	`training_status` enum('assigned','in_progress','completed','overdue') NOT NULL DEFAULT 'assigned',
	`score` int,
	`certificate_url` varchar(1000),
	`assigned_by_user_id` int,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `training_records_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `user_auth_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`provider_subject_id` varchar(255) NOT NULL,
	`provider_email` varchar(320),
	`is_primary` boolean NOT NULL DEFAULT false,
	`linked_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp,
	CONSTRAINT `user_auth_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_auth_provider_subject` UNIQUE(`provider`,`provider_subject_id`)
);

CREATE TABLE IF NOT EXISTS `user_onboarding_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`company_id` int NOT NULL,
	`step_key` varchar(64) NOT NULL,
	`status` enum('pending','completed','skipped') NOT NULL DEFAULT 'pending',
	`completed_at` timestamp,
	`skipped_at` timestamp,
	`auto_completed` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_onboarding_progress_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_onboarding_user_company_step` UNIQUE(`user_id`,`company_id`,`step_key`)
);

CREATE TABLE IF NOT EXISTS `user_profiles` (
	`user_id` int NOT NULL,
	`first_name` varchar(255),
	`last_name` varchar(255),
	`phone` varchar(32),
	`avatar_url` text,
	`locale` varchar(32),
	`timezone` varchar(64),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_user_id` PRIMARY KEY(`user_id`)
);

CREATE TABLE IF NOT EXISTS `user_security_settings` (
	`user_id` int NOT NULL,
	`two_factor_enabled` boolean NOT NULL DEFAULT false,
	`two_factor_verified_at` timestamp,
	`recovery_codes_hash` text,
	`requires_step_up_auth` boolean NOT NULL DEFAULT false,
	`password_last_changed_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_security_settings_user_id` PRIMARY KEY(`user_id`)
);

CREATE TABLE IF NOT EXISTS `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`primary_email` varchar(320),
	`email_normalized` varchar(320),
	`display_name` text,
	`phone` varchar(32),
	`avatarUrl` text,
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`platformRole` enum('super_admin','platform_admin','regional_manager','client_services','finance_admin','hr_admin','company_admin','company_member','reviewer','client','external_auditor','sanad_network_admin','sanad_compliance_reviewer') NOT NULL DEFAULT 'client',
	`isActive` boolean NOT NULL DEFAULT true,
	`account_status` enum('active','invited','suspended','merged','archived') NOT NULL DEFAULT 'active',
	`merged_into_user_id` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	`two_factor_enabled` boolean NOT NULL DEFAULT false,
	`two_factor_secret_encrypted` text,
	`two_factor_backup_codes_json` text,
	`two_factor_verified_at` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);

CREATE TABLE IF NOT EXISTS `work_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_user_id` int NOT NULL,
	`log_date` date NOT NULL,
	`start_time` varchar(5),
	`end_time` varchar(5),
	`hours_worked` varchar(10),
	`project_name` varchar(200),
	`task_description` text NOT NULL,
	`log_category` enum('development','meeting','admin','support','training','other') NOT NULL DEFAULT 'other',
	`log_status` enum('draft','submitted','approved') NOT NULL DEFAULT 'submitted',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_logs_id` PRIMARY KEY(`id`)
);

CREATE TABLE IF NOT EXISTS `work_permits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`employeeId` int NOT NULL,
	`branchId` int,
	`provider` varchar(50) NOT NULL DEFAULT 'mol',
	`workPermitNumber` varchar(100) NOT NULL,
	`labourAuthorisationNumber` varchar(100),
	`issueDate` timestamp,
	`expiryDate` timestamp,
	`graceDate` timestamp,
	`statusDate` timestamp,
	`durationMonths` int,
	`permitStatus` enum('active','expiring_soon','expired','in_grace','cancelled','transferred','pending_update','unknown') NOT NULL DEFAULT 'unknown',
	`transferStatus` varchar(100),
	`skillLevel` varchar(100),
	`occupationCode` varchar(50),
	`occupationTitleEn` varchar(255),
	`occupationTitleAr` varchar(255),
	`occupationClass` varchar(100),
	`activityCode` varchar(50),
	`activityNameEn` varchar(255),
	`activityNameAr` varchar(255),
	`workLocationGovernorate` varchar(100),
	`workLocationWilayat` varchar(100),
	`workLocationArea` varchar(255),
	`governmentSnapshot` json,
	`lastSyncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_permits_id` PRIMARY KEY(`id`),
	CONSTRAINT `work_permits_workPermitNumber_unique` UNIQUE(`workPermitNumber`)
);

CREATE TABLE IF NOT EXISTS `workforce_health_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`snapshot_date` varchar(10) NOT NULL,
	`total_employees` int NOT NULL DEFAULT 0,
	`avg_completeness_score` varchar(10) NOT NULL DEFAULT '0',
	`critical_count` int NOT NULL DEFAULT 0,
	`warning_count` int NOT NULL DEFAULT 0,
	`incomplete_count` int NOT NULL DEFAULT 0,
	`healthy_count` int NOT NULL DEFAULT 0,
	`expiring_docs_count` int NOT NULL DEFAULT 0,
	`expired_docs_count` int NOT NULL DEFAULT 0,
	`unassigned_count` int NOT NULL DEFAULT 0,
	`omanisation_rate` varchar(10) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `workforce_health_snapshots_id` PRIMARY KEY(`id`)
);
