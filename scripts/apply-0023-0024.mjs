import { createPool } from "mysql2/promise";

const rawUrl = process.env.DATABASE_URL;
const urlObj = new URL(rawUrl);
const pool = createPool({
  host: urlObj.hostname,
  port: Number(urlObj.port) || 4000,
  user: urlObj.username,
  password: urlObj.password,
  database: urlObj.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  {
    name: "0023_employee_accountability",
    sql: `CREATE TABLE IF NOT EXISTS \`employee_accountability\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`company_id\` int NOT NULL,
  \`employee_id\` int NOT NULL,
  \`department_id\` int,
  \`business_role_key\` varchar(64),
  \`responsibilities\` json,
  \`kpi_category_keys\` json,
  \`review_cadence\` enum('daily','weekly','biweekly','monthly') NOT NULL DEFAULT 'weekly',
  \`escalation_employee_id\` int,
  \`notes\` text,
  \`created_at\` timestamp NOT NULL DEFAULT (now()),
  \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`employee_accountability_id\` PRIMARY KEY(\`id\`),
  UNIQUE KEY \`uniq_emp_accountability_company_employee\` (\`company_id\`,\`employee_id\`),
  KEY \`idx_ea_company\` (\`company_id\`),
  KEY \`idx_ea_employee\` (\`employee_id\`)
)`,
  },
  {
    name: "0024_performance_interventions",
    sql: `CREATE TABLE IF NOT EXISTS \`performance_interventions\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`company_id\` int NOT NULL,
  \`employee_id\` int NOT NULL,
  \`manager_user_id\` int NOT NULL,
  \`status\` enum('open','closed','escalated') NOT NULL DEFAULT 'open',
  \`kind\` enum('request_update','corrective_task','follow_up','under_review','escalate') NOT NULL,
  \`follow_up_at\` timestamp NULL,
  \`linked_task_id\` int NULL,
  \`note\` text,
  \`closed_at\` timestamp NULL,
  \`created_at\` timestamp NOT NULL DEFAULT (now()),
  \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`performance_interventions_id\` PRIMARY KEY(\`id\`),
  KEY \`idx_pi_company\` (\`company_id\`),
  KEY \`idx_pi_employee\` (\`employee_id\`),
  KEY \`idx_pi_employee_open\` (\`company_id\`,\`employee_id\`,\`status\`)
)`,
  },
];

for (const { name, sql } of migrations) {
  try {
    await pool.execute(sql);
    console.log(`✅ ${name} applied`);
  } catch (e) {
    if (e.code === "ER_TABLE_EXISTS_ERROR" || e.message?.includes("already exists")) {
      console.log(`ℹ️  ${name}: table already exists, skipping`);
    } else {
      console.error(`❌ ${name} failed:`, e.message);
      process.exit(1);
    }
  }
}

await pool.end();
console.log("Done.");
