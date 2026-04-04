CREATE TABLE `shift_change_requests` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
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
  `reviewed_by_user_id` int,
  `reviewed_at` timestamp,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
