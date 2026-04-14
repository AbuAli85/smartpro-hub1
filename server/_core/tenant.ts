import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { getContractById, getDb, getUserCompanies, getUserCompanyById } from "../db";
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
    await assertRowBelongsToActiveCompany(user, quotation.companyId, entityLabel, quotation.companyId);
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
 * Resolves the workspace company for tenant-scoped operations.
 * - If `companyId` is set, validates membership in that company.
 * - If omitted: requires exactly one active membership, **including for global platform admins** (no implicit
 *   “pick first company” for multi-tenant users — avoids acting on the wrong workspace).
 * - The optional `user` argument is kept for call-site clarity and compatibility; resolution is membership-based.
 */
export async function requireActiveCompanyId(userId: number, companyId?: number | null, _user?: User): Promise<number> {
  if (companyId != null) {
    const m = await getUserCompanyById(userId, companyId);
    if (!m?.company?.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You are not a member of this company" });
    }
    return m.company.id;
  }
  const list = await getUserCompanies(userId);
  if (list.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  }
  if (list.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Select a company workspace — pass companyId for this operation.",
    });
  }
  return list[0].company.id;
}

/**
 * Enforce tenant boundary. Uses NOT_FOUND for cross-tenant mismatches to reduce enumeration.
 */
export async function assertRowBelongsToActiveCompany(
  user: User,
  rowCompanyId: number | null | undefined,
  entityLabel = "Record",
  activeCompanyId?: number | null
): Promise<void> {
  if (rowCompanyId == null) {
    throw new TRPCError({ code: "NOT_FOUND", message: `${entityLabel} not found` });
  }
  if (canAccessGlobalAdminProcedures(user)) return;
  const cid = await requireActiveCompanyId(user.id, activeCompanyId, user);
  if (rowCompanyId !== cid) {
    throw new TRPCError({ code: "NOT_FOUND", message: `${entityLabel} not found` });
  }
}

async function assertContractPartyOrCompany(user: User, contractId: number): Promise<void> {
  const c = await getContractById(contractId);
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
  if (c.companyId == null) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
  if (canAccessGlobalAdminProcedures(user)) return;
  /** Owning-company access: membership in the contract's company only (no implicit first-workspace). */
  const m = await getUserCompanyById(user.id, c.companyId);
  if (m?.company?.id === c.companyId) return;

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
 * company users are scoped to active membership and must not pass another tenant's id (NOT_FOUND).
 */
export type StatsCompanyFilterResult =
  | { aggregateAllTenants: true }
  | { aggregateAllTenants: false; companyId: number };

/** Dashboard / operations: `null` = platform may aggregate all tenants; otherwise active company id. */
export async function resolvePlatformOrCompanyScope(user: User, inputCompanyId?: number | null): Promise<number | null> {
  if (canAccessGlobalAdminProcedures(user)) return null;
  return requireActiveCompanyId(user.id, inputCompanyId, user);
}

export async function resolveStatsCompanyFilter(
  user: User,
  inputCompanyId?: number | null
): Promise<StatsCompanyFilterResult> {
  if (canAccessGlobalAdminProcedures(user)) {
    if (inputCompanyId != null) return { aggregateAllTenants: false, companyId: inputCompanyId };
    return { aggregateAllTenants: true };
  }
  const cid = await requireActiveCompanyId(user.id, inputCompanyId, user);
  return { aggregateAllTenants: false, companyId: cid };
}
