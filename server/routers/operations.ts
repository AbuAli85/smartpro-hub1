import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";
import {
  governmentServiceCases,
  caseSlaTracking,
  payrollRuns,
  leaveRequests,
  contracts,
  workPermits,
  proBillingCycles,
  auditEvents,
  omaniProOfficers,
  officerCompanyAssignments,
  renewalWorkflowRuns,
  serviceQuotations,
  employees,
  employeeDocuments,
  companyDocuments,
} from "../../drizzle/schema";
import { and, eq, gte, lte, lt, count, sum, desc, isNull, isNotNull, ne, notInArray } from "drizzle-orm";
import { resolvePlatformOrCompanyScope } from "../_core/tenant";
import {
  canReadHrPerformanceAuditSensitiveRows,
  HR_AUDIT_SENSITIVE_ENTITY_TYPES,
} from "../hrPerformanceAuditReadPolicy";
import type { PayrollRun, User } from "../../drizzle/schema";

/** Locks `payroll.thisMonthStatus` for tRPC client inference (`not_run` is not a DB enum value). */
const getSmartDashboardOutputSchema = z.object({
  headcount: z.object({
    total: z.number(),
    active: z.number(),
    onLeave: z.number(),
  }),
  omanisation: z.object({
    rate: z.number(),
    omani: z.number(),
    expat: z.number(),
  }),
  payroll: z.object({
    monthlyTotal: z.number(),
    thisMonthStatus: z.enum(["draft", "processing", "approved", "paid", "cancelled", "not_run"]),
    thisMonthNet: z.number(),
  }),
  leave: z.object({ pending: z.number() }),
  permits: z.object({ expiring30d: z.number(), expired: z.number() }),
  documents: z.object({ expiring30d: z.number(), expired: z.number() }),
  actions: z.array(
    z.object({
      priority: z.string(),
      title: z.string(),
      description: z.string(),
      url: z.string(),
      count: z.number(),
    }),
  ),
});

export const operationsRouter = router({
  // ── Daily Snapshot ──────────────────────────────────────────────────────────
  getDailySnapshot: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
    const canReadHrAudit =
      companyId === null ? true : await canReadHrPerformanceAuditSensitiveRows(ctx.user as User, companyId);
    const hrAuditExcludeSensitive =
      companyId !== null && !canReadHrAudit
        ? notInArray(auditEvents.entityType, [...HR_AUDIT_SENSITIVE_ENTITY_TYPES])
        : null;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Open cases by status
    const openCasesQuery = db
      .select({ caseStatus: governmentServiceCases.caseStatus, cnt: count() })
      .from(governmentServiceCases);

    const openCases = companyId
      ? await openCasesQuery
          .where(
            and(
              eq(governmentServiceCases.companyId, companyId),
              ne(governmentServiceCases.caseStatus, "completed"),
              ne(governmentServiceCases.caseStatus, "cancelled"),
            ),
          )
          .groupBy(governmentServiceCases.caseStatus)
      : await openCasesQuery
          .where(
            and(
              ne(governmentServiceCases.caseStatus, "completed"),
              ne(governmentServiceCases.caseStatus, "cancelled"),
            ),
          )
          .groupBy(governmentServiceCases.caseStatus);

    // SLA breaches (scoped to company cases when not platform)
    const slaBreaches = companyId
      ? await db
          .select({ id: caseSlaTracking.id, caseId: caseSlaTracking.caseId, dueAt: caseSlaTracking.dueAt })
          .from(caseSlaTracking)
          .innerJoin(governmentServiceCases, eq(caseSlaTracking.caseId, governmentServiceCases.id))
          .where(
            and(
              eq(governmentServiceCases.companyId, companyId),
              lt(caseSlaTracking.dueAt, now),
              isNull(caseSlaTracking.resolvedAt),
            ),
          )
          .limit(20)
      : await db
          .select({ id: caseSlaTracking.id, caseId: caseSlaTracking.caseId, dueAt: caseSlaTracking.dueAt })
          .from(caseSlaTracking)
          .where(and(lt(caseSlaTracking.dueAt, now), isNull(caseSlaTracking.resolvedAt)))
          .limit(20);

    // Cases due today
    const endOfToday = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const casesDueToday = await db
      .select({
        id: governmentServiceCases.id,
        caseType: governmentServiceCases.caseType,
        priority: governmentServiceCases.priority,
        status: governmentServiceCases.caseStatus,
        dueDate: governmentServiceCases.dueDate,
        governmentReference: governmentServiceCases.governmentReference,
      })
      .from(governmentServiceCases)
      .where(
        and(
          ...(companyId ? [eq(governmentServiceCases.companyId, companyId)] : []),
          gte(governmentServiceCases.dueDate, startOfDay),
          lte(governmentServiceCases.dueDate, endOfToday),
          ne(governmentServiceCases.caseStatus, "completed"),
          ne(governmentServiceCases.caseStatus, "cancelled"),
        ),
      )
      .limit(10);

    // Documents expiring in 7 days
    const expiringDocs = await db
      .select({ id: workPermits.id, permitNumber: workPermits.workPermitNumber, expiryDate: workPermits.expiryDate })
      .from(workPermits)
      .where(
        and(
          ...(companyId ? [eq(workPermits.companyId, companyId)] : []),
          gte(workPermits.expiryDate, now),
          lte(workPermits.expiryDate, in7Days),
        ),
      )
      .limit(10);

    // Approved payroll runs (awaiting payment)
    const pendingPayrollQuery = db
      .select({ id: payrollRuns.id, month: payrollRuns.periodMonth, year: payrollRuns.periodYear, totalNet: payrollRuns.totalNet });

    const pendingPayroll = companyId
      ? await pendingPayrollQuery
          .from(payrollRuns)
          .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.status, "approved")))
          .limit(5)
      : await pendingPayrollQuery
          .from(payrollRuns)
          .where(eq(payrollRuns.status, "approved"))
          .limit(5);

    // Pending leave requests
    const pendingLeave = await db
      .select({ cnt: count() })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, "pending"),
          ...(companyId ? [eq(leaveRequests.companyId, companyId)] : []),
        ),
      );

    // Revenue MTD
    const revenueMtd = await db
      .select({ total: sum(proBillingCycles.amountOmr) })
      .from(proBillingCycles)
      .where(
        and(
          eq(proBillingCycles.status, "paid"),
          gte(proBillingCycles.createdAt, startOfMonth),
          ...(companyId ? [eq(proBillingCycles.companyId, companyId)] : []),
        ),
      );

    // Officer workload
    const officerWorkload = await db
      .select({
        officerId: omaniProOfficers.id,
        name: omaniProOfficers.fullName,
        activeAssignments: count(officerCompanyAssignments.id),
        capacity: omaniProOfficers.maxCompanies,
      })
      .from(omaniProOfficers)
      .leftJoin(
        officerCompanyAssignments,
        and(
          eq(officerCompanyAssignments.officerId, omaniProOfficers.id),
          eq(officerCompanyAssignments.status, "active"),
        ),
      )
      .where(eq(omaniProOfficers.status, "active"))
      .groupBy(omaniProOfficers.id, omaniProOfficers.fullName, omaniProOfficers.maxCompanies)
      .limit(10);

    // Pending contracts
    const pendingContractsQuery = db.select({ cnt: count() }).from(contracts);
    const pendingContracts = companyId
      ? await pendingContractsQuery.where(and(eq(contracts.companyId, companyId), eq(contracts.status, "pending_signature")))
      : await pendingContractsQuery.where(eq(contracts.status, "pending_signature"));

    // Active workflows
    const activeWorkflows = await db
      .select({ cnt: count() })
      .from(renewalWorkflowRuns)
      .where(
        and(
          eq(renewalWorkflowRuns.status, "case_created"),
          ...(companyId ? [eq(renewalWorkflowRuns.companyId, companyId)] : []),
        ),
      );

    // Draft quotations
    const draftQuotationsQuery = db.select({ cnt: count() }).from(serviceQuotations);
    const draftQuotations = companyId
      ? await draftQuotationsQuery.where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.status, "draft")))
      : await draftQuotationsQuery.where(eq(serviceQuotations.status, "draft"));

    // Recent audit events
    const recentActivityBase = db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        actorUserId: auditEvents.actorUserId,
        createdAt: auditEvents.createdAt,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents);
    const recentActivity = companyId
      ? await recentActivityBase
          .where(
            hrAuditExcludeSensitive
              ? and(eq(auditEvents.companyId, companyId), hrAuditExcludeSensitive)
              : eq(auditEvents.companyId, companyId)
          )
          .orderBy(desc(auditEvents.createdAt))
          .limit(10)
      : await recentActivityBase.orderBy(desc(auditEvents.createdAt)).limit(10);

    const totalOpenCases = openCases.reduce((s, r) => s + Number(r.cnt), 0);

    const casesActionRequiredQuery = db
      .select({ cnt: count() })
      .from(governmentServiceCases)
      .where(
        and(
          eq(governmentServiceCases.caseStatus, "action_required"),
          ...(companyId ? [eq(governmentServiceCases.companyId, companyId)] : []),
        ),
      );
    const [casesActionRequiredRow] = await casesActionRequiredQuery;

    const overdueInvoicesRow = await db
      .select({ cnt: count(), total: sum(proBillingCycles.amountOmr) })
      .from(proBillingCycles)
      .where(
        and(
          eq(proBillingCycles.status, "overdue"),
          ...(companyId ? [eq(proBillingCycles.companyId, companyId)] : []),
        ),
      );

    const failedRenewalsRow = await db
      .select({ cnt: count() })
      .from(renewalWorkflowRuns)
      .where(
        and(
          eq(renewalWorkflowRuns.status, "failed"),
          ...(companyId ? [eq(renewalWorkflowRuns.companyId, companyId)] : []),
        ),
      );

    const currentMonthNum = now.getMonth() + 1;
    const currentYearNum = now.getFullYear();
    const payrollDraftThisMonthRow = await db
      .select({ cnt: count() })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.status, "draft"),
          eq(payrollRuns.periodMonth, currentMonthNum),
          eq(payrollRuns.periodYear, currentYearNum),
          ...(companyId ? [eq(payrollRuns.companyId, companyId)] : []),
        ),
      );

    const employeeDocsExpiring7dRow = await db
      .select({ cnt: count() })
      .from(employeeDocuments)
      .where(
        and(
          isNotNull(employeeDocuments.expiresAt),
          ...(companyId ? [eq(employeeDocuments.companyId, companyId)] : []),
          gte(employeeDocuments.expiresAt, now),
          lte(employeeDocuments.expiresAt, in7Days),
        ),
      );

    return {
      openCases: {
        total: totalOpenCases,
        byStatus: openCases.map((r) => ({ status: r.caseStatus, cnt: Number(r.cnt) })),
      },
      slaBreaches: slaBreaches.length,
      slaBreachList: slaBreaches,
      casesDueToday,
      casesActionRequired: Number(casesActionRequiredRow?.cnt ?? 0),
      expiringDocs7Days: expiringDocs.length,
      expiringDocsList: expiringDocs,
      employeeDocsExpiring7Days: Number(employeeDocsExpiring7dRow[0]?.cnt ?? 0),
      overdueInvoices: {
        count: Number(overdueInvoicesRow[0]?.cnt ?? 0),
        totalOmr: Number(overdueInvoicesRow[0]?.total ?? 0),
      },
      renewalWorkflowsFailed: Number(failedRenewalsRow[0]?.cnt ?? 0),
      payrollDraftThisMonth: Number(payrollDraftThisMonthRow[0]?.cnt ?? 0),
      pendingPayrollApprovals: pendingPayroll.length,
      pendingPayrollList: pendingPayroll,
      pendingLeaveRequests: Number(pendingLeave[0]?.cnt ?? 0),
      revenueMtdOmr: Number(revenueMtd[0]?.total ?? 0),
      officerWorkload,
      pendingContracts: Number(pendingContracts[0]?.cnt ?? 0),
      activeWorkflows: Number(activeWorkflows[0]?.cnt ?? 0),
      draftQuotations: Number(draftQuotations[0]?.cnt ?? 0),
      recentActivity,
    };
  }),

  // ── AI Insights ─────────────────────────────────────────────────────────────
  getAiInsights: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const expiringPermits = await db
      .select({ cnt: count() })
      .from(workPermits)
      .where(
        and(
          ...(companyId ? [eq(workPermits.companyId, companyId)] : []),
          gte(workPermits.expiryDate, now),
          lte(workPermits.expiryDate, in14Days),
        ),
      );

    const overdueInvoices = await db
      .select({ cnt: count(), total: sum(proBillingCycles.amountOmr) })
      .from(proBillingCycles)
      .where(
        and(
          eq(proBillingCycles.status, "overdue"),
          ...(companyId ? [eq(proBillingCycles.companyId, companyId)] : []),
        ),
      );

    const slaBreaches = companyId
      ? await db
          .select({ cnt: count() })
          .from(caseSlaTracking)
          .innerJoin(governmentServiceCases, eq(caseSlaTracking.caseId, governmentServiceCases.id))
          .where(
            and(
              eq(governmentServiceCases.companyId, companyId),
              lt(caseSlaTracking.dueAt, now),
              isNull(caseSlaTracking.resolvedAt),
            ),
          )
      : await db
          .select({ cnt: count() })
          .from(caseSlaTracking)
          .where(and(lt(caseSlaTracking.dueAt, now), isNull(caseSlaTracking.resolvedAt)));

    const pendingContracts = await db
      .select({ cnt: count() })
      .from(contracts)
      .where(
        and(
          eq(contracts.status, "pending_signature"),
          ...(companyId ? [eq(contracts.companyId, companyId)] : []),
        ),
      );

    const insights: Array<{
      type: string;
      severity: string;
      title: string;
      description: string;
      actionUrl: string;
      actionLabel: string;
    }> = [];

    const permitsCount = Number(expiringPermits[0]?.cnt ?? 0);
    if (permitsCount > 0) {
      insights.push({
        type: "expiry",
        severity: permitsCount > 5 ? "critical" : "high",
        title: `${permitsCount} work permit${permitsCount > 1 ? "s" : ""} expiring in 14 days`,
        description:
          "Start renewal process now to avoid fines and employee disruption. MOL processing takes 3–5 business days.",
        actionUrl: "/renewal-workflows",
        actionLabel: "Trigger Renewals",
      });
    }

    const breachCount = Number(slaBreaches[0]?.cnt ?? 0);
    if (breachCount > 0) {
      insights.push({
        type: "sla",
        severity: "critical",
        title: `${breachCount} case${breachCount > 1 ? "s" : ""} breaching SLA`,
        description:
          "These cases have exceeded their target resolution time. Immediate attention required to maintain client satisfaction.",
        actionUrl: "/sla-management",
        actionLabel: "View Breaches",
      });
    }

    const overdueCount = Number(overdueInvoices[0]?.cnt ?? 0);
    const overdueTotal = Number(overdueInvoices[0]?.total ?? 0);
    if (overdueCount > 0) {
      insights.push({
        type: "finance",
        severity: "high",
        title: `OMR ${overdueTotal.toFixed(3)} overdue from ${overdueCount} invoice${overdueCount > 1 ? "s" : ""}`,
        description: "Follow up with clients on overdue payments to maintain healthy cash flow.",
        actionUrl: "/billing",
        actionLabel: "View Overdue",
      });
    }

    const contractCount = Number(pendingContracts[0]?.cnt ?? 0);
    if (contractCount > 0) {
      insights.push({
        type: "contracts",
        severity: "medium",
        title: `${contractCount} contract${contractCount > 1 ? "s" : ""} awaiting signature`,
        description: "Pending signatures delay service commencement. Send reminders to signers.",
        actionUrl: "/contracts",
        actionLabel: "View Contracts",
      });
    }

    if (insights.length === 0) {
      insights.push({
        type: "ok",
        severity: "low",
        title: "All systems operational",
        description: "No critical alerts at this time. Your operations are running smoothly.",
        actionUrl: "/analytics",
        actionLabel: "View Analytics",
      });
    }

    return insights.slice(0, 4);
  }),

  // ── Smart Dashboard (aggregated intelligence) ──────────────────────────────────────────────────────
  getSmartDashboard: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .output(getSmartDashboardOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
    if (!companyId) return null;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    // Employees
    const allEmployees = await db.select({
      id: employees.id, status: employees.status, nationality: employees.nationality,
      salary: employees.salary, department: employees.department,
      firstName: employees.firstName, lastName: employees.lastName,
    }).from(employees).where(eq(employees.companyId, companyId));
    const activeEmps = allEmployees.filter(e => e.status === "active");
    const omaniEmps = activeEmps.filter(e => (e.nationality ?? "").toLowerCase().includes("oman"));
    const omanisationRate = activeEmps.length > 0 ? Math.round((omaniEmps.length / activeEmps.length) * 100) : 0;
    const totalPayrollCost = activeEmps.reduce((s, e) => s + parseFloat(e.salary ?? "0"), 0);
    // Leave
    const pendingLeave = await db.select({ cnt: count() }).from(leaveRequests)
      .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "pending")));
    // Payroll
    const thisMonthRun = await db.select({ id: payrollRuns.id, status: payrollRuns.status, totalNet: payrollRuns.totalNet })
      .from(payrollRuns).where(and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.periodMonth, currentMonth),
        eq(payrollRuns.periodYear, currentYear)
      )).limit(1);
    // Work permits expiring
    const expiringPermits = await db.select({ cnt: count() }).from(workPermits)
      .where(and(eq(workPermits.companyId, companyId), gte(workPermits.expiryDate, now), lte(workPermits.expiryDate, in30Days)));
    const expiredPermits = await db.select({ cnt: count() }).from(workPermits)
      .where(and(eq(workPermits.companyId, companyId), lt(workPermits.expiryDate, now)));
    // Employee docs expiring
    const expiringEmpDocs = await db.select({ cnt: count() }).from(employeeDocuments)
      .where(and(eq(employeeDocuments.companyId, companyId), gte(employeeDocuments.expiresAt, now), lte(employeeDocuments.expiresAt, in30Days)));
    const expiredEmpDocs = await db.select({ cnt: count() }).from(employeeDocuments)
      .where(and(eq(employeeDocuments.companyId, companyId), lt(employeeDocuments.expiresAt, now)));
    // Company docs expiring
    const expiringCompDocs = await db.select({ cnt: count() }).from(companyDocuments)
      .where(and(eq(companyDocuments.companyId, companyId), gte(companyDocuments.expiryDate, now), lte(companyDocuments.expiryDate, in30Days), eq(companyDocuments.isDeleted, false)));
    // Pending contracts
    const pendingContracts = await db.select({ cnt: count() }).from(contracts)
      .where(and(eq(contracts.status, "pending_signature"), eq(contracts.companyId, companyId)));
    // Build action items
    const actions: Array<{ priority: string; title: string; description: string; url: string; count: number }> = [];
    const expiredPermitCount = Number(expiredPermits[0]?.cnt ?? 0);
    if (expiredPermitCount > 0) actions.push({ priority: "critical", title: `${expiredPermitCount} expired work permit${expiredPermitCount > 1 ? "s" : ""}`, description: "Immediate renewal required to avoid MOL fines", url: "/renewal-workflows", count: expiredPermitCount });
    const expiredDocCount = Number(expiredEmpDocs[0]?.cnt ?? 0);
    if (expiredDocCount > 0) actions.push({ priority: "critical", title: `${expiredDocCount} expired employee document${expiredDocCount > 1 ? "s" : ""}`, description: "Upload renewed documents immediately", url: "/hr/documents-dashboard", count: expiredDocCount });
    const expiringPermitCount = Number(expiringPermits[0]?.cnt ?? 0);
    if (expiringPermitCount > 0) actions.push({ priority: "high", title: `${expiringPermitCount} work permit${expiringPermitCount > 1 ? "s" : ""} expiring in 30 days`, description: "Start renewal process now — MOL takes 3-5 business days", url: "/renewal-workflows", count: expiringPermitCount });
    const expiringDocCount = Number(expiringEmpDocs[0]?.cnt ?? 0) + Number(expiringCompDocs[0]?.cnt ?? 0);
    if (expiringDocCount > 0) actions.push({ priority: "high", title: `${expiringDocCount} document${expiringDocCount > 1 ? "s" : ""} expiring in 30 days`, description: "Review and renew before expiry to maintain compliance", url: "/hr/documents-dashboard", count: expiringDocCount });
    const pendingLeaveCount = Number(pendingLeave[0]?.cnt ?? 0);
    if (pendingLeaveCount > 0) actions.push({ priority: "medium", title: `${pendingLeaveCount} leave request${pendingLeaveCount > 1 ? "s" : ""} awaiting approval`, description: "Review and approve or reject pending requests", url: "/hr/leave", count: pendingLeaveCount });
    const contractCount = Number(pendingContracts[0]?.cnt ?? 0);
    if (contractCount > 0) actions.push({ priority: "medium", title: `${contractCount} contract${contractCount > 1 ? "s" : ""} pending signature`, description: "Follow up with signers to unblock service commencement", url: "/contracts", count: contractCount });
    const payrollRun = thisMonthRun[0];
    const thisMonthPayrollStatus: PayrollRun["status"] | "not_run" = payrollRun?.status ?? "not_run";
    if (!payrollRun) actions.push({ priority: "high", title: "Payroll not run for this month", description: `${new Date().toLocaleString("en", { month: "long" })} ${currentYear} payroll has not been created yet`, url: "/payroll", count: 1 });
    else if (payrollRun.status === "draft") actions.push({ priority: "medium", title: "Payroll draft awaiting approval", description: "Review and approve the current month payroll run", url: "/payroll", count: 1 });
    return {
      headcount: { total: allEmployees.length, active: activeEmps.length, onLeave: allEmployees.filter(e => e.status === "on_leave").length },
      omanisation: { rate: omanisationRate, omani: omaniEmps.length, expat: activeEmps.length - omaniEmps.length },
      payroll: { monthlyTotal: Math.round(totalPayrollCost * 1000) / 1000, thisMonthStatus: thisMonthPayrollStatus, thisMonthNet: parseFloat(payrollRun?.totalNet ?? "0") },
      leave: { pending: pendingLeaveCount },
      permits: { expiring30d: expiringPermitCount, expired: expiredPermitCount },
      documents: { expiring30d: expiringDocCount, expired: expiredDocCount },
      actions: actions.sort((a, b) => ["critical", "high", "medium", "low"].indexOf(a.priority) - ["critical", "high", "medium", "low"].indexOf(b.priority)).slice(0, 6),
    };
  }),
  // ── Today's Tasks ───────────────────────────────────────────────────────────────────────────────────────
  getTodaysTasks: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return { casesDue: [], pendingLeaveApprovals: [], pendingPayrollApprovals: [], totalTasks: 0 };

    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
    const now = new Date();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const casesDue = await db
      .select({
        id: governmentServiceCases.id,
        caseType: governmentServiceCases.caseType,
        priority: governmentServiceCases.priority,
        status: governmentServiceCases.caseStatus,
        dueDate: governmentServiceCases.dueDate,
        governmentReference: governmentServiceCases.governmentReference,
      })
      .from(governmentServiceCases)
      .where(
        and(
          ...(companyId ? [eq(governmentServiceCases.companyId, companyId)] : []),
          lte(governmentServiceCases.dueDate, endOfDay),
          ne(governmentServiceCases.caseStatus, "completed"),
          ne(governmentServiceCases.caseStatus, "cancelled"),
        ),
      )
      .orderBy(governmentServiceCases.priority)
      .limit(15);

    const pendingLeaveApprovals = await db
      .select({
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        leaveType: leaveRequests.leaveType,
        startDate: leaveRequests.startDate,
        endDate: leaveRequests.endDate,
      })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.status, "pending"),
          ...(companyId ? [eq(leaveRequests.companyId, companyId)] : []),
        ),
      )
      .limit(5);

    const pendingPayrollApprovals = await db
      .select({ id: payrollRuns.id, month: payrollRuns.periodMonth, year: payrollRuns.periodYear, totalNet: payrollRuns.totalNet })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.status, "approved"),
          ...(companyId ? [eq(payrollRuns.companyId, companyId)] : []),
        ),
      )
      .limit(3);

    return {
      casesDue,
      pendingLeaveApprovals,
      pendingPayrollApprovals,
      totalTasks: casesDue.length + pendingLeaveApprovals.length + pendingPayrollApprovals.length,
    };
  }),
});
