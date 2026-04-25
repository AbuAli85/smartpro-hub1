/**
 * server/controlTower/signalBuilders.ts
 *
 * Domain-scoped signal builder functions.  Each builder queries real DB tables,
 * applies scope filtering for dept/team managers, and returns canonical
 * ControlTowerItem[] ready for the rankItems engine.
 *
 * Authority rules (enforced before calling builders):
 *  - Caller must already have passed requireControlTowerSignalAccess(domain).
 *  - allowedActions is pre-computed from deriveCapabilities — pass it through.
 *  - Scope filtering: dept/team managers see only items linked to their
 *    departmentEmployeeIds / managedEmployeeIds.
 */

import { and, count, eq, gte, inArray, isNull, isNotNull, lt, lte, or } from "drizzle-orm";
import {
  clientServiceInvoices,
  companyDocuments,
  companyOmanizationSnapshots,
  contracts,
  employeeDocuments,
  employeeRequests,
  employeeTasks,
  engagements,
  leaveRequests,
  payrollRuns,
  renewalWorkflowRuns,
  workPermits,
  caseSlaTracking,
  governmentServiceCases,
} from "../../drizzle/schema";
import {
  muscatCalendarYmdNow,
  muscatMonthUtcRangeExclusiveEnd,
} from "@shared/attendanceMuscatTime";
import type { getDb } from "../db";
import type { VisibilityScope } from "../_core/visibilityScope";
import type {
  ControlTowerItem,
  ControlTowerAction,
} from "@shared/controlTowerTypes";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── Scope helper ─────────────────────────────────────────────────────────────

/** Returns restricted employee ID list for dept/team scope, or null for company scope. */
function scopedEmployeeIds(scope: VisibilityScope): number[] | null {
  if (scope.type === "department") return scope.departmentEmployeeIds;
  if (scope.type === "team") return scope.managedEmployeeIds;
  return null;
}

// ─── Item factory ─────────────────────────────────────────────────────────────

function makeItem(
  fields: Omit<ControlTowerItem, "source" | "ownerUserId" | "departmentId" | "employeeId" | "relatedEntityType" | "relatedEntityId" | "dueAt"> &
    Partial<Pick<ControlTowerItem, "ownerUserId" | "departmentId" | "employeeId" | "relatedEntityType" | "relatedEntityId" | "dueAt">>,
): ControlTowerItem {
  return {
    source: "system",
    ownerUserId: null,
    departmentId: null,
    employeeId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    dueAt: null,
    ...fields,
  };
}

// ─── Payroll signals ─────────────────────────────────────────────────────────

/**
 * Payroll domain signals.
 * – Draft payroll run exists for current Muscat month → high
 * – Approved run not yet paid → high
 * – No real payroll run started for current month (day ≥ 5) → medium
 */
export async function buildPayrollSignals(
  db: DbClient,
  companyId: number,
  _scope: VisibilityScope,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const todayYmd = muscatCalendarYmdNow(now);
  const [yearStr, monthStr, dayStr] = todayYmd.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const dayOfMonth = parseInt(dayStr, 10);

  const { startUtc, endExclusiveUtc } = muscatMonthUtcRangeExclusiveEnd(year, month);

  const [draftRuns, approvedRuns] = await Promise.all([
    db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.companyId, companyId),
          eq(payrollRuns.status, "draft"),
          eq(payrollRuns.previewOnly, false),
          eq(payrollRuns.periodYear, year),
          eq(payrollRuns.periodMonth, month),
        ),
      )
      .limit(1),
    db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.companyId, companyId),
          eq(payrollRuns.status, "approved"),
          eq(payrollRuns.previewOnly, false),
        ),
      )
      .limit(20),
  ]);

  // Also check if any real (non-preview) run exists for this month
  const [anyRunRow] = await db
    .select({ cnt: count() })
    .from(payrollRuns)
    .where(
      and(
        eq(payrollRuns.companyId, companyId),
        eq(payrollRuns.previewOnly, false),
        eq(payrollRuns.periodYear, year),
        eq(payrollRuns.periodMonth, month),
      ),
    );
  const anyRunThisMonth = Number(anyRunRow?.cnt ?? 0) > 0;

  const items: ControlTowerItem[] = [];
  const monthLabel = `${year}-${String(month).padStart(2, "0")}`;

  if (draftRuns.length > 0) {
    items.push(
      makeItem({
        id: `payroll:${companyId}:${year}:${month}:draft`,
        companyId,
        domain: "payroll",
        severity: "high",
        status: "open",
        title: "Payroll draft awaiting submission",
        description: `Payroll run for ${monthLabel} is in draft status and has not been submitted for approval.`,
        relatedEntityType: "payroll_run",
        relatedEntityId: String(draftRuns[0].id),
        dueAt: endExclusiveUtc,
        createdAt: startUtc,
        allowedActions,
      }),
    );
  }

  if (approvedRuns.length > 0) {
    items.push(
      makeItem({
        id: `payroll:${companyId}:approved_unpaid`,
        companyId,
        domain: "payroll",
        severity: "high",
        status: "open",
        title: `${approvedRuns.length} approved payroll run${approvedRuns.length > 1 ? "s" : ""} awaiting payment`,
        description: `${approvedRuns.length} payroll run${approvedRuns.length > 1 ? "s have" : " has"} been approved but payment has not been executed.`,
        relatedEntityType: "payroll_run",
        relatedEntityId: String(approvedRuns[0].id),
        createdAt: now,
        allowedActions,
      }),
    );
  }

  // Warn if no run has been started after the 5th of the month
  if (!anyRunThisMonth && dayOfMonth >= 5) {
    items.push(
      makeItem({
        id: `payroll:${companyId}:${year}:${month}:not_started`,
        companyId,
        domain: "payroll",
        severity: "medium",
        status: "open",
        title: `Payroll not started for ${monthLabel}`,
        description: `No payroll run has been initiated for ${monthLabel}. The month is already past day 5.`,
        dueAt: endExclusiveUtc,
        createdAt: startUtc,
        allowedActions,
      }),
    );
  }

  return items;
}

// ─── HR signals ──────────────────────────────────────────────────────────────

/**
 * HR domain signals.
 * – Pending leave requests (scope-filtered) → medium
 * – Pending employee requests (scope-filtered) → medium
 */
export async function buildHrSignals(
  db: DbClient,
  companyId: number,
  scope: VisibilityScope,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const empIds = scopedEmployeeIds(scope);

  const [leaveRow, empReqRow] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.companyId, companyId),
          eq(leaveRequests.status, "pending"),
          ...(empIds ? [inArray(leaveRequests.employeeId, empIds)] : []),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(employeeRequests)
      .where(
        and(
          eq(employeeRequests.companyId, companyId),
          eq(employeeRequests.status, "pending"),
          ...(empIds ? [inArray(employeeRequests.employeeId, empIds)] : []),
        ),
      ),
  ]);

  const leaveCount = Number(leaveRow[0]?.cnt ?? 0);
  const empReqCount = Number(empReqRow[0]?.cnt ?? 0);
  const items: ControlTowerItem[] = [];

  if (leaveCount > 0) {
    const scopeSuffix = empIds ? `:scoped:${empIds.length}` : "";
    items.push(
      makeItem({
        id: `hr:${companyId}:leave:pending${scopeSuffix}`,
        companyId,
        domain: "hr",
        severity: "medium",
        status: "open",
        title: `${leaveCount} pending leave request${leaveCount > 1 ? "s" : ""}`,
        description: `${leaveCount} leave request${leaveCount > 1 ? "s require" : " requires"} review and approval.`,
        relatedEntityType: "leave_requests",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (empReqCount > 0) {
    const scopeSuffix = empIds ? `:scoped:${empIds.length}` : "";
    items.push(
      makeItem({
        id: `hr:${companyId}:employee_requests:pending${scopeSuffix}`,
        companyId,
        domain: "hr",
        severity: "medium",
        status: "open",
        title: `${empReqCount} pending employee request${empReqCount > 1 ? "s" : ""}`,
        description: `${empReqCount} employee request${empReqCount > 1 ? "s are" : " is"} awaiting action.`,
        relatedEntityType: "employee_requests",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  return items;
}

// ─── Compliance signals ───────────────────────────────────────────────────────

/**
 * Compliance domain signals.
 * – Omanization non_compliant → critical; warning → medium
 * – Renewal workflow failures → critical
 * – Work permits expiring within 7 days → high
 */
export async function buildComplianceSignals(
  db: DbClient,
  companyId: number,
  _scope: VisibilityScope,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const todayYmd = muscatCalendarYmdNow(now);
  const [yearStr, monthStr] = todayYmd.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [omanizationRow, rwFailedRow, permits7Row] = await Promise.all([
    db
      .select({ complianceStatus: companyOmanizationSnapshots.complianceStatus })
      .from(companyOmanizationSnapshots)
      .where(
        and(
          eq(companyOmanizationSnapshots.companyId, companyId),
          eq(companyOmanizationSnapshots.snapshotYear, year),
          eq(companyOmanizationSnapshots.snapshotMonth, month),
        ),
      )
      .limit(1),
    db
      .select({ cnt: count() })
      .from(renewalWorkflowRuns)
      .where(
        and(
          eq(renewalWorkflowRuns.companyId, companyId),
          eq(renewalWorkflowRuns.status, "failed"),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(workPermits)
      .where(
        and(
          eq(workPermits.companyId, companyId),
          gte(workPermits.expiryDate, now),
          lte(workPermits.expiryDate, in7),
        ),
      ),
  ]);

  const items: ControlTowerItem[] = [];
  const omanizationStatus = omanizationRow[0]?.complianceStatus;
  const rwFailed = Number(rwFailedRow[0]?.cnt ?? 0);
  const permits7 = Number(permits7Row[0]?.cnt ?? 0);

  if (omanizationStatus === "non_compliant") {
    items.push(
      makeItem({
        id: `compliance:${companyId}:omanization:${year}:${month}:non_compliant`,
        companyId,
        domain: "compliance",
        severity: "critical",
        status: "open",
        title: "Omanization ratio is non-compliant",
        description: `The company's Omanization ratio for ${year}-${String(month).padStart(2, "0")} is below the required threshold.`,
        relatedEntityType: "omanization_snapshot",
        createdAt: now,
        allowedActions,
      }),
    );
  } else if (omanizationStatus === "warning") {
    items.push(
      makeItem({
        id: `compliance:${companyId}:omanization:${year}:${month}:warning`,
        companyId,
        domain: "compliance",
        severity: "medium",
        status: "open",
        title: "Omanization ratio approaching threshold",
        description: `The company's Omanization ratio for ${year}-${String(month).padStart(2, "0")} is in warning status.`,
        relatedEntityType: "omanization_snapshot",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (rwFailed > 0) {
    items.push(
      makeItem({
        id: `compliance:${companyId}:renewals:failed`,
        companyId,
        domain: "compliance",
        severity: "critical",
        status: "open",
        title: `${rwFailed} renewal workflow${rwFailed > 1 ? "s" : ""} failed`,
        description: `${rwFailed} government renewal workflow${rwFailed > 1 ? "s have" : " has"} failed and require immediate attention.`,
        relatedEntityType: "renewal_workflow_runs",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (permits7 > 0) {
    items.push(
      makeItem({
        id: `compliance:${companyId}:work_permits:expiring_7d`,
        companyId,
        domain: "compliance",
        severity: "high",
        status: "open",
        title: `${permits7} work permit${permits7 > 1 ? "s" : ""} expiring within 7 days`,
        description: `${permits7} employee work permit${permits7 > 1 ? "s are" : " is"} due to expire within the next 7 days.`,
        relatedEntityType: "work_permits",
        dueAt: in7,
        createdAt: now,
        allowedActions,
      }),
    );
  }

  return items;
}

// ─── Operations signals ───────────────────────────────────────────────────────

/**
 * Operations domain signals.
 * – Open SLA breaches → critical
 * – Blocked/at-risk engagements → high
 * – Overdue tasks (scope-filtered, non-completed/cancelled) → high/medium
 */
export async function buildOperationsSignals(
  db: DbClient,
  companyId: number,
  scope: VisibilityScope,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const empIds = scopedEmployeeIds(scope);

  const [slaBreach, blockedEngRow, atRiskEngRow, overdueTaskRow, blockedTaskRow] =
    await Promise.all([
      db
        .select({ cnt: count() })
        .from(caseSlaTracking)
        .innerJoin(
          governmentServiceCases,
          eq(caseSlaTracking.caseId, governmentServiceCases.id),
        )
        .where(
          and(
            eq(governmentServiceCases.companyId, companyId),
            isNotNull(caseSlaTracking.dueAt),
            lt(caseSlaTracking.dueAt, now),
            isNull(caseSlaTracking.resolvedAt),
          ),
        ),
      db
        .select({ cnt: count() })
        .from(engagements)
        .where(
          and(
            eq(engagements.companyId, companyId),
            eq(engagements.health, "blocked"),
            or(
              eq(engagements.status, "active"),
              eq(engagements.status, "waiting_client"),
              eq(engagements.status, "waiting_platform"),
            ),
          ),
        ),
      db
        .select({ cnt: count() })
        .from(engagements)
        .where(
          and(
            eq(engagements.companyId, companyId),
            eq(engagements.health, "at_risk"),
            or(
              eq(engagements.status, "active"),
              eq(engagements.status, "waiting_client"),
              eq(engagements.status, "waiting_platform"),
            ),
          ),
        ),
      db
        .select({ cnt: count() })
        .from(employeeTasks)
        .where(
          and(
            eq(employeeTasks.companyId, companyId),
            inArray(employeeTasks.status, ["pending", "in_progress"]),
            lt(employeeTasks.dueDate, now),
            isNotNull(employeeTasks.dueDate),
            ...(empIds ? [inArray(employeeTasks.assignedToEmployeeId, empIds)] : []),
          ),
        ),
      db
        .select({ cnt: count() })
        .from(employeeTasks)
        .where(
          and(
            eq(employeeTasks.companyId, companyId),
            eq(employeeTasks.status, "blocked"),
            ...(empIds ? [inArray(employeeTasks.assignedToEmployeeId, empIds)] : []),
          ),
        ),
    ]);

  const slaCount = Number(slaBreach[0]?.cnt ?? 0);
  const blockedEngs = Number(blockedEngRow[0]?.cnt ?? 0);
  const atRiskEngs = Number(atRiskEngRow[0]?.cnt ?? 0);
  const overdueTasks = Number(overdueTaskRow[0]?.cnt ?? 0);
  const blockedTasks = Number(blockedTaskRow[0]?.cnt ?? 0);
  const items: ControlTowerItem[] = [];

  if (slaCount > 0) {
    items.push(
      makeItem({
        id: `operations:${companyId}:sla:breach`,
        companyId,
        domain: "operations",
        severity: "critical",
        status: "open",
        title: `${slaCount} open SLA breach${slaCount > 1 ? "es" : ""}`,
        description: `${slaCount} government service case${slaCount > 1 ? "s have" : " has"} breached their SLA deadline.`,
        relatedEntityType: "case_sla_tracking",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (blockedEngs > 0) {
    items.push(
      makeItem({
        id: `operations:${companyId}:engagements:blocked`,
        companyId,
        domain: "operations",
        severity: "high",
        status: "open",
        title: `${blockedEngs} blocked engagement${blockedEngs > 1 ? "s" : ""}`,
        description: `${blockedEngs} active engagement${blockedEngs > 1 ? "s are" : " is"} blocked and unable to progress.`,
        relatedEntityType: "engagements",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (atRiskEngs > 0) {
    items.push(
      makeItem({
        id: `operations:${companyId}:engagements:at_risk`,
        companyId,
        domain: "operations",
        severity: "high",
        status: "open",
        title: `${atRiskEngs} at-risk engagement${atRiskEngs > 1 ? "s" : ""}`,
        description: `${atRiskEngs} engagement${atRiskEngs > 1 ? "s are" : " is"} flagged as at-risk.`,
        relatedEntityType: "engagements",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (overdueTasks > 0) {
    const scopeSuffix = empIds ? `:scoped` : "";
    items.push(
      makeItem({
        id: `operations:${companyId}:tasks:overdue${scopeSuffix}`,
        companyId,
        domain: "operations",
        severity: "high",
        status: "open",
        title: `${overdueTasks} overdue task${overdueTasks > 1 ? "s" : ""}`,
        description: `${overdueTasks} assigned task${overdueTasks > 1 ? "s are" : " is"} past their due date.`,
        relatedEntityType: "employee_tasks",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (blockedTasks > 0) {
    const scopeSuffix = empIds ? `:scoped` : "";
    items.push(
      makeItem({
        id: `operations:${companyId}:tasks:blocked${scopeSuffix}`,
        companyId,
        domain: "operations",
        severity: "medium",
        status: "open",
        title: `${blockedTasks} blocked task${blockedTasks > 1 ? "s" : ""}`,
        description: `${blockedTasks} task${blockedTasks > 1 ? "s are" : " is"} in blocked status and cannot proceed.`,
        relatedEntityType: "employee_tasks",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  return items;
}

// ─── Finance signals ──────────────────────────────────────────────────────────

/**
 * Finance domain signals.
 * – Overdue client service invoices → critical
 * – Approved payroll runs awaiting payment → high (shared with payroll domain)
 */
export async function buildFinanceSignals(
  db: DbClient,
  companyId: number,
  _scope: VisibilityScope,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const [overdueInvRow, approvedPayrollRow] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(clientServiceInvoices)
      .where(
        and(
          eq(clientServiceInvoices.companyId, companyId),
          eq(clientServiceInvoices.status, "overdue"),
        ),
      ),
    db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.companyId, companyId),
          eq(payrollRuns.status, "approved"),
          eq(payrollRuns.previewOnly, false),
        ),
      )
      .limit(20),
  ]);

  const overdueCount = Number(overdueInvRow[0]?.cnt ?? 0);
  const approvedPayroll = approvedPayrollRow.length;
  const items: ControlTowerItem[] = [];

  if (overdueCount > 0) {
    items.push(
      makeItem({
        id: `finance:${companyId}:invoices:overdue`,
        companyId,
        domain: "finance",
        severity: "critical",
        status: "open",
        title: `${overdueCount} overdue client invoice${overdueCount > 1 ? "s" : ""}`,
        description: `${overdueCount} client service invoice${overdueCount > 1 ? "s are" : " is"} past due and require collection action.`,
        relatedEntityType: "client_service_invoices",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (approvedPayroll > 0) {
    items.push(
      makeItem({
        id: `finance:${companyId}:payroll:approved_unpaid`,
        companyId,
        domain: "finance",
        severity: "high",
        status: "open",
        title: `${approvedPayroll} approved payroll run${approvedPayroll > 1 ? "s" : ""} awaiting payment`,
        description: `${approvedPayroll} payroll run${approvedPayroll > 1 ? "s have" : " has"} been approved but payment disbursement is pending.`,
        relatedEntityType: "payroll_runs",
        relatedEntityId: String(approvedPayrollRow[0].id),
        createdAt: now,
        allowedActions,
      }),
    );
  }

  return items;
}

// ─── Document signals ─────────────────────────────────────────────────────────

/**
 * Documents domain signals.
 * – Employee documents expiring within 7 days (scope-filtered) → high
 * – Company documents expiring within 30 days → medium
 */
export async function buildDocumentSignals(
  db: DbClient,
  companyId: number,
  scope: VisibilityScope,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const empIds = scopedEmployeeIds(scope);
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [empDoc7Row, compDoc30Row] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(employeeDocuments)
      .where(
        and(
          eq(employeeDocuments.companyId, companyId),
          isNotNull(employeeDocuments.expiresAt),
          gte(employeeDocuments.expiresAt, now),
          lte(employeeDocuments.expiresAt, in7),
          ...(empIds ? [inArray(employeeDocuments.employeeId, empIds)] : []),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(companyDocuments)
      .where(
        and(
          eq(companyDocuments.companyId, companyId),
          eq(companyDocuments.isDeleted, false),
          isNotNull(companyDocuments.expiryDate),
          gte(companyDocuments.expiryDate, now),
          lte(companyDocuments.expiryDate, in30),
        ),
      ),
  ]);

  const empDoc7 = Number(empDoc7Row[0]?.cnt ?? 0);
  const compDoc30 = Number(compDoc30Row[0]?.cnt ?? 0);
  const items: ControlTowerItem[] = [];

  if (empDoc7 > 0) {
    const scopeSuffix = empIds ? `:scoped` : "";
    items.push(
      makeItem({
        id: `documents:${companyId}:employee:expiring_7d${scopeSuffix}`,
        companyId,
        domain: "documents",
        severity: "high",
        status: "open",
        title: `${empDoc7} employee document${empDoc7 > 1 ? "s" : ""} expiring within 7 days`,
        description: `${empDoc7} employee document${empDoc7 > 1 ? "s are" : " is"} due to expire in the next 7 days.`,
        relatedEntityType: "employee_documents",
        dueAt: in7,
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (compDoc30 > 0) {
    items.push(
      makeItem({
        id: `documents:${companyId}:company:expiring_30d`,
        companyId,
        domain: "documents",
        severity: "medium",
        status: "open",
        title: `${compDoc30} company document${compDoc30 > 1 ? "s" : ""} expiring within 30 days`,
        description: `${compDoc30} company compliance document${compDoc30 > 1 ? "s are" : " is"} expiring within the next 30 days.`,
        relatedEntityType: "company_documents",
        dueAt: in30,
        createdAt: now,
        allowedActions,
      }),
    );
  }

  return items;
}

// ─── Contract signals ─────────────────────────────────────────────────────────

/**
 * Contracts domain signals.
 * – Contracts pending signature → high
 * – Active/signed contracts expiring within 30 days → medium
 */
export async function buildContractSignals(
  db: DbClient,
  companyId: number,
  _scope: VisibilityScope,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [pendingSigRow, expiring30Row] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(contracts)
      .where(
        and(
          eq(contracts.companyId, companyId),
          eq(contracts.status, "pending_signature"),
        ),
      ),
    db
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
      ),
  ]);

  const pendingSig = Number(pendingSigRow[0]?.cnt ?? 0);
  const expiring30 = Number(expiring30Row[0]?.cnt ?? 0);
  const items: ControlTowerItem[] = [];

  if (pendingSig > 0) {
    items.push(
      makeItem({
        id: `contracts:${companyId}:pending_signature`,
        companyId,
        domain: "contracts",
        severity: "high",
        status: "open",
        title: `${pendingSig} contract${pendingSig > 1 ? "s" : ""} awaiting signature`,
        description: `${pendingSig} contract${pendingSig > 1 ? "s are" : " is"} in pending_signature status.`,
        relatedEntityType: "contracts",
        createdAt: now,
        allowedActions,
      }),
    );
  }

  if (expiring30 > 0) {
    items.push(
      makeItem({
        id: `contracts:${companyId}:expiring_30d`,
        companyId,
        domain: "contracts",
        severity: "medium",
        status: "open",
        title: `${expiring30} contract${expiring30 > 1 ? "s" : ""} expiring within 30 days`,
        description: `${expiring30} contract${expiring30 > 1 ? "s are" : " is"} due to expire within the next 30 days.`,
        relatedEntityType: "contracts",
        dueAt: in30,
        createdAt: now,
        allowedActions,
      }),
    );
  }

  return items;
}

// ─── All-domain aggregator ────────────────────────────────────────────────────

/**
 * Runs only the builders for domains the caller can see, then combines results.
 * Callers should pass only the domains returned by visibleDomains(caps).
 */
export async function buildAllVisibleSignals(
  db: DbClient,
  companyId: number,
  scope: VisibilityScope,
  visibleDomainSet: Set<string>,
  allowedActions: ControlTowerAction[],
  now: Date = new Date(),
): Promise<ControlTowerItem[]> {
  const promises: Promise<ControlTowerItem[]>[] = [];

  if (visibleDomainSet.has("payroll")) {
    promises.push(buildPayrollSignals(db, companyId, scope, allowedActions, now));
  }
  if (visibleDomainSet.has("hr")) {
    promises.push(buildHrSignals(db, companyId, scope, allowedActions, now));
  }
  if (visibleDomainSet.has("compliance")) {
    promises.push(buildComplianceSignals(db, companyId, scope, allowedActions, now));
  }
  if (visibleDomainSet.has("operations")) {
    promises.push(buildOperationsSignals(db, companyId, scope, allowedActions, now));
  }
  if (visibleDomainSet.has("finance")) {
    promises.push(buildFinanceSignals(db, companyId, scope, allowedActions, now));
  }
  if (visibleDomainSet.has("documents")) {
    promises.push(buildDocumentSignals(db, companyId, scope, allowedActions, now));
  }
  if (visibleDomainSet.has("contracts")) {
    promises.push(buildContractSignals(db, companyId, scope, allowedActions, now));
  }

  const results = await Promise.all(promises);
  return results.flat();
}
