/**
 * Tests for the schema drift guard.
 *
 * These tests are fully offline (no real DB connection required).
 * The guard is tested by:
 *   1. Verifying it returns an empty report when DISABLE_SCHEMA_DRIFT_GUARD=1.
 *   2. Verifying it returns an empty report when DATABASE_URL is absent.
 *   3. Verifying it correctly identifies missing tables and columns when given
 *      a mock mysql2 connection that returns controlled SHOW COLUMNS data.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const thisDir = dirname(fileURLToPath(import.meta.url));

// ── Mock mysql2/promise before importing the module under test ────────────────
vi.mock("mysql2/promise", () => ({
  createConnection: vi.fn(),
}));

import * as mysql2 from "mysql2/promise";
import { runSchemaDriftGuard } from "./schemaDriftGuard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockConn(
  tables: string[],
  columnsByTable: Record<string, string[]>,
) {
  return {
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      if (typeof sql === "string" && sql.includes("information_schema.TABLES")) {
        return [tables.map((t) => ({ TABLE_NAME: t }))];
      }
      if (typeof sql === "string" && sql.includes("information_schema.COLUMNS")) {
        const tableName = Array.isArray(params) ? (params[1] as string) : "";
        const cols = columnsByTable[tableName] ?? [];
        return [cols.map((c) => ({ COLUMN_NAME: c }))];
      }
      return [[]];
    }),
    end: vi.fn(async () => {}),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runSchemaDriftGuard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset env to clean state before each test
    process.env.DATABASE_URL = "mysql://user:pass@host/testdb";
    delete process.env.DISABLE_SCHEMA_DRIFT_GUARD;
  });

  afterEach(() => {
    // Restore original env
    Object.assign(process.env, originalEnv);
  });

  it("returns empty report and skips DB when DISABLE_SCHEMA_DRIFT_GUARD=1", async () => {
    process.env.DISABLE_SCHEMA_DRIFT_GUARD = "1";
    const report = await runSchemaDriftGuard();
    expect(report.totalDrift).toBe(0);
    expect(report.missingTables).toHaveLength(0);
    expect(report.missingColumns).toEqual({});
    // mysql2.createConnection should NOT have been called
    expect(vi.mocked(mysql2.createConnection)).not.toHaveBeenCalled();
  });

  it("returns empty report and skips DB when DATABASE_URL is absent", async () => {
    delete process.env.DATABASE_URL;
    const report = await runSchemaDriftGuard();
    expect(report.totalDrift).toBe(0);
    expect(vi.mocked(mysql2.createConnection)).not.toHaveBeenCalled();
  });

  it("returns empty report when all schema tables and columns exist in DB", async () => {
    // Build a mock connection that returns every table and column the Drizzle
    // schema actually defines — so no drift is detected.
    const schemaModule = await import("../drizzle/schema");
    const tableNames: string[] = [];
    const columnsByTable: Record<string, string[]> = {};

    for (const val of Object.values(schemaModule)) {
      if (!val || typeof val !== "object") continue;
      const syms = Object.getOwnPropertySymbols(val);
      let tName: string | null = null;
      let cols: string[] = [];
      for (const sym of syms) {
        if (sym.description === "drizzle:Name") {
          const v = (val as Record<symbol, unknown>)[sym];
          if (typeof v === "string") tName = v;
        }
        if (sym.description === "drizzle:Columns") {
          const c = (val as Record<symbol, unknown>)[sym];
          if (c && typeof c === "object") {
            for (const colVal of Object.values(c as object)) {
              if (colVal && typeof colVal === "object" && "name" in colVal && typeof (colVal as { name: unknown }).name === "string") {
                cols.push((colVal as { name: string }).name);
              }
            }
          }
        }
      }
      if (tName) {
        tableNames.push(tName);
        columnsByTable[tName] = cols;
      }
    }

    const mockConn = makeMockConn(tableNames, columnsByTable);
    vi.mocked(mysql2.createConnection).mockResolvedValue(mockConn as never);

    const report = await runSchemaDriftGuard();
    expect(report.totalDrift).toBe(0);
    expect(report.missingTables).toHaveLength(0);
    expect(Object.keys(report.missingColumns)).toHaveLength(0);
  });

  it("reports a missing table when the DB does not have it", async () => {
    // Return an empty table list — every schema table will be "missing"
    const mockConn = makeMockConn([], {});
    vi.mocked(mysql2.createConnection).mockResolvedValue(mockConn as never);

    const report = await runSchemaDriftGuard();
    // Every Drizzle table should be reported missing when the DB is empty
    expect(report.missingTables.length).toBeGreaterThan(0);
    expect(report.totalDrift).toBeGreaterThan(0);
  });

  it("reports missing columns for a known table", async () => {
    // Simulate the promoter_assignments table existing but missing several columns
    const mockConn = makeMockConn(
      ["promoter_assignments"],
      {
        // Only provide the original columns (before migration 0061)
        promoter_assignments: [
          "id", "company_id", "first_party_company_id", "second_party_company_id",
          "promoter_employee_id", "location_ar", "location_en", "start_date",
          "end_date", "contract_reference_number", "issue_date", "created_at",
          "updated_at", "client_site_id",
          // Intentionally omit: assignment_status, billing_model, billing_rate, etc.
        ],
      },
    );
    vi.mocked(mysql2.createConnection).mockResolvedValue(mockConn as never);

    const report = await runSchemaDriftGuard();
    const drift = report.missingColumns["promoter_assignments"] ?? [];
    // assignment_status should be reported as missing
    expect(drift).toContain("assignment_status");
    expect(report.totalDrift).toBeGreaterThan(0);
  });

  it("baseline migration 0070 lists every Drizzle table with CREATE IF NOT EXISTS", async () => {
    const schemaModule = await import("../drizzle/schema");
    let schemaTableCount = 0;
    for (const val of Object.values(schemaModule)) {
      if (!val || typeof val !== "object") continue;
      for (const sym of Object.getOwnPropertySymbols(val)) {
        if (sym.description === "drizzle:Name") {
          schemaTableCount++;
          break;
        }
      }
    }

    const sql = readFileSync(
      join(thisDir, "../drizzle/0070_drizzle_baseline_schema_recovery.sql"),
      "utf8",
    );
    const creates = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`/g)].map((m) => m[1]);
    expect(new Set(creates).size).toBe(schemaTableCount);
    expect(creates.length).toBe(schemaTableCount);
  });

  it("baseline migration 0070 contains only idempotent CREATE TABLE statements", async () => {
    // Non-idempotent DDL (ADD CONSTRAINT / CREATE INDEX) must live in
    // drizzle/bootstrap/*.sql so staging re-apply cannot fail on duplicates.
    const sql = readFileSync(
      join(thisDir, "../drizzle/0070_drizzle_baseline_schema_recovery.sql"),
      "utf8",
    );
    expect(sql.match(/^ALTER TABLE /m)).toBeNull();
    expect(sql.match(/^CREATE INDEX /m)).toBeNull();
    expect(sql.match(/^CREATE UNIQUE INDEX /m)).toBeNull();
  });

  it("bootstrap FK + index files exist with expected statement counts", async () => {
    const fks = readFileSync(
      join(thisDir, "../drizzle/bootstrap/0070_constraints.sql"),
      "utf8",
    );
    const idx = readFileSync(
      join(thisDir, "../drizzle/bootstrap/0070_indexes.sql"),
      "utf8",
    );
    const fkCount = [...fks.matchAll(/^ALTER TABLE /gm)].length;
    const idxCount = [...idx.matchAll(/^CREATE (UNIQUE )?INDEX /gm)].length;
    expect(fkCount).toBeGreaterThan(0);
    expect(idxCount).toBeGreaterThan(0);
  });

  it("is non-fatal when mysql2 throws a connection error", async () => {
    vi.mocked(mysql2.createConnection).mockRejectedValue(new Error("ECONNREFUSED"));
    // Should NOT throw — just return an empty report
    const report = await runSchemaDriftGuard();
    expect(report.totalDrift).toBe(0);
  });
});
