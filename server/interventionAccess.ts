import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { employees } from "../drizzle/schema";
import type { User } from "../drizzle/schema";
import { canReadTeamWorkspace, loadEmployeeForCompany } from "./personPerformanceAccess";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** HR/leadership team view, or direct line manager of `targetEmployeeId`. */
export async function assertCanManageInterventionOnEmployee(
  db: Db,
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number,
  targetEmployeeId: number
): Promise<void> {
  if (await canReadTeamWorkspace(user, companyId)) return;
  const [actorEmp] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.userId, user.id)))
    .limit(1);
  const target = await loadEmployeeForCompany(db, companyId, targetEmployeeId);
  if (!target) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found." });
  }
  if (actorEmp && target.managerId === actorEmp.id) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "You cannot add an intervention for this person." });
}

export async function assertCanCloseIntervention(
  db: Db,
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number,
  managerUserId: number
): Promise<void> {
  if (user.id === managerUserId) return;
  if (await canReadTeamWorkspace(user, companyId)) return;
  throw new TRPCError({ code: "FORBIDDEN", message: "You cannot close this intervention." });
}
