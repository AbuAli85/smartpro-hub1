import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getContractById, getDb, getUserCompany } from "../db";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { User } from "../../drizzle/schema";
import { contractSignatures } from "../../drizzle/schema";

/**
 * Quotations may be company-scoped or legacy rows with null companyId (creator-only).
 */
export async function assertQuotationTenantAccess(
  user: User,
  quotation: { companyId: number | null; createdBy: number },
  entityLabel = "Quotation"
): Promise<void> {
  if (canAccessGlobalAdminProcedures(user)) return;
  if (quotation.companyId != null) {
    await assertRowBelongsToActiveCompany(user, quotation.companyId, entityLabel);
    return;
  }
  if (quotation.createdBy !== user.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: `${entityLabel} not found` });
  }
}

export function normalizeEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

/**
 * Active company for the user. Fails if the user has no company membership.
 */
export async function requireActiveCompanyId(userId: number): Promise<number> {
  const m = await getUserCompany(userId);
  if (!m?.company?.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  }
  return m.company.id;
}

/**
 * Enforce tenant boundary. Uses NOT_FOUND for cross-tenant mismatches to reduce enumeration.
 */
export async function assertRowBelongsToActiveCompany(
  user: User,
  rowCompanyId: number | null | undefined,
  entityLabel = "Record"
): Promise<void> {
  if (rowCompanyId == null) {
    throw new TRPCError({ code: "NOT_FOUND", message: `${entityLabel} not found` });
  }
  if (canAccessGlobalAdminProcedures(user)) return;
  const cid = await requireActiveCompanyId(user.id);
  if (rowCompanyId !== cid) {
    throw new TRPCError({ code: "NOT_FOUND", message: `${entityLabel} not found` });
  }
}

async function assertContractPartyOrCompany(user: User, contractId: number): Promise<void> {
  const c = await getContractById(contractId);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
  if (c.companyId == null) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
  if (canAccessGlobalAdminProcedures(user)) return;
  const m = await getUserCompany(user.id);
  if (m?.company.id === c.companyId) return;

  const email = normalizeEmail(user.email);
  if (!email) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Account email required for signing" });
  }
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const rows = await db
    .select({ signerEmail: contractSignatures.signerEmail })
    .from(contractSignatures)
    .where(eq(contractSignatures.contractId, contractId));
  const match = rows.some((r) => normalizeEmail(r.signerEmail) === email);
  if (!match) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
  }
}

/** Read contract metadata: platform, owning company, or invited signer. */
export async function assertContractReadable(user: User, contractId: number): Promise<void> {
  await assertContractPartyOrCompany(user, contractId);
}

/**
 * Who may read contract signer list: platform staff, same-company members, or a listed signer (by email).
 */
export async function assertContractSignersVisible(user: User, contractId: number): Promise<void> {
  await assertContractPartyOrCompany(user, contractId);
}

/**
 * Signer mutations: only the invited email may act on that signature row.
 */
export async function assertSignatureActor(user: User, signerEmail: string | null | undefined): Promise<void> {
  const a = normalizeEmail(user.email);
  const b = normalizeEmail(signerEmail);
  if (!a || !b || a !== b) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You are not authorized to sign for this request" });
  }
}

/**
 * Stats / dashboard / compliance-style endpoints: platform may aggregate all tenants or pass `inputCompanyId`;
 * company users are scoped to active membership and must not pass another tenant’s id (NOT_FOUND).
 */
export type StatsCompanyFilterResult =
  | { aggregateAllTenants: true }
  | { aggregateAllTenants: false; companyId: number };

/** Dashboard / operations: `null` = platform may aggregate all tenants; otherwise active company id. */
export async function resolvePlatformOrCompanyScope(user: User): Promise<number | null> {
  if (canAccessGlobalAdminProcedures(user)) return null;
  return requireActiveCompanyId(user.id);
}

export async function resolveStatsCompanyFilter(
  user: User,
  inputCompanyId?: number | null
): Promise<StatsCompanyFilterResult> {
  if (canAccessGlobalAdminProcedures(user)) {
    if (inputCompanyId != null) return { aggregateAllTenants: false, companyId: inputCompanyId };
    return { aggregateAllTenants: true };
  }
  const m = await getUserCompany(user.id);
  if (!m?.company?.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  }
  if (inputCompanyId != null && inputCompanyId !== m.company.id) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
  }
  return { aggregateAllTenants: false, companyId: m.company.id };
}
