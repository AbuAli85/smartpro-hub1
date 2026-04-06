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

// ─── KPIs ─────────────────────────────────────────────────────────────────────

/**
 * Aggregate KPIs for the contracts visible to `activeCompanyId`.
 *
 * Strategy:
 *   1. Re-use `listOutsourcingContracts` for tenant-scoped data (single source of truth).
 *   2. Compute all numeric totals, role breakdowns, and risk lists in JS — no extra
 *      raw-SQL aggregates needed at this scale.
 *   3. One extra DB query to fetch document kinds for active contracts (for the
 *      "missing documents" risk list).
 */
export async function getContractKpis(
  db: AppDb,
  activeCompanyId: number,
  isPlatformAdmin: boolean
): Promise<ContractKpis> {
  const EMPTY: ContractKpis = {
    totals: { total: 0, active: 0, draft: 0, expiringIn30Days: 0, expired: 0, terminated: 0, suspended: 0, renewed: 0 },
    promotersDeployed: 0,
    contractsPerCompany: [],
    expiringSoon: [],
    missingDocuments: [],
  };

  const rows = await listOutsourcingContracts(db, activeCompanyId, isPlatformAdmin);
  if (rows.length === 0) return EMPTY;

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totals: ContractKpis["totals"] = {
    total: rows.length,
    active: 0, draft: 0, expiringIn30Days: 0,
    expired: 0, terminated: 0, suspended: 0, renewed: 0,
  };

  for (const row of rows) {
    const s = (row.status ?? "draft") as ContractStatus;
    if (s === "active")     totals.active++;
    else if (s === "draft")      totals.draft++;
    else if (s === "expired")    totals.expired++;
    else if (s === "terminated") totals.terminated++;
    else if (s === "suspended")  totals.suspended++;
    else if (s === "renewed")    totals.renewed++;

    if (s === "active" && row.expiryDate) {
      const exp = new Date(
        typeof row.expiryDate === "string" ? row.expiryDate : (row.expiryDate as Date).toISOString()
      );
      if (exp >= now && exp <= in30) totals.expiringIn30Days++;
    }
  }

  // ── Promoters deployed (distinct active promoter employee IDs) ────────────
  const activePromoterIds = new Set(
    rows
      .filter((r) => r.status === "active" && r.promoterEmployeeId)
      .map((r) => r.promoterEmployeeId)
  );
  const promotersDeployed = activePromoterIds.size;

  // ── Contracts per company (by first party, top 10) ────────────────────────
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
    if (row.status === "active") entry.active++;
  }
  const contractsPerCompany = [...coMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ── Expiring soon (top 15 by nearest expiry) ─────────────────────────────
  const expiringSoon: ContractKpis["expiringSoon"] = rows
    .filter((r) => {
      if (r.status !== "active" || !r.expiryDate) return false;
      const exp = new Date(
        typeof r.expiryDate === "string" ? r.expiryDate : (r.expiryDate as Date).toISOString()
      );
      return exp >= now && exp <= in30;
    })
    .sort((a, b) => {
      const da = new Date(typeof a.expiryDate === "string" ? a.expiryDate : (a.expiryDate as Date).toISOString());
      const db2 = new Date(typeof b.expiryDate === "string" ? b.expiryDate : (b.expiryDate as Date).toISOString());
      return da.getTime() - db2.getTime();
    })
    .slice(0, 15)
    .map((r) => {
      const exp = new Date(
        typeof r.expiryDate === "string" ? r.expiryDate.slice(0, 10) : (r.expiryDate as Date).toISOString().slice(0, 10)
      );
      const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / 86_400_000);
      return {
        id: r.id,
        contractNumber: r.contractNumber ?? null,
        promoterName: r.promoterName ?? "—",
        firstPartyName: r.firstPartyName ?? "—",
        expiryDate:
          typeof r.expiryDate === "string"
            ? r.expiryDate.slice(0, 10)
            : (r.expiryDate as Date).toISOString().slice(0, 10),
        daysLeft,
      };
    });

  // ── Missing required documents (active contracts only) ───────────────────
  const activeIds = rows.filter((r) => r.status === "active").map((r) => r.id);
  let missingDocuments: ContractKpis["missingDocuments"] = [];

  if (activeIds.length > 0) {
    const docRows = await db
      .select({
        contractId: outsourcingContractDocuments.contractId,
        documentKind: outsourcingContractDocuments.documentKind,
      })
      .from(outsourcingContractDocuments)
      .where(inArray(outsourcingContractDocuments.contractId, activeIds));

    // Build a map: contractId → Set<normalised kind>
    const LEGACY: Record<string, string> = {
      signed_pdf: "signed_contract_pdf",
      id_copy:    "id_card_copy",
    };
    const docsByContract = new Map<string, Set<string>>();
    for (const d of docRows) {
      if (!docsByContract.has(d.contractId)) docsByContract.set(d.contractId, new Set());
      const kind = LEGACY[d.documentKind ?? ""] ?? d.documentKind ?? "";
      docsByContract.get(d.contractId)!.add(kind);
    }

    const REQUIRED = [
      { kind: "signed_contract_pdf", label: "Signed Contract" },
      { kind: "passport_copy",       label: "Passport Copy" },
      { kind: "id_card_copy",        label: "ID Card Copy" },
    ] as const;

    for (const row of rows) {
      if (row.status !== "active") continue;
      const kinds = docsByContract.get(row.id) ?? new Set<string>();
      const missing = REQUIRED.filter((r) => !kinds.has(r.kind)).map((r) => r.label);
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
  }

  return { totals, promotersDeployed, contractsPerCompany, expiringSoon, missingDocuments };
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
