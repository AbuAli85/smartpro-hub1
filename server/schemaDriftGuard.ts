/**
 * Schema Drift Guard
 * ─────────────────
 * Runs at server startup (after runPendingMigrations) and compares every
 * Drizzle table's column list against the live database.
 *
 * - Logs a WARNING for each missing column so operators know immediately.
 * - Never throws — drift is non-fatal so the server still starts.
 * - Can be disabled with DISABLE_SCHEMA_DRIFT_GUARD=1.
 *
 * Usage (server/_core/index.ts):
 *   import { runSchemaDriftGuard } from "../schemaDriftGuard";
 *   await runSchemaDriftGuard();
 */

import * as mysql2 from "mysql2/promise";
import * as schema from "../drizzle/schema";

// ── Types ────────────────────────────────────────────────────────────────────

interface DriftReport {
  /** Tables present in Drizzle schema but missing from the DB entirely */
  missingTables: string[];
  /** Per-table lists of columns present in Drizzle schema but absent from DB */
  missingColumns: Record<string, string[]>;
  /** Total number of drift items (tables + columns) */
  totalDrift: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the SQL column name from a Drizzle column definition.
 * Drizzle stores it as `column.name` (the first argument to `varchar(...)` etc.).
 */
function getColumnName(col: unknown): string | null {
  if (col && typeof col === "object" && "name" in col && typeof (col as { name: unknown }).name === "string") {
    return (col as { name: string }).name;
  }
  return null;
}

/**
 * Extract the SQL table name and its column names from a Drizzle table object.
 * Returns null if the value is not a Drizzle table.
 */
function extractTableInfo(tableObj: unknown): { tableName: string; columns: string[] } | null {
  if (!tableObj || typeof tableObj !== "object") return null;

  // Drizzle MySqlTable stores metadata under Symbol(drizzle:Name) and columns under Symbol(drizzle:Columns)
  const symbols = Object.getOwnPropertySymbols(tableObj);
  let tableName: string | null = null;
  let columns: string[] = [];

  for (const sym of symbols) {
    const desc = sym.description ?? "";
    if (desc === "drizzle:Name") {
      const val = (tableObj as Record<symbol, unknown>)[sym];
      if (typeof val === "string") tableName = val;
    }
    if (desc === "drizzle:Columns") {
      const cols = (tableObj as Record<symbol, unknown>)[sym];
      if (cols && typeof cols === "object") {
        for (const colKey of Object.keys(cols as object)) {
          const colName = getColumnName((cols as Record<string, unknown>)[colKey]);
          if (colName) columns.push(colName);
        }
      }
    }
  }

  if (!tableName) return null;
  return { tableName, columns };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Compare every Drizzle table against the live database and log warnings for
 * any columns or tables that are missing.  Returns a DriftReport summary.
 */
export async function runSchemaDriftGuard(): Promise<DriftReport> {
  const report: DriftReport = { missingTables: [], missingColumns: {}, totalDrift: 0 };

  if (process.env.DISABLE_SCHEMA_DRIFT_GUARD === "1") {
    console.log("[drift-guard] Disabled via DISABLE_SCHEMA_DRIFT_GUARD=1");
    return report;
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    // No DB configured (test / CI) — skip silently
    return report;
  }

  let conn: mysql2.Connection | null = null;
  try {
    conn = await mysql2.createConnection(url);

    // Derive database name
    const dbMatch = url.match(/\/([^/?]+)(\?|$)/);
    const database = dbMatch?.[1];
    if (!database) {
      console.warn("[drift-guard] Could not parse database name from DATABASE_URL — skipping.");
      return report;
    }

    // Fetch all tables that exist in the DB
    const [tableRows] = await conn.execute<mysql2.RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?",
      [database],
    );
    const dbTables = new Set(tableRows.map((r) => r.TABLE_NAME as string));

    // Iterate every exported symbol from the Drizzle schema
    for (const [exportKey, exportVal] of Object.entries(schema)) {
      // Skip non-table exports (types, enums, relations, etc.)
      const info = extractTableInfo(exportVal);
      if (!info) continue;

      const { tableName, columns } = info;

      if (!dbTables.has(tableName)) {
        report.missingTables.push(tableName);
        report.totalDrift++;
        console.warn(
          `[drift-guard] ⚠  TABLE MISSING in DB: \`${tableName}\` (schema export: ${exportKey})`,
        );
        continue;
      }

      // Fetch columns for this table
      const [colRows] = await conn.execute<mysql2.RowDataPacket[]>(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
        [database, tableName],
      );
      const dbCols = new Set(colRows.map((r) => r.COLUMN_NAME as string));

      const missing = columns.filter((c) => !dbCols.has(c));
      if (missing.length > 0) {
        report.missingColumns[tableName] = missing;
        report.totalDrift += missing.length;
        console.warn(
          `[drift-guard] ⚠  COLUMN DRIFT in \`${tableName}\`: missing [${missing.join(", ")}]`,
        );
      }
    }

    if (report.totalDrift === 0) {
      console.log("[drift-guard] ✓ Schema matches database — no drift detected.");
    } else {
      console.warn(
        `[drift-guard] ⚠  Drift summary: ${report.missingTables.length} missing table(s), ` +
          `${Object.keys(report.missingColumns).length} table(s) with missing column(s), ` +
          `${report.totalDrift} total drift item(s). ` +
          `Run \`pnpm drizzle-kit generate\` and apply the SQL to fix.`,
      );
    }
  } catch (err) {
    // Non-fatal — log and continue
    console.error("[drift-guard] Error during schema drift check (non-fatal):", err);
  } finally {
    await conn?.end();
  }

  return report;
}
