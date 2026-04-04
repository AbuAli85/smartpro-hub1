import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await mysql.createConnection(url);

const tables = [
  {
    name: "work_logs",
    sql: `CREATE TABLE IF NOT EXISTS work_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      employee_user_id INT NOT NULL,
      log_date DATE NOT NULL,
      start_time VARCHAR(5),
      end_time VARCHAR(5),
      hours_worked VARCHAR(10),
      project_name VARCHAR(200),
      task_description TEXT NOT NULL,
      log_category ENUM('development','meeting','admin','support','training','other') NOT NULL DEFAULT 'other',
      log_status ENUM('draft','submitted','approved') NOT NULL DEFAULT 'submitted',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_wl_company (company_id),
      INDEX idx_wl_employee (employee_user_id),
      INDEX idx_wl_date (log_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  },
  {
    name: "expense_claims",
    sql: `CREATE TABLE IF NOT EXISTS expense_claims (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      employee_user_id INT NOT NULL,
      claim_date DATE NOT NULL,
      expense_category ENUM('travel','meals','accommodation','equipment','communication','training','medical','other') NOT NULL,
      amount VARCHAR(20) NOT NULL,
      currency VARCHAR(5) NOT NULL DEFAULT 'OMR',
      description TEXT NOT NULL,
      receipt_url VARCHAR(1000),
      expense_status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      reviewed_by_user_id INT,
      reviewed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ec_company (company_id),
      INDEX idx_ec_employee (employee_user_id),
      INDEX idx_ec_status (expense_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  },
  {
    name: "training_records",
    sql: `CREATE TABLE IF NOT EXISTS training_records (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      employee_user_id INT NOT NULL,
      title VARCHAR(300) NOT NULL,
      provider VARCHAR(200),
      description TEXT,
      start_date DATE,
      end_date DATE,
      due_date DATE,
      duration_hours INT,
      training_category ENUM('technical','compliance','leadership','safety','soft_skills','other') NOT NULL DEFAULT 'other',
      training_status ENUM('assigned','in_progress','completed','overdue') NOT NULL DEFAULT 'assigned',
      score INT,
      certificate_url VARCHAR(1000),
      assigned_by_user_id INT,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tr_company (company_id),
      INDEX idx_tr_employee (employee_user_id),
      INDEX idx_tr_status (training_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  },
  {
    name: "employee_self_reviews",
    sql: `CREATE TABLE IF NOT EXISTS employee_self_reviews (
      id INT PRIMARY KEY AUTO_INCREMENT,
      company_id INT NOT NULL,
      employee_user_id INT NOT NULL,
      review_period VARCHAR(50) NOT NULL,
      self_rating INT,
      manager_rating INT,
      self_achievements TEXT,
      self_goals TEXT,
      manager_feedback TEXT,
      goals_next_period TEXT,
      review_status ENUM('draft','submitted','reviewed','acknowledged') NOT NULL DEFAULT 'draft',
      submitted_at TIMESTAMP NULL,
      reviewed_at TIMESTAMP NULL,
      reviewed_by_user_id INT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_esr_company (company_id),
      INDEX idx_esr_employee (employee_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  }
];

for (const t of tables) {
  try {
    await conn.execute(t.sql);
    console.log(`✅ ${t.name} created/verified`);
  } catch (e) {
    console.error(`❌ ${t.name}: ${e.message}`);
  }
}

await conn.end();
console.log("Done.");
