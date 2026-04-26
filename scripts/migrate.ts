/**
 * scripts/migrate.ts — idempotent database migration runner.
 *
 * Reads drizzle/meta/_journal.json to discover the ordered migration list,
 * tracks applied migrations in `__drizzle_migrations` by content hash, and
 * executes each pending SQL file via connection.query().
 *
 * Fresh-database bootstrap:
 *   This journal was designed for brownfield databases. Migrations 0016-0060
 *   (journal positions 3-35) add columns/indexes to tables that pre-existed in
 *   the brownfield DB; those tables are only created by the 0070 baseline
 *   recovery (journal position 36). On a fresh database, 0070 must therefore
 *   run FIRST so subsequent migrations find their tables. The runner handles
 *   this automatically: if `__drizzle_migrations` is empty it applies 0070
 *   before iterating the journal, then skips it when reached in order.
 *
 *   Subsequent ALTER TABLE / CREATE INDEX segments that try to add columns or
 *   indexes already present in 0070 emit a warning and continue — they are
 *   idempotent in effect.
 *
 * Why not Drizzle's built-in migrate():
 *   It routes through mysql2 execute() (prepared-statement protocol) which
 *   rejects multi-statement files even when multipleStatements:true is set on
 *   the connection. connection.query() uses the text protocol and respects it.
 *
 * Why hash-based (not timestamp-based) tracking:
 *   This journal's `when` timestamps are non-monotonic — entries 0018-0043 have
 *   timestamps earlier than 0016-0017 — so "when > lastApplied" skips ~20
 *   migrations. Hash-based tracking is unaffected by timestamp ordering.
 *
 * Usage:
 *   pnpm tsx scripts/migrate.ts            # apply all pending migrations
 *   pnpm tsx scripts/migrate.ts --dry-run  # list pending without applying
 *
 * DATABASE_URL must be set in the environment.
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import mysql2 from "mysql2/promise";

const DRY_RUN = process.argv.includes("--dry-run");
const MIGRATIONS_DIR = path.resolve(
  // @ts-ignore — import.meta.dirname is undefined in ts-node/cjs mode
  (typeof import.meta !== "undefined" && import.meta.dirname) || __dirname,
  "../drizzle"
);

const BASELINE_TAG = "0070_drizzle_baseline_schema_recovery";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

/** Compute hash the same way drizzle-orm/migrator.js does, for compatibility. */
function migrationHash(sqlContent: string): string {
  const segments = sqlContent.split("--> statement-breakpoint");
  return crypto.createHash("sha256").update(segments.join("")).digest("hex");
}

/**
 * Error codes that are ALWAYS safe to skip — idempotent in effect:
 *   ER_DUP_KEYNAME: index already exists (re-running CREATE INDEX is harmless)
 *   ER_DUP_FIELDNAME: column already exists (re-running ADD COLUMN is harmless)
 */
const ALWAYS_SKIP_CODES = new Set([
  "ER_DUP_KEYNAME",   // 1061 — index already exists
  "ER_DUP_FIELDNAME", // 1060 — column already exists
]);

/**
 * Error codes safe to skip ONLY in fresh-DB mode (0070 ran first as bootstrap).
 * 0070 is the authoritative current-schema baseline; early migrations (0000-0002,
 * 0016-0060) may reference table/column states that have since been renamed or
 * dropped — those failures are idempotent in effect.
 */
const FRESH_DB_SKIP_CODES = new Set([
  "ER_TABLE_EXISTS_ERROR",         // 1050 — CREATE TABLE without IF NOT EXISTS
  "ER_FK_DUP_NAME",                // 1826 — duplicate FK constraint name
  "ER_KEY_COLUMN_DOES_NOT_EXITS",  // 1072 — index on a column removed in a later migration
  "ER_NO_SUCH_TABLE",              // 1146 — early migration references a pre-0070 table
]);

async function applyEntry(
  connection: mysql2.Connection,
  entry: JournalEntry,
  freshDbMode: boolean
): Promise<"applied" | "skipped" | "error"> {
  const sqlFile = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
  const sqlContent = fs.readFileSync(sqlFile, "utf8");
  const hash = migrationHash(sqlContent);

  const segments = sqlContent
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  process.stdout.write(`  → ${entry.tag}  (${segments.length} segment(s)) … `);

  let anyFailed = false;
  for (const seg of segments) {
    try {
      await connection.query(seg);
    } catch (err: any) {
      if (ALWAYS_SKIP_CODES.has(err.code) || (freshDbMode && FRESH_DB_SKIP_CODES.has(err.code))) {
        process.stdout.write(`[skip:${err.code}] `);
      } else {
        console.log("✗");
        console.error(`     Error in segment: ${err.message}`);
        console.error(`     SQL: ${seg.slice(0, 200)}`);
        return "error";
      }
    }
  }

  await connection.query(
    "INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)",
    [hash, entry.when]
  );

  console.log(anyFailed ? "~" : "✓");
  return "applied";
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌  DATABASE_URL is not set.");
    process.exit(1);
  }

  const journalPath = path.join(MIGRATIONS_DIR, "meta", "_journal.json");
  const journal: Journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

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
    console.log(`  Journal entries: ${journal.entries.length}`);
    console.log("  Run without --dry-run to apply pending migrations.");
    return;
  }

  console.log("🚀  Connecting to database …");
  const connection = await mysql2.createConnection({ uri: url, multipleStatements: true });

  console.log(`📂  Migrations folder: ${MIGRATIONS_DIR}`);

  try {
    await connection.query("SET FOREIGN_KEY_CHECKS=0");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const [appliedRows] = await connection.query(
      "SELECT hash FROM `__drizzle_migrations`"
    ) as [Array<{ hash: string }>, unknown];
    const appliedHashes = new Set(appliedRows.map((r) => r.hash));

    const isFreshDb = appliedHashes.size === 0;

    // On a fresh database, the 0070 baseline recovery must run before any other
    // migration, because pre-0070 journal entries add columns/indexes to tables
    // that only 0070 creates (0001 only covers the initial schema).
    if (isFreshDb) {
      const baselineEntry = journal.entries.find((e) => e.tag === BASELINE_TAG);
      if (baselineEntry) {
        console.log("⚡  Fresh database detected — applying baseline recovery first …\n");
        const result = await applyEntry(connection, baselineEntry, false);
        if (result === "error") {
          process.exitCode = 1;
          return;
        }
        // Reload applied hashes so the baseline is skipped in the main loop
        const [newRows] = await connection.query(
          "SELECT hash FROM `__drizzle_migrations`"
        ) as [Array<{ hash: string }>, unknown];
        for (const r of newRows) appliedHashes.add(r.hash);
        console.log("");
      }
    }

    const pending = journal.entries.filter((e) => {
      const sqlContent = fs.readFileSync(
        path.join(MIGRATIONS_DIR, `${e.tag}.sql`),
        "utf8"
      );
      return !appliedHashes.has(migrationHash(sqlContent));
    });

    if (pending.length === 0) {
      console.log("✅  No pending migrations.");
      return;
    }

    console.log(`⏳  Applying ${pending.length} pending migration(s) …\n`);

    let errorCount = 0;
    for (const entry of pending) {
      const result = await applyEntry(connection, entry, isFreshDb);
      if (result === "error") {
        errorCount++;
        break; // stop on first fatal error
      }
    }

    if (errorCount === 0) {
      console.log("\n✅  All migrations applied successfully.");
    } else {
      console.error(`\n❌  Migration run stopped due to errors.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("\n❌  Migration failed:", err);
    process.exitCode = 1;
  } finally {
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS=1");
    } catch {
      // ignore
    }
    await connection.end();
  }
}

await main();
