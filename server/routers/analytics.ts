import { z } from "zod";
import {
  getAuditLogs,
  getCompanyStats,
  getCompanySubscription,
  getCrmDeals,
  getEmployees,
  getPlatformStats,
  getUserCompany,
  getContracts,
  getProServices,
  getSanadApplications,
  getLeaveRequests,
  getPayrollRecords,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const analyticsRouter = router({
  platformStats: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") return null;
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

  auditLogs: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        const membership = await getUserCompany(ctx.user.id);
        return getAuditLogs(membership?.company.id, input.limit);
      }
      return getAuditLogs(undefined, input.limit);
    }),
});
