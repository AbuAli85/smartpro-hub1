import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireActiveCompanyId } from "../_core/tenant";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { canReadTeamWorkspace } from "../personPerformanceAccess";
import { loadMyWorkspace, loadTeamWorkspace } from "../workspaceData";
import { employees, employeeTasks, performanceInterventions } from "../../drizzle/schema";
import { assertCanCloseIntervention, assertCanManageInterventionOnEmployee } from "../interventionAccess";
import { sendEmployeeNotification } from "./employeePortal";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

const interventionKind = z.enum([
  "request_update",
  "corrective_task",
  "follow_up",
  "under_review",
  "escalate",
]);

/**
 * Daily workspace: my snapshot + optional team snapshot (same company).
 * Team section is omitted when the user lacks HR/KPI team read access.
 */
export const workspaceRouter = router({
  getWorkspace: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        year: z.number().optional(),
        month: z.number().optional(),
        /** When true, include team summary if RBAC allows (default true; server still hides if forbidden). */
        includeTeam: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const now = new Date();
      const year = input.year ?? now.getFullYear();
      const month = input.month ?? now.getMonth() + 1;
      const includeTeam = input.includeTeam !== false;

      const my = await loadMyWorkspace(db, companyId, ctx.user.id, year, month);

      let team = null;
      if (includeTeam && (await canReadTeamWorkspace(ctx.user, companyId))) {
        team = await loadTeamWorkspace(db, companyId, year, month, ctx.user.id);
      }

      return { year, month, my, team };
    }),

  createIntervention: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        employeeId: z.number(),
        kind: interventionKind,
        note: z.string().max(1000).optional(),
        followUpAt: z.string().optional(),
        taskTitle: z.string().max(255).optional(),
        taskDueDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const m = await requireWorkspaceMembership(ctx.user, input.companyId);
      requireNotAuditor(m.role);
      await assertCanManageInterventionOnEmployee(db, ctx.user, m.companyId, input.employeeId);

      let linkedTaskId: number | null = null;
      if (input.kind === "corrective_task" && (input.taskTitle?.trim() ?? "").length > 0) {
        const now = new Date();
        const [taskIns] = await db.insert(employeeTasks).values({
          companyId: m.companyId,
          assignedToEmployeeId: input.employeeId,
          assignedByUserId: ctx.user.id,
          assignedAt: now,
          title: input.taskTitle!.trim(),
          priority: "high",
          dueDate: input.taskDueDate ? new Date(input.taskDueDate) : undefined,
          status: "pending",
          notifiedOverdue: false,
        });
        const tid = (taskIns as { insertId?: number }).insertId as number | undefined;
        if (tid) linkedTaskId = tid;
      }

      const status = input.kind === "escalate" ? "escalated" : "open";
      const follow = input.followUpAt?.trim()
        ? new Date(`${input.followUpAt.trim()}T09:00:00`)
        : null;

      await db.insert(performanceInterventions).values({
        companyId: m.companyId,
        employeeId: input.employeeId,
        managerUserId: ctx.user.id,
        status,
        kind: input.kind,
        followUpAt: follow ?? undefined,
        linkedTaskId: linkedTaskId ?? undefined,
        note: input.note?.trim() ?? undefined,
      });

      const [target] = await db
        .select({ userId: employees.userId })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, m.companyId)))
        .limit(1);
      if (target?.userId) {
        await sendEmployeeNotification({
          toUserId: target.userId,
          companyId: m.companyId,
          type: "intervention",
          title: "Manager follow-up",
          message: "Your manager sent a follow-up. Open Workspace to see it.",
          link: "/workspace",
        });
      }

      return { ok: true as const };
    }),

  closeIntervention: protectedProcedure
    .input(z.object({ companyId: z.number().optional(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const m = await requireWorkspaceMembership(ctx.user, input.companyId);
      requireNotAuditor(m.role);
      const companyId = m.companyId;

      const [row] = await db
        .select()
        .from(performanceInterventions)
        .where(
          and(eq(performanceInterventions.id, input.id), eq(performanceInterventions.companyId, companyId))
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Intervention not found." });

      await assertCanCloseIntervention(db, ctx.user, companyId, row.managerUserId);

      await db
        .update(performanceInterventions)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(performanceInterventions.id, row.id));

      return { ok: true as const };
    }),
});
