-- Add schedule_id column to attendance_records for explicit shift attribution
ALTER TABLE `attendance_records` ADD COLUMN `schedule_id` int;
