/**
 * scripts/migrate.ts — idempotent database migration runner.
 *
 * Uses Drizzle's built-in `migrate()` which maintains a `__drizzle_migrations`
 * table to track applied files.  Safe to run multiple times; already-applied
 * migrations are skipped automatically.
 *
 * Usage:
 *   pnpm tsx scripts/migrate.ts            # apply all pending migrations
 *   pnpm tsx scripts/migrate.ts --dry-run  # list pending without applying
 *
 * DATABASE_URL must be set in the environment.
 */
import * as fs from "fs";
import * as path from "path";
import mysql2 from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

const DRY_RUN = process.argv.includes("--dry-run");
const MIGRATIONS_DIR = path.resolve(import.meta.dirname ?? __dirname, "../drizzle");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌  DATABASE_URL is not set.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("🔍  Dry run — listing migration files:\n");
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      console.log(`  ${f}`);
    }
    console.log(`\n  Total: ${files.length} migration files in ${MIGRATIONS_DIR}`);
    console.log("  Run without --dry-run to apply pending migrations.");
    return;
  }

  console.log("🚀  Connecting to database …");
  const connection = await mysql2.createConnection(url);
  const db = drizzle(connection);

  console.log(`📂  Migrations folder: ${MIGRATIONS_DIR}`);
  console.log("⏳  Applying pending migrations …\n");

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("\n✅  All migrations applied successfully.");
  } catch (err) {
    console.error("\n❌  Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

await main();
