/**
 * Lightweight startup migration runner.
 *
 * Instead of relying on drizzle-kit CLI (which requires a full snapshot chain),
 * this module checks for specific columns and applies the ALTER TABLE statements
 * needed to bring the DB up to the latest schema. Each check is idempotent:
 * it inspects information_schema before issuing any DDL.
 *
 * Add new entries to `PENDING_COLUMNS` whenever a migration adds nullable
 * columns to existing tables. Destructive DDL (DROP, RENAME) must never go here.
 */
import mysql2 from "mysql2/promise";

interface ColumnMigration {
  table: string;
  column: string;
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

/** Runs at server startup. Safe to call on every boot — skips columns that already exist. */
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

    for (const { table, column, ddl } of PENDING_COLUMNS) {
      const exists = await columnExists(conn, database, table, column);
      if (!exists) {
        console.log(`[migrations] Adding column ${table}.${column} …`);
        await conn.execute(ddl);
        console.log(`[migrations] ✓ ${table}.${column} added.`);
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
