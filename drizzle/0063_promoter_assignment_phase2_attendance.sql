-- Phase 2: assignment-centered attendance linkage (promoter deployments).
-- `promoter_assignments` remains operational truth; attendance rows optionally reference it.

ALTER TABLE `attendance_records`
  ADD COLUMN `promoter_assignment_id` CHAR(36) NULL
    COMMENT 'FK to promoter_assignments.id when resolved for promoter flow'
    AFTER `site_id`;

ALTER TABLE `attendance_sessions`
  ADD COLUMN `promoter_assignment_id` CHAR(36) NULL
    COMMENT 'Mirrors attendance_records linkage for session-based reporting'
    AFTER `site_id`;

CREATE INDEX `idx_att_rec_promoter_assignment` ON `attendance_records` (`promoter_assignment_id`);
CREATE INDEX `idx_att_sess_promoter_assignment` ON `attendance_sessions` (`promoter_assignment_id`);
