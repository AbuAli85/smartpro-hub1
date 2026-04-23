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
  subscriptionInvoices,
  crmContacts,
  crmDeals,
  marketplaceBookings,
  proServices,
  employeeTasks,
} from "../../drizzle/schema";
import { and, eq, gte, lte, lt, count, sum, desc, asc, isNull, isNotNull, ne, notInArray, inArray, sql } from "drizzle-orm";
import { resolvePlatformOrCompanyScope } from "../_core/tenant";
import {
  canReadHrPerformanceAuditSensitiveRows,
  HR_AUDIT_SENSITIVE_ENTITY_TYPES,
} from "../hrPerformanceAuditReadPolicy";
import type { PayrollRun, User } from "../../drizzle/schema";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { buildOwnerAttentionQueue } from "../ownerAttentionQueue";
import { requireWorkspaceMembership } from "../_core/membership";
import { getPostSaleSignals } from "../postSaleSignals";
import { getCompanyAccountPortfolioSnapshot } from "../accountHealth";
import { buildRevenueRealizationSnapshot, selectRenewalMonetizationRiskRows } from "../revenueRealization";
import { getOwnerResolutionSnapshot, loadOwnerResolutionSnapshotForCompany } from "../ownerResolution";
import { buildOwnerResolutionCsv, buildOwnerResolutionExportJson } from "../ownerResolutionCsv";
import {
  buildBillingResolutionFollowUpPrefill,
  buildCrmResolutionFollowUpPrefill,
} from "../resolutionFollowUpPrefill";
import { buildExecutiveRevenueSnapshot } from "../executiveRevenueSnapshot";
import {
  buildClientHealthTop,
  buildControlTowerBundle,
  buildExecutiveInsightNarrative,
} from "../controlTower";
import { listDecisionWorkItems } from "../decisionWorkItems";
import { listCollectionsExecutionQueue, upsertCollectionWorkItem } from "../collectionsExecution";
import { filterDecisionWorkItemsForRole } from "../executionCapabilities";
import { buildManagementCadenceBundle } from "../managementCadence";
import { buildRoleExecutionView } from "../roleExecutionSummary";
import {
  type QueueRoleView,
  type RoleActionQueueItem,
  prioritizeForRole,
  sortRoleActionQueue,
} from "../roleActionQueue";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const DEFAULT_OWNER_LIFECYCLE_SIGNALS = {
  closedWonDealsWithoutLinkedQuote: 0,
  wonDealsAwaitingSignedAgreement: 0,
  contractsExpiringNext30Days: 0,
  employeeTasksOverdue: 0,
  employeeTasksBlocked: 0,
};

/** Commercial / delivery lifecycle signals reused by daily snapshot attention and owner business pulse. */
async function getOwnerLifecycleSignals(db: DbClient, companyId: number) {
  try {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const wonDealRows = await db
      .select({ id: crmDeals.id })
      .from(crmDeals)
      .where(and(eq(crmDeals.companyId, companyId), eq(crmDeals.stage, "closed_won")));

    const quotedDealRows = await db
      .select({ id: serviceQuotations.crmDealId })
      .from(serviceQuotations)
      .where(and(eq(serviceQuotations.companyId, companyId), isNotNull(serviceQuotations.crmDealId)));
    const quotedSet = new Set(quotedDealRows.map((r) => r.id).filter((x): x is number => x != null));

    const closedWonDealsWithoutLinkedQuote = wonDealRows.filter((d) => !quotedSet.has(d.id)).length;

    const [expiringContractsRow] = await db
      .select({ cnt: count() })
      .from(contracts)
      .where(
        and(
          eq(contracts.companyId, companyId),
          inArray(contracts.status, ["signed", "active"]),
          isNotNull(contracts.endDate),
          gte(contracts.endDate, now),
          lte(contracts.endDate, in30),
        ),
      );

    const [tasksOverdue] = await db
      .select({ cnt: count() })
      .from(employeeTasks)
      .where(
        and(
          eq(employeeTasks.companyId, companyId),
          notInArray(employeeTasks.status, ["completed", "cancelled"]),
          sql`(${employeeTasks.dueDate} IS NOT NULL AND ${employeeTasks.dueDate} < CURDATE())`,
        ),
      );

    const [tasksBlocked] = await db
      .select({ cnt: count() })
      .from(employeeTasks)
      .where(and(eq(employeeTasks.companyId, companyId), eq(employeeTasks.status, "blocked")));

    const wonAwaitRows = await db
      .select({ dealId: crmDeals.id })
      .from(crmDeals)
      .innerJoin(serviceQuotations, eq(serviceQuotations.crmDealId, crmDeals.id))
      .where(
        and(
          eq(crmDeals.companyId, companyId),
          eq(crmDeals.stage, "closed_won"),
          eq(serviceQuotations.status, "accepted"),
          isNull(serviceQuotations.convertedToContractId),
        ),
      );
    const wonDealsAwaitingSignedAgreement = new Set(wonAwaitRows.map((r) => r.dealId)).size;

    return {
      closedWonDealsWithoutLinkedQuote,
      wonDealsAwaitingSignedAgreement,
      contractsExpiringNext30Days: Number(expiringContractsRow?.cnt ?? 0),
      employeeTasksOverdue: Number(tasksOverdue?.cnt ?? 0),
      employeeTasksBlocked: Number(tasksBlocked?.cnt ?? 0),
    };
  } catch (err) {
    console.warn(
      "[operations.getOwnerLifecycleSignals] degraded (likely missing service_quotations.crm_deal_id / CRM columns):",
      err instanceof Error ? err.message : err,
    );
    return { ...DEFAULT_OWNER_LIFECYCLE_SIGNALS };
  }
}

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
    thisMonthStatus: z.enum(["draft", "processing", "approved", "paid", "cancelled", "pending_execution", "locked", "wps_generated", "ready_for_upload", "not_run"]),
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

const roleActionQueueItemSchema = z.object({
  id: z.string(),
  type: z.enum([
    "payroll_blocker",
    "permit_expiry",
    "government_case_overdue",
    "hr_approval",
    "task",
    "document_issue",
  ]),
  title: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  ownerUserId: z.string().nullable(),
  dueAt: z.string().nullable(),
  status: z.enum(["open", "pending", "blocked", "overdue", "resolved"]),
  href: z.string(),
  reason: z.string(),
});

export const operationsRouter = router({
  getRoleActionQueue: protectedProcedure
    .input(
      z.object({
        companyId: z.number(),
        roleView: z.enum(["ceo", "admin", "hr", "finance", "compliance"]).optional(),
      }),
    )
    .output(z.array(roleActionQueueItemSchema))
    .query(async ({ ctx, input }) => {

      let memberRole: string | null = null;
      if (!canAccessGlobalAdminProcedures(ctx.user as User)) {
        const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
        memberRole = membership.role ?? null;
      }

      const roleView: QueueRoleView =
        input.roleView ??
        (memberRole === "finance_admin"
          ? "finance"
          : memberRole === "hr_admin"
            ? "hr"
            : memberRole === "reviewer" || memberRole === "external_auditor"
              ? "compliance"
              : "admin");

      const canSeeFinance = canAccessGlobalAdminProcedures(ctx.user as User)
        || memberRole === "company_admin"
        || memberRole === "finance_admin"
        || memberRole === "hr_admin";
      const canSeeHr = canAccessGlobalAdminProcedures(ctx.user as User)
        || memberRole === "company_admin"
        || memberRole === "hr_admin";
      const canSeeCompliance = canAccessGlobalAdminProcedures(ctx.user as User)
        || memberRole === "company_admin"
        || memberRole === "hr_admin"
        || memberRole === "finance_admin"
        || memberRole === "reviewer"
        || memberRole === "external_auditor";
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const now = new Date();
      const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const items: RoleActionQueueItem[] = [];

      if (canSeeFinance) {
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const [currentRun] = await db
          .select({
            id: payrollRuns.id,
            status: payrollRuns.status,
            periodMonth: payrollRuns.periodMonth,
            periodYear: payrollRuns.periodYear,
            createdAt: payrollRuns.createdAt,
            paidAt: payrollRuns.paidAt,
            wpsFileUrl: payrollRuns.wpsFileUrl,
          })
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.companyId, input.companyId),
              eq(payrollRuns.periodMonth, currentMonth),
              eq(payrollRuns.periodYear, currentYear),
            ),
          )
          .orderBy(desc(payrollRuns.createdAt))
          .limit(1);

        if (!currentRun) {
          items.push({
            id: `payroll-missing-${input.companyId}-${currentYear}-${currentMonth}`,
            type: "payroll_blocker",
            title: "Current month payroll run is missing",
            severity: "critical",
            ownerUserId: null,
            dueAt: new Date(currentYear, currentMonth - 1, 28).toISOString(),
            status: "blocked",
            href: "/payroll",
            reason: "No payroll run exists for the current month.",
          });
        } else if (currentRun.status === "draft" || currentRun.status === "processing") {
          items.push({
            id: `payroll-blocked-${currentRun.id}`,
            type: "payroll_blocker",
            title: `Payroll run ${currentRun.periodMonth}/${currentRun.periodYear} needs approval`,
            severity: "critical",
            ownerUserId: null,
            dueAt: new Date(currentYear, currentMonth, 0).toISOString(),
            status: "blocked",
            href: `/payroll`,
            reason: "Payroll is not approved yet for the current month.",
          });
        } else if (currentRun.status === "approved" && !currentRun.paidAt) {
          items.push({
            id: `payroll-approved-${currentRun.id}`,
            type: "payroll_blocker",
            title: `Payroll run ${currentRun.periodMonth}/${currentRun.periodYear} approved, awaiting payment`,
            severity: "high",
            ownerUserId: null,
            dueAt: new Date(currentYear, currentMonth, 0).toISOString(),
            status: "pending",
            href: `/payroll`,
            reason: "Run is approved but not marked as paid.",
          });
        }
      }

      if (canSeeCompliance) {
        const permits = await db
          .select({
            id: workPermits.id,
            employeeId: workPermits.employeeId,
            expiryDate: workPermits.expiryDate,
            permitStatus: workPermits.permitStatus,
          })
          .from(workPermits)
          .where(
            and(
              eq(workPermits.companyId, input.companyId),
              eq(workPermits.permitStatus, "active"),
              isNotNull(workPermits.expiryDate),
              lte(workPermits.expiryDate, in14d),
            ),
          )
          .orderBy(asc(workPermits.expiryDate))
          .limit(25);

        for (const p of permits) {
          const overdue = p.expiryDate ? p.expiryDate < now : false;
          items.push({
            id: `permit-${p.id}`,
            type: "permit_expiry",
            title: overdue ? `Permit #${p.id} expired` : `Permit #${p.id} expires soon`,
            severity: overdue ? "critical" : "high",
            ownerUserId: null,
            dueAt: p.expiryDate ? p.expiryDate.toISOString() : null,
            status: overdue ? "overdue" : "pending",
            href: overdue ? "/workforce/permits?status=expired" : "/workforce/permits?status=expiring_soon",
            reason: overdue
              ? "Work permit expiry date has passed."
              : "Work permit expires within the next 14 days.",
          });
        }

        const overdueCases = await db
          .select({
            id: governmentServiceCases.id,
            dueDate: governmentServiceCases.dueDate,
            assignedTo: governmentServiceCases.assignedTo,
            caseType: governmentServiceCases.caseType,
          })
          .from(governmentServiceCases)
          .where(
            and(
              eq(governmentServiceCases.companyId, input.companyId),
              lt(governmentServiceCases.dueDate, now),
              notInArray(governmentServiceCases.caseStatus, ["completed", "cancelled"]),
            ),
          )
          .orderBy(asc(governmentServiceCases.dueDate))
          .limit(20);

        for (const c of overdueCases) {
          items.push({
            id: `govcase-${c.id}`,
            type: "government_case_overdue",
            title: `Government case #${c.id} is overdue`,
            severity: "critical",
            ownerUserId: c.assignedTo != null ? String(c.assignedTo) : null,
            dueAt: c.dueDate ? c.dueDate.toISOString() : null,
            status: "overdue",
            href: "/workforce/cases",
            reason: `${String(c.caseType).replace(/_/g, " ")} case exceeded due date.`,
          });
        }
      }

      if (canSeeHr) {
        const pendingLeave = await db
          .select({
            id: leaveRequests.id,
            createdAt: leaveRequests.createdAt,
          })
          .from(leaveRequests)
          .where(
            and(
              eq(leaveRequests.companyId, input.companyId),
              eq(leaveRequests.status, "pending"),
            ),
          )
          .orderBy(asc(leaveRequests.createdAt))
          .limit(15);

        for (const l of pendingLeave) {
          const ageMs = now.getTime() - (l.createdAt?.getTime() ?? now.getTime());
          const overdue = ageMs > 3 * 24 * 60 * 60 * 1000;
          items.push({
            id: `leave-${l.id}`,
            type: "hr_approval",
            title: `Leave request #${l.id} awaiting approval`,
            severity: overdue ? "high" : "medium",
            ownerUserId: null,
            dueAt: l.createdAt ? new Date(l.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString() : null,
            status: overdue ? "overdue" : "pending",
            href: "/hr/leave",
            reason: overdue ? "Leave request has been pending for more than 3 days." : "Leave request is pending review.",
          });
        }

        const taskRows = await db
          .select({
            id: employeeTasks.id,
            title: employeeTasks.title,
            status: employeeTasks.status,
            dueDate: employeeTasks.dueDate,
            assignedByUserId: employeeTasks.assignedByUserId,
          })
          .from(employeeTasks)
          .where(
            and(
              eq(employeeTasks.companyId, input.companyId),
              notInArray(employeeTasks.status, ["completed", "cancelled"]),
            ),
          )
          .orderBy(asc(employeeTasks.dueDate))
          .limit(20);

        for (const t of taskRows) {
          const overdue = t.dueDate ? t.dueDate < now : false;
          const blocked = t.status === "blocked";
          if (!overdue && !blocked) continue;
          items.push({
            id: `task-${t.id}`,
            type: "task",
            title: t.title,
            severity: blocked || overdue ? "high" : "medium",
            ownerUserId: t.assignedByUserId != null ? String(t.assignedByUserId) : null,
            dueAt: t.dueDate ? t.dueDate.toISOString() : null,
            status: overdue ? "overdue" : blocked ? "blocked" : "open",
            href: "/hr/tasks",
            reason: overdue ? "Task due date has passed." : "Task is currently blocked.",
          });
        }
      }

      if (canSeeCompliance || canSeeHr) {
        const docRows = await db
          .select({
            id: employeeDocuments.id,
            expiresAt: employeeDocuments.expiresAt,
            verificationStatus: employeeDocuments.verificationStatus,
          })
          .from(employeeDocuments)
          .where(eq(employeeDocuments.companyId, input.companyId))
          .orderBy(asc(employeeDocuments.expiresAt))
          .limit(25);

        for (const d of docRows) {
          const expired = d.expiresAt ? d.expiresAt < now : false;
          const expSoon = d.expiresAt ? d.expiresAt <= in14d : false;
          const pendingVerification = d.verificationStatus === "pending";
          if (!expired && !expSoon && !pendingVerification) continue;
          items.push({
            id: `doc-${d.id}`,
            type: "document_issue",
            title: expired
              ? `Document #${d.id} is expired`
              : pendingVerification
                ? `Document #${d.id} pending verification`
                : `Document #${d.id} expires soon`,
            severity: expired ? "high" : pendingVerification ? "medium" : "low",
            ownerUserId: null,
            dueAt: d.expiresAt ? d.expiresAt.toISOString() : null,
            status: expired ? "overdue" : pendingVerification ? "pending" : "open",
            href: "/hr/documents-dashboard",
            reason: expired
              ? "Document expiry date has passed."
              : pendingVerification
                ? "Document is waiting for verification."
                : "Document expires within the next 14 days.",
          });
        }
      }

      const sorted = sortRoleActionQueue(items);
      const prioritized = prioritizeForRole(sorted, roleView);
      return prioritized.slice(0, 50);
    }),

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

    const isPlatformOperator = canAccessGlobalAdminProcedures(ctx.user as User);

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

    const acceptedQuoteUnconvertedWhere = and(
      eq(serviceQuotations.status, "accepted"),
      isNull(serviceQuotations.convertedToContractId),
      ...(companyId ? [eq(serviceQuotations.companyId, companyId)] : []),
    );
    const [acceptedUnconvertedRow] = await db
      .select({ cnt: count() })
      .from(serviceQuotations)
      .where(acceptedQuoteUnconvertedWhere);

    const saasSubOverdueWhere = and(
      eq(subscriptionInvoices.status, "overdue"),
      ...(companyId ? [eq(subscriptionInvoices.companyId, companyId)] : []),
    );
    const [saasSubOverdueRow] = await db
      .select({ cnt: count(), total: sum(subscriptionInvoices.amount) })
      .from(subscriptionInvoices)
      .where(saasSubOverdueWhere);

    const lifecycleSignals =
      companyId != null
        ? await getOwnerLifecycleSignals(db, companyId)
        : {
            closedWonDealsWithoutLinkedQuote: 0,
            wonDealsAwaitingSignedAgreement: 0,
            contractsExpiringNext30Days: 0,
            employeeTasksOverdue: 0,
            employeeTasksBlocked: 0,
          };

    const postSaleSnapshot =
      companyId != null ? await getPostSaleSignals(db, companyId) : null;

    const attentionQueue = buildOwnerAttentionQueue({
      isPlatformOperator,
      slaBreaches: slaBreaches.length,
      casesActionRequired: Number(casesActionRequiredRow?.cnt ?? 0),
      pendingLeaveRequests: Number(pendingLeave[0]?.cnt ?? 0),
      payrollDraftThisMonth: Number(payrollDraftThisMonthRow[0]?.cnt ?? 0),
      pendingPayrollApprovedAwaitingPayment: pendingPayroll.length,
      expiringPermits7Days: expiringDocs.length,
      employeeDocsExpiring7Days: Number(employeeDocsExpiring7dRow[0]?.cnt ?? 0),
      pendingContracts: Number(pendingContracts[0]?.cnt ?? 0),
      overdueInvoiceCount: Number(overdueInvoicesRow[0]?.cnt ?? 0),
      overdueInvoiceTotalOmr: Number(overdueInvoicesRow[0]?.total ?? 0),
      renewalWorkflowsFailed: Number(failedRenewalsRow[0]?.cnt ?? 0),
      draftQuotations: Number(draftQuotations[0]?.cnt ?? 0),
      acceptedQuotationsUnconverted: Number(acceptedUnconvertedRow?.cnt ?? 0),
      saasSubscriptionOverdueCount: Number(saasSubOverdueRow?.cnt ?? 0),
      saasSubscriptionOverdueOmr: Number(saasSubOverdueRow?.total ?? 0),
      closedWonDealsWithoutLinkedQuote: lifecycleSignals.closedWonDealsWithoutLinkedQuote,
      wonDealsAwaitingSignedAgreement: lifecycleSignals.wonDealsAwaitingSignedAgreement,
      contractsExpiringNext30Days: lifecycleSignals.contractsExpiringNext30Days,
      employeeTasksOverdue: lifecycleSignals.employeeTasksOverdue,
      employeeTasksBlocked: lifecycleSignals.employeeTasksBlocked,
      serviceContractsStalledNoDelivery: postSaleSnapshot?.serviceContractsStalledNoDeliveryCount ?? 0,
      stalledContractSampleId: postSaleSnapshot?.stalledContractSampleId ?? null,
    });

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
      attentionQueue,
    };
  }),

  // ── AI Insights ─────────────────────────────────────────────────────────────
  getAiInsights: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
    const isPlatform = canAccessGlobalAdminProcedures(ctx.user as User);
    const db = await getDb();
    if (!db) return [];
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
      titleKey?: string;
      descriptionKey?: string;
      actionLabelKey?: string;
      titleParams?: Record<string, string | number>;
    }> = [];

    const permitsCount = Number(expiringPermits[0]?.cnt ?? 0);
    if (permitsCount > 0) {
      insights.push({
        type: "expiry",
        severity: permitsCount > 5 ? "critical" : "high",
        title: `${permitsCount} work permit${permitsCount > 1 ? "s" : ""} expiring in 14 days`,
        description:
          "Start renewal process now to avoid fines and employee disruption. MOL processing takes 3–5 business days.",
        actionUrl: isPlatform ? "/renewal-workflows" : "/workforce/permits",
        actionLabel: isPlatform ? "Renewal workflows" : "View permits",
        titleKey: "insights.permitsExpiring",
        titleParams: { count: permitsCount },
        descriptionKey: "insights.permitsExpiringDesc",
        actionLabelKey: isPlatform ? "insights.renewalWorkflows" : "insights.viewPermits",
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
        actionUrl: isPlatform ? "/sla-management" : "/operations",
        actionLabel: isPlatform ? "View breaches" : "Operations centre",
        titleKey: "insights.slaBreaches",
        titleParams: { count: breachCount },
        descriptionKey: "insights.slaBreachesDesc",
        actionLabelKey: isPlatform ? "insights.viewBreaches" : "insights.operationsCentre",
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
        actionUrl: isPlatform ? "/billing" : "/client/invoices",
        actionLabel: isPlatform ? "Billing engine" : "View invoices",
        titleKey: "insights.overdueInvoices",
        titleParams: { total: overdueTotal.toFixed(3), count: overdueCount },
        descriptionKey: "insights.overdueInvoicesDesc",
        actionLabelKey: isPlatform ? "insights.billingEngine" : "insights.viewInvoices",
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
        titleKey: "insights.contractsAwaitingSignature",
        titleParams: { count: contractCount },
        descriptionKey: "insights.contractsAwaitingSignatureDesc",
        actionLabelKey: "insights.viewContracts",
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
        titleKey: "insights.allSystemsOperational",
        descriptionKey: "insights.allSystemsOperationalDesc",
        actionLabelKey: "insights.viewAnalytics",
      });
    }

    return insights.slice(0, 4);
  }),

  // ── Smart Dashboard (aggregated intelligence) ──────────────────────────────────────────────────────
  getSmartDashboard: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .output(getSmartDashboardOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
    const db = await getDb();
    if (!db) return null;
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
    const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
    const db = await getDb();
    if (!db) return { casesDue: [], pendingLeaveApprovals: [], pendingPayrollApprovals: [], totalTasks: 0 };

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

  /**
   * Owner command center — commercial, finance, and delivery signals in one tenant-scoped payload.
   * Returns null for platform-wide scope (no single company workspace).
   */
  getOwnerBusinessPulse: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input?.companyId);
      if (companyId === null) return null;

      const membership = await requireWorkspaceMembership(ctx.user as User, companyId);
      const db = await getDb();
      if (!db) return null;
      if (membership.role === "company_member" || membership.role === "client") return null;

      const openStages = ["lead", "qualified", "proposal", "negotiation"] as const;

      const [contactsLeads] = await db
        .select({ cnt: count() })
        .from(crmContacts)
        .where(and(eq(crmContacts.companyId, companyId), eq(crmContacts.status, "lead")));
      const [contactsProspects] = await db
        .select({ cnt: count() })
        .from(crmContacts)
        .where(and(eq(crmContacts.companyId, companyId), eq(crmContacts.status, "prospect")));

      const [dealsOpen] = await db
        .select({ cnt: count() })
        .from(crmDeals)
        .where(and(eq(crmDeals.companyId, companyId), inArray(crmDeals.stage, [...openStages])));

      const [pipelineSum] = await db
        .select({ total: sum(crmDeals.value) })
        .from(crmDeals)
        .where(and(eq(crmDeals.companyId, companyId), inArray(crmDeals.stage, [...openStages])));

      const dealStageRows = await db
        .select({ stage: crmDeals.stage, cnt: count() })
        .from(crmDeals)
        .where(eq(crmDeals.companyId, companyId))
        .groupBy(crmDeals.stage);
      const stageMap = Object.fromEntries(
        dealStageRows.map((r) => [r.stage, Number(r.cnt)]),
      ) as Record<string, number>;

      const [qDraft] = await db
        .select({ cnt: count() })
        .from(serviceQuotations)
        .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.status, "draft")));
      const [qSent] = await db
        .select({ cnt: count() })
        .from(serviceQuotations)
        .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.status, "sent")));
      const [qAcceptedNoContract] = await db
        .select({ cnt: count() })
        .from(serviceQuotations)
        .where(
          and(
            eq(serviceQuotations.companyId, companyId),
            eq(serviceQuotations.status, "accepted"),
            isNull(serviceQuotations.convertedToContractId),
          ),
        );

      const [pendingSig] = await db
        .select({ cnt: count() })
        .from(contracts)
        .where(and(eq(contracts.companyId, companyId), eq(contracts.status, "pending_signature")));

      const [proOverdue] = await db
        .select({ cnt: count(), total: sum(proBillingCycles.amountOmr) })
        .from(proBillingCycles)
        .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "overdue")));
      const [proPending] = await db
        .select({ cnt: count() })
        .from(proBillingCycles)
        .where(and(eq(proBillingCycles.companyId, companyId), eq(proBillingCycles.status, "pending")));

      const [subOverdue] = await db
        .select({ cnt: count(), total: sum(subscriptionInvoices.amount) })
        .from(subscriptionInvoices)
        .where(and(eq(subscriptionInvoices.companyId, companyId), eq(subscriptionInvoices.status, "overdue")));
      const [subIssued] = await db
        .select({ cnt: count() })
        .from(subscriptionInvoices)
        .where(and(eq(subscriptionInvoices.companyId, companyId), eq(subscriptionInvoices.status, "issued")));

      const [openPro] = await db
        .select({ cnt: count() })
        .from(proServices)
        .where(
          and(
            eq(proServices.companyId, companyId),
            notInArray(proServices.status, ["completed", "cancelled", "rejected"]),
          ),
        );

      const [bookings] = await db
        .select({ cnt: count() })
        .from(marketplaceBookings)
        .where(
          and(
            eq(marketplaceBookings.companyId, companyId),
            inArray(marketplaceBookings.status, ["pending", "confirmed", "in_progress"]),
          ),
        );

      const [govCases] = await db
        .select({ cnt: count() })
        .from(governmentServiceCases)
        .where(
          and(
            eq(governmentServiceCases.companyId, companyId),
            ne(governmentServiceCases.caseStatus, "completed"),
            ne(governmentServiceCases.caseStatus, "cancelled"),
          ),
        );

      const lifecycle = await getOwnerLifecycleSignals(db, companyId);
      const postSale = await getPostSaleSignals(db, companyId);
      const accountPortfolio = await getCompanyAccountPortfolioSnapshot(
        db,
        companyId,
        postSale.proBillingOverdueCount > 0,
      );

      const revenueRealization = await buildRevenueRealizationSnapshot(
        db,
        companyId,
        postSale,
        Number(proPending?.cnt ?? 0),
      );
      const renewalMonetizationRisk = selectRenewalMonetizationRiskRows(accountPortfolio, revenueRealization);

      const ownerResolution = await getOwnerResolutionSnapshot(
        db,
        companyId,
        accountPortfolio,
        revenueRealization,
        renewalMonetizationRisk,
        postSale,
      );

      const revenueSnapshot = await buildExecutiveRevenueSnapshot(db, companyId);

      const controlTowerCore = await buildControlTowerBundle(db, companyId);
      const clientHealthTop = buildClientHealthTop(ownerResolution.rankedAccountsForReview);
      const overdueArInvoiceCount =
        controlTowerCore.agedReceivables.officerPro.rowCount +
        controlTowerCore.agedReceivables.platformSubscription.rowCount;
      const insightSummary = buildExecutiveInsightNarrative({
        revenueMtdOmr: revenueSnapshot.combinedPaid.monthToDateOmr,
        combinedAtRiskArOmr: controlTowerCore.agedReceivables.combinedAtRiskOmr,
        overdueArInvoiceCount,
        decisionsOpen: controlTowerCore.decisionsQueue.totalOpenCount,
        slaBreaches: controlTowerCore.riskCompliance.slaOpenBreaches,
        contractsPendingSignature: controlTowerCore.riskCompliance.contractsPendingSignature,
        renewalWorkflowsFailed: controlTowerCore.riskCompliance.renewalWorkflowsFailed,
        rankedAccountsCount: ownerResolution.rankedAccountsForReview.length,
        absentToday: controlTowerCore.attendanceSignal.absentToday,
        overdueCheckouts: controlTowerCore.attendanceSignal.overdueCheckouts,
      });

      const [decisionWorkItemsRaw, collectionExecutionQueue] = await Promise.all([
        listDecisionWorkItems(db, companyId),
        listCollectionsExecutionQueue(db, companyId, 20),
      ]);
      const decisionWorkItems = filterDecisionWorkItemsForRole(decisionWorkItemsRaw, membership.role);
      const pendingLeaveCount = decisionWorkItemsRaw.filter((i) => i.entityType === "leave_request").length;
      const pendingExpenseCount = decisionWorkItemsRaw.filter((i) => i.entityType === "expense_claim").length;

      const managementCadence = buildManagementCadenceBundle({
        revenue: revenueSnapshot,
        agedReceivables: controlTowerCore.agedReceivables,
        decisionsQueue: controlTowerCore.decisionsQueue,
        riskCompliance: controlTowerCore.riskCompliance,
        insightSummary,
        clientHealthTop,
        delivery: {
          employeeTasksOverdue: lifecycle.employeeTasksOverdue,
          employeeTasksBlocked: lifecycle.employeeTasksBlocked,
        },
        overdueArInvoiceCount,
      });

      const roleExecution = buildRoleExecutionView({
        memberRole: membership.role,
        decisionsOpen: controlTowerCore.decisionsQueue.totalOpenCount,
        collectionQueueCount: collectionExecutionQueue.length,
        agedReceivablesOmr: controlTowerCore.agedReceivables.combinedAtRiskOmr,
        contractsPendingSignature: controlTowerCore.riskCompliance.contractsPendingSignature,
        renewalWorkflowsFailed: controlTowerCore.riskCompliance.renewalWorkflowsFailed,
        slaBreaches: controlTowerCore.riskCompliance.slaOpenBreaches,
        openProServices: Number(openPro?.cnt ?? 0),
        proOverdueCount: Number(proOverdue?.cnt ?? 0),
        subscriptionOverdueCount: Number(subOverdue?.cnt ?? 0),
        employeeTasksOverdue: lifecycle.employeeTasksOverdue,
        employeeTasksBlocked: lifecycle.employeeTasksBlocked,
        pendingLeaveCount,
        pendingExpenseCount,
      });

      return {
        revenue: revenueSnapshot,
        managementCadence,
        roleExecution,
        execution: {
          basis:
            "Approvals and collections actions shown here match your workspace role. Open a row to review context; buttons run only when your role is allowed.",
          decisionWorkItems,
          collectionQueue: collectionExecutionQueue,
          viewerRole: membership.role,
          readOnlyExecution: membership.role === "external_auditor",
        },
        controlTower: {
          agedReceivables: controlTowerCore.agedReceivables,
          decisionsQueue: controlTowerCore.decisionsQueue,
          riskCompliance: controlTowerCore.riskCompliance,
          clientHealthTop,
          insightSummary,
          attendanceSignal: controlTowerCore.attendanceSignal,
        },
        commercial: {
          contactsLeads: Number(contactsLeads?.cnt ?? 0),
          contactsProspects: Number(contactsProspects?.cnt ?? 0),
          dealsOpen: Number(dealsOpen?.cnt ?? 0),
          pipelineValueOmr: Number(pipelineSum?.total ?? 0),
          dealsByStage: {
            lead: stageMap.lead ?? 0,
            qualified: stageMap.qualified ?? 0,
            proposal: stageMap.proposal ?? 0,
            negotiation: stageMap.negotiation ?? 0,
            closedWon: stageMap["closed_won"] ?? 0,
            closedLost: stageMap["closed_lost"] ?? 0,
          },
          quotationsDraft: Number(qDraft?.cnt ?? 0),
          quotationsSent: Number(qSent?.cnt ?? 0),
          quotationsAcceptedUnconverted: Number(qAcceptedNoContract?.cnt ?? 0),
          contractsPendingSignature: Number(pendingSig?.cnt ?? 0),
          closedWonDealsWithoutLinkedQuote: lifecycle.closedWonDealsWithoutLinkedQuote,
          wonDealsAwaitingSignedAgreement: lifecycle.wonDealsAwaitingSignedAgreement,
          contractsExpiringNext30Days: lifecycle.contractsExpiringNext30Days,
        },
        finance: {
          proBillingOverdueCount: Number(proOverdue?.cnt ?? 0),
          proBillingOverdueOmr: Number(proOverdue?.total ?? 0),
          proBillingPendingCount: Number(proPending?.cnt ?? 0),
          subscriptionOverdueCount: Number(subOverdue?.cnt ?? 0),
          subscriptionOverdueOmr: Number(subOverdue?.total ?? 0),
          subscriptionIssuedUnpaidCount: Number(subIssued?.cnt ?? 0),
        },
        delivery: {
          openProServices: Number(openPro?.cnt ?? 0),
          activeBookings: Number(bookings?.cnt ?? 0),
          openGovernmentCases: Number(govCases?.cnt ?? 0),
          employeeTasksOverdue: lifecycle.employeeTasksOverdue,
          employeeTasksBlocked: lifecycle.employeeTasksBlocked,
        },
        postSale: {
          serviceContractsStalledNoDeliveryCount: postSale.serviceContractsStalledNoDeliveryCount,
          stalledContractSampleId: postSale.stalledContractSampleId,
          completedProWithFeesLast90dCount: postSale.completedProWithFeesLast90dCount,
          stalledDeliveryBasis: postSale.stalledDeliveryBasis,
          completedProFeesBasis: postSale.completedProFeesBasis,
          completedWorkBillingCaveat: postSale.completedWorkBillingCaveat,
          combinedExecutionAndCollectionRisk:
            postSale.serviceContractsStalledNoDeliveryCount > 0 && Number(proOverdue?.cnt ?? 0) > 0,
          deepLinks: {
            stalledContracts:
              postSale.stalledContractSampleId != null
                ? `/contracts?id=${postSale.stalledContractSampleId}`
                : "/contracts",
            proJobs: "/pro",
            clientBilling: "/client/invoices",
          },
        },
        accountPortfolio,
        revenueRealization,
        renewalMonetizationRisk,
        ownerResolution,
      };
    }),

  /** Prefill for Task Manager when opening /hr/tasks?resolution=crm|billing&… — tenant-scoped. */
  getResolutionFollowUpPrefill: protectedProcedure
    .input(
      z.union([
        z.object({ kind: z.literal("crm"), contactId: z.number(), companyId: z.number().optional() }),
        z.object({ kind: z.literal("billing"), billingCycleId: z.number(), companyId: z.number().optional() }),
      ]),
    )
    .query(async ({ input, ctx }) => {
      const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input.companyId);
      if (companyId === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Company required" });
      const membership = await requireWorkspaceMembership(ctx.user as User, companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (membership.role === "company_member" || membership.role === "client") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient access" });
      }
      if (input.kind === "crm") {
        const p = await buildCrmResolutionFollowUpPrefill(db, companyId, input.contactId);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
        return p;
      }
      const p = await buildBillingResolutionFollowUpPrefill(db, companyId, input.billingCycleId);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Billing cycle not found" });
      return p;
    }),

  /** Downloadable owner-resolution pack (CSV or JSON) — same snapshot shape as pulse `ownerResolution`. */
  exportOwnerResolutionPack: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        format: z.enum(["csv", "json"]),
      }),
    )
    .query(async ({ input, ctx }) => {
      const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input.companyId);
      if (companyId === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Company required" });
      const membership = await requireWorkspaceMembership(ctx.user as User, companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (membership.role === "company_member" || membership.role === "client") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient access" });
      }
      const snapshot = await loadOwnerResolutionSnapshotForCompany(db, companyId);
      const stamp = new Date().toISOString().slice(0, 10);
      if (input.format === "csv") {
        return {
          filename: `owner-resolution-${companyId}-${stamp}.csv`,
          mimeType: "text/csv;charset=utf-8",
          body: buildOwnerResolutionCsv(snapshot),
        };
      }
      return {
        filename: `owner-resolution-${companyId}-${stamp}.json`,
        mimeType: "application/json;charset=utf-8",
        body: buildOwnerResolutionExportJson(snapshot),
      };
    }),

  /**
   * Persist collection workflow on a receivable row (PRO billing cycle or subscription invoice).
   * Finance or company admin only; source row must belong to the tenant.
   */
  upsertCollectionWorkItem: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        sourceType: z.enum(["pro_billing_cycle", "subscription_invoice"]),
        sourceId: z.number().int().positive(),
        workflowStatus: z.enum([
          "needs_follow_up",
          "promised_to_pay",
          "escalated",
          "disputed",
          "resolved",
        ]),
        note: z.string().max(4000).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await resolvePlatformOrCompanyScope(ctx.user as User, input.companyId);
      if (companyId === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Company required" });
      const membership = await requireWorkspaceMembership(ctx.user as User, companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (membership.role === "company_member" || membership.role === "client") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient access" });
      }
      if (membership.role !== "company_admin" && membership.role !== "finance_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Finance or company admin required" });
      }
      if (input.sourceType === "pro_billing_cycle") {
        const [row] = await db
          .select({ id: proBillingCycles.id })
          .from(proBillingCycles)
          .where(and(eq(proBillingCycles.id, input.sourceId), eq(proBillingCycles.companyId, companyId)))
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Billing cycle not found" });
      } else {
        const [row] = await db
          .select({ id: subscriptionInvoices.id })
          .from(subscriptionInvoices)
          .where(
            and(eq(subscriptionInvoices.id, input.sourceId), eq(subscriptionInvoices.companyId, companyId)),
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      await upsertCollectionWorkItem(db, {
        companyId,
        userId: ctx.user.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        workflowStatus: input.workflowStatus,
        note: input.note,
      });
      return { success: true as const };
    }),
});
