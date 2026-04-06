/**
 * CLI report for Phase 3 party / contract-party integrity (NULL party_id, duplicate regs).
 *
 * Usage:
 *   npx tsx scripts/party-integrity-report.ts
 */
import { getDb } from "../server/db";
import {
  getAgreementPartyIntegritySummary,
  listDuplicateRegistrationPartyGroups,
} from "../server/modules/agreementParties/party.repository";

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("Database unavailable");
    process.exit(1);
  }

  const summary = await getAgreementPartyIntegritySummary(db);
  console.log("\n=== Agreement party integrity summary ===\n");
  console.log(JSON.stringify(summary, null, 2));

  const dups = await listDuplicateRegistrationPartyGroups(db, 25);
  console.log("\n=== Duplicate registration groups (top 25) ===\n");
  if (dups.length === 0) {
    console.log("(none)");
  } else {
    for (const g of dups) {
      console.log(`\nReg: ${g.registrationNumber} (${g.partyCount} rows)`);
      g.partyIds.forEach((id, i) => console.log(`  - ${id}  ${g.displayNames[i] ?? ""}`));
    }
  }

  console.log("\n---\nBackfill: DRY_RUN=1 npx tsx scripts/backfill-contract-party-ids.ts\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
