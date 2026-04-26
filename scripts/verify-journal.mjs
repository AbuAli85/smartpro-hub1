/**
 * Phase 0 pre-flight checks for the journal rebuild runbook.
 *
 * Verifies that:
 *   1. Every SQL file in drizzle/ is covered by the journal (post-rebuild check).
 *   2. No journal entry references a missing SQL file.
 *   3. idx values are sequential from 0.
 *   4. old-journal-tags.txt has been captured (prerequisite for the backfill).
 *   5. (optional) Runs a structural diff against the old tag list.
 *
 * Usage:
 *   node scripts/verify-journal.mjs           # pre-rebuild: should show 40 missing
 *   node scripts/verify-journal.mjs --post    # post-rebuild: should show 0 missing
 */

import fs from "fs";

const POST = process.argv.includes("--post");
const JOURNAL_PATH = "drizzle/meta/_journal.json";
const OLD_TAGS_PATH = "scripts/old-journal-tags.txt";
const DRIZZLE_DIR = "drizzle";

let allPassed = true;

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  allPassed = false;
}

function warn(msg) {
  console.warn(`  ⚠ ${msg}`);
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// ── Load journal ──────────────────────────────────────────────────────────────
section("Loading journal");

if (!fs.existsSync(JOURNAL_PATH)) {
  fail(`${JOURNAL_PATH} not found`);
  process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
const entries = journal.entries ?? [];
pass(`Loaded journal with ${entries.length} entries`);

if (journal.version !== "7") warn(`journal version is "${journal.version}", expected "7"`);
if (journal.dialect !== "mysql") warn(`journal dialect is "${journal.dialect}", expected "mysql"`);

// ── Check idx sequentiality ───────────────────────────────────────────────────
section("idx sequentiality");

const idxValues = entries.map((e) => e.idx);
const sequential = idxValues.every((v, i) => v === i);
if (sequential) {
  pass(`All ${entries.length} idx values are sequential (0 – ${entries.length - 1})`);
} else {
  const badAt = idxValues.findIndex((v, i) => v !== i);
  fail(`idx breaks at position ${badAt}: expected ${badAt}, got ${idxValues[badAt]} (tag: ${entries[badAt].tag})`);
}

// ── Cross-check journal ↔ SQL files ──────────────────────────────────────────
section("Journal ↔ SQL file cross-check");

const sqlFiles = new Set(
  fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith(".sql") && /^\d{4}_/.test(f))
    .map((f) => f.replace(".sql", "")),
);

const journaledTags = new Set(entries.map((e) => e.tag));

const missingFromJournal = [...sqlFiles].filter((t) => !journaledTags.has(t)).sort();
const orphanedInJournal = [...journaledTags].filter((t) => !sqlFiles.has(t)).sort();

if (missingFromJournal.length === 0) {
  pass("All SQL files are covered by the journal");
} else {
  if (POST) {
    fail(`${missingFromJournal.length} SQL files still missing from journal:`);
    missingFromJournal.forEach((t) => console.error(`      ${t}.sql`));
  } else {
    warn(`${missingFromJournal.length} SQL files not in journal (expected before rebuild):`);
    missingFromJournal.forEach((t) => console.warn(`      ${t}.sql`));
  }
}

if (orphanedInJournal.length === 0) {
  pass("No orphaned journal entries (every entry has a matching SQL file)");
} else {
  fail(`${orphanedInJournal.length} journal entries have no SQL file:`);
  orphanedInJournal.forEach((t) => console.error(`      ${t}.sql  ← MISSING`));
}

// ── Numeric ordering sanity ───────────────────────────────────────────────────
section("Numeric ordering");

const tagNumbers = entries.map((e) => {
  const m = e.tag.match(/^(\d{4})_/);
  return m ? parseInt(m[1], 10) : null;
});

const outOfOrder = tagNumbers
  .map((n, i) => ({ n, i, tag: entries[i].tag }))
  .filter(({ n }) => n !== null)
  .filter(({ n, i }, _, arr) => i > 0 && n < arr[i - 1].n);

if (outOfOrder.length === 0) {
  pass("Migration tags are in ascending numeric order");
} else {
  fail(`${outOfOrder.length} tag(s) are out of numeric order:`);
  outOfOrder.forEach(({ tag, n, i }) =>
    console.error(`      position ${i}: ${tag} (num ${n} < prev ${tagNumbers[i - 1]})`),
  );
}

// ── old-journal-tags.txt prerequisite ────────────────────────────────────────
section("Backfill prerequisite");

if (fs.existsSync(OLD_TAGS_PATH)) {
  const oldTags = fs
    .readFileSync(OLD_TAGS_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);

  pass(`old-journal-tags.txt exists with ${oldTags.length} tags`);

  // Show diff summary
  const oldSet = new Set(oldTags);
  const added = entries.filter((e) => !oldSet.has(e.tag));
  const removed = oldTags.filter((t) => !journaledTags.has(t));

  if (POST) {
    console.log(`\n  Journal diff (old → new):`);
    console.log(`    Added  : ${added.length}`);
    if (added.length && added.length <= 50)
      added.forEach((e) => console.log(`      + ${e.tag}`));
    console.log(`    Removed: ${removed.length}`);
    if (removed.length) {
      removed.forEach((t) => console.error(`      - ${t}  ← WARNING`));
      fail("Previously-journaled tags were removed — SQL files may have been deleted");
    }
  } else {
    console.log(`  (run with --post after rebuild to see the full diff)`);
  }
} else {
  if (POST) {
    warn(`${OLD_TAGS_PATH} not found — backfill script cannot run without it`);
  } else {
    fail(`${OLD_TAGS_PATH} not found — capture it BEFORE running the rebuild:`);
    console.error(
      '  node -e "const j=JSON.parse(require(\'fs\').readFileSync(\'drizzle/meta/_journal.json\',\'utf8\'));' +
        'console.log(j.entries.map(e=>JSON.stringify(e.tag)).join(\'\\n\'))" > scripts/old-journal-tags.txt',
    );
  }
}

// ── Final result ──────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(62));
if (allPassed) {
  if (POST) {
    console.log("✓ All post-rebuild checks passed. Safe to proceed to Phase 3.");
  } else {
    console.log("✓ Pre-rebuild checks passed. Journal is ready for rebuild.");
    if (missingFromJournal.length > 0) {
      console.log(`  (${missingFromJournal.length} missing files are the expected drift — rebuild will fix this)`);
    }
  }
} else {
  console.error("✗ One or more checks failed. Resolve before continuing.");
  process.exit(1);
}
