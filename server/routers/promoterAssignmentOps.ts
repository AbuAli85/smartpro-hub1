/**
 * Phase 2: execution summary, payroll staging, billing staging (assignment-centered).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import type { User } from "../../drizzle/schema";
import { getDb } from "../db";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getBillingStagingRows,
  getPayrollStagingRows,
  getPromoterExecutionSummary,
  summarizeStaging,
} from "../promoterAssignmentOps.service";
import { createAuditLog } from "../repositories/audit.repository";

const ASSIGNMENT_ROLES = ["company_admin", "hr_admin"] as const;

async function requireCanViewPromoterOps(
  user: { id: number; role?: string | null; platformRole?: string | null },
  companyId: number,
): Promise<void> {
  const m = await requireWorkspaceMembership(user as User, companyId);
  requireNotAuditor(m.role);
  if (
    !canAccessGlobalAdminProcedures(user) &&
    !(ASSIGNMENT_ROLES as readonly string[]).includes(m.role)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only company administrators and HR admins can view promoter operations staging.",
    });
  }
}

const periodInput = optionalActiveWorkspace.merge(
  z.object({
    periodStartYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEndYmd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
);

export const promoterAssignmentOpsRouter = router({
  executionSummary: protectedProcedure.input(optionalActiveWorkspace.optional()).query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    await requireCanViewPromoterOps(ctx.user, activeId);
    const db = await getDb();
    if (!db) {
      return {
        referenceDate: new Date().toISOString().slice(0, 10),
        operationalAssignmentsToday: 0,
        attendanceResolvedToday: 0,
        attendanceUnresolvedToday: 0,
        suspendedAttemptedAttendance: 0,
        futureAssignmentAttendanceAttempts: 0,
      };
    }
    const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
    return getPromoterExecutionSummary(db, { activeCompanyId: activeId, isPlatformAdmin: isPlatform });
  }),

  payrollStaging: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
    await requireCanViewPromoterOps(ctx.user, activeId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
    const rows = await getPayrollStagingRows(db, {
      activeCompanyId: activeId,
      isPlatformAdmin: isPlatform,
      periodStartYmd: input.periodStartYmd,
      periodEndYmd: input.periodEndYmd,
    });
    const summary = summarizeStaging(rows);
    await createAuditLog({
      userId: ctx.user.id,
      companyId: activeId,
      action: "payroll_staging_generated",
      entityType: "promoter_assignment_ops",
      entityId: null,
      newValues: {
        periodStartYmd: input.periodStartYmd,
        periodEndYmd: input.periodEndYmd,
        rowCount: rows.length,
      },
    });
    return { rows, summary };
  }),

  billingStaging: protectedProcedure.input(periodInput).query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
    await requireCanViewPromoterOps(ctx.user, activeId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
    const rows = await getBillingStagingRows(db, {
      activeCompanyId: activeId,
      isPlatformAdmin: isPlatform,
      periodStartYmd: input.periodStartYmd,
      periodEndYmd: input.periodEndYmd,
    });
    const summary = summarizeStaging(rows, "billableAmount");
    await createAuditLog({
      userId: ctx.user.id,
      companyId: activeId,
      action: "billing_staging_generated",
      entityType: "promoter_assignment_ops",
      entityId: null,
      newValues: {
        periodStartYmd: input.periodStartYmd,
        periodEndYmd: input.periodEndYmd,
        rowCount: rows.length,
        totalBillableAmount: summary.totalBillableAmount,
      },
    });
    return { rows, summary };
  }),
});
