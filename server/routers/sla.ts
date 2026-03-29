import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import {
  serviceSlaRules,
  caseSlaTracking,
  governmentServiceCases,
} from "../../drizzle/schema";
import { eq, and, isNull, lt, desc, count, sql } from "drizzle-orm";
import { resolvePlatformOrCompanyScope } from "../_core/tenant";
import type { User } from "../../drizzle/schema";

export const slaRouter = router({
  // ── List Rules ───────────────────────────────────────────────────────────────
  listRules: protectedProcedure.query(async ({ ctx }) => {
    if (!canAccessGlobalAdminProcedures(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
    }
    const db = await getDb();
    if (!db) return [];
    return db.select().from(serviceSlaRules).orderBy(serviceSlaRules.serviceType, serviceSlaRules.priority);
  }),

  // ── Upsert Rule ──────────────────────────────────────────────────────────────
  upsertRule: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        serviceType: z.string().min(1),
        priority: z.enum(["low", "normal", "high", "urgent"]),
        targetHours: z.number().min(1),
        escalationHours: z.number().min(1),
        breachAction: z.enum(["notify", "escalate", "auto_reassign"]),
        isActive: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (input.id) {
        await db
          .update(serviceSlaRules)
          .set({
            serviceType: input.serviceType,
            priority: input.priority,
            targetHours: input.targetHours,
            escalationHours: input.escalationHours,
            breachAction: input.breachAction,
            isActive: input.isActive,
          })
          .where(eq(serviceSlaRules.id, input.id));
        return { id: input.id };
      }

      const [result] = await db
        .insert(serviceSlaRules)
        .values({
          serviceType: input.serviceType,
          priority: input.priority,
          targetHours: input.targetHours,
          escalationHours: input.escalationHours,
          breachAction: input.breachAction,
          isActive: input.isActive,
        })
        .$returningId();

      return { id: result.id };
    }),

  // ── Delete Rule ──────────────────────────────────────────────────────────────
  deleteRule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Platform access required" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(serviceSlaRules).where(eq(serviceSlaRules.id, input.id));
      return { success: true };
    }),

  // ── Get Breaches ─────────────────────────────────────────────────────────────
  getBreaches: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);
    const now = new Date();

    const breaches = await db
      .select({
        id: caseSlaTracking.id,
        caseId: caseSlaTracking.caseId,
        dueAt: caseSlaTracking.dueAt,
        startedAt: caseSlaTracking.startedAt,
        ruleId: caseSlaTracking.ruleId,
        caseType: governmentServiceCases.caseType,
        priority: governmentServiceCases.priority,
        caseStatus: governmentServiceCases.caseStatus,
        governmentReference: governmentServiceCases.governmentReference,
        companyId: governmentServiceCases.companyId,
      })
      .from(caseSlaTracking)
      .innerJoin(governmentServiceCases, eq(governmentServiceCases.id, caseSlaTracking.caseId))
      .where(
        and(
          lt(caseSlaTracking.dueAt, now),
          isNull(caseSlaTracking.resolvedAt),
          ...(companyId ? [eq(governmentServiceCases.companyId, companyId)] : []),
        ),
      )
      .orderBy(caseSlaTracking.dueAt)
      .limit(50);

    return breaches.map((b) => ({
      ...b,
      hoursOverdue: Math.round((now.getTime() - new Date(b.dueAt).getTime()) / (1000 * 60 * 60)),
    }));
  }),

  // ── Start Tracking ───────────────────────────────────────────────────────────
  startTracking: protectedProcedure
    .input(
      z.object({
        caseId: z.number(),
        serviceType: z.string(),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);
      const [caseRow] = await db
        .select({ id: governmentServiceCases.id })
        .from(governmentServiceCases)
        .where(
          and(
            eq(governmentServiceCases.id, input.caseId),
            ...(companyId ? [eq(governmentServiceCases.companyId, companyId)] : []),
          ),
        )
        .limit(1);
      if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });

      // Find matching rule
      const [rule] = await db
        .select()
        .from(serviceSlaRules)
        .where(
          and(
            eq(serviceSlaRules.serviceType, input.serviceType),
            eq(serviceSlaRules.priority, input.priority),
            eq(serviceSlaRules.isActive, true),
          ),
        )
        .limit(1);

      const targetHours = rule?.targetHours ?? 72; // default 72h
      const now = new Date();
      const dueAt = new Date(now.getTime() + targetHours * 60 * 60 * 1000);

      const [result] = await db
        .insert(caseSlaTracking)
        .values({
          caseId: input.caseId,
          ruleId: rule?.id ?? null,
          startedAt: now,
          dueAt,
        })
        .$returningId();

      return { id: result.id, dueAt };
    }),

  // ── Resolve Tracking ─────────────────────────────────────────────────────────
  resolve: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);
      const [caseRow] = await db
        .select({ id: governmentServiceCases.id })
        .from(governmentServiceCases)
        .where(
          and(
            eq(governmentServiceCases.id, input.caseId),
            ...(companyId ? [eq(governmentServiceCases.companyId, companyId)] : []),
          ),
        )
        .limit(1);
      if (!caseRow) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });

      await db
        .update(caseSlaTracking)
        .set({ resolvedAt: new Date() })
        .where(and(eq(caseSlaTracking.caseId, input.caseId), isNull(caseSlaTracking.resolvedAt)));

      return { success: true };
    }),

  // ── Get Case SLA Status ───────────────────────────────────────────────────────
  getCaseSlaStatus: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);
      const [caseRow] = await db
        .select({ id: governmentServiceCases.id })
        .from(governmentServiceCases)
        .where(
          and(
            eq(governmentServiceCases.id, input.caseId),
            ...(companyId ? [eq(governmentServiceCases.companyId, companyId)] : []),
          ),
        )
        .limit(1);
      if (!caseRow) return null;

      const [tracking] = await db
        .select()
        .from(caseSlaTracking)
        .where(and(eq(caseSlaTracking.caseId, input.caseId), isNull(caseSlaTracking.resolvedAt)))
        .limit(1);

      if (!tracking) return null;

      const now = new Date();
      const total = tracking.dueAt.getTime() - tracking.startedAt.getTime();
      const elapsed = now.getTime() - tracking.startedAt.getTime();
      const pctElapsed = Math.min(100, Math.round((elapsed / total) * 100));
      const isBreached = now > tracking.dueAt;
      const hoursRemaining = Math.round((tracking.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60));

      return {
        ...tracking,
        pctElapsed,
        isBreached,
        hoursRemaining,
        severity: isBreached ? "critical" : pctElapsed >= 80 ? "high" : pctElapsed >= 50 ? "medium" : "low",
      };
    }),

  // ── Performance Summary ───────────────────────────────────────────────────────
  getPerformanceSummary: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { total: 0, resolved: 0, breached: 0, onTime: 0, breachRate: 0, onTimeRate: 0 };

    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);

    const scopeWhere = companyId ? eq(governmentServiceCases.companyId, companyId) : undefined;

    const baseAgg = db
      .select({
        total: count(),
        resolved: sql<number>`sum(case when ${caseSlaTracking.resolvedAt} is not null then 1 else 0 end)`,
        breached: sql<number>`sum(case when ${caseSlaTracking.breachedAt} is not null or (${caseSlaTracking.dueAt} < now() and ${caseSlaTracking.resolvedAt} is null) then 1 else 0 end)`,
        onTime: sql<number>`sum(case when ${caseSlaTracking.resolvedAt} is not null and ${caseSlaTracking.resolvedAt} <= ${caseSlaTracking.dueAt} then 1 else 0 end)`,
      })
      .from(caseSlaTracking)
      .innerJoin(governmentServiceCases, eq(caseSlaTracking.caseId, governmentServiceCases.id));

    const [totals] = scopeWhere
      ? await baseAgg.where(scopeWhere)
      : await baseAgg;

    const total = Number(totals?.total ?? 0);
    const breached = Number(totals?.breached ?? 0);
    const onTime = Number(totals?.onTime ?? 0);
    const resolved = Number(totals?.resolved ?? 0);

    return {
      total,
      resolved,
      breached,
      onTime,
      breachRate: total > 0 ? Math.round((breached / total) * 100) : 0,
      onTimeRate: resolved > 0 ? Math.round((onTime / resolved) * 100) : 0,
    };
  }),
});
