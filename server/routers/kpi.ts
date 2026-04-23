import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { createNotification, getDb } from "../db";
import { kpiTargets, kpiDailyLogs, kpiAchievements, employees } from "../../drizzle/schema";
import { eq, and, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { requireActiveCompanyId } from "../_core/tenant";
import {
  assertCanManageKpiTargets,
  assertCanReadKpiTargets,
  assertEmployeeScopedForKpiTarget,
} from "../kpiTargetAccess";
import {
  assertKpiTargetRowEditableForMetrics,
  assertKpiTargetStatusTransition,
  type KpiTargetStatus,
} from "../kpiTargetGuards";
import { insertHrPerformanceAuditEvent, kpiTargetAuditSnapshot } from "../hrPerformanceAudit";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireDb() {
  const rawDb = await getDb();
  if (!rawDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return rawDb;
}

const EMPLOYEE_TARGET_STATUSES = ["active", "completed"] as const;
const ADMIN_TEAM_TARGET_STATUSES = ["draft", "active", "completed"] as const;

async function sendNotification(
  userId: number,
  companyId: number,
  title: string,
  message: string,
  link?: string,
  auditActorUserId?: number | null,
) {
  try {
    await createNotification(
      {
        userId,
        companyId,
        type: "kpi",
        title,
        message,
        link: link ?? "/my-portal",
        isRead: false,
      },
      { actorUserId: auditActorUserId ?? null },
    );
  } catch {}
}

async function recalcAchievement(
  companyId: number, employeeUserId: number,
  year: number, month: number,
  metricName: string, targetId: number,
  targetValue: number, commissionRate: number,
  commissionType: string, currency: string
) {
  const db = await requireDb();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
  const logs = await db
    .select({ total: sql<string>`COALESCE(SUM(value_achieved), 0)` })
    .from(kpiDailyLogs)
    .where(
      and(
        eq(kpiDailyLogs.companyId, companyId),
        eq(kpiDailyLogs.employeeUserId, employeeUserId),
        eq(kpiDailyLogs.metricName, metricName),
        gte(kpiDailyLogs.logDate, startDate),
        lte(kpiDailyLogs.logDate, endDate)
      )
    );
  const achieved = parseFloat(logs[0]?.total ?? "0");
  const pct = targetValue > 0 ? Math.min((achieved / targetValue) * 100, 999.99) : 0;
  let commission = 0;
  if (commissionType === "percentage") {
    commission = (achieved * commissionRate) / 100;
  } else if (commissionType === "fixed_per_unit") {
    commission = achieved * commissionRate;
  }

  const db2 = await requireDb();
  const existing = await db2.select({ id: kpiAchievements.id }).from(kpiAchievements).where(
    and(
      eq(kpiAchievements.companyId, companyId),
      eq(kpiAchievements.employeeUserId, employeeUserId),
      eq(kpiAchievements.periodYear, year),
      eq(kpiAchievements.periodMonth, month),
      eq(kpiAchievements.metricName, metricName)
    )
  ).limit(1);

  if (existing.length > 0) {
    await db.update(kpiAchievements).set({
      achievedValue: String(achieved),
      achievementPct: String(pct.toFixed(2)),
      commissionEarned: String(commission.toFixed(2)),
    }).where(eq(kpiAchievements.id, existing[0].id));
  } else {
    await db.insert(kpiAchievements).values({
      companyId,
      employeeUserId,
      periodYear: year,
      periodMonth: month,
      metricName,
      targetValue: String(targetValue),
      achievedValue: String(achieved),
      achievementPct: String(pct.toFixed(2)),
      commissionEarned: String(commission.toFixed(2)),
      currency,
      kpiTargetId: targetId,
    });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const kpiRouter = router({

  // ── Employee: list my targets for a period ──────────────────────────────────
  listMyTargets: protectedProcedure
    .input(z.object({ year: z.number().optional(), month: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const year = input.year ?? new Date().getFullYear();
      const month = input.month ?? new Date().getMonth() + 1;
      return db.select().from(kpiTargets).where(
        and(
          eq(kpiTargets.companyId, companyId),
          eq(kpiTargets.employeeUserId, ctx.user.id),
          eq(kpiTargets.periodYear, year),
          eq(kpiTargets.periodMonth, month),
          inArray(kpiTargets.targetStatus, [...EMPLOYEE_TARGET_STATUSES])
        )
      ).orderBy(kpiTargets.metricName);
    }),

  // ── Employee: get my progress (targets + achievements) ─────────────────────
  getMyProgress: protectedProcedure
    .input(z.object({ year: z.number().optional(), month: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const year = input.year ?? new Date().getFullYear();
      const month = input.month ?? new Date().getMonth() + 1;

      const targets = await db.select().from(kpiTargets).where(
        and(
          eq(kpiTargets.companyId, companyId),
          eq(kpiTargets.employeeUserId, ctx.user.id),
          eq(kpiTargets.periodYear, year),
          eq(kpiTargets.periodMonth, month),
          inArray(kpiTargets.targetStatus, [...EMPLOYEE_TARGET_STATUSES])
        )
      );

      const achievements = await db.select().from(kpiAchievements).where(
        and(
          eq(kpiAchievements.companyId, companyId),
          eq(kpiAchievements.employeeUserId, ctx.user.id),
          eq(kpiAchievements.periodYear, year),
          eq(kpiAchievements.periodMonth, month)
        )
      );

      const achievementMap = new Map(achievements.map(a => [a.metricName, a]));

      return targets.map(t => {
        const ach = achievementMap.get(t.metricName);
        return {
          target: t,
          achievement: ach ?? null,
          achievedValue: parseFloat(ach?.achievedValue ?? "0"),
          targetValue: parseFloat(t.targetValue),
          pct: parseFloat(ach?.achievementPct ?? "0"),
          commissionEarned: parseFloat(ach?.commissionEarned ?? "0"),
        };
      });
    }),

  // ── Employee: log daily activity ────────────────────────────────────────────
  logActivity: protectedProcedure
    .input(z.object({
      logDate: z.string(),
      metricName: z.string().min(1),
      metricType: z.enum(["sales_amount","client_count","leads_count","calls_count","meetings_count","proposals_count","revenue","units_sold","custom"]),
      valueAchieved: z.number().min(0),
      clientName: z.string().optional(),
      notes: z.string().optional(),
      attachmentUrl: z.string().optional(),
      kpiTargetId: z.number().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await db.insert(kpiDailyLogs).values({
        companyId,
        employeeUserId: ctx.user.id,
        logDate: input.logDate,
        metricName: input.metricName,
        metricType: input.metricType,
        valueAchieved: String(input.valueAchieved),
        clientName: input.clientName,
        notes: input.notes,
        attachmentUrl: input.attachmentUrl,
        kpiTargetId: input.kpiTargetId,
      });

      if (input.kpiTargetId) {
        const target = await db.select().from(kpiTargets).where(
          and(eq(kpiTargets.id, input.kpiTargetId), eq(kpiTargets.companyId, companyId))
        ).limit(1);
        if (target.length > 0) {
          const t = target[0];
          if (t.targetStatus !== "active") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Activity can only be logged against an active KPI target",
            });
          }
          const d = new Date(input.logDate);
          await recalcAchievement(
            companyId, ctx.user.id,
            d.getFullYear(), d.getMonth() + 1,
            t.metricName, t.id,
            parseFloat(t.targetValue),
            parseFloat(t.commissionRate ?? "0"),
            t.commissionType ?? "percentage",
            t.currency
          );
        }
      }
      return { success: true };
    }),

  // ── Employee: list my daily logs ────────────────────────────────────────────
  listMyLogs: protectedProcedure
    .input(z.object({
      year: z.number().optional(),
      month: z.number().optional(),
      limit: z.number().optional(),
      companyId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const year = input.year ?? new Date().getFullYear();
      const month = input.month ?? new Date().getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
      return db.select().from(kpiDailyLogs).where(
        and(
          eq(kpiDailyLogs.companyId, companyId),
          eq(kpiDailyLogs.employeeUserId, ctx.user.id),
          gte(kpiDailyLogs.logDate, startDate),
          lte(kpiDailyLogs.logDate, endDate)
        )
      ).orderBy(desc(kpiDailyLogs.logDate)).limit(input.limit ?? 100);
    }),

  // ── Employee: delete a log ──────────────────────────────────────────────────
  deleteLog: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const log = await db.select().from(kpiDailyLogs).where(
        and(eq(kpiDailyLogs.id, input.id), eq(kpiDailyLogs.employeeUserId, ctx.user.id), eq(kpiDailyLogs.companyId, companyId))
      ).limit(1);
      if (!log.length) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(kpiDailyLogs).where(eq(kpiDailyLogs.id, input.id));
      return { success: true };
    }),

  // ── Employee: get total commission this month ───────────────────────────────
  getMyCommission: protectedProcedure
    .input(z.object({ year: z.number().optional(), month: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      const year = input.year ?? new Date().getFullYear();
      const month = input.month ?? new Date().getMonth() + 1;
      return db.select({
        total: sql<string>`COALESCE(SUM(commission_earned), 0)`,
        currency: kpiAchievements.currency,
      }).from(kpiAchievements).where(
        and(
          eq(kpiAchievements.companyId, companyId),
          eq(kpiAchievements.employeeUserId, ctx.user.id),
          eq(kpiAchievements.periodYear, year),
          eq(kpiAchievements.periodMonth, month)
        )
      ).groupBy(kpiAchievements.currency);
    }),

  // ── Admin: set / update a KPI target (PR-5: permissions, duplicate guard, transactional audit) ──
  setTarget: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      employeeUserId: z.number(),
      year: z.number(),
      month: z.number(),
      metricName: z.string().min(1),
      metricType: z.enum(["sales_amount","client_count","leads_count","calls_count","meetings_count","proposals_count","revenue","units_sold","custom"]),
      targetValue: z.number().min(0),
      commissionRate: z.number().min(0).max(100).optional(),
      commissionType: z.enum(["percentage","fixed_per_unit","tiered"]).optional(),
      currency: z.string().optional(),
      notes: z.string().optional(),
      /** New rows only; default `active` preserves legacy behaviour. */
      initialStatus: z.enum(["draft", "active"]).optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await assertCanManageKpiTargets(ctx.user, companyId);

      if (input.id !== undefined) {
        const targetId = input.id;
        const [row] = await db.select().from(kpiTargets).where(
          and(eq(kpiTargets.id, targetId), eq(kpiTargets.companyId, companyId))
        ).limit(1);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "KPI target not found" });
        }
        assertKpiTargetRowEditableForMetrics(row.targetStatus as KpiTargetStatus);

        const beforeSnap = kpiTargetAuditSnapshot(row);
        await db.transaction(async (tx) => {
          await tx
            .update(kpiTargets)
            .set({
              metricName: input.metricName,
              metricType: input.metricType,
              targetValue: String(input.targetValue),
              commissionRate: String(input.commissionRate ?? 0),
              commissionType: input.commissionType ?? "percentage",
              currency: input.currency ?? "OMR",
              notes: input.notes,
            })
            .where(and(eq(kpiTargets.id, targetId), eq(kpiTargets.companyId, companyId)));
          const [afterRow] = await tx.select().from(kpiTargets).where(eq(kpiTargets.id, targetId)).limit(1);
          if (!afterRow) return;
          await insertHrPerformanceAuditEvent(tx, {
            companyId,
            actorUserId: ctx.user.id,
            entityType: "kpi_target",
            entityId: targetId,
            action: "kpi_target.updated",
            beforeState: beforeSnap,
            afterState: kpiTargetAuditSnapshot(afterRow),
          });
        });
        return { success: true };
      }

      await assertEmployeeScopedForKpiTarget(db, companyId, input.employeeUserId);

      const [dup] = await db
        .select({ id: kpiTargets.id })
        .from(kpiTargets)
        .where(
          and(
            eq(kpiTargets.companyId, companyId),
            eq(kpiTargets.employeeUserId, input.employeeUserId),
            eq(kpiTargets.periodYear, input.year),
            eq(kpiTargets.periodMonth, input.month),
            eq(kpiTargets.metricName, input.metricName),
            inArray(kpiTargets.targetStatus, ["draft", "active"])
          )
        )
        .limit(1);
      if (dup) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "An active or draft target already exists for this employee, period, and metric.",
        });
      }

      const initialStatus = input.initialStatus ?? "active";

      await db.transaction(async (tx) => {
        const insertResult = await tx.insert(kpiTargets).values({
          companyId,
          employeeUserId: input.employeeUserId,
          periodYear: input.year,
          periodMonth: input.month,
          metricName: input.metricName,
          metricType: input.metricType,
          targetValue: String(input.targetValue),
          commissionRate: String(input.commissionRate ?? 0),
          commissionType: input.commissionType ?? "percentage",
          currency: input.currency ?? "OMR",
          notes: input.notes,
          setByUserId: ctx.user.id,
          targetStatus: initialStatus,
        });
        const newId = Number(insertResult[0].insertId);
        const [afterRow] = await tx.select().from(kpiTargets).where(eq(kpiTargets.id, newId)).limit(1);
        if (!afterRow) return;
        await insertHrPerformanceAuditEvent(tx, {
          companyId,
          actorUserId: ctx.user.id,
          entityType: "kpi_target",
          entityId: newId,
          action: "kpi_target.created",
          beforeState: null,
          afterState: kpiTargetAuditSnapshot(afterRow),
        });
      });

      if (initialStatus === "active") {
        await sendNotification(
          input.employeeUserId,
          companyId,
          "New KPI Target Set",
          `A new target has been set for you: ${input.metricName} — ${input.targetValue} ${input.currency ?? "OMR"} for ${input.month}/${input.year}`,
          "/my-portal",
          ctx.user.id,
        );
      }
      return { success: true };
    }),

  /** PR-5: lifecycle transition (replaces hard delete). */
  transitionKpiTarget: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        to: z.enum(["draft", "active", "completed", "archived", "cancelled"]),
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await assertCanManageKpiTargets(ctx.user, companyId);

      const [row] = await db
        .select()
        .from(kpiTargets)
        .where(and(eq(kpiTargets.id, input.id), eq(kpiTargets.companyId, companyId)))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "KPI target not found" });
      }
      assertKpiTargetStatusTransition(row.targetStatus as KpiTargetStatus, input.to);
      const beforeSnap = kpiTargetAuditSnapshot(row);

      await db.transaction(async (tx) => {
        await tx
          .update(kpiTargets)
          .set({ targetStatus: input.to })
          .where(and(eq(kpiTargets.id, input.id), eq(kpiTargets.companyId, companyId)));
        const [afterRow] = await tx.select().from(kpiTargets).where(eq(kpiTargets.id, input.id)).limit(1);
        if (!afterRow) return;
        await insertHrPerformanceAuditEvent(tx, {
          companyId,
          actorUserId: ctx.user.id,
          entityType: "kpi_target",
          entityId: input.id,
          action: "kpi_target.status_changed",
          beforeState: beforeSnap,
          afterState: kpiTargetAuditSnapshot(afterRow),
        });
      });
      return { success: true };
    }),

  /** @deprecated Prefer `transitionKpiTarget` with `to: "cancelled"`. Cancels in-place with audit. */
  deleteTarget: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await assertCanManageKpiTargets(ctx.user, companyId);

      const [row] = await db
        .select()
        .from(kpiTargets)
        .where(and(eq(kpiTargets.id, input.id), eq(kpiTargets.companyId, companyId)))
        .limit(1);
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "KPI target not found" });
      }
      assertKpiTargetStatusTransition(row.targetStatus as KpiTargetStatus, "cancelled");
      const beforeSnap = kpiTargetAuditSnapshot(row);

      await db.transaction(async (tx) => {
        await tx
          .update(kpiTargets)
          .set({ targetStatus: "cancelled" })
          .where(and(eq(kpiTargets.id, input.id), eq(kpiTargets.companyId, companyId)));
        const [afterRow] = await tx.select().from(kpiTargets).where(eq(kpiTargets.id, input.id)).limit(1);
        if (!afterRow) return;
        await insertHrPerformanceAuditEvent(tx, {
          companyId,
          actorUserId: ctx.user.id,
          entityType: "kpi_target",
          entityId: input.id,
          action: "kpi_target.cancelled",
          beforeState: beforeSnap,
          afterState: kpiTargetAuditSnapshot(afterRow),
        });
      });
      return { success: true };
    }),

  // ── Admin: list all employees' progress for a period ───────────────────────
  adminGetTeamProgress: protectedProcedure
    .input(z.object({ year: z.number().optional(), month: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await assertCanReadKpiTargets(ctx.user, companyId);
      const year = input.year ?? new Date().getFullYear();
      const month = input.month ?? new Date().getMonth() + 1;

      const targets = await db.select().from(kpiTargets).where(
        and(
          eq(kpiTargets.companyId, companyId),
          eq(kpiTargets.periodYear, year),
          eq(kpiTargets.periodMonth, month),
          inArray(kpiTargets.targetStatus, [...ADMIN_TEAM_TARGET_STATUSES])
        )
      );
      const achievements = await db.select().from(kpiAchievements).where(
        and(eq(kpiAchievements.companyId, companyId), eq(kpiAchievements.periodYear, year), eq(kpiAchievements.periodMonth, month))
      );
      const empRows = await db.select({
        id: employees.id, userId: employees.userId,
        firstName: employees.firstName, lastName: employees.lastName,
        position: employees.position, department: employees.department,
      }).from(employees).where(eq(employees.companyId, companyId));

      const empMap = new Map(empRows.map(e => [e.userId ?? e.id, e]));
      const achieveMap = new Map(achievements.map(a => [`${a.employeeUserId}:${a.metricName}`, a]));

      return targets.map(t => {
        const ach = achieveMap.get(`${t.employeeUserId}:${t.metricName}`);
        return {
          target: t,
          employee: empMap.get(t.employeeUserId) ?? null,
          achievement: ach ?? null,
          achievedValue: parseFloat(ach?.achievedValue ?? "0"),
          targetValue: parseFloat(t.targetValue),
          pct: parseFloat(ach?.achievementPct ?? "0"),
          commissionEarned: parseFloat(ach?.commissionEarned ?? "0"),
        };
      });
    }),

  // ── Admin: leaderboard for a period ────────────────────────────────────────
  getLeaderboard: protectedProcedure
    .input(z.object({ year: z.number().optional(), month: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await assertCanReadKpiTargets(ctx.user, companyId);
      const year = input.year ?? new Date().getFullYear();
      const month = input.month ?? new Date().getMonth() + 1;

      const rows = await db.select({
        employeeUserId: kpiAchievements.employeeUserId,
        totalAchieved: sql<string>`SUM(achieved_value)`,
        totalTarget: sql<string>`SUM(target_value)`,
        totalCommission: sql<string>`SUM(commission_earned)`,
        avgPct: sql<string>`AVG(achievement_pct)`,
      }).from(kpiAchievements).where(
        and(eq(kpiAchievements.companyId, companyId), eq(kpiAchievements.periodYear, year), eq(kpiAchievements.periodMonth, month))
      ).groupBy(kpiAchievements.employeeUserId)
       .orderBy(sql`AVG(achievement_pct) DESC`);

      const empRows = await db.select({
        id: employees.id, userId: employees.userId,
        firstName: employees.firstName, lastName: employees.lastName,
        position: employees.position, department: employees.department,
      }).from(employees).where(eq(employees.companyId, companyId));
      const empMap = new Map(empRows.map(e => [e.userId ?? e.id, e]));

      return rows.map((r, i) => ({
        rank: i + 1,
        employeeUserId: r.employeeUserId,
        employee: empMap.get(r.employeeUserId) ?? null,
        totalAchieved: parseFloat(r.totalAchieved ?? "0"),
        totalTarget: parseFloat(r.totalTarget ?? "0"),
        totalCommission: parseFloat(r.totalCommission ?? "0"),
        avgPct: parseFloat(r.avgPct ?? "0"),
      }));
    }),

  // ── Admin: get all logs for an employee ────────────────────────────────────
  adminListEmployeeLogs: protectedProcedure
    .input(z.object({
      employeeUserId: z.number(),
      year: z.number().optional(),
      month: z.number().optional(),
      companyId: z.number().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await requireDb();
      await assertCanReadKpiTargets(ctx.user, companyId);
      const year = input.year ?? new Date().getFullYear();
      const month = input.month ?? new Date().getMonth() + 1;
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-31`;
      return db.select().from(kpiDailyLogs).where(
        and(
          eq(kpiDailyLogs.companyId, companyId),
          eq(kpiDailyLogs.employeeUserId, input.employeeUserId),
          gte(kpiDailyLogs.logDate, startDate),
          lte(kpiDailyLogs.logDate, endDate)
        )
      ).orderBy(desc(kpiDailyLogs.logDate));
    }),
});
