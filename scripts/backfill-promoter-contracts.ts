/**
 * One-time backfill: migrate existing `promoter_assignments` rows into the
 * normalized CMS tables (outsourcing_contracts, parties, locations, promoter_details).
 *
 * The same UUID is used as the contract ID so that any existing `generated_documents`
 * records continue to match via entityId.
 *
 * Run:
 *   npx tsx scripts/backfill-promoter-contracts.ts
 *   npx tsx scripts/backfill-promoter-contracts.ts --dry-run
 *
 * The script is idempotent — it skips rows that already have a corresponding
 * outsourcing_contract record. Safe to run multiple times.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  attendanceSites,
  companies,
  employees,
  outsourcingContracts,
  promoterAssignments,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  createOutsourcingContractFull,
  outsourcingContractExistsForId,
} from "../server/modules/contractManagement/contractManagement.repository";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("[backfill] Database unavailable — check DB_URL env var.");
    process.exit(1);
  }

  console.log(`[backfill] Starting promoter_assignments → CMS backfill${DRY_RUN ? " (DRY RUN)" : ""}`);

  // Load all legacy assignments
  const assignments = await db
    .select()
    .from(promoterAssignments)
    .orderBy(promoterAssignments.createdAt);

  console.log(`[backfill] Found ${assignments.length} legacy assignment(s).`);

  let skipped = 0;
  let migrated = 0;
  let failed = 0;

  for (const pa of assignments) {
    try {
      const alreadyExists = await outsourcingContractExistsForId(db, pa.id);
      if (alreadyExists) {
        skipped++;
        continue;
      }

      // Load companies
      const coIds = [pa.firstPartyCompanyId, pa.secondPartyCompanyId];
      const coRows = await db
        .select({
          id: companies.id,
          name: companies.name,
          nameAr: companies.nameAr,
          crNumber: companies.crNumber,
          registrationNumber: companies.registrationNumber,
        })
        .from(companies)
        .where(inArray(companies.id, coIds));

      const coMap = new Map(coRows.map((c) => [c.id, c]));
      const clientCo = coMap.get(pa.firstPartyCompanyId);
      const employerCo = coMap.get(pa.secondPartyCompanyId);

      if (!clientCo || !employerCo) {
        console.warn(`[backfill] SKIP ${pa.id}: company not found (client=${pa.firstPartyCompanyId}, employer=${pa.secondPartyCompanyId})`);
        skipped++;
        continue;
      }

      // Load employee with identity fields
      const [emp] = await db
        .select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          firstNameAr: employees.firstNameAr,
          lastNameAr: employees.lastNameAr,
          nationalId: employees.nationalId,
          passportNumber: employees.passportNumber,
          nationality: employees.nationality,
          position: employees.position,
          profession: employees.profession,
        })
        .from(employees)
        .where(eq(employees.id, pa.promoterEmployeeId))
        .limit(1);

      if (!emp) {
        console.warn(`[backfill] SKIP ${pa.id}: employee #${pa.promoterEmployeeId} not found`);
        skipped++;
        continue;
      }

      const fullNameEn = `${emp.firstName} ${emp.lastName}`.trim();
      const fullNameAr =
        `${emp.firstNameAr ?? ""} ${emp.lastNameAr ?? ""}`.trim() || fullNameEn;

      // Map legacy status to CMS status
      const cmsStatus = pa.status === "active" ? "active" :
                        pa.status === "expired" ? "expired" :
                        "draft";

      if (DRY_RUN) {
        console.log(`[backfill] DRY RUN — would migrate: ${pa.id} (${fullNameEn} @ ${pa.locationEn ?? "no location"})`);
        migrated++;
        continue;
      }

      await createOutsourcingContractFull(db, {
        contractId: pa.id,
        companyId: pa.companyId,
        contractTypeId: "promoter_assignment",
        contractNumber: pa.contractReferenceNumber ?? null,
        status: cmsStatus as "draft" | "active" | "expired",
        issueDate: pa.issueDate ? new Date(pa.issueDate) : null,
        effectiveDate: new Date(pa.startDate),
        expiryDate: new Date(pa.endDate),
        createdBy: 0, // system backfill
        firstParty: {
          companyId: clientCo.id,
          partyId: null,
          nameEn: clientCo.name,
          nameAr: clientCo.nameAr ?? null,
          regNumber: clientCo.crNumber ?? clientCo.registrationNumber ?? null,
        },
        secondParty: {
          companyId: employerCo.id,
          partyId: null,
          nameEn: employerCo.name,
          nameAr: employerCo.nameAr ?? null,
          regNumber: employerCo.crNumber ?? employerCo.registrationNumber ?? null,
        },
        location: {
          locationEn: pa.locationEn ?? "",
          locationAr: pa.locationAr ?? "",
          clientSiteId: pa.clientSiteId ?? null,
        },
        promoter: {
          employeeId: emp.id,
          employerCompanyId: pa.secondPartyCompanyId,
          fullNameEn,
          fullNameAr,
          civilId: emp.nationalId?.trim() || null,
          passportNumber: emp.passportNumber?.trim() || null,
          passportExpiry: null, // not stored on legacy employees — user must fill in
          nationality: emp.nationality?.trim() || null,
          jobTitleEn: emp.position?.trim() || emp.profession?.trim() || null,
          jobTitleAr: null,
        },
        actorName: "system:backfill",
      });

      console.log(`[backfill] MIGRATED: ${pa.id} → ${fullNameEn} @ ${pa.locationEn ?? "—"}`);
      migrated++;
    } catch (err) {
      console.error(`[backfill] ERROR on ${pa.id}:`, err);
      failed++;
    }
  }

  console.log(
    `\n[backfill] Done. migrated=${migrated} skipped=${skipped} failed=${failed}${DRY_RUN ? " (DRY RUN — no changes written)" : ""}`
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[backfill] Fatal:", err);
  process.exit(1);
});
