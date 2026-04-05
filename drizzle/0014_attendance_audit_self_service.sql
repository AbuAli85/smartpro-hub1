ALTER TABLE `attendance_audit` MODIFY COLUMN `aa_action_type` enum(
  'hr_attendance_create',
  'hr_attendance_update',
  'hr_attendance_delete',
  'correction_approve',
  'correction_reject',
  'manual_checkin_approve',
  'manual_checkin_reject',
  'self_checkin_allowed',
  'self_checkin_denied',
  'self_checkout',
  'manual_checkin_submit'
) NOT NULL;
