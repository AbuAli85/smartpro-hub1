/**
 * Apply missing migrations: departments, positions, employee_tasks, announcements,
 * announcement_reads, attendance_corrections, shift_change_requests, hr_letters,
 * and extended profile columns.
 *
 * Uses IF NOT EXISTS / IF NOT COLUMN EXISTS patterns to be idempotent.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const statements = [
  // 0003: Extended company profile fields
  `ALTER TABLE \`companies\`
    ADD COLUMN IF NOT EXISTS \`crNumber\` varchar(100),
    ADD COLUMN IF NOT EXISTS \`occiNumber\` varchar(100),
    ADD COLUMN IF NOT EXISTS \`municipalityLicenceNumber\` varchar(100),
    ADD COLUMN IF NOT EXISTS \`laborCardNumber\` varchar(100),
    ADD COLUMN IF NOT EXISTS \`pasiNumber\` varchar(100),
    ADD COLUMN IF NOT EXISTS \`bankName\` varchar(255),
    ADD COLUMN IF NOT EXISTS \`bankAccountNumber\` varchar(100),
    ADD COLUMN IF NOT EXISTS \`bankIban\` varchar(50),
    ADD COLUMN IF NOT EXISTS \`omanisationTarget\` decimal(5,2),
    ADD COLUMN IF NOT EXISTS \`foundedYear\` int,
    ADD COLUMN IF NOT EXISTS \`description\` text`,

  // 0003: Extended employee fields
  `ALTER TABLE \`employees\`
    ADD COLUMN IF NOT EXISTS \`dateOfBirth\` date,
    ADD COLUMN IF NOT EXISTS \`gender\` enum('male','female'),
    ADD COLUMN IF NOT EXISTS \`maritalStatus\` enum('single','married','divorced','widowed'),
    ADD COLUMN IF NOT EXISTS \`profession\` varchar(150),
    ADD COLUMN IF NOT EXISTS \`visaNumber\` varchar(50),
    ADD COLUMN IF NOT EXISTS \`visaExpiryDate\` date,
    ADD COLUMN IF NOT EXISTS \`workPermitNumber\` varchar(50),
    ADD COLUMN IF NOT EXISTS \`workPermitExpiryDate\` date,
    ADD COLUMN IF NOT EXISTS \`pasiNumber\` varchar(50),
    ADD COLUMN IF NOT EXISTS \`bankName\` varchar(255),
    ADD COLUMN IF NOT EXISTS \`bankAccountNumber\` varchar(100),
    ADD COLUMN IF NOT EXISTS \`emergencyContactName\` varchar(255),
    ADD COLUMN IF NOT EXISTS \`emergencyContactPhone\` varchar(32)`,

  // 0004: HR Letters
  `CREATE TABLE IF NOT EXISTS \`hr_letters\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
    \`company_id\` int NOT NULL,
    \`employee_id\` int NOT NULL,
    \`letter_type\` varchar(64) NOT NULL,
    \`language\` varchar(8) NOT NULL DEFAULT 'en',
    \`reference_number\` varchar(64),
    \`subject\` varchar(512),
    \`body_en\` text,
    \`body_ar\` text,
    \`issued_to\` varchar(255),
    \`purpose\` text,
    \`additional_notes\` text,
    \`is_deleted\` boolean NOT NULL DEFAULT false,
    \`created_by\` int,
    \`created_at\` timestamp DEFAULT (now()) NOT NULL,
    \`updated_at\` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP NOT NULL
  )`,

  // 0005: Departments
  `CREATE TABLE IF NOT EXISTS \`departments\` (
    \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    \`company_id\` int NOT NULL,
    \`name\` varchar(128) NOT NULL,
    \`name_ar\` varchar(128),
    \`description\` text,
    \`head_employee_id\` int,
    \`is_active\` boolean NOT NULL DEFAULT true,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // 0005: Positions
  `CREATE TABLE IF NOT EXISTS \`positions\` (
    \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    \`company_id\` int NOT NULL,
    \`department_id\` int,
    \`title\` varchar(128) NOT NULL,
    \`title_ar\` varchar(128),
    \`description\` text,
    \`is_active\` boolean NOT NULL DEFAULT true,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // 0005: Employee Tasks
  `CREATE TABLE IF NOT EXISTS \`employee_tasks\` (
    \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    \`company_id\` int NOT NULL,
    \`assigned_to_employee_id\` int NOT NULL,
    \`assigned_by_user_id\` int NOT NULL,
    \`title\` varchar(255) NOT NULL,
    \`description\` text,
    \`priority\` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
    \`status\` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
    \`due_date\` date,
    \`completed_at\` timestamp,
    \`notes\` text,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // 0005: Announcements
  `CREATE TABLE IF NOT EXISTS \`announcements\` (
    \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    \`company_id\` int NOT NULL,
    \`created_by_user_id\` int NOT NULL,
    \`title\` varchar(255) NOT NULL,
    \`body\` text NOT NULL,
    \`type\` enum('announcement','request','alert','reminder') NOT NULL DEFAULT 'announcement',
    \`target_employee_id\` int,
    \`is_deleted\` boolean NOT NULL DEFAULT false,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // 0005: Announcement reads
  `CREATE TABLE IF NOT EXISTS \`announcement_reads\` (
    \`id\` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
    \`announcement_id\` int NOT NULL,
    \`employee_id\` int NOT NULL,
    \`read_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  // 0006: Attendance corrections
  `CREATE TABLE IF NOT EXISTS \`attendance_corrections\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
    \`company_id\` int NOT NULL,
    \`employee_id\` int NOT NULL,
    \`employee_user_id\` int NOT NULL,
    \`attendance_record_id\` int,
    \`requested_date\` varchar(10) NOT NULL,
    \`requested_check_in\` varchar(8),
    \`requested_check_out\` varchar(8),
    \`reason\` text NOT NULL,
    \`ac_status\` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    \`admin_note\` text,
    \`reviewed_by_user_id\` int,
    \`reviewed_at\` timestamp,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,

  // 0007: Shift change requests
  `CREATE TABLE IF NOT EXISTS \`shift_change_requests\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
    \`company_id\` int NOT NULL,
    \`employee_user_id\` int NOT NULL,
    \`request_type\` enum('shift_change','time_off','early_leave','late_arrival','day_swap') NOT NULL,
    \`requested_date\` date NOT NULL,
    \`requested_end_date\` date,
    \`preferred_shift_id\` int,
    \`requested_time\` varchar(5),
    \`reason\` text NOT NULL,
    \`request_status\` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
    \`admin_notes\` text,
    \`reviewed_by_user_id\` int,
    \`reviewed_at\` timestamp,
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
  )`,
];

let success = 0;
let skipped = 0;
let failed = 0;

for (const sql of statements) {
  const label = sql.trim().split("\n")[0].substring(0, 60);
  try {
    await conn.execute(sql);
    console.log(`✅ OK: ${label}`);
    success++;
  } catch (err) {
    if (err.code === "ER_TABLE_EXISTS_ERROR" || err.code === "ER_DUP_FIELDNAME") {
      console.log(`⏭  SKIP (already exists): ${label}`);
      skipped++;
    } else {
      console.error(`❌ FAIL: ${label}`);
      console.error(`   ${err.message}`);
      failed++;
    }
  }
}

await conn.end();
console.log(`\nDone: ${success} applied, ${skipped} skipped, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
