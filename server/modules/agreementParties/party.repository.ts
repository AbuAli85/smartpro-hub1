/**
 * Agreement party master — data access.
 * Keeps one canonical row per platform company (linked_company_id) when possible.
 */

import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
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

/**
 * Link an external party to a platform company. Caller must enforce RBAC.
 * Updates outsourcing_contract header company_id when it was NULL and first_party pointed at this party.
 */
export async function linkPartyToPlatformCompany(
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
