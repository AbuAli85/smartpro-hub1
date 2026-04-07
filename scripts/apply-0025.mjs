import { createPool } from "mysql2/promise";
import { URL } from "url";

const dbUrl = new URL(process.env.DATABASE_URL);
const pool = createPool({
  host: dbUrl.hostname,
  port: parseInt(dbUrl.port || "3306"),
  user: dbUrl.username,
  password: dbUrl.password,
  database: dbUrl.pathname.slice(1).split("?")[0],
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
});

// TiDB-compatible migration for 0025 - sanad_network_intelligence
// Fixes: JSON defaults use json_array()/json_object(), FK names shortened to <=64 chars
const statements = [
  // 1. Import batches
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_import_batches\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`batch_key\` varchar(64) NOT NULL,
    \`source_files\` json NOT NULL DEFAULT (json_array()),
    \`row_counts\` json NOT NULL DEFAULT (json_object()),
    \`notes\` text,
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sanad_intel_import_batches_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`sanad_intel_import_batches_batch_key_unique\` UNIQUE(\`batch_key\`),
    KEY \`idx_sanad_intel_batch_created\` (\`created_at\`)
  )`,

  // 2. Governorate year metrics
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_governorate_year_metrics\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`import_batch_id\` int,
    \`year\` int NOT NULL,
    \`governorate_key\` varchar(128) NOT NULL,
    \`governorate_label\` varchar(255) NOT NULL,
    \`transaction_count\` int NOT NULL DEFAULT 0,
    \`income_amount\` decimal(18,2) NOT NULL DEFAULT '0',
    \`source_ref\` varchar(128),
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sanad_intel_governorate_year_metrics_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`uq_sanad_intel_gov_year\` UNIQUE(\`year\`,\`governorate_key\`),
    KEY \`idx_sanad_intel_gov_year_y\` (\`year\`),
    KEY \`idx_sanad_intel_gov_year_k\` (\`governorate_key\`),
    CONSTRAINT \`fk_sanad_gov_batch\` FOREIGN KEY (\`import_batch_id\`) REFERENCES \`sanad_intel_import_batches\`(\`id\`) ON DELETE no action ON UPDATE no action
  )`,

  // 3. Workforce governorate
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_workforce_governorate\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`import_batch_id\` int,
    \`year\` int NOT NULL,
    \`governorate_key\` varchar(128) NOT NULL,
    \`governorate_label\` varchar(255) NOT NULL,
    \`employee_count\` int NOT NULL DEFAULT 0,
    \`source_ref\` varchar(128),
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sanad_intel_workforce_governorate_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`uq_sanad_intel_wf_gov_year\` UNIQUE(\`year\`,\`governorate_key\`),
    KEY \`idx_sanad_intel_wf_gov_y\` (\`year\`),
    CONSTRAINT \`fk_sanad_wf_batch\` FOREIGN KEY (\`import_batch_id\`) REFERENCES \`sanad_intel_import_batches\`(\`id\`) ON DELETE no action ON UPDATE no action
  )`,

  // 4. Geography stats
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_geography_stats\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`import_batch_id\` int,
    \`year\` int NOT NULL,
    \`governorate_key\` varchar(128) NOT NULL,
    \`wilayat_key\` varchar(128) NOT NULL,
    \`village_key\` varchar(128),
    \`center_count\` int NOT NULL DEFAULT 0,
    \`source_ref\` varchar(128),
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sanad_intel_geography_stats_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`uq_sanad_intel_geo\` UNIQUE(\`year\`,\`governorate_key\`,\`wilayat_key\`,\`village_key\`),
    KEY \`idx_sanad_intel_geo_gov\` (\`governorate_key\`),
    CONSTRAINT \`fk_sanad_geo_batch\` FOREIGN KEY (\`import_batch_id\`) REFERENCES \`sanad_intel_import_batches\`(\`id\`) ON DELETE no action ON UPDATE no action
  )`,

  // 5. Service usage year
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_service_usage_year\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`import_batch_id\` int,
    \`year\` int NOT NULL,
    \`entity_name\` varchar(255) NOT NULL,
    \`service_name\` varchar(255) NOT NULL,
    \`usage_count\` int NOT NULL DEFAULT 0,
    \`rank_in_year\` int,
    \`source_ref\` varchar(128),
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sanad_intel_service_usage_year_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`uq_sanad_intel_svc_year\` UNIQUE(\`year\`,\`entity_name\`,\`service_name\`),
    KEY \`idx_sanad_intel_svc_y\` (\`year\`),
    KEY \`idx_sanad_intel_svc_entity\` (\`entity_name\`),
    CONSTRAINT \`fk_sanad_svc_batch\` FOREIGN KEY (\`import_batch_id\`) REFERENCES \`sanad_intel_import_batches\`(\`id\`) ON DELETE no action ON UPDATE no action
  )`,

  // 6. Centers
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_centers\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`import_batch_id\` int,
    \`center_name\` varchar(255) NOT NULL,
    \`governorate_key\` varchar(128),
    \`wilayat_key\` varchar(128),
    \`village_key\` varchar(128),
    \`contact_info\` varchar(255),
    \`source_ref\` varchar(128),
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sanad_intel_centers_id\` PRIMARY KEY(\`id\`),
    KEY \`idx_sanad_intel_ctr_gov\` (\`governorate_key\`),
    KEY \`idx_sanad_intel_ctr_name\` (\`center_name\`),
    CONSTRAINT \`fk_sanad_ctr_batch\` FOREIGN KEY (\`import_batch_id\`) REFERENCES \`sanad_intel_import_batches\`(\`id\`) ON DELETE no action ON UPDATE no action
  )`,

  // 7. Center operations
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_center_operations\` (
    \`center_id\` int NOT NULL,
    \`partner_status\` varchar(64) NOT NULL DEFAULT 'unknown',
    \`onboarding_status\` varchar(64) NOT NULL DEFAULT 'not_started',
    \`compliance_flags\` json NOT NULL DEFAULT (json_array()),
    \`notes\` text,
    \`internal_review_notes\` text,
    \`assigned_manager_user_id\` int,
    \`latitude\` decimal(10,7),
    \`longitude\` decimal(10,7),
    \`coverage_radius_km\` int,
    \`target_sla_hours\` int,
    \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`sanad_intel_center_operations_center_id\` PRIMARY KEY(\`center_id\`),
    KEY \`idx_sanad_intel_ops_partner\` (\`partner_status\`),
    KEY \`idx_sanad_intel_ops_onb\` (\`onboarding_status\`),
    CONSTRAINT \`fk_sanad_ops_center\` FOREIGN KEY (\`center_id\`) REFERENCES \`sanad_intel_centers\`(\`id\`) ON DELETE cascade ON UPDATE no action,
    CONSTRAINT \`fk_sanad_ops_manager\` FOREIGN KEY (\`assigned_manager_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE no action ON UPDATE no action
  )`,

  // 8. Center compliance items
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_center_compliance_items\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`center_id\` int NOT NULL,
    \`requirement_key\` varchar(128) NOT NULL,
    \`status\` varchar(64) NOT NULL DEFAULT 'pending',
    \`due_date\` date,
    \`resolved_at\` timestamp,
    \`notes\` text,
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    \`updated_at\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`sanad_intel_center_compliance_items_id\` PRIMARY KEY(\`id\`),
    KEY \`idx_sanad_intel_comp_ctr\` (\`center_id\`),
    KEY \`idx_sanad_intel_comp_status\` (\`status\`),
    CONSTRAINT \`fk_sanad_comp_center\` FOREIGN KEY (\`center_id\`) REFERENCES \`sanad_intel_centers\`(\`id\`) ON DELETE cascade ON UPDATE no action
  )`,

  // 9. Center metrics yearly
  `CREATE TABLE IF NOT EXISTS \`sanad_intel_center_metrics_yearly\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`center_id\` int NOT NULL,
    \`year\` int NOT NULL,
    \`transaction_count\` int NOT NULL DEFAULT 0,
    \`income_amount\` decimal(18,2) NOT NULL DEFAULT '0',
    \`employee_count\` int NOT NULL DEFAULT 0,
    \`source_ref\` varchar(128),
    \`created_at\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`sanad_intel_center_metrics_yearly_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`uq_sanad_intel_ctr_metrics\` UNIQUE(\`center_id\`,\`year\`),
    KEY \`idx_sanad_intel_ctr_metrics_y\` (\`year\`),
    CONSTRAINT \`fk_sanad_metrics_center\` FOREIGN KEY (\`center_id\`) REFERENCES \`sanad_intel_centers\`(\`id\`) ON DELETE cascade ON UPDATE no action
  )`,
];

console.log(`Applying ${statements.length} statements for migration 0025 (TiDB-compatible)...`);

for (const stmt of statements) {
  const firstLine = stmt.trim().split("\n")[0].slice(0, 80);
  try {
    await pool.execute(stmt);
    console.log(`  ✓ ${firstLine}`);
  } catch (err) {
    if (
      err.code === "ER_TABLE_EXISTS_ERROR" ||
      err.code === "ER_DUP_KEYNAME" ||
      (err.message && err.message.includes("already exists"))
    ) {
      console.log(`  ~ skipped (already exists): ${firstLine}`);
    } else {
      console.error(`  ✗ FAILED: ${firstLine}`);
      console.error(`    Error: ${err.message}`);
    }
  }
}

await pool.end();
console.log("Migration 0025 complete.");
