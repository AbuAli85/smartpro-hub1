-- Hot paths: company + day range scans (today board, reports) and employee history.
CREATE INDEX `idx_att_rec_company_checkin` ON `attendance_records` (`company_id`, `check_in`);
CREATE INDEX `idx_att_rec_employee_checkin` ON `attendance_records` (`employee_id`, `check_in`);

-- Employee roster lookups by tenant + employee key + active flag; board-style date filters.
CREATE INDEX `idx_emp_sched_company_emp_active` ON `employee_schedules` (`company_id`, `employee_user_id`, `is_active`);
CREATE INDEX `idx_emp_sched_company_active_dates` ON `employee_schedules` (`company_id`, `is_active`, `start_date`, `end_date`);
