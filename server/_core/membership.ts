import { TRPCError } from "@trpc/server";
import { getUserCompany } from "../db";
import type { CompanyMember } from "../../drizzle/schema";

/**
 * Canonical active company membership (one row: `company_members.isActive` + join to `companies`).
 * Use instead of ad hoc `company_members` queries so behavior matches `getUserCompany` everywhere.
 */
export async function getActiveCompanyMembership(
  userId: number
): Promise<{ companyId: number; role: CompanyMember["role"] } | null> {
  const m = await getUserCompany(userId);
  if (!m?.company?.id || !m.member) return null;
  return { companyId: m.company.id, role: m.member.role };
}

export async function requireActiveCompanyMembership(
  userId: number
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  const m = await getActiveCompanyMembership(userId);
  if (!m) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  }
  return m;
}
