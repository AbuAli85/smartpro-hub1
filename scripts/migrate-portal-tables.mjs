import { createConnection } from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const conn = await createConnection(url);

const sql = `
CREATE TABLE IF NOT EXISTS attendance_sites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  location VARCHAR(255),
  qr_token VARCHAR(64) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_att_site_company (company_id)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  employee_id INT NOT NULL,
  site_id INT,
  site_name VARCHAR(128),
  check_in TIMESTAMP NOT NULL,
  check_out TIMESTAMP NULL,
  check_in_lat DECIMAL(10,7),
  check_in_lng DECIMAL(10,7),
  check_out_lat DECIMAL(10,7),
  check_out_lng DECIMAL(10,7),
  method ENUM('qr_scan','manual','admin') NOT NULL DEFAULT 'qr_scan',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_att_rec_company (company_id),
  INDEX idx_att_rec_employee (employee_id),
  INDEX idx_att_rec_checkin (check_in)
);

CREATE TABLE IF NOT EXISTS employee_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  employee_id INT NOT NULL,
  type ENUM('leave','document','overtime','expense','equipment','training','other') NOT NULL,
  status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  subject VARCHAR(255) NOT NULL,
  details JSON,
  admin_note TEXT,
  reviewed_by_user_id INT,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX idx_emp_req_company (company_id),
  INDEX idx_emp_req_employee (employee_id),
  INDEX idx_emp_req_status (status)
);
`;

// Split and execute each statement
const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
for (const stmt of statements) {
  await conn.execute(stmt);
  console.log("✓", stmt.slice(0, 60).replace(/\n/g, " ") + "...");
}

await conn.end();
console.log("\n✅ Portal tables migration complete.");
