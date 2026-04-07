import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { employees } from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { assertCanReadKpiTargets } from "./kpiTargetAccess";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** HR performance / KPI readers — same gate as team KPI visibility. */
export async function assertCanReadPersonPerformance(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number
): Promise<void> {
  await assertCanReadKpiTargets(user, companyId);
}

/**
 * Read scorecard for `employeeId`: self (linked user), direct manager (employees.managerId → user), or HR performance readers.
 */
export async function assertCanReadPersonScorecard(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number,
  employeeId: number
): Promise<void> {
  if (canAccessGlobalAdminProcedures(user)) return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [emp] = await db
    .select({
      id: employees.id,
      userId: employees.userId,
      companyId: employees.companyId,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)))
    .limit(1);
  if (!emp) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
  }
  if (emp.userId != null && emp.userId === user.id) return;
  if (emp.managerId != null) {
    const mgr = await loadEmployeeForCompany(db, companyId, emp.managerId);
    if (mgr?.userId != null && mgr.userId === user.id) return;
  }
  await assertCanReadPersonPerformance(user, companyId);
}

export async function loadEmployeeForCompany(
  db: Db,
  companyId: number,
  employeeId: number
): Promise<typeof employees.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.id, employeeId)))
    .limit(1);
  return row ?? null;
}

/** Resolve KPI `employee_user_id` keys that may refer to portal user id or legacy employee id. */
export function kpiIdentityKeys(emp: { id: number; userId: number | null }): number[] {
  if (emp.userId != null) return [emp.userId, emp.id];
  return [emp.id];
}
