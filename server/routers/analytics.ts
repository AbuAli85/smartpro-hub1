import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  getCompanyStats,
  getCrmDeals,
  getEmployees,
  getPlatformStats,
  getUserCompany,
  getUserCompanyById,
  getContracts,
  getProServices,
  getSanadApplications,
  getLeaveRequests,
  getPayrollRecords,
  getAnalyticsReports,
  createAnalyticsReport,
  updateAnalyticsReport,
  deleteAnalyticsReport,
  getSystemSettings,
  upsertSystemSettings,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { requireActiveCompanyId } from "../_core/tenant";
import { loadUnifiedAuditTimeline } from "../unifiedAuditTimeline";

async function assertScheduledReportInCompany(reportId: number, companyId: number): Promise<void> {
  const reports = await getAnalyticsReports(companyId);
  if (!reports.some((r) => r.id === reportId)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
  }
}

const adHocModuleSchema = z.enum(["contracts", "pro", "hr", "crm", "marketplace", "sanad"]);
const adHocAggregationSchema = z.enum(["Count", "Sum", "Average", "Min", "Max"]);
const adHocChartSchema = z.enum(["Bar Chart", "Line Chart", "Pie Chart", "Table"]);
const adHocDateRangeSchema = z.enum(["last_7_days", "last_30_days", "last_90_days", "this_year", "all_time"]);

export const analyticsRouter = router({
  platformStats: protectedProcedure.query(async ({ ctx }) => {
    if (!canAccessGlobalAdminProcedures(ctx.user)) return null;
    return getPlatformStats();
  }),

  companyStats: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    return getCompanyStats(membership.company.id);
  }),

  contractsOverview: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const allContracts = await getContracts(membership.company.id);
    const statuses = ["draft", "pending_review", "pending_signature", "signed", "active", "expired", "terminated"] as const;
    return statuses.map((status) => ({
      status,
      count: allContracts.filter((c) => c.status === status).length,
    }));
  }),

  proServicesOverview: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const services = await getProServices(membership.company.id);
    const types = [
      "visa_processing",
      "work_permit",
      "labor_card",
      "residence_renewal",
      "visa_renewal",
      "permit_renewal",
    ] as const;
    return types.map((type) => ({
      type,
      count: services.filter((s) => s.serviceType === type).length,
    }));
  }),

  dealsPipeline: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    const deals = await getCrmDeals(membership.company.id);
    const stages = ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"] as const;
    return stages.map((stage) => {
      const stageDeals = deals.filter((d) => d.stage === stage);
      return {
        stage,
        count: stageDeals.length,
        value: stageDeals.reduce((s, d) => s + Number(d.value ?? 0), 0),
      };
    });
  }),

  hrOverview: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return null;
    const cid = membership.company.id;
    const emps = await getEmployees(cid);
    const leaves = await getLeaveRequests(cid);
    const payroll = await getPayrollRecords(cid, new Date().getFullYear(), new Date().getMonth() + 1);

    const byDept: Record<string, number> = {};
    emps.forEach((e) => {
      const dept = e.department ?? "Unassigned";
      byDept[dept] = (byDept[dept] ?? 0) + 1;
    });

    return {
      totalEmployees: emps.length,
      activeEmployees: emps.filter((e) => e.status === "active").length,
      pendingLeave: leaves.filter((l) => l.status === "pending").length,
      payrollThisMonth: payroll.reduce((s, p) => s + Number(p.netSalary ?? 0), 0),
      byDepartment: Object.entries(byDept).map(([dept, count]) => ({ dept, count })),
    };
  }),

  /**
   * Unified activity timeline: `audit_events` (operational) + `audit_logs` (platform membership / role changes).
   * Replaces the legacy-only `getAuditLogs` read path so the UI reflects real system activity.
   */
  auditLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(500).default(50),
        companyId: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (isPlatform) {
        return loadUnifiedAuditTimeline(ctx, input.limit, {
          companyId: input.companyId ?? null,
          memberRole: null,
        });
      }
      const cid = await requireActiveCompanyId(ctx.user.id, input.companyId);
      const m = await getUserCompanyById(ctx.user.id, cid);
      return loadUnifiedAuditTimeline(ctx, input.limit, {
        companyId: cid,
        memberRole: m?.member.role ?? null,
      });
    }),

  // ── Scheduled Reports ──────────────────────────────────────────────────────
  listReports: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getUserCompany(ctx.user.id);
    if (!membership) return [];
    return getAnalyticsReports(membership.company.id);
  }),

  createReport: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.string(),
      frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).default("weekly"),
      channel: z.enum(["email", "dashboard", "email_dashboard"]).default("dashboard"),
      recipients: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const now = new Date();
      const nextRun = new Date(now);
      if (input.frequency === "daily") nextRun.setDate(now.getDate() + 1);
      else if (input.frequency === "weekly") nextRun.setDate(now.getDate() + 7);
      else if (input.frequency === "monthly") nextRun.setMonth(now.getMonth() + 1);
      else nextRun.setMonth(now.getMonth() + 3);
      await createAnalyticsReport({
        companyId: membership.company.id,
        createdBy: ctx.user.id,
        name: input.name,
        type: input.type,
        frequency: input.frequency,
        channel: input.channel,
        recipients: input.recipients ?? null,
        nextRunAt: nextRun,
        status: "active",
        isActive: true,
      });
      return { success: true };
    }),

  updateReportStatus: protectedProcedure
    .input(z.object({ id: z.number(), status: z.enum(["active", "paused"]) }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      await assertScheduledReportInCompany(input.id, membership.company.id);
      await updateAnalyticsReport(input.id, { status: input.status });
      return { success: true };
    }),

  deleteReport: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      await assertScheduledReportInCompany(input.id, membership.company.id);
      await deleteAnalyticsReport(input.id);
      return { success: true };
    }),

  runReportNow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      await assertScheduledReportInCompany(input.id, membership.company.id);
      await updateAnalyticsReport(input.id, { lastRunAt: new Date() });
      return { success: true };
    }),

  /**
   * Server-validated ad-hoc report specification (export + preview metadata).
   * Row execution against warehouse/DB is a future enhancement.
   */
  buildAdHocReportSpec: protectedProcedure
    .input(
      z.object({
        name: z.string().max(200).optional(),
        module: adHocModuleSchema,
        fields: z.array(z.string().min(1).max(64)).min(1).max(32),
        aggregation: adHocAggregationSchema,
        chartType: adHocChartSchema,
        dateRange: adHocDateRangeSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const trimmedName = input.name?.trim();
      const generatedAt = new Date().toISOString();
      return {
        version: 1 as const,
        name: trimmedName && trimmedName.length > 0 ? trimmedName : `${input.module}_report`,
        module: input.module,
        fields: input.fields,
        aggregation: input.aggregation,
        chartType: input.chartType,
        dateRange: input.dateRange,
        generatedAt,
        companyId: membership.company.id,
        generatedByUserId: ctx.user.id,
        executionNote:
          "Server-validated specification only; aggregated row data is not executed in this version.",
      };
    }),

  // ── System Settings ────────────────────────────────────────────────────────
  getSettings: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      return getSystemSettings(input.category);
    }),

  saveSettings: protectedProcedure
    .input(z.object({
      settings: z.array(z.object({ key: z.string(), value: z.string() })),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      await upsertSystemSettings(input.settings, ctx.user.id);
      return { success: true };
    }),
});
