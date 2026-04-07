import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireActiveCompanyId } from "../_core/tenant";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { departments, employeeAccountability } from "../../drizzle/schema";
import { assertCanManageKpiTargets, hasKpiTargetPermission } from "../kpiTargetAccess";
import { HR_PERF } from "@shared/hrPerformancePermissions";
import type { User } from "../../drizzle/schema";
import {
  assertCanReadPersonPerformance,
  assertCanReadPersonScorecard,
  loadEmployeeForCompany,
} from "../personPerformanceAccess";
import { buildEffectiveAccountability } from "../accountabilityEngine";
import { getSinglePersonPerformanceBundle, listTeamScorecardSummaries } from "../personPerformanceScorecard";

async function requireDb() {
  const rawDb = await getDb();
  if (!rawDb) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return rawDb;
}

async function assertCanManageAccountability(user: User, companyId: number): Promise<void> {
  if (await hasKpiTargetPermission(user, companyId, HR_PERF.MANAGE)) return;
  await assertCanManageKpiTargets(user, companyId);
}

export const accountabilityPerformanceRouter = router({
  /** Accountability overlay + effective merged view (HR readers / manager / self). */
  getAccountability: protectedProcedure
    .input(z.object({ employeeId: z.number(), companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCanReadPersonScorecard(ctx.user, companyId, input.employeeId);

      const emp = await loadEmployeeForCompany(db, companyId, input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      const [overlay] = await db
        .select()
        .from(employeeAccountability)
        .where(
          and(
            eq(employeeAccountability.companyId, companyId),
            eq(employeeAccountability.employeeId, input.employeeId)
          )
        )
        .limit(1);

      let departmentName: string | null = null;
      if (overlay?.departmentId != null) {
        const [d] = await db
          .select({ name: departments.name })
          .from(departments)
          .where(and(eq(departments.companyId, companyId), eq(departments.id, overlay.departmentId)))
          .limit(1);
        departmentName = d?.name ?? null;
      }

      return {
        overlay: overlay ?? null,
        effective: buildEffectiveAccountability(emp, overlay ?? null, { departmentName }),
      };
    }),

  upsertAccountability: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        employeeId: z.number(),
        departmentId: z.number().nullable().optional(),
        businessRoleKey: z.string().max(64).nullable().optional(),
        responsibilities: z.array(z.string().max(500)).max(40).optional(),
        kpiCategoryKeys: z.array(z.string().max(120)).max(40).optional(),
        reviewCadence: z.enum(["daily", "weekly", "biweekly", "monthly"]).optional(),
        escalationEmployeeId: z.number().nullable().optional(),
        notes: z.string().max(4000).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const m = await requireWorkspaceMembership(ctx.user, input.companyId);
      requireNotAuditor(m.role);
      await assertCanManageAccountability(ctx.user, m.companyId);

      const emp = await loadEmployeeForCompany(db, m.companyId, input.employeeId);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });

      if (input.escalationEmployeeId != null) {
        const esc = await loadEmployeeForCompany(db, m.companyId, input.escalationEmployeeId);
        if (!esc) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Escalation employee not in this company." });
        }
      }

      const [existing] = await db
        .select({ id: employeeAccountability.id })
        .from(employeeAccountability)
        .where(
          and(
            eq(employeeAccountability.companyId, m.companyId),
            eq(employeeAccountability.employeeId, input.employeeId)
          )
        )
        .limit(1);

      const payload = {
        departmentId: input.departmentId ?? null,
        businessRoleKey: input.businessRoleKey ?? null,
        responsibilities: input.responsibilities ?? [],
        kpiCategoryKeys: input.kpiCategoryKeys ?? [],
        reviewCadence: input.reviewCadence ?? "weekly",
        escalationEmployeeId: input.escalationEmployeeId ?? null,
        notes: input.notes ?? null,
      };

      if (existing) {
        await db
          .update(employeeAccountability)
          .set(payload)
          .where(eq(employeeAccountability.id, existing.id));
      } else {
        await db.insert(employeeAccountability).values({
          companyId: m.companyId,
          employeeId: input.employeeId,
          ...payload,
        });
      }

      return { ok: true as const };
    }),

  /** Full person scorecard: signals, composite score, underperformance assessment. */
  getPersonScorecard: protectedProcedure
    .input(
      z.object({
        employeeId: z.number(),
        year: z.number().optional(),
        month: z.number().optional(),
        companyId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCanReadPersonScorecard(ctx.user, companyId, input.employeeId);

      const now = new Date();
      const year = input.year ?? now.getFullYear();
      const month = input.month ?? now.getMonth() + 1;

      const bundle = await getSinglePersonPerformanceBundle(db, companyId, input.employeeId, year, month);
      if (!bundle) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      return { year, month, ...bundle };
    }),

  /** Manager / HR: ranked list of people with assessment summary. */
  listTeamScorecards: protectedProcedure
    .input(
      z.object({
        department: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
        year: z.number().optional(),
        month: z.number().optional(),
        companyId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      await assertCanReadPersonPerformance(ctx.user, companyId);

      const now = new Date();
      const year = input.year ?? now.getFullYear();
      const month = input.month ?? now.getMonth() + 1;

      const rows = await listTeamScorecardSummaries(
        db,
        companyId,
        { department: input.department, limit: input.limit },
        year,
        month
      );

      const sorted = [...rows].sort((a, b) => {
        const sev = (x: typeof a) =>
          x.assessment.status === "critical"
            ? 4
            : x.assessment.status === "at_risk"
              ? 3
              : x.assessment.status === "watch"
                ? 2
                : 1;
        const d = sev(b) - sev(a);
        if (d !== 0) return d;
        return a.compositeScore - b.compositeScore;
      });

      return { year, month, rows: sorted };
    }),
});
