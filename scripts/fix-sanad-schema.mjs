/**
 * Fix SANAD intelligence table schema mismatches between old migration 0025
 * and the current Drizzle schema definitions.
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
  multipleStatements: true,
});

const fixes = [
  // sanad_intel_geography_stats: rename year->remove, add governorate_label, wilayat, village; remove wilayat_key, village_key
  `ALTER TABLE \`sanad_intel_geography_stats\`
    ADD COLUMN \`governorate_label\` varchar(255) NOT NULL DEFAULT '' AFTER \`governorate_key\`,
    ADD COLUMN \`wilayat\` varchar(255) NULL AFTER \`governorate_label\`,
    ADD COLUMN \`village\` varchar(255) NULL AFTER \`wilayat\`,
    DROP COLUMN \`year\`,
    DROP COLUMN \`wilayat_key\`,
    DROP COLUMN \`village_key\``,

  // sanad_intel_service_usage_year: rename entity_name->authority_name_en, service_name->service_name_en, usage_count->demand_volume, rank_in_year->rank_order; add missing columns
  `ALTER TABLE \`sanad_intel_service_usage_year\`
    ADD COLUMN \`rank_order\` int NOT NULL DEFAULT 0 AFTER \`year\`,
    ADD COLUMN \`service_name_ar\` text NULL AFTER \`rank_order\`,
    ADD COLUMN \`service_name_en\` varchar(512) NULL AFTER \`service_name_ar\`,
    ADD COLUMN \`authority_name_ar\` text NULL AFTER \`service_name_en\`,
    ADD COLUMN \`authority_name_en\` varchar(512) NULL AFTER \`authority_name_ar\`,
    ADD COLUMN \`demand_volume\` int NOT NULL DEFAULT 0 AFTER \`authority_name_en\`,
    DROP COLUMN \`entity_name\`,
    DROP COLUMN \`service_name\`,
    DROP COLUMN \`usage_count\`,
    DROP COLUMN \`rank_in_year\``,

  // sanad_intel_centers: rename wilayat_key->wilayat, village_key->village; add governorate_label, wilayat_label, village_label, center_name_ar, phone, email, address, is_active
  `ALTER TABLE \`sanad_intel_centers\`
    ADD COLUMN \`governorate_label\` varchar(255) NULL AFTER \`governorate_key\`,
    ADD COLUMN \`wilayat\` varchar(255) NULL AFTER \`governorate_label\`,
    ADD COLUMN \`wilayat_label\` varchar(255) NULL AFTER \`wilayat\`,
    ADD COLUMN \`village\` varchar(255) NULL AFTER \`wilayat_label\`,
    ADD COLUMN \`village_label\` varchar(255) NULL AFTER \`village\`,
    ADD COLUMN \`center_name_ar\` text NULL AFTER \`center_name\`,
    ADD COLUMN \`phone\` varchar(64) NULL AFTER \`contact_info\`,
    ADD COLUMN \`email\` varchar(255) NULL AFTER \`phone\`,
    ADD COLUMN \`address\` text NULL AFTER \`email\`,
    ADD COLUMN \`is_active\` tinyint(1) NOT NULL DEFAULT 1 AFTER \`address\`,
    DROP COLUMN \`wilayat_key\`,
    DROP COLUMN \`village_key\``,

  // sanad_intel_center_operations: add missing columns compliance_overall, internal_tags, compliance_flags->keep but add new ones
  `ALTER TABLE \`sanad_intel_center_operations\`
    ADD COLUMN \`compliance_overall\` enum('not_assessed','partial','complete','at_risk') NOT NULL DEFAULT 'not_assessed' AFTER \`onboarding_status\`,
    ADD COLUMN \`internal_tags\` json NOT NULL DEFAULT (json_array()) AFTER \`compliance_overall\`,
    DROP COLUMN \`compliance_flags\``,

  // sanad_intel_center_compliance_items: rename requirement_key->add requirement_id; add missing columns
  `ALTER TABLE \`sanad_intel_center_compliance_items\`
    ADD COLUMN \`requirement_id\` int NOT NULL DEFAULT 0 AFTER \`center_id\`,
    ADD COLUMN \`evidence_note\` text NULL AFTER \`status\`,
    ADD COLUMN \`reviewed_by_user_id\` int NULL AFTER \`evidence_note\`,
    DROP COLUMN \`requirement_key\`,
    DROP COLUMN \`due_date\`,
    DROP COLUMN \`resolved_at\`,
    DROP COLUMN \`notes\`,
    DROP COLUMN \`created_at\``,

  // sanad_intel_workforce_governorate: no changes needed (already has governorate_label)

  // sanad_intel_center_metrics_yearly: rename transaction_count and income_amount (already correct names)
  // employee_count column needs to be dropped (not in schema)
  `ALTER TABLE \`sanad_intel_center_metrics_yearly\`
    DROP COLUMN \`employee_count\``,

  // Create sanad_intel_license_requirements table (missing from original migration)
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_license_requirements\` (
    \`id\` int AUTO_INCREMENT PRIMARY KEY,
    \`code\` varchar(64) NOT NULL UNIQUE,
    \`category\` varchar(64) NOT NULL,
    \`onboarding_stage\` enum('intake','documentation','premises','staffing','licensing_review','go_live') NOT NULL,
    \`title_ar\` varchar(512),
    \`title_en\` varchar(512) NOT NULL,
    \`description\` text,
    \`sort_order\` int NOT NULL DEFAULT 0,
    \`required_document_codes\` json DEFAULT (json_array()),
    \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX \`idx_sanad_intel_lic_cat\` (\`category\`),
    INDEX \`idx_sanad_intel_lic_stage\` (\`onboarding_stage\`)
  )`,
];

for (const sql of fixes) {
  try {
    await pool.execute(sql);
    const firstLine = sql.trim().split("\n")[0].slice(0, 80);
    console.log("✓", firstLine);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_CANT_DROP_FIELD_OR_KEY" || e.sqlMessage?.includes("Duplicate column") || e.sqlMessage?.includes("Can't DROP")) {
      console.log("⚠ Already applied (skipping):", e.sqlMessage?.slice(0, 80));
    } else {
      console.error("✗ FAILED:", e.sqlMessage || e.message);
      console.error("  SQL:", sql.trim().slice(0, 120));
    }
  }
}

await pool.end();
console.log("\nDone.");
