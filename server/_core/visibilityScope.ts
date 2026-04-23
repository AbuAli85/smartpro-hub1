/**
 * server/_core/visibilityScope.ts
 *
 * Resolves how much company data a caller may see — the "scope layer" that sits
 * above pure role enforcement and models the real company hierarchy:
 *
 *   company  →  team  →  self
 *
 * Rules (in priority order):
 *  1. Platform admins (canAccessGlobalAdminProcedures) → always "company"
 *  2. company_admin, hr_admin, finance_admin, reviewer, external_auditor → "company"
 *  3. company_member whose employee record is the managerId of ≥1 active employee → "team"
 *  4. company_member with no direct reports → "self"
 *
 * "team" scope includes the manager themselves plus all employees whose
 * `employees.managerId = selfEmployeeId`.  It is NOT recursive (only direct
 * reports) to keep query complexity predictable.  If you need depth-2+ you can
 * call `expandTeamScope` on the returned id set.
 *
 * Usage in a router:
 *
 *   const scope = await resolveVisibilityScope(ctx.user as User, companyId);
 *   const whereClause = buildScopeFilter(employees, scope);
 *   const rows = await db.select().from(employees).where(whereClause);
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { employees, companyMembers } from "../../drizzle/schema";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { User } from "../../drizzle/schema";

/** The set of company_members.role values that always get full company scope. */
const COMPANY_SCOPE_ROLES = new Set([
  "company_admin",
  "hr_admin",
  "finance_admin",
  "reviewer",
  "external_auditor",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type VisibilityScope =
  | { type: "company"; companyId: number }
  | {
      type: "team";
      companyId: number;
      selfEmployeeId: number;
      /** Direct-report employee IDs + selfEmployeeId */
      managedEmployeeIds: number[];
    }
  | { type: "self"; companyId: number; selfEmployeeId: number | null };

// ─── Core resolver ────────────────────────────────────────────────────────────

/**
 * Returns the visibility scope for the caller in the given company.
 * Always resolves a concrete companyId — callers must have already validated
 * company membership before calling this.
 */
export async function resolveVisibilityScope(
  user: User,
  companyId: number,
): Promise<VisibilityScope> {
  // Platform operators see everything
  if (canAccessGlobalAdminProcedures(user)) {
    return { type: "company", companyId };
  }

  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

  // Resolve membership role
  const [membership] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, user.id),
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.isActive, true),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
  }

  // Admin-class roles → full company visibility
  if (COMPANY_SCOPE_ROLES.has(membership.role)) {
    return { type: "company", companyId };
  }

  // company_member: check if they are a manager of any active employee
  const [selfEmployee] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.userId, user.id),
      ),
    )
    .limit(1);

  if (!selfEmployee) {
    return { type: "self", companyId, selfEmployeeId: null };
  }

  const selfEmpId = selfEmployee.id;

  // Direct reports of this employee
  const reports = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        eq(employees.managerId, selfEmpId),
        eq(employees.status, "active"),
      ),
    );

  if (reports.length > 0) {
    return {
      type: "team",
      companyId,
      selfEmployeeId: selfEmpId,
      managedEmployeeIds: [selfEmpId, ...reports.map((r) => r.id)],
    };
  }

  return { type: "self", companyId, selfEmployeeId: selfEmpId };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Returns a Drizzle WHERE fragment that scopes an `employees`-joined query to
 * the visibility the caller is allowed.
 *
 * Pass the Drizzle table reference (or an alias) as `table`.
 */
export function buildEmployeeScopeFilter(
  table: typeof employees,
  scope: VisibilityScope,
): ReturnType<typeof eq> | ReturnType<typeof inArray> | ReturnType<typeof isNotNull> {
  switch (scope.type) {
    case "company":
      return eq(table.companyId, scope.companyId);
    case "team":
      return inArray(table.id, scope.managedEmployeeIds);
    case "self":
      if (scope.selfEmployeeId != null) {
        return eq(table.id, scope.selfEmployeeId);
      }
      // No employee record — return a condition that matches nothing
      return eq(table.id, -1);
  }
}

/**
 * Returns true when the `targetEmployeeId` is within the caller's scope.
 * Use this for single-record access checks (getEmployee, getTask, etc.).
 */
export function isInScope(scope: VisibilityScope, targetEmployeeId: number): boolean {
  switch (scope.type) {
    case "company":
      return true;
    case "team":
      return scope.managedEmployeeIds.includes(targetEmployeeId);
    case "self":
      return scope.selfEmployeeId === targetEmployeeId;
  }
}

// ─── Field-level redaction ────────────────────────────────────────────────────

type SensitiveFields = {
  salary?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  ibanNumber?: string | null;
  pasiNumber?: string | null;
  nationalId?: string | null;
  passportNumber?: string | null;
};

/**
 * Removes financial and identity fields from an employee record for callers
 * who are not allowed to see them.
 *
 * Applies to:
 *  - external_auditor: sees HR structure but not salary/banking/identity docs
 *  - team-scope managers: see team operational data but not salary
 */
export function redactEmployeeForScope<T extends SensitiveFields>(
  emp: T,
  scope: VisibilityScope,
  memberRole: string,
): T {
  const isAuditor = memberRole === "external_auditor";
  const isManager = scope.type === "team";

  if (!isAuditor && !isManager) return emp;

  return {
    ...emp,
    salary: null,
    bankName: null,
    bankAccountNumber: null,
    ibanNumber: null,
    pasiNumber: null,
    ...(isAuditor
      ? {
          nationalId: null,
          passportNumber: null,
        }
      : {}),
  };
}

// ─── Scope label (for logging / error messages) ───────────────────────────────

export function scopeLabel(scope: VisibilityScope): string {
  switch (scope.type) {
    case "company":
      return "company";
    case "team":
      return `team (${scope.managedEmployeeIds.length} members)`;
    case "self":
      return scope.selfEmployeeId != null ? `self (emp #${scope.selfEmployeeId})` : "self (no record)";
  }
}
