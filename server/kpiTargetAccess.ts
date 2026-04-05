import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "./db";
import { companyMembers, employees } from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { HR_PERF, HR_TARGETS, memberHasHrPerformancePermission } from "@shared/hrPerformancePermissions";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function loadMember(
  userId: number,
  companyId: number
): Promise<{ role: string; permissions: unknown } | null> {
  const db = await getDb();
  if (!db) return null;
  const [member] = await db
    .select({ role: companyMembers.role, permissions: companyMembers.permissions })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, userId),
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.isActive, true)
      )
    )
    .limit(1);
  return member ?? null;
}

export async function hasKpiTargetPermission(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number,
  permission: string
): Promise<boolean> {
  if (canAccessGlobalAdminProcedures(user)) return true;
  const member = await loadMember(user.id, companyId);
  if (!member) return false;
  return memberHasHrPerformancePermission(member, permission);
}

/** Team progress, leaderboard, admin logs — readers with HR or target read. */
export async function assertCanReadKpiTargets(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number
): Promise<void> {
  if (await hasKpiTargetPermission(user, companyId, HR_TARGETS.READ)) return;
  if (await hasKpiTargetPermission(user, companyId, HR_PERF.READ)) return;
  if (await hasKpiTargetPermission(user, companyId, HR_TARGETS.MANAGE)) return;
  if (await hasKpiTargetPermission(user, companyId, HR_PERF.MANAGE)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view KPI targets." });
}

/** Create / update / transition targets */
export async function assertCanManageKpiTargets(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number
): Promise<void> {
  if (await hasKpiTargetPermission(user, companyId, HR_TARGETS.MANAGE)) return;
  if (await hasKpiTargetPermission(user, companyId, HR_PERF.MANAGE)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage KPI targets." });
}

/**
 * `employeeUserId` on kpi_targets matches `employees.id` or `employees.userId` (legacy callers pass either).
 */
export async function assertEmployeeScopedForKpiTarget(
  db: Db,
  companyId: number,
  employeeUserId: number
): Promise<void> {
  const [emp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.companyId, companyId),
        or(eq(employees.id, employeeUserId), eq(employees.userId, employeeUserId))
      )
    )
    .limit(1);
  if (!emp) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Employee is not in this company." });
  }
}
