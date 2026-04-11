-- Multi-shift attendance: explicit shift attribution on attendance records
ALTER TABLE `attendance_records` ADD COLUMN `schedule_id` int;

-- Explicit shift intent on manual check-in requests (employee selects target shift)
ALTER TABLE `manual_checkin_requests` ADD COLUMN `requested_business_date` varchar(10);
ALTER TABLE `manual_checkin_requests` ADD COLUMN `requested_schedule_id` int;
