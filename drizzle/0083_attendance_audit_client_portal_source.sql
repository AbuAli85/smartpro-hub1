-- Migration 0083: Add client_portal to attendance_audit.aa_source enum
-- Needed for Phase 10B: external clients approve/reject via JWT token link.

ALTER TABLE `attendance_audit`
  MODIFY COLUMN `aa_source`
    ENUM('hr_panel','employee_portal','admin_panel','system','client_portal')
    NOT NULL DEFAULT 'hr_panel';
