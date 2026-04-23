/**
 * server/_core/policy.ts
 *
 * Centralized RBAC policy helpers for SmartPRO tenant mutations.
 *
 * ## Why this exists
 * Using bare `protectedProcedure` only guarantees the caller is authenticated — it does NOT
 * verify that the caller holds an operator-level role within the target company. This file
 * provides a single, auditable gate for all tenant mutations so that:
 *  - company_member / reviewer / external_auditor / client roles are blocked from admin actions.
 *  - Platform-level operators (super_admin, platform_admin, etc.) are always trusted.
 *  - The role check is co-located with the workspace resolution, preventing accidental gaps.
 *
 * ## Usage (in a router mutation)
 *
 *   import { requireHrOrAdmin } from "../_core/policy";
 *   import type { User } from "../../drizzle/schema";
 *
 *   createFoo: protectedProcedure
 *     .input(z.object({ companyId: z.number().optional(), ... }))
 *     .mutation(async ({ ctx, input }) => {
 *       const { companyId } = await requireHrOrAdmin(ctx.user as User, input.companyId);
 *       // ... DB operations using companyId
 *     }),
 *
 * ## Role taxonomy (company_members.role)
 *  - company_admin   → full admin access
 *  - hr_admin        → HR module access
 *  - finance_admin   → Finance module access
 *  - company_member  → self-service only (My Portal)
 *  - reviewer        → read-only across company
 *  - external_auditor→ read-only, no mutations
 *  - client          → client portal only
 */

import { TRPCError } from "@trpc/server";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { requireActiveCompanyId } from "./tenant";
import { requireWorkspaceMembership } from "./membership";
import type { CompanyMember, User } from "../../drizzle/schema";

/** Roles that are permitted to perform administrative mutations within a company. */
export type TenantMutationRole = "company_admin" | "hr_admin" | "finance_admin";

/**
 * Core policy gate for all tenant mutations.
 *
 * Resolves the active workspace and verifies the caller holds one of `allowedRoles`.
 * Platform-level admins (super_admin, platform_admin, etc.) always pass regardless of role.
 *
 * @param user        - The authenticated session user (`ctx.user as User`)
 * @param allowedRoles - Roles permitted to call this mutation
 * @param companyId   - Optional explicit workspace; falls back to implicit selection
 * @returns { companyId, role } for use in downstream DB operations
 * @throws FORBIDDEN when the caller's membership role is not in `allowedRoles`
 */
export async function requireTenantRole(
  user: User,
  allowedRoles: readonly TenantMutationRole[],
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  // Platform operators (super_admin / platform_admin / regional_manager / client_services)
  // are globally trusted — bypass tenant role enforcement.
  if (canAccessGlobalAdminProcedures(user)) {
    const cid = await requireActiveCompanyId(user.id, companyId, user);
    return { companyId: cid, role: "company_admin" };
  }

  const m = await requireWorkspaceMembership(user, companyId);

  if (!(allowedRoles as readonly string[]).includes(m.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `This action requires one of the following roles: ${allowedRoles.join(", ")}.`,
    });
  }

  return m;
}

/**
 * Only `company_admin` may perform this action.
 * Use for operations that touch company-wide settings, billing, or structural configuration.
 */
export async function requireCompanyAdmin(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  return requireTenantRole(user, ["company_admin"], companyId);
}

/**
 * `company_admin` or `hr_admin` may perform this action.
 * Use for employee management, attendance, payroll, recruitment, org structure, scheduling.
 */
export async function requireHrOrAdmin(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  return requireTenantRole(user, ["company_admin", "hr_admin"], companyId);
}

/**
 * `company_admin` or `finance_admin` may perform this action.
 * Use for invoicing, billing, collections, financial reports, and payroll runs.
 */
export async function requireFinanceOrAdmin(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  return requireTenantRole(user, ["company_admin", "finance_admin"], companyId);
}

/**
 * Any of `company_admin`, `hr_admin`, or `finance_admin` may perform this action.
 * Use for cross-functional operator actions like automation rules, renewals, CRM, dashboards.
 */
export async function requireAnyOperatorRole(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  return requireTenantRole(user, ["company_admin", "hr_admin", "finance_admin"], companyId);
}
