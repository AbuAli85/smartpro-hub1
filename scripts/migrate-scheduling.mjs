import mysql from "mysql2/promise";

const db = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS shift_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time VARCHAR(5) NOT NULL,
    end_time VARCHAR(5) NOT NULL,
    grace_period_minutes INT NOT NULL DEFAULT 15,
    color VARCHAR(20) DEFAULT '#ef4444',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS employee_schedules (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    employee_user_id INT NOT NULL,
    site_id INT NOT NULL,
    shift_template_id INT NOT NULL,
    working_days VARCHAR(20) NOT NULL DEFAULT '0,1,2,3,4',
    start_date DATE NOT NULL,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    INDEX idx_es_company (company_id),
    INDEX idx_es_employee (employee_user_id),
    INDEX idx_es_site (site_id)
  )`,

  `CREATE TABLE IF NOT EXISTS company_holidays (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_id INT NOT NULL,
    name VARCHAR(200) NOT NULL,
    holiday_date DATE NOT NULL,
    holiday_type ENUM('public','company','optional') NOT NULL DEFAULT 'public',
    is_recurring_yearly BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    INDEX idx_ch_company (company_id),
    INDEX idx_ch_date (holiday_date)
  )`,
];

for (const sql of statements) {
  const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
  try {
    await db.execute(sql);
    console.log(`✓ Table ${tableName} created/verified`);
  } catch (err) {
    console.error(`✗ Failed to create ${tableName}:`, err.message);
    process.exit(1);
  }
}

await db.end();
console.log("✓ Scheduling migration complete");
