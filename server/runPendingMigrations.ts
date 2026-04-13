/**
 * Lightweight startup migration runner.
 *
 * Instead of relying on drizzle-kit CLI (which requires a full snapshot chain),
 * this module checks for specific columns/tables/indexes and applies the DDL
 * needed to bring the DB up to the latest schema. Each check is idempotent:
 * it inspects information_schema before issuing any DDL.
 *
 * Add new entries to `PENDING_COLUMNS` whenever a migration adds nullable
 * columns to existing tables. Destructive DDL (DROP, RENAME) must never go here.
 * For new tables, use `PENDING_TABLES`. For indexes, use `PENDING_INDEXES`.
 */
import mysql2 from "mysql2/promise";

interface ColumnMigration {
  table: string;
  column: string;
  ddl: string;
}

interface IndexMigration {
  table: string;
  indexName: string;
  /** Full CREATE INDEX / CREATE UNIQUE INDEX statement */
  ddl: string;
}

interface TableMigration {
  table: string;
  /** Full CREATE TABLE statement */
  ddl: string;
}

interface ForeignKeyMigration {
  table: string;
  constraintName: string;
  ddl: string;
}

/** Each entry adds one nullable column if it does not already exist. */
const PENDING_COLUMNS: ColumnMigration[] = [
  // 0032 — multi-shift attendance
  {
    table: "attendance_records",
    column: "schedule_id",
    ddl: "ALTER TABLE `attendance_records` ADD COLUMN `schedule_id` int",
  },
  {
    table: "manual_checkin_requests",
    column: "requested_business_date",
    ddl: "ALTER TABLE `manual_checkin_requests` ADD COLUMN `requested_business_date` varchar(10)",
  },
  {
    table: "manual_checkin_requests",
    column: "requested_schedule_id",
    ddl: "ALTER TABLE `manual_checkin_requests` ADD COLUMN `requested_schedule_id` int",
  },
  // 0033 — open-session uniqueness guard (virtual generated column on attendance_records)
  {
    table: "attendance_records",
    column: "open_session_key",
    ddl: `ALTER TABLE \`attendance_records\`
  ADD COLUMN \`open_session_key\` varchar(64) GENERATED ALWAYS AS (
    IF(\`check_out\` IS NULL AND \`schedule_id\` IS NOT NULL,
       CONCAT(\`employee_id\`, '-', \`schedule_id\`),
       NULL)
  ) VIRTUAL`,
  },
  // 0040 — survey: link response to user + completion invite email tracking (column only; index + FK below)
  {
    table: "survey_responses",
    column: "user_id",
    ddl: "ALTER TABLE `survey_responses` ADD COLUMN `user_id` int NULL",
  },
  {
    table: "survey_responses",
    column: "completion_invite_email_sent_at",
    ddl: "ALTER TABLE `survey_responses` ADD COLUMN `completion_invite_email_sent_at` timestamp NULL",
  },
  {
    table: "survey_responses",
    column: "nurture_followup_count",
    ddl: "ALTER TABLE `survey_responses` ADD COLUMN `nurture_followup_count` int NOT NULL DEFAULT 0",
  },
  {
    table: "survey_responses",
    column: "nurture_last_sent_at",
    ddl: "ALTER TABLE `survey_responses` ADD COLUMN `nurture_last_sent_at` timestamp NULL",
  },
  {
    table: "survey_responses",
    column: "nurture_stopped_at",
    ddl: "ALTER TABLE `survey_responses` ADD COLUMN `nurture_stopped_at` timestamp NULL",
  },
  {
    table: "survey_responses",
    column: "nurture_stopped_reason",
    ddl: "ALTER TABLE `survey_responses` ADD COLUMN `nurture_stopped_reason` varchar(32) NULL",
  },
  {
    table: "survey_responses",
    column: "sanad_office_id",
    ddl: "ALTER TABLE `survey_responses` ADD COLUMN `sanad_office_id` int NULL",
  },
];

/** Each entry creates a unique/regular index if it does not already exist. */
const PENDING_INDEXES: IndexMigration[] = [
  // 0033 — unique open session per (employee, schedule)
  {
    table: "attendance_records",
    indexName: "uniq_att_rec_open_session",
    ddl: "CREATE UNIQUE INDEX `uniq_att_rec_open_session` ON `attendance_records` (`open_session_key`)",
  },
  {
    table: "survey_responses",
    indexName: "idx_survey_responses_user",
    ddl: "CREATE INDEX `idx_survey_responses_user` ON `survey_responses` (`user_id`)",
  },
  {
    table: "survey_responses",
    indexName: "idx_survey_responses_sanad_office",
    ddl: "CREATE INDEX `idx_survey_responses_sanad_office` ON `survey_responses` (`sanad_office_id`)",
  },
];

/** Foreign keys (run after columns + indexes exist). */
const PENDING_FOREIGN_KEYS: ForeignKeyMigration[] = [
  {
    table: "survey_responses",
    constraintName: "fk_survey_responses_user",
    ddl: `ALTER TABLE \`survey_responses\`
      ADD CONSTRAINT \`fk_survey_responses_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL`,
  },
  {
    table: "survey_responses",
    constraintName: "fk_survey_responses_sanad_office",
    ddl: `ALTER TABLE \`survey_responses\`
      ADD CONSTRAINT \`fk_survey_responses_sanad_office\` FOREIGN KEY (\`sanad_office_id\`) REFERENCES \`sanad_offices\`(\`id\`) ON DELETE SET NULL`,
  },
];

/** Each entry creates a table if it does not already exist. */
const PENDING_TABLES: TableMigration[] = [
  // 0036 — profile change requests
  {
    table: "profile_change_requests",
    ddl: `CREATE TABLE IF NOT EXISTS \`profile_change_requests\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`companyId\` int NOT NULL,
  \`employeeId\` int NOT NULL,
  \`submittedByUserId\` int NOT NULL,
  \`fieldLabel\` varchar(100) NOT NULL,
  \`fieldKey\` varchar(64) NOT NULL DEFAULT 'other',
  \`requestedValue\` varchar(500) NOT NULL,
  \`notes\` varchar(500) DEFAULT NULL,
  \`status\` enum('pending','resolved','rejected') NOT NULL DEFAULT 'pending',
  \`submittedAt\` timestamp NOT NULL DEFAULT (now()),
  \`resolvedAt\` timestamp NULL DEFAULT NULL,
  \`resolvedByUserId\` int DEFAULT NULL,
  \`resolutionNote\` varchar(500) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_pcr_company_employee\` (\`companyId\`,\`employeeId\`),
  KEY \`idx_pcr_company_status\` (\`companyId\`,\`status\`),
  KEY \`idx_pcr_employee_status_fieldkey\` (\`employeeId\`, \`status\`, \`fieldKey\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  // 0034 — authoritative session model
  {
    table: "attendance_sessions",
    ddl: `CREATE TABLE IF NOT EXISTS \`attendance_sessions\` (
  \`id\`               int          AUTO_INCREMENT NOT NULL,
  \`company_id\`       int          NOT NULL,
  \`employee_id\`      int          NOT NULL,
  \`schedule_id\`      int,
  \`business_date\`    varchar(10)  NOT NULL,
  \`status\`           enum('open','closed') NOT NULL DEFAULT 'open',
  \`check_in_at\`      timestamp    NOT NULL,
  \`check_out_at\`     timestamp,
  \`site_id\`          int,
  \`site_name\`        varchar(128),
  \`method\`           enum('qr_scan','manual','admin') NOT NULL DEFAULT 'qr_scan',
  \`source\`           enum('employee_portal','admin_panel','system') NOT NULL DEFAULT 'employee_portal',
  \`check_in_lat\`     decimal(10,7),
  \`check_in_lng\`     decimal(10,7),
  \`check_out_lat\`    decimal(10,7),
  \`check_out_lng\`    decimal(10,7),
  \`notes\`            text,
  \`source_record_id\` int,
  \`open_key\`         varchar(64) GENERATED ALWAYS AS (
                        IF(\`status\` = 'open' AND \`schedule_id\` IS NOT NULL,
                           CONCAT(\`employee_id\`, '-', \`schedule_id\`, '-', \`business_date\`),
                           NULL)
                      ) VIRTUAL,
  \`created_at\`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`attendance_sessions_id\` PRIMARY KEY (\`id\`),
  UNIQUE INDEX \`uniq_att_sess_open_key\` (\`open_key\`),
  INDEX \`idx_att_sess_company_date\`  (\`company_id\`, \`business_date\`),
  INDEX \`idx_att_sess_employee_date\` (\`employee_id\`, \`business_date\`),
  INDEX \`idx_att_sess_schedule\`      (\`schedule_id\`),
  INDEX \`idx_att_sess_source_record\` (\`source_record_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
  // 0039 — survey tables
  { table: "surveys", ddl: `CREATE TABLE IF NOT EXISTS \`surveys\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`slug\` varchar(100) NOT NULL UNIQUE, \`title_en\` varchar(255) NOT NULL, \`title_ar\` varchar(255) NOT NULL, \`description_en\` text, \`description_ar\` text, \`status\` enum('draft','active','paused','closed') NOT NULL DEFAULT 'draft', \`welcome_message_en\` text, \`welcome_message_ar\` text, \`thank_you_message_en\` text, \`thank_you_message_ar\` text, \`allow_anonymous\` boolean NOT NULL DEFAULT true, \`estimated_minutes\` int NOT NULL DEFAULT 12, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX \`idx_surveys_status\` (\`status\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  { table: "survey_sections", ddl: `CREATE TABLE IF NOT EXISTS \`survey_sections\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`survey_id\` int NOT NULL, \`slug\` varchar(100) NOT NULL, \`title_en\` varchar(255) NOT NULL, \`title_ar\` varchar(255) NOT NULL, \`description_en\` text, \`description_ar\` text, \`sort_order\` int NOT NULL DEFAULT 0, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX \`idx_survey_sections_survey\` (\`survey_id\`), UNIQUE \`uq_survey_sections_survey_slug\` (\`survey_id\`, \`slug\`), CONSTRAINT \`fk_survey_sections_survey\` FOREIGN KEY (\`survey_id\`) REFERENCES \`surveys\`(\`id\`) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  { table: "survey_questions", ddl: `CREATE TABLE IF NOT EXISTS \`survey_questions\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`section_id\` int NOT NULL, \`question_key\` varchar(100) NOT NULL, \`type\` enum('text','textarea','single_choice','multi_choice','rating','number','dropdown','yes_no') NOT NULL, \`label_en\` text NOT NULL, \`label_ar\` text NOT NULL, \`hint_en\` text, \`hint_ar\` text, \`is_required\` boolean NOT NULL DEFAULT true, \`sort_order\` int NOT NULL DEFAULT 0, \`settings\` json, \`scoring_rule\` json, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX \`idx_survey_questions_section\` (\`section_id\`), CONSTRAINT \`fk_survey_questions_section\` FOREIGN KEY (\`section_id\`) REFERENCES \`survey_sections\`(\`id\`) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  { table: "survey_options", ddl: `CREATE TABLE IF NOT EXISTS \`survey_options\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`question_id\` int NOT NULL, \`value\` varchar(100) NOT NULL, \`label_en\` varchar(500) NOT NULL, \`label_ar\` varchar(500) NOT NULL, \`score\` int NOT NULL DEFAULT 0, \`sort_order\` int NOT NULL DEFAULT 0, \`tags\` json, INDEX \`idx_survey_options_question\` (\`question_id\`), CONSTRAINT \`fk_survey_options_question\` FOREIGN KEY (\`question_id\`) REFERENCES \`survey_questions\`(\`id\`) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  { table: "survey_tags", ddl: `CREATE TABLE IF NOT EXISTS \`survey_tags\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`slug\` varchar(100) NOT NULL UNIQUE, \`label_en\` varchar(255) NOT NULL, \`label_ar\` varchar(255) NOT NULL, \`category\` varchar(64) NOT NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  { table: "survey_responses", ddl: `CREATE TABLE IF NOT EXISTS \`survey_responses\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`survey_id\` int NOT NULL, \`resume_token\` varchar(64) NOT NULL UNIQUE, \`language\` enum('en','ar') NOT NULL DEFAULT 'en', \`status\` enum('in_progress','completed','abandoned') NOT NULL DEFAULT 'in_progress', \`current_section_id\` int, \`respondent_name\` varchar(255), \`respondent_email\` varchar(320), \`respondent_phone\` varchar(32), \`company_name\` varchar(255), \`company_sector\` varchar(128), \`company_size\` varchar(64), \`company_governorate\` varchar(128), \`scores\` json, \`completed_at\` timestamp, \`started_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX \`idx_survey_responses_survey\` (\`survey_id\`), INDEX \`idx_survey_responses_status\` (\`status\`), CONSTRAINT \`fk_survey_responses_survey\` FOREIGN KEY (\`survey_id\`) REFERENCES \`surveys\`(\`id\`) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  { table: "survey_answers", ddl: `CREATE TABLE IF NOT EXISTS \`survey_answers\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`response_id\` int NOT NULL, \`question_id\` int NOT NULL, \`answer_value\` text, \`selected_options\` json, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE \`uq_survey_answers_response_question\` (\`response_id\`, \`question_id\`), INDEX \`idx_survey_answers_response\` (\`response_id\`), CONSTRAINT \`fk_survey_answers_response\` FOREIGN KEY (\`response_id\`) REFERENCES \`survey_responses\`(\`id\`) ON DELETE CASCADE, CONSTRAINT \`fk_survey_answers_question\` FOREIGN KEY (\`question_id\`) REFERENCES \`survey_questions\`(\`id\`) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  { table: "survey_response_tags", ddl: `CREATE TABLE IF NOT EXISTS \`survey_response_tags\` (\`id\` int AUTO_INCREMENT PRIMARY KEY, \`response_id\` int NOT NULL, \`tag_id\` int NOT NULL, \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE \`uq_survey_response_tags\` (\`response_id\`, \`tag_id\`), INDEX \`idx_survey_response_tags_response\` (\`response_id\`), CONSTRAINT \`fk_survey_response_tags_response\` FOREIGN KEY (\`response_id\`) REFERENCES \`survey_responses\`(\`id\`) ON DELETE CASCADE, CONSTRAINT \`fk_survey_response_tags_tag\` FOREIGN KEY (\`tag_id\`) REFERENCES \`survey_tags\`(\`id\`) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4` },
  // 0042 — survey Sanad office outreach audit (bulk invite tracking)
  {
    table: "survey_sanad_office_outreach",
    ddl: `CREATE TABLE IF NOT EXISTS \`survey_sanad_office_outreach\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`survey_id\` int NOT NULL,
  \`sanad_office_id\` int NOT NULL,
  \`batch_id\` varchar(36) NOT NULL,
  \`channel\` enum('email','whatsapp_api') NOT NULL,
  \`outcome\` enum('sent','failed','skipped_no_email','skipped_no_phone') NOT NULL,
  \`detail\` varchar(500) DEFAULT NULL,
  \`actor_user_id\` int DEFAULT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_survey_outreach_survey_office\` (\`survey_id\`,\`sanad_office_id\`),
  KEY \`idx_survey_outreach_batch\` (\`batch_id\`),
  KEY \`idx_survey_outreach_created\` (\`created_at\`),
  CONSTRAINT \`fk_survey_outreach_survey\` FOREIGN KEY (\`survey_id\`) REFERENCES \`surveys\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_survey_outreach_office\` FOREIGN KEY (\`sanad_office_id\`) REFERENCES \`sanad_offices\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_survey_outreach_actor\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  },
];

async function columnExists(
  conn: mysql2.Connection,
  database: string,
  table: string,
  column: string,
): Promise<boolean> {
  const [rows] = await conn.execute<mysql2.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, table, column],
  );
  return rows.length > 0;
}

async function indexExists(
  conn: mysql2.Connection,
  database: string,
  table: string,
  indexName: string,
): Promise<boolean> {
  const [rows] = await conn.execute<mysql2.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
     LIMIT 1`,
    [database, table, indexName],
  );
  return rows.length > 0;
}

async function tableExists(
  conn: mysql2.Connection,
  database: string,
  table: string,
): Promise<boolean> {
  const [rows] = await conn.execute<mysql2.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [database, table],
  );
  return rows.length > 0;
}

async function foreignKeyConstraintExists(
  conn: mysql2.Connection,
  database: string,
  table: string,
  constraintName: string,
): Promise<boolean> {
  const [rows] = await conn.execute<mysql2.RowDataPacket[]>(
    `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     LIMIT 1`,
    [database, table, constraintName],
  );
  return rows.length > 0;
}

/** Runs at server startup. Safe to call on every boot — skips DDL that already exists. */
export async function runPendingMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return; // test / CI environment without a DB

  let conn: mysql2.Connection | null = null;
  try {
    conn = await mysql2.createConnection(url);

    // Derive database name from URL (e.g. mysql://user:pass@host/dbname?...)
    const dbMatch = url.match(/\/([^/?]+)(\?|$)/);
    const database = dbMatch?.[1];
    if (!database) {
      console.warn("[migrations] Could not parse database name from DATABASE_URL — skipping auto-migration.");
      return;
    }

    // ── Columns ──────────────────────────────────────────────────────────────
    for (const { table, column, ddl } of PENDING_COLUMNS) {
      const exists = await columnExists(conn, database, table, column);
      if (!exists) {
        console.log(`[migrations] Adding column ${table}.${column} …`);
        await conn.execute(ddl);
        console.log(`[migrations] ✓ ${table}.${column} added.`);
      }
    }

    // ── Indexes ───────────────────────────────────────────────────────────────
    for (const { table, indexName, ddl } of PENDING_INDEXES) {
      const exists = await indexExists(conn, database, table, indexName);
      if (!exists) {
        console.log(`[migrations] Creating index ${table}.${indexName} …`);
        await conn.execute(ddl);
        console.log(`[migrations] ✓ ${table}.${indexName} created.`);
      }
    }

    // ── Foreign keys ──────────────────────────────────────────────────────────
    for (const { table, constraintName, ddl } of PENDING_FOREIGN_KEYS) {
      const exists = await foreignKeyConstraintExists(conn, database, table, constraintName);
      if (!exists) {
        console.log(`[migrations] Adding foreign key ${table}.${constraintName} …`);
        await conn.execute(ddl);
        console.log(`[migrations] ✓ ${table}.${constraintName} added.`);
      }
    }

    // ── Tables ────────────────────────────────────────────────────────────────
    for (const { table, ddl } of PENDING_TABLES) {
      const exists = await tableExists(conn, database, table);
      if (!exists) {
        console.log(`[migrations] Creating table ${table} …`);
        await conn.execute(ddl);
        console.log(`[migrations] ✓ table ${table} created.`);
      }
    }
  } catch (err) {
    // Non-fatal: log but don't crash the server. The affected queries will
    // still fail, but other functionality remains available.
    console.error("[migrations] Auto-migration error (non-fatal):", err);
  } finally {
    await conn?.end();
  }
}
