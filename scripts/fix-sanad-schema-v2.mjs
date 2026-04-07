/**
 * Fix SANAD intelligence table schema mismatches - TiDB compatible version.
 * Runs each ADD COLUMN and DROP COLUMN as separate statements.
 */
import mysql from "mysql2/promise";
import { URL } from "url";

const dbUrl = new URL(process.env.DATABASE_URL);
const pool = await mysql.createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "3306"),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1).split("?")[0],
  ssl: { rejectUnauthorized: false },
});

async function exec(sql, label) {
  try {
    await pool.execute(sql);
    console.log("✓", label || sql.slice(0, 80));
  } catch (e) {
    const msg = e.sqlMessage || e.message || "";
    if (
      msg.includes("Duplicate column") ||
      msg.includes("Can't DROP") ||
      msg.includes("check that column") ||
      msg.includes("Unknown column") && sql.includes("DROP COLUMN") ||
      e.code === "ER_DUP_FIELDNAME" ||
      e.code === "ER_CANT_DROP_FIELD_OR_KEY"
    ) {
      console.log("⚠ Skip (already applied):", label || sql.slice(0, 80));
    } else {
      console.error("✗ FAILED:", msg.slice(0, 120));
      console.error("  SQL:", sql.slice(0, 120));
    }
  }
}

// ─── sanad_intel_geography_stats ─────────────────────────────────────────────
// Add new columns
await exec(`ALTER TABLE \`sanad_intel_geography_stats\` ADD COLUMN \`governorate_label\` varchar(255) NOT NULL DEFAULT ''`, "geo: add governorate_label");
await exec(`ALTER TABLE \`sanad_intel_geography_stats\` ADD COLUMN \`wilayat\` varchar(255) NULL`, "geo: add wilayat");
await exec(`ALTER TABLE \`sanad_intel_geography_stats\` ADD COLUMN \`village\` varchar(255) NULL`, "geo: add village");
// Drop old columns
await exec(`ALTER TABLE \`sanad_intel_geography_stats\` DROP COLUMN \`year\``, "geo: drop year");
await exec(`ALTER TABLE \`sanad_intel_geography_stats\` DROP COLUMN \`wilayat_key\``, "geo: drop wilayat_key");
await exec(`ALTER TABLE \`sanad_intel_geography_stats\` DROP COLUMN \`village_key\``, "geo: drop village_key");

// ─── sanad_intel_service_usage_year ──────────────────────────────────────────
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` ADD COLUMN \`rank_order\` int NOT NULL DEFAULT 0`, "svc: add rank_order");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` ADD COLUMN \`service_name_ar\` text NULL`, "svc: add service_name_ar");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` ADD COLUMN \`service_name_en\` varchar(512) NULL`, "svc: add service_name_en");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` ADD COLUMN \`authority_name_ar\` text NULL`, "svc: add authority_name_ar");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` ADD COLUMN \`authority_name_en\` varchar(512) NULL`, "svc: add authority_name_en");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` ADD COLUMN \`demand_volume\` int NOT NULL DEFAULT 0`, "svc: add demand_volume");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` DROP COLUMN \`entity_name\``, "svc: drop entity_name");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` DROP COLUMN \`service_name\``, "svc: drop service_name");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` DROP COLUMN \`usage_count\``, "svc: drop usage_count");
await exec(`ALTER TABLE \`sanad_intel_service_usage_year\` DROP COLUMN \`rank_in_year\``, "svc: drop rank_in_year");

// ─── sanad_intel_centers ─────────────────────────────────────────────────────
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`governorate_label\` varchar(255) NULL`, "centers: add governorate_label");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`wilayat\` varchar(255) NULL`, "centers: add wilayat");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`wilayat_label\` varchar(255) NULL`, "centers: add wilayat_label");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`village\` varchar(255) NULL`, "centers: add village");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`village_label\` varchar(255) NULL`, "centers: add village_label");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`center_name_ar\` text NULL`, "centers: add center_name_ar");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`phone\` varchar(64) NULL`, "centers: add phone");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`email\` varchar(255) NULL`, "centers: add email");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`address\` text NULL`, "centers: add address");
await exec(`ALTER TABLE \`sanad_intel_centers\` ADD COLUMN \`is_active\` tinyint(1) NOT NULL DEFAULT 1`, "centers: add is_active");
await exec(`ALTER TABLE \`sanad_intel_centers\` DROP COLUMN \`wilayat_key\``, "centers: drop wilayat_key");
await exec(`ALTER TABLE \`sanad_intel_centers\` DROP COLUMN \`village_key\``, "centers: drop village_key");

// ─── sanad_intel_center_operations ───────────────────────────────────────────
await exec(`ALTER TABLE \`sanad_intel_center_operations\` ADD COLUMN \`compliance_overall\` enum('not_assessed','partial','complete','at_risk') NOT NULL DEFAULT 'not_assessed'`, "ops: add compliance_overall");
await exec(`ALTER TABLE \`sanad_intel_center_operations\` ADD COLUMN \`internal_tags\` json NOT NULL DEFAULT ('[]')`, "ops: add internal_tags");
await exec(`ALTER TABLE \`sanad_intel_center_operations\` DROP COLUMN \`compliance_flags\``, "ops: drop compliance_flags");

// ─── sanad_intel_center_compliance_items ─────────────────────────────────────
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` ADD COLUMN \`requirement_id\` int NOT NULL DEFAULT 0`, "compliance: add requirement_id");
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` ADD COLUMN \`evidence_note\` text NULL`, "compliance: add evidence_note");
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` ADD COLUMN \`reviewed_by_user_id\` int NULL`, "compliance: add reviewed_by_user_id");
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` DROP COLUMN \`requirement_key\``, "compliance: drop requirement_key");
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` DROP COLUMN \`due_date\``, "compliance: drop due_date");
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` DROP COLUMN \`resolved_at\``, "compliance: drop resolved_at");
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` DROP COLUMN \`notes\``, "compliance: drop notes");
await exec(`ALTER TABLE \`sanad_intel_center_compliance_items\` DROP COLUMN \`created_at\``, "compliance: drop created_at");

await pool.end();
console.log("\n✅ Schema fix complete.");
