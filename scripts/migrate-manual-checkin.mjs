import mysql from "mysql2/promise";

const db = await mysql.createConnection(process.env.DATABASE_URL);

await db.execute(`
  CREATE TABLE IF NOT EXISTS manual_checkin_requests (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    employee_user_id INT NOT NULL,
    site_id INT NOT NULL,
    requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    justification TEXT NOT NULL,
    lat DECIMAL(10,7),
    lng DECIMAL(10,7),
    distance_meters INT,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    reviewed_by_user_id INT,
    reviewed_at TIMESTAMP NULL,
    admin_note TEXT,
    attendance_record_id INT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mcr_company (company_id),
    INDEX idx_mcr_employee (employee_user_id),
    INDEX idx_mcr_site (site_id),
    INDEX idx_mcr_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`);

console.log("✅ manual_checkin_requests table created");
await db.end();
