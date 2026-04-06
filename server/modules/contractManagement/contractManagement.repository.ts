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
