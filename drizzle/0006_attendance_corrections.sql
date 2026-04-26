CREATE TABLE IF NOT EXISTS `attendance_corrections` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
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
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
