import { TRPCError } from "@trpc/server";
import { getUserCompany, getUserCompanyById } from "../db";
import type { CompanyMember, User } from "../../drizzle/schema";
import { requireActiveCompanyId } from "./tenant";

/**
 * Policy (post–workspace migration):
 * - **Authorization in routers** must use {@link requireWorkspaceMembership} or {@link requireActiveCompanyId},
 *   not first-membership guessing.
 * - **`getActiveCompanyMembership` without `companyId`** remains for legacy call sites, tests, and
 *   **non-authority** helpers only; do not add new tenant-sensitive reads/mutations on implicit selection.
 */
/**
 * Legacy “implicit” workspace: first membership row order from {@link getUserCompany}.
 * **Shadow / diagnostics only** — compares to explicit `input.companyId` to find client/server drift.
 * Do not use for authorization once explicit workspace is enforced.
 */
export async function getImplicitWorkspaceCompanyIdForShadow(userId: number): Promise<number | null> {
  const m = await getActiveCompanyMembership(userId);
  return m?.companyId ?? null;
}

export async function getActiveCompanyMembership(
  userId: number,
  companyId?: number | null
): Promise<{ companyId: number; role: CompanyMember["role"] } | null> {
  if (companyId != null) {
    const m = await getUserCompanyById(userId, companyId);
    if (!m?.company?.id || !m.member) return null;
    return { companyId: m.company.id, role: m.member.role };
  }
  const m = await getUserCompany(userId);
  if (!m?.company?.id || !m.member) return null;
  return { companyId: m.company.id, role: m.member.role };
}

/**
 * Selected workspace + role for mutations and tenant-scoped reads that must not guess the company
 * when the user belongs to multiple tenants.
 */
export async function requireWorkspaceMembership(
  user: User,
  companyId?: number | null
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  const cid = await requireActiveCompanyId(user.id, companyId, user);
  const m = await getUserCompanyById(user.id, cid);
  if (!m?.company?.id || !m.member) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
  }
  return { companyId: m.company.id, role: m.member.role };
}

export async function requireActiveCompanyMembership(
  userId: number,
  companyId?: number | null
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  const m = await getActiveCompanyMembership(userId, companyId);
  if (!m) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  }
  return m;
}

/**
 * Throws FORBIDDEN if the membership role is external_auditor.
 * Use in any write (mutation) procedure to enforce read-only access for auditors.
 *
 * Usage:
 *   const m = await requireActiveCompanyMembership(ctx.user.id);
 *   requireNotAuditor(m.role);
 */
export function requireNotAuditor(
  role: CompanyMember["role"],
  message = "External Auditors have read-only access and cannot perform this action.",
): void {
  if (role === "external_auditor") {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}
