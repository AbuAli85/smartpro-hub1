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

// Re-export scope helpers so routers only import from one place
export {
  resolveVisibilityScope,
  buildEmployeeScopeFilter,
  isInScope,
  redactEmployeeForScope,
  scopeLabel,
} from "./visibilityScope";
export type { VisibilityScope } from "./visibilityScope";

// Capability layer: role × scope → what the caller may do + field redaction
export { deriveCapabilities, applyEmployeePayloadPolicy } from "./capabilities";
export type { Capabilities, MemberRole, EmployeeSensitiveFields } from "./capabilities";

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

/**
 * HR/Admin scope: requires `company_admin` or `hr_admin`, OR any authenticated member
 * for self-scoped access (the caller's own employee record).
 *
 * Returns `{ companyId, role, isSelfOnly }`.  When `isSelfOnly` is true the
 * caller is a company_member/reviewer/client and can only see their own data —
 * callers must apply `resolveVisibilityScope` to filter responses accordingly.
 */
export async function requireWorkspaceMemberForRead(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  // Platform operators always pass
  if (canAccessGlobalAdminProcedures(user)) {
    const cid = await requireActiveCompanyId(user.id, companyId, user);
    return { companyId: cid, role: "company_admin" };
  }
  return requireWorkspaceMembership(user, companyId);
}

// ─── Control Tower guards ─────────────────────────────────────────────────────

/**
 * Control Tower read gate.
 *
 * Passes for any user who holds canViewCompanyControlTower:
 *   company_admin, hr_admin, finance_admin, reviewer, external_auditor,
 *   and company_member with dept/team scope.
 *
 * Returns `{ companyId, role, scope }`.  Callers must apply scope filtering so
 * that dept/team managers only receive items relevant to their scope.
 */
export async function requireCanViewCompanyControlTower(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  // Platform operators always have access
  if (canAccessGlobalAdminProcedures(user)) {
    const cid = await requireActiveCompanyId(user.id, companyId, user);
    return { companyId: cid, role: "company_admin" };
  }
  const m = await requireWorkspaceMembership(user, companyId);
  // Operator-class roles always pass
  const ALLOWED: readonly string[] = [
    "company_admin",
    "hr_admin",
    "finance_admin",
    "reviewer",
    "external_auditor",
  ];
  if (ALLOWED.includes(m.role)) return m;
  // company_member: pass only when they have managerial scope
  if (m.role === "company_member") {
    const { resolveVisibilityScope: resolveScp } = await import("./visibilityScope");
    const scope = await resolveScp(user, m.companyId);
    if (scope.type === "department" || scope.type === "team") return m;
  }
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Company Control Tower is not accessible to your current role and scope.",
  });
}

/**
 * Control Tower mutation gate: allows acknowledge, manage, assign, resolve.
 * Restricted to company_admin, hr_admin, finance_admin.
 */
export async function requireCanManageControlTower(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  return requireTenantRole(user, ["company_admin", "hr_admin", "finance_admin"], companyId);
}

export type ControlTowerDomain =
  | "hr"
  | "payroll"
  | "finance"
  | "compliance"
  | "operations"
  | "contracts"
  | "documents"
  | "crm"
  | "client"
  | "audit";

/**
 * Domain-scoped signal access gate.
 *
 * Checks that the caller both has company Control Tower access AND holds the
 * domain-specific signal capability.  Throws FORBIDDEN if either check fails.
 *
 * Use this inside per-signal query procedures to prevent cross-domain leakage
 * (e.g. hr_admin cannot call finance signal procedures and vice-versa).
 */
export async function requireControlTowerSignalAccess(
  user: User,
  domain: ControlTowerDomain,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  // Resolves membership AND scope in one shot
  const m = await requireCanViewCompanyControlTower(user, companyId);

  // Platform operators skip domain checks
  if (canAccessGlobalAdminProcedures(user)) return m;

  const { resolveVisibilityScope: resolveScp } = await import("./visibilityScope");
  const { deriveCapabilities: deriveCaps } = await import("./capabilities");
  const scope = await resolveScp(user, m.companyId);
  const caps = deriveCaps(m.role, scope);

  const domainCapMap: Record<ControlTowerDomain, keyof typeof caps> = {
    hr: "canViewControlTowerHrSignals",
    payroll: "canViewControlTowerFinanceSignals",
    finance: "canViewControlTowerFinanceSignals",
    compliance: "canViewControlTowerComplianceSignals",
    operations: "canViewControlTowerOperationsSignals",
    contracts: "canViewControlTowerOperationsSignals",
    documents: "canViewControlTowerHrSignals",
    crm: "canViewControlTowerOperationsSignals",
    client: "canViewControlTowerOperationsSignals",
    audit: "canViewControlTowerAuditSignals",
  };

  const capKey = domainCapMap[domain];
  if (!caps[capKey]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Your role does not permit access to Control Tower ${domain} signals.`,
    });
  }
  return m;
}

// ─── Payroll guard ────────────────────────────────────────────────────────────

/**
 * Payroll access: requires `company_admin` or `finance_admin`.
 *
 * Returns `{ companyId, role }`.  Callers should then call
 * `deriveCapabilities(role, scope)` to check specific payroll action capabilities
 * (canRunPayroll, canApprovePayroll, canMarkPayrollPaid, canEditPayrollLineItem,
 * canGenerateWpsFile).
 *
 * `company_admin` has all payroll capabilities.
 * `finance_admin` can run, edit line items, and generate WPS — but NOT approve or mark paid.
 */
export async function requirePayrollAdmin(
  user: User,
  companyId?: number | null,
): Promise<{ companyId: number; role: CompanyMember["role"] }> {
  return requireTenantRole(user, ["company_admin", "finance_admin"], companyId);
}
