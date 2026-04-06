/**
 * Backfill outsourcing_contract_parties.party_id for rows that have company_id but null party_id.
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/backfill-contract-party-ids.ts   # log only
 *   npx tsx scripts/backfill-contract-party-ids.ts               # apply
 *
 * Requires DATABASE_URL. Idempotent per company (ensurePartyForLinkedCompany).
 */

import { getDb } from "../server/db";
import { backfillPartyIdsOnContractParties } from "../server/modules/agreementParties/party.repository";

async function main() {
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const db = await getDb();
  if (!db) {
    console.error("[backfill-party-ids] DATABASE_URL not available");
    process.exit(1);
  }
  console.log(`[backfill-party-ids] dryRun=${dryRun}`);
  const result = await backfillPartyIdsOnContractParties(db, { dryRun });
  console.log("[backfill-party-ids] distinct company ids:", result.distinctCompanyIds);
  console.log("[backfill-party-ids] batches applied:", result.batchesApplied);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
