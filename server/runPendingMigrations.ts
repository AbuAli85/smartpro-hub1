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
];

/** Each entry creates a unique/regular index if it does not already exist. */
const PENDING_INDEXES: IndexMigration[] = [
  // 0033 — unique open session per (employee, schedule)
  {
    table: "attendance_records",
    indexName: "uniq_att_rec_open_session",
    ddl: "CREATE UNIQUE INDEX `uniq_att_rec_open_session` ON `attendance_records` (`open_session_key`)",
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
