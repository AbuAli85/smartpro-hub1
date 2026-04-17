/**
 * Generates the 0070 baseline schema-recovery artifacts.
 *
 * drizzle-kit export emits:
 *   1) CREATE TABLE ...                       → idempotent via CREATE TABLE IF NOT EXISTS
 *   2) ALTER TABLE ... ADD CONSTRAINT FK ...  → NOT idempotent in MySQL (no IF NOT EXISTS)
 *   3) CREATE INDEX ...                       → NOT idempotent in MySQL
 *
 * To keep migration 0070 staging-safe and re-runnable, we split the output:
 *
 *   drizzle/0070_drizzle_baseline_schema_recovery.sql   ← journaled (tables only)
 *   drizzle/bootstrap/0070_constraints.sql              ← NOT journaled (FKs)
 *   drizzle/bootstrap/0070_indexes.sql                  ← NOT journaled (indexes)
 *
 * Bootstrap files are intentionally left out of `meta/_journal.json` because
 * they are single-apply — they will fail on any database that already has the
 * matching FKs/indexes from historical loose migrations (0018 … 0069). They
 * exist as a ready-to-apply reference for truly fresh staging/dev databases.
 *
 * Regenerate: `pnpm run db:build-baseline-0070`
 */
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const drizzleDir = join(root, "drizzle");
const bootstrapDir = join(drizzleDir, "bootstrap");
const tablesPath = join(drizzleDir, "0070_drizzle_baseline_schema_recovery.sql");
const constraintsPath = join(bootstrapDir, "0070_constraints.sql");
const indexesPath = join(bootstrapDir, "0070_indexes.sql");

mkdirSync(bootstrapDir, { recursive: true });

const raw = execSync(
  `pnpm exec drizzle-kit export --schema ./drizzle/schema.ts --dialect mysql`,
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

const firstCreate = raw.indexOf("CREATE TABLE ");
if (firstCreate === -1) {
  throw new Error("drizzle-kit export did not contain any CREATE TABLE statement");
}
const body = raw.slice(firstCreate);

/**
 * Split the body into three buckets by statement type.
 * Each CREATE TABLE block is terminated by `);` at column 0; everything after
 * the last `);` is the tail of ALTER / CREATE INDEX single-line statements.
 */
const tables = [];
const constraints = [];
const indexes = [];

const lines = body.split(/\r?\n/);
let current = null;
for (const line of lines) {
  if (current) {
    current.push(line);
    if (line.startsWith(");")) {
      tables.push(current.join("\n"));
      current = null;
    }
    continue;
  }
  if (line.startsWith("CREATE TABLE ")) {
    current = [line.replace(/^CREATE TABLE /, "CREATE TABLE IF NOT EXISTS ")];
    continue;
  }
  if (line.startsWith("ALTER TABLE ")) {
    constraints.push(line);
    continue;
  }
  if (line.startsWith("CREATE INDEX ") || line.startsWith("CREATE UNIQUE INDEX ")) {
    indexes.push(line);
    continue;
  }
  // Blank / other lines are skipped; they are re-introduced as spacing below.
}

if (current) {
  throw new Error("drizzle-kit export ended in the middle of a CREATE TABLE block");
}

const tablesHeader = `-- Migration 0070 — Baseline schema recovery (tables only, generated)
-- Source: drizzle-kit export from drizzle/schema.ts (authoritative).
-- Contains ONLY CREATE TABLE IF NOT EXISTS — safe to re-run when a subset of
-- tables is missing. Foreign keys and indexes live in drizzle/bootstrap/*.sql
-- (not journaled) because MySQL cannot guard ADD CONSTRAINT / CREATE INDEX
-- with IF NOT EXISTS.
-- Regenerate: pnpm run db:build-baseline-0070
`;

const constraintsHeader = `-- 0070 bootstrap: foreign-key constraints (NOT journaled)
-- Apply manually on fresh staging/dev databases only. These statements are
-- single-apply — they will fail with duplicate-constraint errors on any
-- database that already has the matching FKs from historical migrations.
-- Regenerate: pnpm run db:build-baseline-0070
`;

const indexesHeader = `-- 0070 bootstrap: secondary indexes (NOT journaled)
-- Apply manually on fresh staging/dev databases only. These statements are
-- single-apply — they will fail with duplicate-index errors on any database
-- that already has the matching indexes from historical migrations.
-- Regenerate: pnpm run db:build-baseline-0070
`;

writeFileSync(tablesPath, tablesHeader + "\n" + tables.join("\n\n") + "\n", "utf8");
writeFileSync(constraintsPath, constraintsHeader + "\n" + constraints.join("\n") + "\n", "utf8");
writeFileSync(indexesPath, indexesHeader + "\n" + indexes.join("\n") + "\n", "utf8");

const fmt = (n) => n.toLocaleString();
console.log(`Wrote ${tablesPath} — ${fmt(tables.length)} CREATE TABLE IF NOT EXISTS`);
console.log(`Wrote ${constraintsPath} — ${fmt(constraints.length)} ALTER TABLE ADD CONSTRAINT`);
console.log(`Wrote ${indexesPath} — ${fmt(indexes.length)} CREATE INDEX`);
