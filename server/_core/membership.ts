import { TRPCError } from "@trpc/server";
import { getUserCompany, getUserCompanyById } from "../db";
import type { CompanyMember } from "../../drizzle/schema";

/**
 * Canonical active company membership (one row: `company_members.isActive` + join to `companies`).
 * If companyId is provided, validates the user is a member of that specific company.
 * Use instead of ad hoc `company_members` queries so behavior matches `getUserCompany` everywhere.
 */
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
