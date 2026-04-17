/**
 * Builds drizzle/0070_drizzle_baseline_schema_recovery.sql from drizzle-kit export:
 * - strips CLI banner lines before the first CREATE
 * - rewrites CREATE TABLE → CREATE TABLE IF NOT EXISTS (idempotent table creation)
 *
 * ALTER TABLE … ADD CONSTRAINT and CREATE INDEX are kept as-is (single-apply on a DB
 * that already has overlapping objects may error — see docs/db-live-recovery-plan.md).
 */
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "drizzle/0070_drizzle_baseline_schema_recovery.sql");

let sql = execSync(
  `pnpm exec drizzle-kit export --schema ./drizzle/schema.ts --dialect mysql`,
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

const firstCreate = sql.indexOf("CREATE TABLE ");
if (firstCreate === -1) throw new Error("Could not find CREATE TABLE in drizzle-kit export");
sql = sql.slice(firstCreate);

sql = sql.replaceAll("CREATE TABLE `", "CREATE TABLE IF NOT EXISTS `");

const header = `-- Migration 0070 — Baseline schema recovery (generated)
-- Source: drizzle-kit export from drizzle/schema.ts (authoritative).
-- Tables use CREATE TABLE IF NOT EXISTS for safe re-run when only some tables are missing.
-- ALTER/INDEX statements follow drizzle export order; applying twice on a fully migrated DB may error.
-- Regenerate: node scripts/build-0070-baseline-migration.mjs
`;

writeFileSync(outPath, header + "\n" + sql, "utf8");
console.log(`Wrote ${outPath} (${(header.length + sql.length).toLocaleString()} bytes)`);
