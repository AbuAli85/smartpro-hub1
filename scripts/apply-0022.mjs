import { createPool } from "mysql2/promise";

const rawUrl = process.env.DATABASE_URL;
// Strip query string for URL parsing
const urlObj = new URL(rawUrl);
const pool = createPool({
  host: urlObj.hostname,
  port: Number(urlObj.port) || 4000,
  user: urlObj.username,
  password: urlObj.password,
  database: urlObj.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

const sql = `CREATE TABLE IF NOT EXISTS \`collection_work_items\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`company_id\` int NOT NULL,
  \`source_type\` enum('pro_billing_cycle','subscription_invoice') NOT NULL,
  \`source_id\` int NOT NULL,
  \`workflow_status\` enum('needs_follow_up','promised_to_pay','escalated','disputed','resolved') NOT NULL DEFAULT 'needs_follow_up',
  \`note\` text,
  \`updated_by_user_id\` int,
  \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`collection_work_items_id\` PRIMARY KEY(\`id\`),
  CONSTRAINT \`uniq_collection_work_source\` UNIQUE(\`source_type\`,\`source_id\`),
  KEY \`idx_cwi_company\` (\`company_id\`)
)`;

try {
  await pool.execute(sql);
  console.log("✅ Migration 0022 applied: collection_work_items table created");
} catch (e) {
  if (e.code === "ER_TABLE_EXISTS_ERROR" || e.message?.includes("already exists")) {
    console.log("ℹ️  Table already exists, skipping");
  } else {
    console.error("❌ Error:", e.message);
    process.exit(1);
  }
} finally {
  await pool.end();
}
