/**
 * Owner Executive Control Tower — server-authoritative aggregates for AR aging,
 * cross-module decisions, compliance/renewal risk, and executive insight narrative.
 */

import type { getDb } from "./db";
import {
  attendanceRecords,
  attendanceSites,
  caseSlaTracking,
  companyHolidays,
  companyDocuments,
  contracts,
  employeeSchedules,
  employeeDocuments,
  employeeRequests,
  expenseClaims,
  governmentServiceCases,
  leaveRequests,
  payrollRuns,
  proBillingCycles,
  renewalWorkflowRuns,
  serviceQuotations,
  shiftTemplates,
  subscriptionInvoices,
  workPermits,
} from "../drizzle/schema";
import { and, count, eq, gte, inArray, isNotNull, isNull, lte, lt, or } from "drizzle-orm";
import type { RankedAccountRow } from "./ownerResolution";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ArBucketKey = "0_30" | "31_60" | "61_plus";

export type AgedReceivablesSnapshot = {
  basis: string;
  officerPro: {
    totalOmr: number;
    rowCount: number;
    buckets: Array<{ key: ArBucketKey; omr: number; count: number }>;
  };
  platformSubscription: {
    totalOmr: number;
    rowCount: number;
    buckets: Array<{ key: ArBucketKey; omr: number; count: number }>;
  };
  combinedAtRiskOmr: number;
};

export type DecisionQueueItem = {
  key: string;
  label: string;
  count: number;
  href: string;
  severity: "critical" | "high" | "medium";
};

export type DecisionsQueueSnapshot = {
  basis: string;
  items: DecisionQueueItem[];
  totalOpenCount: number;
};

export type RiskComplianceSnapshot = {
  basis: string;
  contractsPendingSignature: number;
  contractsExpiringNext30Days: number;
  renewalWorkflowsFailed: number;
  renewalWorkflowsStuckPending: number;
  employeeDocsExpiring7Days: number;
  companyDocsExpiring30Days: number;
  workPermitsExpiring7Days: number;
  slaOpenBreaches: number;
};

export type AttendanceSignalSnapshot = {
  basis: string;
  businessDateYmd: string;
  /** Total scheduled shifts for today (holiday-adjusted). */
  scheduledToday: number;
  /** Employees currently checked in (open punch, not yet out). */
  checkedInActive: number;
  /** Shifts that ended with no check-in (confirmed absent). */
  absentToday: number;
  /** Employees checked in but shift has ended (open punch past shift end). */
  overdueCheckouts: number;
  /** Employees who arrived late (after grace period). */
  lateCheckins: number;
  /** Attendance rate: (present + late + completed) / scheduled, 0–100. */
  attendanceRateToday: number;
};

export type ClientHealthTopRow = {
  contactId: number;
  displayName: string;
  companyLabel: string | null;
  tier: string;
  priorityScore: number;
  rankReason: string;
  primaryHref: string;
  nextActionLabel: string;
};

export type ExecutiveInsightSummary = {
  headline: string;
  bullets: string[];
  severity: "calm" | "attention" | "critical";
};

const EMPTY_BUCKETS = (): Array<{ key: ArBucketKey; omr: number; count: number }> => [
  { key: "0_30", omr: 0, count: 0 },
  { key: "31_60", omr: 0, count: 0 },
  { key: "61_plus", omr: 0, count: 0 },
];

/** Days past due date (non-negative). Null due → treat as 0 for bucket (still in at-risk total). */
export function daysPastDue(due: Date | null, now: Date): number {
  if (!due) return 0;
  const ms = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function bucketKeyForDaysPastDue(days: number): ArBucketKey {
  if (days <= 30) return "0_30";
  if (days <= 60) return "31_60";
  return "61_plus";
}

function addToBuckets(
  buckets: Array<{ key: ArBucketKey; omr: number; count: number }>,
  key: ArBucketKey,
  omr: number,
) {
  const b = buckets.find((x) => x.key === key);
  if (b) {
    b.omr += omr;
    b.count += 1;
  }
}

/**
 * PRO officer billing: overdue, or pending with due date in the past.
 */
export async function buildAgedReceivablesSnapshot(
  db: DbClient,
  companyId: number,
  now: Date = new Date(),
): Promise<AgedReceivablesSnapshot> {
  const proRows = await db
    .select({
      amountOmr: proBillingCycles.amountOmr,
      status: proBillingCycles.status,
      dueDate: proBillingCycles.dueDate,
    })
    .from(proBillingCycles)
    .where(eq(proBillingCycles.companyId, companyId));

  const proBuckets = EMPTY_BUCKETS();
  let proTotal = 0;
  let proCount = 0;

  for (const r of proRows) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const amt = Number(r.amountOmr ?? 0);
    const isOverdueStatus = r.status === "overdue";
    const isPastDuePending = r.status === "pending" && due != null && due.getTime() < now.getTime();
    if (!isOverdueStatus && !isPastDuePending) continue;
    proTotal += amt;
    proCount += 1;
    const days = daysPastDue(due, now);
    addToBuckets(proBuckets, bucketKeyForDaysPastDue(days), amt);
  }

  const subRows = await db
    .select({
      amount: subscriptionInvoices.amount,
      status: subscriptionInvoices.status,
      dueDate: subscriptionInvoices.dueDate,
    })
    .from(subscriptionInvoices)
    .where(eq(subscriptionInvoices.companyId, companyId));

  const subBuckets = EMPTY_BUCKETS();
  let subTotal = 0;
  let subCount = 0;

  for (const r of subRows) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const amt = Number(r.amount ?? 0);
    const isOverdue = r.status === "overdue";
    const isIssuedPastDue =
      r.status === "issued" && due != null && due.getTime() < now.getTime();
    if (!isOverdue && !isIssuedPastDue) continue;
    subTotal += amt;
    subCount += 1;
    const days = daysPastDue(due, now);
    addToBuckets(subBuckets, bucketKeyForDaysPastDue(days), amt);
  }

  const basis =
    "Aged receivables: PRO officer cycles in overdue status or pending past due date; subscription invoices overdue or issued past due. Bucketed by days past due date (0–30, 31–60, 61+).";

  return {
    basis,
    officerPro: { totalOmr: proTotal, rowCount: proCount, buckets: proBuckets },
    platformSubscription: { totalOmr: subTotal, rowCount: subCount, buckets: subBuckets },
    combinedAtRiskOmr: proTotal + subTotal,
  };
}

/**
 * Same rules as {@link buildAgedReceivablesSnapshot}, but aggregated across all tenants (platform ops).
 */
export async function buildAgedReceivablesSnapshotAllTenants(
  db: DbClient,
  now: Date = new Date(),
): Promise<AgedReceivablesSnapshot> {
  const proRows = await db
    .select({
      amountOmr: proBillingCycles.amountOmr,
      status: proBillingCycles.status,
      dueDate: proBillingCycles.dueDate,
    })
    .from(proBillingCycles);

  const proBuckets = EMPTY_BUCKETS();
  let proTotal = 0;
  let proCount = 0;

  for (const r of proRows) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const amt = Number(r.amountOmr ?? 0);
    const isOverdueStatus = r.status === "overdue";
    const isPastDuePending = r.status === "pending" && due != null && due.getTime() < now.getTime();
    if (!isOverdueStatus && !isPastDuePending) continue;
    proTotal += amt;
    proCount += 1;
    const days = daysPastDue(due, now);
    addToBuckets(proBuckets, bucketKeyForDaysPastDue(days), amt);
  }

  const subRows = await db
    .select({
      amount: subscriptionInvoices.amount,
      status: subscriptionInvoices.status,
      dueDate: subscriptionInvoices.dueDate,
    })
    .from(subscriptionInvoices);

  const subBuckets = EMPTY_BUCKETS();
  let subTotal = 0;
  let subCount = 0;

  for (const r of subRows) {
    const due = r.dueDate ? new Date(r.dueDate) : null;
    const amt = Number(r.amount ?? 0);
    const isOverdue = r.status === "overdue";
    const isIssuedPastDue =
      r.status === "issued" && due != null && due.getTime() < now.getTime();
    if (!isOverdue && !isIssuedPastDue) continue;
    subTotal += amt;
    subCount += 1;
    const days = daysPastDue(due, now);
    addToBuckets(subBuckets, bucketKeyForDaysPastDue(days), amt);
  }

  const basis =
    "All-tenant aged receivables: PRO cycles overdue or pending past due; subscription invoices overdue or issued past due.";

  return {
    basis,
    officerPro: { totalOmr: proTotal, rowCount: proCount, buckets: proBuckets },
    platformSubscription: { totalOmr: subTotal, rowCount: subCount, buckets: subBuckets },
    combinedAtRiskOmr: proTotal + subTotal,
  };
}

export async function buildDecisionsQueueSnapshot(
  db: DbClient,
  companyId: number,
  now: Date = new Date(),
): Promise<DecisionsQueueSnapshot> {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [
    [leaveRow],
    [expenseRow],
    [draftPayrollRow],
    pendingPayrollApproved,
    [pendingContractRow],
    [draftQuoteRow],
    [empReqRow],
  ] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.companyId, companyId), eq(leaveRequests.status, "pending"))),
    db
      .select({ cnt: count() })
      .from(expenseClaims)
      .where(and(eq(expenseClaims.companyId, companyId), eq(expenseClaims.expenseStatus, "pending"))),
    db
      .select({ cnt: count() })
      .from(payrollRuns)
      .where(
        and(
          eq(payrollRuns.companyId, companyId),
          eq(payrollRuns.status, "draft"),
          eq(payrollRuns.periodMonth, month),
          eq(payrollRuns.periodYear, year),
        ),
      ),
    db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.companyId, companyId), eq(payrollRuns.status, "approved")))
      .limit(20),
    db
      .select({ cnt: count() })
      .from(contracts)
      .where(and(eq(contracts.companyId, companyId), eq(contracts.status, "pending_signature"))),
    db
      .select({ cnt: count() })
      .from(serviceQuotations)
      .where(and(eq(serviceQuotations.companyId, companyId), eq(serviceQuotations.status, "draft"))),
    db
      .select({ cnt: count() })
      .from(employeeRequests)
      .where(and(eq(employeeRequests.companyId, companyId), eq(employeeRequests.status, "pending"))),
  ]);

  const leave = Number(leaveRow?.cnt ?? 0);
  const expense = Number(expenseRow?.cnt ?? 0);
  const payrollDraft = Number(draftPayrollRow?.cnt ?? 0);
  const payrollAwaitingPayment = pendingPayrollApproved.length;
  const contractsSign = Number(pendingContractRow?.cnt ?? 0);
  const quotesDraft = Number(draftQuoteRow?.cnt ?? 0);
  const empReq = Number(empReqRow?.cnt ?? 0);

  const items: DecisionQueueItem[] = [];
  if (leave > 0) {
    items.push({
      key: "leave",
      label: "Leave requests",
      count: leave,
      href: "/hr/leave",
      severity: "medium",
    });
  }
  if (expense > 0) {
    items.push({
      key: "expense",
      label: "Expense claims",
      count: expense,
      href: "/finance/overview",
      severity: "medium",
    });
  }
  if (payrollDraft > 0) {
    items.push({
      key: "payroll_draft",
      label: "Payroll drafts (this month)",
      count: payrollDraft,
      href: "/payroll",
      severity: "high",
    });
  }
  if (payrollAwaitingPayment > 0) {
    items.push({
      key: "payroll_payment",
      label: "Payroll approved — awaiting payment",
      count: payrollAwaitingPayment,
      href: "/payroll/process",
      severity: "high",
    });
  }
  if (contractsSign > 0) {
    items.push({
      key: "contracts",
      label: "Contracts pending signature",
      count: contractsSign,
      href: "/contracts",
      severity: "high",
    });
  }
  if (quotesDraft > 0) {
    items.push({
      key: "quotations",
      label: "Quotations in draft",
      count: quotesDraft,
      href: "/quotations",
      severity: "medium",
    });
  }
  if (empReq > 0) {
    items.push({
      key: "employee_requests",
      label: "Employee requests",
      count: empReq,
      href: "/hr/employee-requests",
      severity: "medium",
    });
  }

  const sevRank = { critical: 0, high: 1, medium: 2 };
  items.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  const totalOpenCount = items.reduce((s, i) => s + i.count, 0);
  const basis =
    "Cross-module decisions queue: pending leave, expense claims, payroll drafts / payment execution, contracts awaiting signature, draft quotations, and pending employee requests. Counts are authoritative from each table.";

  return { basis, items, totalOpenCount };
}

export async function buildRiskComplianceSnapshot(
  db: DbClient,
  companyId: number,
  now: Date = new Date(),
): Promise<RiskComplianceSnapshot> {
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    [pendingSig],
    [exp30],
    [rwFailed],
    [rwStuck],
    [empDoc7],
    [compDoc30],
    [perm7],
    [slaBreach],
  ] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(contracts)
      .where(and(eq(contracts.companyId, companyId), eq(contracts.status, "pending_signature"))),
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
    db
      .select({ cnt: count() })
      .from(renewalWorkflowRuns)
      .where(and(eq(renewalWorkflowRuns.companyId, companyId), eq(renewalWorkflowRuns.status, "failed"))),
    db
      .select({ cnt: count() })
      .from(renewalWorkflowRuns)
      .where(
        and(
          eq(renewalWorkflowRuns.companyId, companyId),
          eq(renewalWorkflowRuns.status, "pending"),
          lte(renewalWorkflowRuns.expiryDate, in30),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(employeeDocuments)
      .where(
        and(
          eq(employeeDocuments.companyId, companyId),
          isNotNull(employeeDocuments.expiresAt),
          gte(employeeDocuments.expiresAt, now),
          lte(employeeDocuments.expiresAt, in7),
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
    db
      .select({ cnt: count() })
      .from(workPermits)
      .where(
        and(eq(workPermits.companyId, companyId), gte(workPermits.expiryDate, now), lte(workPermits.expiryDate, in7)),
      ),
    db
      .select({ cnt: count() })
      .from(caseSlaTracking)
      .innerJoin(governmentServiceCases, eq(caseSlaTracking.caseId, governmentServiceCases.id))
      .where(
        and(
          eq(governmentServiceCases.companyId, companyId),
          lt(caseSlaTracking.dueAt, now),
          isNull(caseSlaTracking.resolvedAt),
        ),
      ),
  ]);

  const basis =
    "Risk summary: contracts awaiting signature and ending within 30 days; renewal workflow failures and pending runs near expiry; employee documents expiring in 7 days; company licence/compliance documents expiring in 30 days; work permits expiring in 7 days; open SLA breaches on government cases.";

  return {
    basis,
    contractsPendingSignature: Number(pendingSig?.cnt ?? 0),
    contractsExpiringNext30Days: Number(exp30?.cnt ?? 0),
    renewalWorkflowsFailed: Number(rwFailed?.cnt ?? 0),
    renewalWorkflowsStuckPending: Number(rwStuck?.cnt ?? 0),
    employeeDocsExpiring7Days: Number(empDoc7?.cnt ?? 0),
    companyDocsExpiring30Days: Number(compDoc30?.cnt ?? 0),
    workPermitsExpiring7Days: Number(perm7?.cnt ?? 0),
    slaOpenBreaches: Number(slaBreach?.cnt ?? 0),
  };
}

export async function buildAttendanceSignalSnapshot(
  db: DbClient,
  companyId: number,
  now: Date = new Date(),
): Promise<AttendanceSignalSnapshot> {
  const { muscatCalendarYmdNow, muscatDayUtcRangeExclusiveEnd, muscatWallDateTimeToUtc } =
    await import("@shared/attendanceMuscatTime");
  const todayYmd = muscatCalendarYmdNow();
  const { startUtc: dayStart, endExclusiveUtc: dayEnd } = muscatDayUtcRangeExclusiveEnd(todayYmd);
  const dow = new Date(`${todayYmd}T12:00:00`).getDay();

  const basis =
    "Attendance signal: today's scheduled shifts, check-ins, confirmed absents, late arrivals, and open sessions past shift end — Muscat wall-clock, same boundaries as the HR attendance board.";

  const [holidayRow] = await db
    .select({ id: companyHolidays.id })
    .from(companyHolidays)
    .where(
      and(
        eq(companyHolidays.companyId, companyId),
        eq(companyHolidays.holidayDate, todayYmd),
      ),
    )
    .limit(1);

  if (holidayRow) {
    return {
      basis,
      businessDateYmd: todayYmd,
      scheduledToday: 0,
      checkedInActive: 0,
      absentToday: 0,
      overdueCheckouts: 0,
      lateCheckins: 0,
      attendanceRateToday: 0,
    };
  }

  const allSchedules = await db
    .select()
    .from(employeeSchedules)
    .where(
      and(
        eq(employeeSchedules.companyId, companyId),
        eq(employeeSchedules.isActive, true),
        lte(employeeSchedules.startDate, todayYmd),
        or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, todayYmd)),
      ),
    );

  const todaySchedules = allSchedules.filter((s) =>
    s.workingDays.split(",").map(Number).includes(dow),
  );

  const scheduledToday = todaySchedules.length;
  if (scheduledToday === 0) {
    return {
      basis,
      businessDateYmd: todayYmd,
      scheduledToday: 0,
      checkedInActive: 0,
      absentToday: 0,
      overdueCheckouts: 0,
      lateCheckins: 0,
      attendanceRateToday: 0,
    };
  }

  const todayRecords = await db
    .select({
      id: attendanceRecords.id,
      employeeId: attendanceRecords.employeeId,
      checkIn: attendanceRecords.checkIn,
      checkOut: attendanceRecords.checkOut,
      scheduleId: attendanceRecords.scheduleId,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.companyId, companyId),
        gte(attendanceRecords.checkIn, dayStart),
        lt(attendanceRecords.checkIn, dayEnd),
      ),
    );

  const recordByScheduleId = new Map(
    todayRecords
      .filter((r) => r.scheduleId != null)
      .map((r) => [r.scheduleId as number, r]),
  );

  const templateIds = [...new Set(todaySchedules.map((s) => s.shiftTemplateId))];
  const shiftRows = templateIds.length
    ? await db
        .select()
        .from(shiftTemplates)
        .where(inArray(shiftTemplates.id, templateIds))
    : [];
  const shiftById = new Map(shiftRows.map((s) => [s.id, s]));

  let checkedInActive = 0;
  let absentToday = 0;
  let overdueCheckouts = 0;
  let lateCheckins = 0;
  let presentOrCompleted = 0;

  for (const sched of todaySchedules) {
    const shift = shiftById.get(sched.shiftTemplateId);
    if (!shift) continue;

    const record = recordByScheduleId.get(sched.id);
    const shiftStartUtc = muscatWallDateTimeToUtc(
      todayYmd,
      shift.startTime.length <= 5 ? `${shift.startTime}:00` : shift.startTime,
    );
    const shiftEndUtc = muscatWallDateTimeToUtc(
      todayYmd,
      shift.endTime.length <= 5 ? `${shift.endTime}:00` : shift.endTime,
    );

    if (!record) {
      if (now > shiftEndUtc) absentToday++;
      continue;
    }

    const graceMs = (shift.gracePeriodMinutes ?? 15) * 60_000;

    if (record.checkOut == null) {
      checkedInActive++;
      if (now > shiftEndUtc) overdueCheckouts++;
      if (record.checkIn.getTime() > shiftStartUtc.getTime() + graceMs) {
        lateCheckins++;
      }
      presentOrCompleted++;
      continue;
    }

    presentOrCompleted++;
    if (record.checkIn.getTime() > shiftStartUtc.getTime() + graceMs) {
      lateCheckins++;
    }
  }

  const attendanceRateToday =
    scheduledToday > 0
      ? Math.round((presentOrCompleted / scheduledToday) * 100)
      : 0;

  return {
    basis,
    businessDateYmd: todayYmd,
    scheduledToday,
    checkedInActive,
    absentToday,
    overdueCheckouts,
    lateCheckins,
    attendanceRateToday,
  };
}

export function buildClientHealthTop(ranked: RankedAccountRow[], max = 5): ClientHealthTopRow[] {
  return ranked.slice(0, max).map((r) => ({
    contactId: r.contactId,
    displayName: r.displayName,
    companyLabel: r.companyLabel,
    tier: r.tier,
    priorityScore: r.priorityScore,
    rankReason: r.rankReason,
    primaryHref: r.primaryHref,
    nextActionLabel: r.nextAction.label,
  }));
}

export function buildExecutiveInsightNarrative(input: {
  revenueMtdOmr: number;
  combinedAtRiskArOmr: number;
  overdueArInvoiceCount: number;
  decisionsOpen: number;
  slaBreaches: number;
  contractsPendingSignature: number;
  renewalWorkflowsFailed: number;
  rankedAccountsCount: number;
  absentToday: number;
  overdueCheckouts: number;
}): ExecutiveInsightSummary {
  const bullets: string[] = [];
  let severity: ExecutiveInsightSummary["severity"] = "calm";

  if (input.absentToday > 0) {
    bullets.push(
      `${input.absentToday} promoter${input.absentToday > 1 ? "s" : ""} absent today — check HR attendance board.`,
    );
    severity = "attention";
  }
  if (input.overdueCheckouts > 0) {
    bullets.push(
      `${input.overdueCheckouts} employee${input.overdueCheckouts > 1 ? "s" : ""} still clocked in past shift end — force checkout if needed.`,
    );
    severity = "attention";
  }

  if (input.slaBreaches > 0) {
    bullets.push(`${input.slaBreaches} government case(s) past SLA — review Operations or Workforce cases.`);
    severity = "critical";
  }
  if (input.combinedAtRiskArOmr > 0) {
    bullets.push(
      `OMR ${input.combinedAtRiskArOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} in aged receivables (${input.overdueArInvoiceCount} invoice row(s)) across PRO billing and subscriptions.`,
    );
    if (severity !== "critical") severity = "attention";
  }
  if (input.revenueMtdOmr > 0) {
    bullets.push(
      `OMR ${input.revenueMtdOmr.toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} cash received (paid) month-to-date.`,
    );
  }
  if (input.decisionsOpen > 0) {
    bullets.push(`${input.decisionsOpen} open decision(s) across leave, expenses, payroll, contracts, quotes, and employee requests.`);
    if (severity === "calm") severity = "attention";
  }
  if (input.contractsPendingSignature > 0) {
    bullets.push(`${input.contractsPendingSignature} contract(s) awaiting signature before service or billing can align.`);
    if (severity === "calm") severity = "attention";
  }
  if (input.renewalWorkflowsFailed > 0) {
    bullets.push(`${input.renewalWorkflowsFailed} renewal workflow run(s) failed — check Renewal Workflows.`);
    if (severity !== "critical") severity = "attention";
  }
  if (input.rankedAccountsCount > 0) {
    bullets.push(`${input.rankedAccountsCount} CRM account(s) in the leadership review queue — prioritise follow-through.`);
  }

  const headline =
    severity === "critical"
      ? "Critical: SLA or severe delivery risk — act today."
      : severity === "attention"
        ? "Attention: cash, approvals, or renewals need a decision this week."
        : "Steady state: keep pipeline and collections rhythm.";

  return { headline, bullets: bullets.slice(0, 7), severity };
}

export async function buildControlTowerBundle(
  db: DbClient,
  companyId: number,
  now?: Date,
): Promise<{
  agedReceivables: AgedReceivablesSnapshot;
  decisionsQueue: DecisionsQueueSnapshot;
  riskCompliance: RiskComplianceSnapshot;
  attendanceSignal: AttendanceSignalSnapshot;
}> {
  const t = now ?? new Date();
  const [agedReceivables, decisionsQueue, riskCompliance, attendanceSignal] = await Promise.all([
    buildAgedReceivablesSnapshot(db, companyId, t),
    buildDecisionsQueueSnapshot(db, companyId, t),
    buildRiskComplianceSnapshot(db, companyId, t),
    buildAttendanceSignalSnapshot(db, companyId, t),
  ]);
  return { agedReceivables, decisionsQueue, riskCompliance, attendanceSignal };
}
