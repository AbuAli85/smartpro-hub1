/**
 * Rebuilds drizzle/meta/_journal.json from the SQL files on disk.
 *
 * Run ONLY on a branch after capturing old-journal-tags.txt:
 *   node scripts/rebuild-journal.mjs
 *
 * Prerequisites:
 *   - scripts/old-journal-tags.txt already exists (run before this script)
 *   - Working tree is clean (git status)
 */

import fs from "fs";
import path from "path";

const drizzleDir = "drizzle";
const journalPath = path.join(drizzleDir, "meta", "_journal.json");
const oldTagsPath = "scripts/old-journal-tags.txt";

// Safety: refuse to run if the old-tags snapshot hasn't been taken yet.
if (!fs.existsSync(oldTagsPath)) {
  console.error(`✗ ${oldTagsPath} not found.`);
  console.error("  Capture current tags first:");
  console.error(
    '  node -e "const j=JSON.parse(require(\'fs\').readFileSync(\'drizzle/meta/_journal.json\',\'utf8\'));console.log(j.entries.map(e=>JSON.stringify(e.tag)).join(\'\\n\'))" > scripts/old-journal-tags.txt',
  );
  process.exit(1);
}

// Safety: warn if the working tree has uncommitted changes to the journal.
try {
  const { execSync } = await import("child_process");
  const dirty = execSync("git status --porcelain drizzle/meta/_journal.json", {
    encoding: "utf8",
  }).trim();
  if (dirty) {
    console.warn("⚠ _journal.json has uncommitted changes — overwriting anyway.");
  }
} catch {
  // git not available or not a repo — skip check
}

const sqlFiles = fs
  .readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql") && /^\d{4}_/.test(f))
  .sort();

if (sqlFiles.length === 0) {
  console.error(`✗ No migration SQL files found in ${drizzleDir}/`);
  process.exit(1);
}

const EPOCH_BASE = 1774722471835; // timestamp of migration 0000

const entries = sqlFiles.map((filename, idx) => ({
  idx,
  version: "7",
  when: EPOCH_BASE + idx * 1000,
  tag: filename.replace(".sql", ""),
  breakpoints: true,
}));

// Verify sequentiality before writing.
const sequential = entries.every((e, i) => e.idx === i);
if (!sequential) {
  console.error("✗ idx values are not sequential — logic error in this script");
  process.exit(1);
}

const journal = { version: "7", dialect: "mysql", entries };
fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");

// Summary
const oldTags = new Set(
  fs
    .readFileSync(oldTagsPath, "utf8")
    .split("\n")
    .map((l) => l.trim().replace(/^"|"$/g, ""))
    .filter(Boolean),
);
const added = entries.filter((e) => !oldTags.has(e.tag));
const removed = [...oldTags].filter((t) => !entries.find((e) => e.tag === t));

console.log(`✓ Wrote ${entries.length} entries to ${journalPath}`);
console.log(`  First : ${entries[0].tag}`);
console.log(`  Last  : ${entries[entries.length - 1].tag}`);
console.log(`  idx   : 0 – ${entries.length - 1} (sequential ✓)`);
console.log(`  Added to journal   : ${added.length}`);
if (added.length) added.forEach((e) => console.log(`    + ${e.tag}`));
console.log(`  Removed from journal: ${removed.length}`);
if (removed.length) removed.forEach((t) => console.error(`    - ${t}  ← WARNING`));

if (removed.length > 0) {
  console.error("\n✗ Some previously-journaled tags are now missing.");
  console.error("  This means SQL files were deleted. Restore them or investigate before continuing.");
  process.exit(1);
}

console.log("\nNext steps:");
console.log("  1. Review the diff:  git diff drizzle/meta/_journal.json");
console.log("  2. Test fresh deploy: DATABASE_URL=<empty-db> pnpm drizzle-kit migrate");
console.log("  3. Generate backfill: node scripts/generate-backfill.mjs > scripts/backfill-migrations.sql");
