import mysql from "mysql2/promise";
import { config } from "dotenv";

config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const statements = [
  `CREATE TABLE IF NOT EXISTS \`attendance_client_approval_batches\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`company_id\` int NOT NULL,
    \`site_id\` int,
    \`client_company_id\` int,
    \`promoter_assignment_id\` int,
    \`period_start\` date NOT NULL,
    \`period_end\` date NOT NULL,
    \`status\` enum('draft','submitted','approved','rejected','cancelled') NOT NULL DEFAULT 'draft',
    \`submitted_at\` timestamp NULL,
    \`submitted_by_user_id\` int,
    \`approved_at\` timestamp NULL,
    \`approved_by_user_id\` int,
    \`rejected_at\` timestamp NULL,
    \`rejected_by_user_id\` int,
    \`rejection_reason\` text,
    \`client_comment\` text,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`)
  )`,
  `CREATE INDEX \`idx_acab_company\` ON \`attendance_client_approval_batches\` (\`company_id\`)`,
  `CREATE INDEX \`idx_acab_site\` ON \`attendance_client_approval_batches\` (\`company_id\`,\`site_id\`)`,
  `CREATE INDEX \`idx_acab_status\` ON \`attendance_client_approval_batches\` (\`company_id\`,\`status\`)`,
  `CREATE INDEX \`idx_acab_period\` ON \`attendance_client_approval_batches\` (\`company_id\`,\`period_start\`,\`period_end\`)`,
  `CREATE INDEX \`idx_acab_client\` ON \`attendance_client_approval_batches\` (\`company_id\`,\`client_company_id\`)`,
  `CREATE TABLE IF NOT EXISTS \`attendance_client_approval_items\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`batch_id\` int NOT NULL,
    \`company_id\` int NOT NULL,
    \`employee_id\` int NOT NULL,
    \`attendance_date\` date NOT NULL,
    \`attendance_record_id\` int,
    \`attendance_session_id\` int,
    \`daily_state_json\` json,
    \`status\` enum('pending','approved','rejected','disputed') NOT NULL DEFAULT 'pending',
    \`client_comment\` text,
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_acai_batch_employee_date\` (\`batch_id\`,\`employee_id\`,\`attendance_date\`)
  )`,
  `CREATE INDEX \`idx_acai_batch\` ON \`attendance_client_approval_items\` (\`batch_id\`)`,
  `CREATE INDEX \`idx_acai_company\` ON \`attendance_client_approval_items\` (\`company_id\`)`,
  `CREATE INDEX \`idx_acai_employee\` ON \`attendance_client_approval_items\` (\`company_id\`,\`employee_id\`)`,
  `CREATE INDEX \`idx_acai_status\` ON \`attendance_client_approval_items\` (\`batch_id\`,\`status\`)`,
];

for (const stmt of statements) {
  try {
    await conn.execute(stmt);
    const firstLine = stmt.trim().split("\n")[0].slice(0, 80);
    console.log("✓", firstLine);
  } catch (err) {
    if (err.code === "ER_TABLE_EXISTS_ERROR" || err.code === "ER_DUP_KEYNAME") {
      console.log("⚠ already exists, skipping:", err.message);
    } else {
      console.error("✗ FAILED:", err.message);
    }
  }
}

await conn.end();
console.log("\nDone.");
