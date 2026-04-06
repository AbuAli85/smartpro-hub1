/**
 * Agreement party master — data access.
 * Keeps one canonical row per platform company (linked_company_id) when possible.
 */

import { and, asc, desc, eq, inArray, isNotNull, isNull, like, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  businessParties,
  businessPartyEvents,
  companies,
  outsourcingContractParties,
  outsourcingContracts,
  type InsertBusinessParty,
} from "../../../drizzle/schema";
import type { getDb } from "../../db";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function getPartyById(db: AppDb, partyId: string) {
  const [row] = await db.select().from(businessParties).where(eq(businessParties.id, partyId)).limit(1);
  return row ?? null;
}

/** Party row for a platform company, if it already exists. */
export async function findPartyByLinkedCompany(db: AppDb, companyId: number) {
  const [row] = await db
    .select()
    .from(businessParties)
    .where(eq(businessParties.linkedCompanyId, companyId))
    .limit(1);
  return row ?? null;
}

/**
 * Ensure a business_parties row exists for a platform tenant company.
 * Used so contract party rows can reference a stable party id across renewals/linking.
 */
export async function ensurePartyForLinkedCompany(
  db: AppDb,
  companyId: number,
  createdBy?: number | null
): Promise<string> {
  const existing = await findPartyByLinkedCompany(db, companyId);
  if (existing) return existing.id;

  const [co] = await db
    .select({
      id: companies.id,
      name: companies.name,
      nameAr: companies.nameAr,
      crNumber: companies.crNumber,
      registrationNumber: companies.registrationNumber,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!co) throw new Error(`Company not found: ${companyId}`);

  const id = crypto.randomUUID();
  const row: InsertBusinessParty = {
    id,
    displayNameEn: co.name,
    displayNameAr: co.nameAr ?? null,
    legalNameEn: co.name,
    legalNameAr: co.nameAr ?? null,
    status: "active",
    linkedCompanyId: companyId,
    managedByCompanyId: null,
    registrationNumber: co.crNumber ?? co.registrationNumber ?? null,
    createdBy: createdBy ?? null,
  };
  await db.insert(businessParties).values(row);
  await appendPartyEvent(db, {
    partyId: id,
    action: "party_created",
    actorId: createdBy ?? undefined,
    details: { source: "platform_company_auto", companyId },
  });
  return id;
}

export async function listManagedExternalParties(db: AppDb, employerCompanyId: number) {
  return db
    .select()
    .from(businessParties)
    .where(
      and(
        eq(businessParties.managedByCompanyId, employerCompanyId),
        isNull(businessParties.linkedCompanyId)
      )
    )
    .orderBy(asc(businessParties.displayNameEn));
}

export type PromoterFlowClientOption =
  | {
      kind: "platform";
      companyId: number;
      displayNameEn: string;
      displayNameAr: string | null;
      registrationNumber: string | null;
    }
  | {
      kind: "external_party";
      partyId: string;
      displayNameEn: string;
      displayNameAr: string | null;
      registrationNumber: string | null;
    };

/** Unified client picker for employer-side promoter flow: tenants (except self) + managed externals. */
export async function listPromoterFlowClientOptions(
  db: AppDb,
  employerCompanyId: number
): Promise<PromoterFlowClientOption[]> {
  const tenantRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      nameAr: companies.nameAr,
      crNumber: companies.crNumber,
      registrationNumber: companies.registrationNumber,
    })
    .from(companies)
    .where(and(eq(companies.status, "active"), ne(companies.id, employerCompanyId)))
    .orderBy(asc(companies.name));

  const externals = await listManagedExternalParties(db, employerCompanyId);

  const platform: PromoterFlowClientOption[] = tenantRows.map((c) => ({
    kind: "platform" as const,
    companyId: c.id,
    displayNameEn: c.name,
    displayNameAr: c.nameAr ?? null,
    registrationNumber: c.crNumber ?? c.registrationNumber ?? null,
  }));

  const externalOpts: PromoterFlowClientOption[] = externals.map((p) => ({
    kind: "external_party" as const,
    partyId: p.id,
    displayNameEn: p.displayNameEn,
    displayNameAr: p.displayNameAr ?? null,
    registrationNumber: p.registrationNumber ?? null,
  }));

  return [...platform, ...externalOpts];
}

export async function createManagedExternalParty(
  db: AppDb,
  params: {
    managedByCompanyId: number;
    displayNameEn: string;
    displayNameAr?: string | null;
    legalNameEn?: string | null;
    legalNameAr?: string | null;
    registrationNumber?: string | null;
    phone?: string | null;
    email?: string | null;
    createdBy: number;
  }
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(businessParties).values({
    id,
    displayNameEn: params.displayNameEn.trim(),
    displayNameAr: params.displayNameAr?.trim() || null,
    legalNameEn: params.legalNameEn?.trim() || null,
    legalNameAr: params.legalNameAr?.trim() || null,
    status: "active",
    linkedCompanyId: null,
    managedByCompanyId: params.managedByCompanyId,
    registrationNumber: params.registrationNumber?.trim() || null,
    phone: params.phone?.trim() || null,
    email: params.email?.trim() || null,
    createdBy: params.createdBy,
  });
  await appendPartyEvent(db, {
    partyId: id,
    action: "external_party_created",
    actorId: params.createdBy,
    details: { managedByCompanyId: params.managedByCompanyId },
  });
  return id;
}

function normalizeRegistration(s: string | null | undefined): string | null {
  if (s == null || !String(s).trim()) return null;
  return String(s).replace(/\s+/g, "").toUpperCase();
}

/** Loose name match for merge safety (alphanumeric only, case-insensitive). */
export function partyAndCompanyNamesLooselyMatch(partyDisplayEn: string, companyName: string): boolean {
  const a = partyDisplayEn.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "");
  const b = companyName.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "");
  if (a.length < 2 || b.length < 2) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

export type PartyLinkAssessment = {
  canProceed: boolean;
  blockingReasons: string[];
  warnings: string[];
  /** Stable codes; caller must pass back in `acknowledgedWarningCodes` to proceed when warnings exist. */
  warningCodes: string[];
  party: {
    id: string;
    displayNameEn: string;
    registrationNumber: string | null;
    managedByCompanyId: number | null;
    linkedCompanyId: number | null;
  };
  targetCompany: {
    id: number;
    name: string;
    nameAr: string | null;
    crNumber: string | null;
    registrationNumber: string | null;
  } | null;
};

/**
 * Pre-flight checks before linking an external party to a platform tenant.
 * Does not mutate. Use `executePartyLinkToPlatformCompany` after acknowledgement of warnings.
 */
export async function assessPartyLinkSafety(
  db: AppDb,
  partyId: string,
  platformCompanyId: number
): Promise<PartyLinkAssessment> {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const warningCodes: string[] = [];

  const party = await getPartyById(db, partyId);
  if (!party) {
    return {
      canProceed: false,
      blockingReasons: ["Party not found"],
      warnings: [],
      warningCodes: [],
      party: {
        id: partyId,
        displayNameEn: "",
        registrationNumber: null,
        managedByCompanyId: null,
        linkedCompanyId: null,
      },
      targetCompany: null,
    };
  }

  if (party.linkedCompanyId != null) {
    blockingReasons.push("This party is already linked to a platform company.");
  }

  const [co] = await db
    .select({
      id: companies.id,
      name: companies.name,
      nameAr: companies.nameAr,
      crNumber: companies.crNumber,
      registrationNumber: companies.registrationNumber,
    })
    .from(companies)
    .where(eq(companies.id, platformCompanyId))
    .limit(1);

  if (!co) {
    blockingReasons.push("Target platform company not found.");
  }

  const otherLink = await findPartyByLinkedCompany(db, platformCompanyId);
  if (otherLink && otherLink.id !== party.id) {
    blockingReasons.push(
      `Another party record (${otherLink.id.slice(0, 8)}…) is already linked to this company. Merge or retire duplicates before linking.`
    );
  }

  const partyReg = normalizeRegistration(party.registrationNumber);
  const coReg = normalizeRegistration(co?.crNumber ?? co?.registrationNumber ?? null);
  if (partyReg && coReg && partyReg !== coReg) {
    blockingReasons.push(
      "Registration number on the external party does not match the tenant CR/registration — refuse automatic link."
    );
  }

  const regRaw = party.registrationNumber?.trim();
  const dupReg =
    regRaw && regRaw.length > 0
      ? await db
          .select({ id: businessParties.id })
          .from(businessParties)
          .where(and(ne(businessParties.id, partyId), eq(businessParties.registrationNumber, regRaw)))
          .limit(3)
      : [];
  if (regRaw && dupReg.length > 0) {
    warnings.push("Other party rows share the same registration number — verify this is the correct entity.");
    if (!warningCodes.includes("DUPLICATE_REG")) warningCodes.push("DUPLICATE_REG");
  }

  if (co && !partyAndCompanyNamesLooselyMatch(party.displayNameEn, co.name)) {
    warnings.push(
      `Display name "${party.displayNameEn}" does not closely match tenant name "${co.name}". Confirm this is the same legal entity.`
    );
    if (!warningCodes.includes("NAME_MISMATCH")) warningCodes.push("NAME_MISMATCH");
  }

  const canProceed = blockingReasons.length === 0;

  return {
    canProceed,
    blockingReasons,
    warnings,
    warningCodes,
    party: {
      id: party.id,
      displayNameEn: party.displayNameEn,
      registrationNumber: party.registrationNumber ?? null,
      managedByCompanyId: party.managedByCompanyId ?? null,
      linkedCompanyId: party.linkedCompanyId ?? null,
    },
    targetCompany: co
      ? {
          id: co.id,
          name: co.name,
          nameAr: co.nameAr ?? null,
          crNumber: co.crNumber ?? null,
          registrationNumber: co.registrationNumber ?? null,
        }
      : null,
  };
}

/** Mutating link — caller must run `assessPartyLinkSafety` and require warning acknowledgement first. */
export async function executePartyLinkToPlatformCompany(
  db: AppDb,
  params: {
    partyId: string;
    platformCompanyId: number;
    actorId: number;
    actorName?: string;
  }
): Promise<void> {
  const party = await getPartyById(db, params.partyId);
  if (!party) throw new Error("Party not found");
  if (party.linkedCompanyId != null) {
    throw new Error("Party is already linked to a platform company");
  }

  const [co] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, params.platformCompanyId))
    .limit(1);
  if (!co) throw new Error("Platform company not found");

  const otherLink = await findPartyByLinkedCompany(db, params.platformCompanyId);
  if (otherLink && otherLink.id !== party.id) {
    throw new Error("Another party record is already linked to this platform company");
  }

  await db
    .update(businessParties)
    .set({
      linkedCompanyId: params.platformCompanyId,
      updatedAt: new Date(),
    })
    .where(eq(businessParties.id, params.partyId));

  await appendPartyEvent(db, {
    partyId: params.partyId,
    action: "party_linked_to_company",
    actorId: params.actorId,
    actorName: params.actorName,
    details: { platformCompanyId: params.platformCompanyId },
  });

  const firstPartyRows = await db
    .select({ contractId: outsourcingContractParties.contractId })
    .from(outsourcingContractParties)
    .where(
      and(
        eq(outsourcingContractParties.partyId, params.partyId),
        eq(outsourcingContractParties.partyRole, "first_party")
      )
    );
  const contractIds = Array.from(new Set(firstPartyRows.map((r) => r.contractId)));
  if (contractIds.length > 0) {
    await db
      .update(outsourcingContracts)
      .set({ companyId: params.platformCompanyId, updatedAt: new Date() })
      .where(and(isNull(outsourcingContracts.companyId), inArray(outsourcingContracts.id, contractIds)));

    await db
      .update(outsourcingContractParties)
      .set({ companyId: params.platformCompanyId })
      .where(
        and(
          eq(outsourcingContractParties.partyId, params.partyId),
          eq(outsourcingContractParties.partyRole, "first_party")
        )
      );
  }
}

/** @deprecated Use executePartyLinkToPlatformCompany — kept for direct calls that already validated. */
export async function linkPartyToPlatformCompany(
  db: AppDb,
  params: {
    partyId: string;
    platformCompanyId: number;
    actorId: number;
    actorName?: string;
  }
): Promise<void> {
  await executePartyLinkToPlatformCompany(db, params);
}

export type AdminBusinessPartyRow = {
  id: string;
  displayNameEn: string;
  displayNameAr: string | null;
  status: string;
  linkedCompanyId: number | null;
  linkedCompanyName: string | null;
  managedByCompanyId: number | null;
  registrationNumber: string | null;
  createdAt: Date;
};

export async function listBusinessPartiesForAdmin(
  db: AppDb,
  opts: {
    filter: "unlinked_managed" | "all";
    search?: string;
    limit: number;
    offset: number;
  }
): Promise<AdminBusinessPartyRow[]> {
  const linkedCo = alias(companies, "bp_linked_company");

  const conditions = [];
  if (opts.filter === "unlinked_managed") {
    conditions.push(isNull(businessParties.linkedCompanyId));
    conditions.push(isNotNull(businessParties.managedByCompanyId));
  }
  if (opts.search?.trim()) {
    const q = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        like(businessParties.displayNameEn, q),
        like(businessParties.displayNameAr, q),
        like(businessParties.registrationNumber, q)
      )
    );
  }

  const baseQuery = db
    .select({
      id: businessParties.id,
      displayNameEn: businessParties.displayNameEn,
      displayNameAr: businessParties.displayNameAr,
      status: businessParties.status,
      linkedCompanyId: businessParties.linkedCompanyId,
      linkedCompanyName: linkedCo.name,
      managedByCompanyId: businessParties.managedByCompanyId,
      registrationNumber: businessParties.registrationNumber,
      createdAt: businessParties.createdAt,
    })
    .from(businessParties)
    .leftJoin(linkedCo, eq(linkedCo.id, businessParties.linkedCompanyId));

  const filtered =
    conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

  return filtered
    .orderBy(desc(businessParties.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);
}

/**
 * Backfill `party_id` on `outsourcing_contract_parties` where `company_id` is set but `party_id` is null.
 * Uses `ensurePartyForLinkedCompany` (idempotent per company). Safe to re-run.
 */
export async function backfillPartyIdsOnContractParties(
  db: AppDb,
  options?: { dryRun?: boolean }
): Promise<{ distinctCompanyIds: number[]; batchesApplied: number }> {
  const distinct = await db
    .select({ companyId: outsourcingContractParties.companyId })
    .from(outsourcingContractParties)
    .where(
      and(
        isNull(outsourcingContractParties.partyId),
        isNotNull(outsourcingContractParties.companyId)
      )
    )
    .groupBy(outsourcingContractParties.companyId);

  const companyIds = distinct.map((d) => d.companyId).filter((id): id is number => id != null);
  if (options?.dryRun) {
    return { distinctCompanyIds: companyIds, batchesApplied: 0 };
  }

  let batchesApplied = 0;
  for (const companyId of companyIds) {
    const partyId = await ensurePartyForLinkedCompany(db, companyId, null);
    await db
      .update(outsourcingContractParties)
      .set({ partyId })
      .where(
        and(
          eq(outsourcingContractParties.companyId, companyId),
          isNull(outsourcingContractParties.partyId)
        )
      );
    batchesApplied++;
  }
  return { distinctCompanyIds: companyIds, batchesApplied };
}

export async function searchActiveCompaniesForPartyLink(
  db: AppDb,
  q: string,
  limit: number
): Promise<{ id: number; name: string; nameAr: string | null }[]> {
  if (!q.trim()) {
    return db
      .select({ id: companies.id, name: companies.name, nameAr: companies.nameAr })
      .from(companies)
      .where(eq(companies.status, "active"))
      .orderBy(asc(companies.name))
      .limit(limit);
  }
  const term = `%${q.trim()}%`;
  return db
    .select({ id: companies.id, name: companies.name, nameAr: companies.nameAr })
    .from(companies)
    .where(
      and(
        eq(companies.status, "active"),
        or(like(companies.name, term), like(companies.nameAr, term))
      )
    )
    .orderBy(asc(companies.name))
    .limit(limit);
}

export async function appendPartyEvent(
  db: AppDb,
  params: {
    partyId: string;
    action: string;
    actorId?: number;
    actorName?: string;
    details?: Record<string, unknown>;
  }
) {
  await db.insert(businessPartyEvents).values({
    id: crypto.randomUUID(),
    partyId: params.partyId,
    action: params.action,
    actorId: params.actorId,
    actorName: params.actorName,
    details: params.details,
  });
}
