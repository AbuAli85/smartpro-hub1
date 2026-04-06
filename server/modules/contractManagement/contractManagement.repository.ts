/**
 * Contract Management System — data-access layer.
 * All queries go through this file; the router never touches the DB directly.
 */

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { format } from "date-fns";
import {
  attendanceSites,
  companies,
  employees,
  outsourcingContractDocuments,
  outsourcingContractEvents,
  outsourcingContractLocations,
  outsourcingContractParties,
  outsourcingContracts,
  outsourcingPromoterDetails,
  type InsertOutsourcingContract,
  type InsertOutsourcingContractDocument,
  type InsertOutsourcingContractEvent,
  type InsertOutsourcingContractLocation,
  type InsertOutsourcingContractParty,
  type InsertOutsourcingPromoterDetail,
} from "../../../drizzle/schema";
import type { getDb } from "../../db";
import {
  ALLOWED_TRANSITIONS,
  ContractTransitionError,
  DEFAULT_REQUIRED_DOCUMENTS,
  REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE,
  validateStatusTransition,
  type ContractDocumentKind,
  type ContractEventAction,
  type ContractKpis,
  type ContractStatus,
  type OutsourcingContractRow,
} from "./contractManagement.types";

// Re-export so the router only needs one import
export { ALLOWED_TRANSITIONS, ContractTransitionError, validateStatusTransition };

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function toDateOrNull(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function toDateInput(d: Date | string): Date {
  if (d instanceof Date) return d;
  return new Date(d);
}

// ─── READS ────────────────────────────────────────────────────────────────────

/**
 * List contracts visible to the given company.
 * A company sees a contract if it is either the first_party or second_party.
 * Platform admins pass activeCompanyId=0 and isPlatformAdmin=true to see all.
 */
export async function listOutsourcingContracts(
  db: AppDb,
  activeCompanyId: number,
  isPlatformAdmin: boolean,
  filters?: { status?: ContractStatus; contractTypeId?: string }
): Promise<OutsourcingContractRow[]> {
  const firstPartyAlias = alias(companies, "fp_co");
  const secondPartyAlias = alias(companies, "sp_co");
  const firstPartyParty = alias(outsourcingContractParties, "fp_party");
  const secondPartyParty = alias(outsourcingContractParties, "sp_party");

  const baseQuery = db
    .select({
      id: outsourcingContracts.id,
      contractTypeId: outsourcingContracts.contractTypeId,
      companyId: outsourcingContracts.companyId,
      contractNumber: outsourcingContracts.contractNumber,
      status: outsourcingContracts.status,
      issueDate: outsourcingContracts.issueDate,
      effectiveDate: outsourcingContracts.effectiveDate,
      expiryDate: outsourcingContracts.expiryDate,
      generatedPdfUrl: outsourcingContracts.generatedPdfUrl,
      signedPdfUrl: outsourcingContracts.signedPdfUrl,
      renewalOfContractId: outsourcingContracts.renewalOfContractId,
      createdAt: outsourcingContracts.createdAt,
      updatedAt: outsourcingContracts.updatedAt,
      // First party
      firstPartyCompanyId: firstPartyParty.companyId,
      firstPartyName: firstPartyParty.displayNameEn,
      firstPartyNameAr: firstPartyParty.displayNameAr,
      firstPartyRegNumber: firstPartyParty.registrationNumber,
      // Second party
      secondPartyCompanyId: secondPartyParty.companyId,
      secondPartyName: secondPartyParty.displayNameEn,
      secondPartyNameAr: secondPartyParty.displayNameAr,
      secondPartyRegNumber: secondPartyParty.registrationNumber,
      // Location
      locationEn: outsourcingContractLocations.locationEn,
      locationAr: outsourcingContractLocations.locationAr,
      clientSiteId: outsourcingContractLocations.clientSiteId,
      // Promoter
      promoterEmployeeId: outsourcingPromoterDetails.promoterEmployeeId,
      promoterNameEn: outsourcingPromoterDetails.fullNameEn,
      promoterNameAr: outsourcingPromoterDetails.fullNameAr,
      civilId: outsourcingPromoterDetails.civilId,
      passportNumber: outsourcingPromoterDetails.passportNumber,
      passportExpiry: outsourcingPromoterDetails.passportExpiry,
      nationality: outsourcingPromoterDetails.nationality,
      jobTitleEn: outsourcingPromoterDetails.jobTitleEn,
    })
    .from(outsourcingContracts)
    .leftJoin(
      firstPartyParty,
      and(
        eq(firstPartyParty.contractId, outsourcingContracts.id),
        eq(firstPartyParty.partyRole, "first_party")
      )
    )
    .leftJoin(
      secondPartyParty,
      and(
        eq(secondPartyParty.contractId, outsourcingContracts.id),
        eq(secondPartyParty.partyRole, "second_party")
      )
    )
    .leftJoin(
      outsourcingContractLocations,
      eq(outsourcingContractLocations.contractId, outsourcingContracts.id)
    )
    .leftJoin(
      outsourcingPromoterDetails,
      eq(outsourcingPromoterDetails.contractId, outsourcingContracts.id)
    );

  const conditions = [];
  if (!isPlatformAdmin) {
    // Visible to company as first_party OR second_party
    conditions.push(
      or(
        eq(outsourcingContracts.companyId, activeCompanyId),
        eq(firstPartyParty.companyId, activeCompanyId),
        eq(secondPartyParty.companyId, activeCompanyId),
        eq(outsourcingPromoterDetails.employerCompanyId, activeCompanyId)
      )
    );
  }
  if (filters?.status) {
    conditions.push(eq(outsourcingContracts.status, filters.status));
  }
  if (filters?.contractTypeId) {
    conditions.push(eq(outsourcingContracts.contractTypeId, filters.contractTypeId));
  }

  const rows = await (conditions.length > 0
    ? baseQuery.where(and(...conditions)).orderBy(desc(outsourcingContracts.createdAt))
    : baseQuery.orderBy(desc(outsourcingContracts.createdAt)));

  return rows.map((r) => ({
    ...r,
    promoterEmployeeId: r.promoterEmployeeId ?? 0,
    promoterName: r.promoterNameEn ?? "—",
    promoterNameAr: r.promoterNameAr ?? null,
    firstPartyName: r.firstPartyName ?? "Unknown company",
    firstPartyNameAr: r.firstPartyNameAr ?? null,
    secondPartyName: r.secondPartyName ?? "Unknown company",
    secondPartyNameAr: r.secondPartyNameAr ?? null,
    firstPartyCompanyId: r.firstPartyCompanyId ?? null,
    secondPartyCompanyId: r.secondPartyCompanyId ?? null,
  }));
}

// ─── KPIs — PURE HELPERS ──────────────────────────────────────────────────────
//
// ADR: KPI aggregation strategy and migration path
//
// PHASE 1 (current — recommended up to ~2 000 visible contracts)
// ──────────────────────────────────────────────────────────────
// All numeric aggregation is done in JavaScript after a single JOIN query
// (listOutsourcingContracts) plus one extra SELECT for document kinds.
// Pros: no duplicate tenant-filter logic, easy to test purely, readable.
// Cons: loads full rows into memory; not suitable for platform-wide queries
//       once the total contract count reaches several thousand.
//
// PHASE 2 (recommended when any single tenant's visible set exceeds ~2 000 rows)
// ──────────────────────────────────────────────────────────────────────────────
// Replace the JS counters with a single GROUP BY / CASE SQL aggregate:
//   SELECT status, COUNT(*) as cnt FROM outsourcing_contracts
//   WHERE <tenant filter>  GROUP BY status
// This avoids loading row data just to count it.
// The document-check subquery can similarly become:
//   SELECT contract_id, GROUP_CONCAT(document_kind) ...
//   WHERE contract_id IN (SELECT id ... WHERE status='active' AND <tenant>)
//   GROUP BY contract_id  HAVING  NOT (MAX(...) = 1) AND ...
//
// PHASE 3 (if platform-admin queries exceed ~50 000 rows)
// ──────────────────────────────────────────────────────
// Materialise a kpi_snapshot table refreshed by a scheduled job (e.g. daily).
// The current `meta.generatedAt` field is designed to communicate data
// freshness to the UI so this transition is transparent to callers.

/**
 * Normalise any date-like value to a UTC start-of-day Date (midnight UTC).
 *
 * Why: contract expiryDate values are stored as DATE (no time) in MySQL, which
 * Drizzle returns as a string like "2026-04-30".  Calling new Date("2026-04-30")
 * yields 2026-04-30T00:00:00.000Z — UTC midnight.  If we compare this to
 * `new Date()` (which includes hours/minutes), a contract expiring *today* would
 * incorrectly appear already expired.  Normalising `now` to UTC midnight gives
 * consistent date-level comparisons across timezones.
 *
 * Exported for unit-testing.
 */
export function toUtcDay(d: Date | string): Date {
  const s = typeof d === "string" ? d : d.toISOString();
  // Slice to "YYYY-MM-DD" and append UTC midnight
  return new Date(s.slice(0, 10) + "T00:00:00.000Z");
}

/**
 * Returns the *effective* contract status, bridging the lazy-expire gap.
 *
 * Lazy-expire only updates the DB when `getById` is called.  A contract stored
 * as "active" whose expiryDate is strictly before today (UTC) should be treated
 * as "expired" for KPI purposes — showing it as "active" is misleading.
 *
 * Note: "expiring today" means expiryDate === today → effective status = "active"
 * (the contract is valid through the end of the expiry day, then expires overnight).
 *
 * Exported for unit-testing.
 */
export function effectiveContractStatus(
  storedStatus: string,
  expiryDate: Date | string | null | undefined,
  nowUtcDay: Date
): ContractStatus {
  const s = storedStatus as ContractStatus;
  if (s === "active" && expiryDate) {
    const exp = toUtcDay(expiryDate as Date | string);
    if (exp < nowUtcDay) return "expired";
  }
  return s;
}

/**
 * Normalise legacy document kind aliases to their canonical name.
 * Keeps the logic in one place rather than duplicating it.
 * Exported for unit-testing.
 */
export function normaliseDocumentKind(rawKind: string): string {
  const LEGACY: Record<string, string> = {
    signed_pdf: "signed_contract_pdf",
    id_copy:    "id_card_copy",
  };
  return LEGACY[rawKind] ?? rawKind;
}

/**
 * Pure KPI aggregation — no DB access.
 *
 * Accepts pre-fetched contract rows and a map of document kinds per contract,
 * and returns the full `ContractKpis` object.  Extracted from `getContractKpis`
 * so it can be unit-tested without a database mock.
 *
 * @param rows          - output of `listOutsourcingContracts`
 * @param docsByContract - Map<contractId, Set<normalised documentKind>>
 * @param options.activeCompanyId - 0 for platform admins
 * @param options.isPlatformAdmin
 * @param options.now   - override current time (for testing)
 */
export function aggregateKpisFromRows(
  rows: OutsourcingContractRow[],
  docsByContract: Map<string, Set<string>>,
  options: {
    activeCompanyId: number;
    isPlatformAdmin: boolean;
    now?: Date;
  }
): ContractKpis {
  const nowUtcDay = toUtcDay(options.now ?? new Date());
  const in30UtcDay = new Date(nowUtcDay.getTime() + 30 * 24 * 60 * 60 * 1000);

  const totals: ContractKpis["totals"] = {
    total: rows.length,
    active: 0, draft: 0, expiringIn30Days: 0,
    expired: 0, storedActiveEffectivelyExpired: 0,
    terminated: 0, suspended: 0, renewed: 0,
  };

  for (const row of rows) {
    const stored = (row.status ?? "draft") as ContractStatus;
    const effective = effectiveContractStatus(stored, row.expiryDate, nowUtcDay);

    // Status buckets use effective status so KPIs reflect reality even when
    // lazy-expire hasn't fired yet.
    if      (effective === "active")     totals.active++;
    else if (effective === "draft")      totals.draft++;
    else if (effective === "expired")    totals.expired++;
    else if (effective === "terminated") totals.terminated++;
    else if (effective === "suspended")  totals.suspended++;
    else if (effective === "renewed")    totals.renewed++;

    // Diagnostic: contracts stored "active" but effectively expired
    if (stored === "active" && effective === "expired") {
      totals.storedActiveEffectivelyExpired++;
    }

    // expiringIn30Days: effectively active AND expiry within [today, today+30]
    if (effective === "active" && row.expiryDate) {
      const exp = toUtcDay(row.expiryDate as Date | string);
      if (exp >= nowUtcDay && exp <= in30UtcDay) totals.expiringIn30Days++;
    }
  }

  // Promoters deployed: distinct promoter IDs with effectively-active contracts
  const activePromoterIds = new Set(
    rows
      .filter((r) => {
        const eff = effectiveContractStatus(r.status ?? "draft", r.expiryDate, nowUtcDay);
        return eff === "active" && r.promoterEmployeeId;
      })
      .map((r) => r.promoterEmployeeId)
  );
  const promotersDeployed = activePromoterIds.size;

  // Contracts per company (by first party, top 10, effective active count)
  const coMap = new Map<
    string,
    { companyId: number | null; companyName: string; total: number; active: number }
  >();
  for (const row of rows) {
    const key = String(row.firstPartyCompanyId ?? "unknown");
    if (!coMap.has(key)) {
      coMap.set(key, {
        companyId: row.firstPartyCompanyId ?? null,
        companyName: row.firstPartyName ?? "Unknown",
        total: 0,
        active: 0,
      });
    }
    const entry = coMap.get(key)!;
    entry.total++;
    const eff = effectiveContractStatus(row.status ?? "draft", row.expiryDate, nowUtcDay);
    if (eff === "active") entry.active++;
  }
  const contractsPerCompany = [...coMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Expiring soon: effectively active + expiryDate within [today, today+30], sorted nearest-first
  const expiringSoon: ContractKpis["expiringSoon"] = rows
    .filter((r) => {
      if (!r.expiryDate) return false;
      const eff = effectiveContractStatus(r.status ?? "draft", r.expiryDate, nowUtcDay);
      if (eff !== "active") return false;
      const exp = toUtcDay(r.expiryDate as Date | string);
      return exp >= nowUtcDay && exp <= in30UtcDay;
    })
    .sort((a, b) => {
      const ta = toUtcDay(a.expiryDate as Date | string).getTime();
      const tb = toUtcDay(b.expiryDate as Date | string).getTime();
      return ta - tb;
    })
    .slice(0, 15)
    .map((r) => {
      const exp = toUtcDay(r.expiryDate as Date | string);
      const daysLeft = Math.ceil((exp.getTime() - nowUtcDay.getTime()) / 86_400_000);
      return {
        id: r.id,
        contractNumber: r.contractNumber ?? null,
        promoterName: r.promoterName ?? "—",
        firstPartyName: r.firstPartyName ?? "—",
        expiryDate: exp.toISOString().slice(0, 10),
        daysLeft,
      };
    });

  // Missing documents: effectively-active contracts lacking required kinds per type
  const missingDocuments: ContractKpis["missingDocuments"] = [];
  for (const row of rows) {
    const eff = effectiveContractStatus(row.status ?? "draft", row.expiryDate, nowUtcDay);
    if (eff !== "active") continue;

    // Look up required kinds for this contract type; fall back to promoter_assignment
    const required =
      REQUIRED_DOCUMENTS_BY_CONTRACT_TYPE[row.contractTypeId ?? "promoter_assignment"]
      ?? DEFAULT_REQUIRED_DOCUMENTS;

    const rawKinds = docsByContract.get(row.id) ?? new Set<string>();
    // Normalise on read so the map can contain either canonical or legacy kinds
    const kinds = new Set([...rawKinds].map(normaliseDocumentKind));
    const missing = required
      .filter((req) => !kinds.has(req.kind))
      .map((req) => req.label);

    if (missing.length > 0) {
      missingDocuments.push({
        id: row.id,
        contractNumber: row.contractNumber ?? null,
        promoterName: row.promoterName ?? "—",
        missingKinds: missing,
      });
    }
    if (missingDocuments.length >= 20) break;
  }

  return {
    meta: {
      scope: options.isPlatformAdmin ? "platform" : "company",
      companyId: options.isPlatformAdmin ? null : options.activeCompanyId,
      generatedAt: (options.now ?? new Date()).toISOString(),
    },
    totals,
    promotersDeployed,
    contractsPerCompany,
    expiringSoon,
    missingDocuments,
  };
}

/**
 * Async entry point: fetches data, builds document-kind map, then delegates
 * all aggregation to `aggregateKpisFromRows`.
 *
 * See ADR comment at the top of this section for the performance migration plan.
 */
export async function getContractKpis(
  db: AppDb,
  activeCompanyId: number,
  isPlatformAdmin: boolean
): Promise<ContractKpis> {
  const rows = await listOutsourcingContracts(db, activeCompanyId, isPlatformAdmin);

  const EMPTY: ContractKpis = aggregateKpisFromRows([], new Map(), {
    activeCompanyId,
    isPlatformAdmin,
  });
  if (rows.length === 0) return EMPTY;

  // Fetch document kinds for effectively-active contracts only
  // (Phase 2 note: this IN (...) becomes a subquery once activeIds is large)
  const nowUtcDay = toUtcDay(new Date());
  const activeIds = rows
    .filter((r) => effectiveContractStatus(r.status ?? "draft", r.expiryDate, nowUtcDay) === "active")
    .map((r) => r.id);

  const docsByContract = new Map<string, Set<string>>();
  if (activeIds.length > 0) {
    const docRows = await db
      .select({
        contractId: outsourcingContractDocuments.contractId,
        documentKind: outsourcingContractDocuments.documentKind,
      })
      .from(outsourcingContractDocuments)
      .where(inArray(outsourcingContractDocuments.contractId, activeIds));

    for (const d of docRows) {
      if (!docsByContract.has(d.contractId)) docsByContract.set(d.contractId, new Set());
      docsByContract.get(d.contractId)!.add(normaliseDocumentKind(d.documentKind ?? ""));
    }
  }

  return aggregateKpisFromRows(rows, docsByContract, { activeCompanyId, isPlatformAdmin });
}

/** Get a single contract with all related data. */
export async function getOutsourcingContractById(db: AppDb, contractId: string) {
  const [contract] = await db
    .select()
    .from(outsourcingContracts)
    .where(eq(outsourcingContracts.id, contractId))
    .limit(1);
  if (!contract) return null;

  const parties = await db
    .select()
    .from(outsourcingContractParties)
    .where(eq(outsourcingContractParties.contractId, contractId))
    .orderBy(asc(outsourcingContractParties.partyRole));

  const locations = await db
    .select()
    .from(outsourcingContractLocations)
    .where(eq(outsourcingContractLocations.contractId, contractId));

  const [promoterDetail] = await db
    .select()
    .from(outsourcingPromoterDetails)
    .where(eq(outsourcingPromoterDetails.contractId, contractId))
    .limit(1);

  const documents = await db
    .select()
    .from(outsourcingContractDocuments)
    .where(eq(outsourcingContractDocuments.contractId, contractId))
    .orderBy(desc(outsourcingContractDocuments.uploadedAt));

  const events = await db
    .select()
    .from(outsourcingContractEvents)
    .where(eq(outsourcingContractEvents.contractId, contractId))
    .orderBy(desc(outsourcingContractEvents.createdAt));

  return {
    contract,
    parties,
    locations,
    promoterDetail: promoterDetail ?? null,
    documents,
    events,
  };
}

// ─── WRITES ───────────────────────────────────────────────────────────────────

/** Insert the full normalized contract in a single logical operation (not a DB transaction — MySQL row-by-row). */
export async function createOutsourcingContractFull(
  db: AppDb,
  params: {
    contractId: string;
    companyId: number;
    contractTypeId: string;
    contractNumber: string | null;
    status: ContractStatus;
    issueDate: Date | null;
    effectiveDate: Date;
    expiryDate: Date;
    createdBy: number;
    firstParty: { companyId: number; nameEn: string; nameAr: string | null; regNumber: string | null };
    secondParty: { companyId: number; nameEn: string; nameAr: string | null; regNumber: string | null };
    location: {
      locationEn: string;
      locationAr: string;
      clientSiteId: number | null;
    };
    promoter: {
      employeeId: number;
      employerCompanyId: number;
      fullNameEn: string;
      fullNameAr: string | null;
      civilId: string | null;
      passportNumber: string | null;
      passportExpiry: Date | null;
      nationality: string | null;
      jobTitleEn: string | null;
      jobTitleAr: string | null;
    };
    actorName: string;
  }
): Promise<void> {
  const header: InsertOutsourcingContract = {
    id: params.contractId,
    companyId: params.companyId,
    contractTypeId: params.contractTypeId,
    contractNumber: params.contractNumber,
    status: params.status,
    issueDate: params.issueDate,
    effectiveDate: params.effectiveDate,
    expiryDate: params.expiryDate,
    createdBy: params.createdBy,
    templateVersion: 1,
  };
  await db.insert(outsourcingContracts).values(header);

  const firstPartyRow: InsertOutsourcingContractParty = {
    id: crypto.randomUUID(),
    contractId: params.contractId,
    partyRole: "first_party",
    companyId: params.firstParty.companyId,
    displayNameEn: params.firstParty.nameEn,
    displayNameAr: params.firstParty.nameAr,
    registrationNumber: params.firstParty.regNumber,
  };
  const secondPartyRow: InsertOutsourcingContractParty = {
    id: crypto.randomUUID(),
    contractId: params.contractId,
    partyRole: "second_party",
    companyId: params.secondParty.companyId,
    displayNameEn: params.secondParty.nameEn,
    displayNameAr: params.secondParty.nameAr,
    registrationNumber: params.secondParty.regNumber,
  };
  await db.insert(outsourcingContractParties).values([firstPartyRow, secondPartyRow]);

  const locationRow: InsertOutsourcingContractLocation = {
    id: crypto.randomUUID(),
    contractId: params.contractId,
    belongsToPartyRole: "first_party",
    locationEn: params.location.locationEn,
    locationAr: params.location.locationAr,
    clientSiteId: params.location.clientSiteId,
  };
  await db.insert(outsourcingContractLocations).values(locationRow);

  const promoterRow: InsertOutsourcingPromoterDetail = {
    id: crypto.randomUUID(),
    contractId: params.contractId,
    promoterEmployeeId: params.promoter.employeeId,
    employerCompanyId: params.promoter.employerCompanyId,
    fullNameEn: params.promoter.fullNameEn,
    fullNameAr: params.promoter.fullNameAr,
    civilId: params.promoter.civilId,
    passportNumber: params.promoter.passportNumber,
    passportExpiry: params.promoter.passportExpiry,
    nationality: params.promoter.nationality,
    jobTitleEn: params.promoter.jobTitleEn,
    jobTitleAr: params.promoter.jobTitleAr,
  };
  await db.insert(outsourcingPromoterDetails).values(promoterRow);

  await appendContractEvent(db, {
    contractId: params.contractId,
    action: "created",
    actorId: params.createdBy,
    actorName: params.actorName,
    details: { contractTypeId: params.contractTypeId, status: params.status },
  });
}

/** Update mutable fields on an existing contract. */
export async function updateOutsourcingContract(
  db: AppDb,
  contractId: string,
  updates: {
    contractNumber?: string | null;
    status?: ContractStatus;
    issueDate?: Date | null;
    effectiveDate?: Date;
    expiryDate?: Date;
    renewalOfContractId?: string | null;
  },
  locationUpdates?: {
    locationEn?: string;
    locationAr?: string;
    clientSiteId?: number | null;
  },
  promoterUpdates?: {
    civilId?: string | null;
    passportNumber?: string | null;
    passportExpiry?: Date | null;
    nationality?: string | null;
    jobTitleEn?: string | null;
    jobTitleAr?: string | null;
  }
): Promise<void> {
  if (Object.keys(updates).length > 0) {
    await db
      .update(outsourcingContracts)
      .set(updates)
      .where(eq(outsourcingContracts.id, contractId));
  }

  if (locationUpdates && Object.keys(locationUpdates).length > 0) {
    await db
      .update(outsourcingContractLocations)
      .set(locationUpdates)
      .where(eq(outsourcingContractLocations.contractId, contractId));
  }

  if (promoterUpdates && Object.keys(promoterUpdates).length > 0) {
    await db
      .update(outsourcingPromoterDetails)
      .set(promoterUpdates)
      .where(eq(outsourcingPromoterDetails.contractId, contractId));
  }
}

// ─── DOCUMENT MANAGEMENT ─────────────────────────────────────────────────────

/**
 * Generic document record — persists any uploaded file linked to a contract.
 *
 * Called by the `uploadDocument` tRPC mutation after the file has been
 * uploaded to the storage proxy and a URL has been minted.
 *
 * Returns the new document ID.
 */
export async function recordContractDocument(
  db: AppDb,
  params: {
    contractId: string;
    documentKind: ContractDocumentKind;
    fileUrl: string;
    filePath: string;
    fileName: string;
    mimeType: string;
    uploadedBy: number;
    uploadedByName?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const docId = crypto.randomUUID();

  await db.insert(outsourcingContractDocuments).values({
    id: docId,
    contractId: params.contractId,
    documentKind: params.documentKind,
    fileUrl: params.fileUrl,
    filePath: params.filePath,
    fileName: params.fileName,
    mimeType: params.mimeType,
    uploadedBy: params.uploadedBy,
    metadata: params.metadata,
  });

  await appendContractEvent(db, {
    contractId: params.contractId,
    action: "document_uploaded",
    actorId: params.uploadedBy,
    actorName: params.uploadedByName,
    details: {
      documentId: docId,
      documentKind: params.documentKind,
      fileName: params.fileName,
    },
  });

  return docId;
}

/** Load a single document row — used for ownership/tenant checks before delete. */
export async function getContractDocumentById(
  db: AppDb,
  documentId: string
) {
  const [row] = await db
    .select()
    .from(outsourcingContractDocuments)
    .where(eq(outsourcingContractDocuments.id, documentId))
    .limit(1);
  return row ?? null;
}

/**
 * Delete a contract document row.
 * The caller must verify tenant ownership and RBAC before calling this.
 * Does NOT remove the file from the storage proxy (orphaned files are cleaned
 * up separately; this is consistent with the rest of the app).
 */
export async function deleteContractDocument(
  db: AppDb,
  documentId: string,
  contractId: string,
  actorId: number,
  actorName?: string
): Promise<void> {
  await db
    .delete(outsourcingContractDocuments)
    .where(
      and(
        eq(outsourcingContractDocuments.id, documentId),
        eq(outsourcingContractDocuments.contractId, contractId)
      )
    );

  await appendContractEvent(db, {
    contractId,
    action: "document_deleted",
    actorId,
    actorName,
    details: { documentId },
  });
}

/** Record the generated PDF URL on the contract header and documents table. */
export async function recordGeneratedPdf(
  db: AppDb,
  contractId: string,
  fileUrl: string,
  filePath: string,
  actorId: number
): Promise<void> {
  await db
    .update(outsourcingContracts)
    .set({ generatedPdfUrl: fileUrl })
    .where(eq(outsourcingContracts.id, contractId));

  const docRow: InsertOutsourcingContractDocument = {
    id: crypto.randomUUID(),
    contractId,
    documentKind: "generated_pdf",
    fileUrl,
    filePath,
    fileName: `contract-${contractId}.pdf`,
    mimeType: "application/pdf",
    uploadedBy: actorId,
  };
  await db.insert(outsourcingContractDocuments).values(docRow);

  await appendContractEvent(db, {
    contractId,
    action: "pdf_generated",
    actorId,
    details: { fileUrl },
  });
}

/** Record an uploaded signed copy. */
export async function recordSignedPdf(
  db: AppDb,
  contractId: string,
  fileUrl: string,
  filePath: string,
  fileName: string,
  actorId: number
): Promise<void> {
  await db
    .update(outsourcingContracts)
    .set({ signedPdfUrl: fileUrl })
    .where(eq(outsourcingContracts.id, contractId));

  const docRow: InsertOutsourcingContractDocument = {
    id: crypto.randomUUID(),
    contractId,
    documentKind: "signed_pdf",
    fileUrl,
    filePath,
    fileName,
    mimeType: "application/pdf",
    uploadedBy: actorId,
  };
  await db.insert(outsourcingContractDocuments).values(docRow);

  await appendContractEvent(db, {
    contractId,
    action: "signed_uploaded",
    actorId,
    details: { fileUrl, fileName },
  });
}

/** Append an event to the contract timeline. */
export async function appendContractEvent(
  db: AppDb,
  params: {
    contractId: string;
    action: ContractEventAction;
    actorId?: number;
    actorName?: string;
    snapshotBefore?: Record<string, unknown>;
    snapshotAfter?: Record<string, unknown>;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const row: InsertOutsourcingContractEvent = {
    id: crypto.randomUUID(),
    contractId: params.contractId,
    action: params.action,
    actorId: params.actorId,
    actorName: params.actorName,
    snapshotBefore: params.snapshotBefore,
    snapshotAfter: params.snapshotAfter,
    details: params.details,
  };
  await db.insert(outsourcingContractEvents).values(row);
}

// ─── LIFECYCLE TRANSITIONS ────────────────────────────────────────────────────

/**
 * The single authoritative path for every status change.
 *
 * What it does (in order):
 *   1. Loads the current status from the database.
 *   2. Calls validateStatusTransition() — throws ContractTransitionError if invalid.
 *   3. Writes the new status to outsourcing_contracts.
 *   4. Appends an audit event with { from, to } in the details.
 *   5. Returns { previousStatus, newStatus }.
 *
 * Every lifecycle mutation in the router (activate, terminate, renew, expire)
 * MUST call this function instead of doing a raw db.update().
 */
export async function transitionContractStatus(
  db: AppDb,
  contractId: string,
  toStatus: ContractStatus,
  actor: { id: number; name: string }
): Promise<{ previousStatus: ContractStatus; newStatus: ContractStatus }> {
  // 1. Load current status
  const [row] = await db
    .select({ status: outsourcingContracts.status })
    .from(outsourcingContracts)
    .where(eq(outsourcingContracts.id, contractId))
    .limit(1);

  if (!row) {
    throw new Error(`[transitionContractStatus] Contract not found: ${contractId}`);
  }

  const fromStatus = row.status as ContractStatus;

  // 2. Validate — throws ContractTransitionError if invalid
  validateStatusTransition(fromStatus, toStatus);

  // 3. Write new status
  await db
    .update(outsourcingContracts)
    .set({ status: toStatus })
    .where(eq(outsourcingContracts.id, contractId));

  // 4. Audit event — use the most specific action name where possible
  const actionMap: Partial<Record<ContractStatus, ContractEventAction>> = {
    active:     "activated",
    terminated: "terminated",
    renewed:    "renewed",
    suspended:  "suspended",
    expired:    "expired",
  };
  const action: ContractEventAction = actionMap[toStatus] ?? "status_changed";

  await appendContractEvent(db, {
    contractId,
    action,
    actorId: actor.id,
    actorName: actor.name,
    details: { from: fromStatus, to: toStatus },
  });

  return { previousStatus: fromStatus, newStatus: toStatus };
}

/**
 * Lazily expire a single contract if its expiry date has passed and its
 * current status is "active".  Called from `getById` so the UI always sees
 * an up-to-date status without needing a cron job.
 *
 * Returns `true` if the contract was just transitioned to "expired".
 * Returns `false` if no change was needed.
 */
export async function lazyExpireContract(
  db: AppDb,
  contractId: string,
  expiryDate: Date | string,
  currentStatus: ContractStatus,
  systemActorId = 0
): Promise<boolean> {
  if (currentStatus !== "active") return false;

  const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  const now = new Date();
  if (expiry > now) return false;

  // Transition is valid: active → expired
  try {
    await transitionContractStatus(db, contractId, "expired", {
      id: systemActorId,
      name: "system:auto-expire",
    });
    return true;
  } catch (err) {
    if (err instanceof ContractTransitionError) return false; // already expired elsewhere
    throw err;
  }
}

/** Delete a contract and all cascade children. */
export async function deleteOutsourcingContract(
  db: AppDb,
  contractId: string
): Promise<void> {
  await db
    .delete(outsourcingContracts)
    .where(eq(outsourcingContracts.id, contractId));
}

// ─── BACKFILL HELPER ──────────────────────────────────────────────────────────

/**
 * Check if a legacy promoter_assignment id already has a corresponding
 * outsourcing_contract row. Used during the dual-write migration phase.
 */
export async function outsourcingContractExistsForId(
  db: AppDb,
  contractId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: outsourcingContracts.id })
    .from(outsourcingContracts)
    .where(eq(outsourcingContracts.id, contractId))
    .limit(1);
  return rows.length > 0;
}
