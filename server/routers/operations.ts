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
} from "../../drizzle/schema";
import { and, eq, gte, lte, lt, count, sum, desc, isNull, ne } from "drizzle-orm";
import { resolvePlatformOrCompanyScope } from "../_core/tenant";
import type { User } from "../../drizzle/schema";

export const operationsRouter = router({
  // ── Daily Snapshot ──────────────────────────────────────────────────────────
  getDailySnapshot: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);
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
          .where(eq(auditEvents.companyId, companyId))
          .orderBy(desc(auditEvents.createdAt))
          .limit(10)
      : await recentActivityBase.orderBy(desc(auditEvents.createdAt)).limit(10);

    const totalOpenCases = openCases.reduce((s, r) => s + Number(r.cnt), 0);

    return {
      openCases: {
        total: totalOpenCases,
        byStatus: openCases.map((r) => ({ status: r.caseStatus, cnt: Number(r.cnt) })),
      },
      slaBreaches: slaBreaches.length,
      slaBreachList: slaBreaches,
      casesDueToday,
      expiringDocs7Days: expiringDocs.length,
      expiringDocsList: expiringDocs,
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
  getAiInsights: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);
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

  // ── Today's Tasks ────────────────────────────────────────────────────────────
  getTodaysTasks: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { casesDue: [], pendingLeaveApprovals: [], pendingPayrollApprovals: [], totalTasks: 0 };

    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User);
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
