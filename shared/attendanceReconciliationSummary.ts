/**
 * Reconciliation period readiness and payroll gate — Phase 5.
 *
 * Pure module: no database, no React, no tRPC.
 * Converts a flat list of AttendanceActionQueueItems (built by
 * buildAttendanceActionItems across all employees in a period) into a
 * period-level readiness summary suitable for the reconciliation UI and for
 * driving canLock / canExportToPayroll capability gates.
 *
 * Readiness rules (identical to live action-queue rules):
 *   - Any item with isPayrollBlocking=true → "blocked"
 *   - No blocking items but review items exist → "needs_review"
 *   - No items at all → "ready"
 *
 * canLock   = readinessStatus === "ready" AND caps.canLockAttendancePeriod
 * canExport = readinessStatus === "ready" AND caps.canExportAttendanceReports
 *
 * No period-lock table exists yet (Phase 5A read-only). Lock / export mutations
 * are deferred to Phase 5B once a migration is in place.
 */

import {
  hasPayrollBlockingItems,
  sortAttendanceActionItems,
  type AttendanceActionQueueItem,
} from "./attendanceActionQueue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReconciliationReadinessStatus = "ready" | "needs_review" | "blocked";

export interface ReconciliationPeriod {
  year: number;
  /** 1-based calendar month (1 = January, 12 = December). */
  month: number;
  /** YYYY-MM-DD first calendar day of the period (Muscat). */
  startDate: string;
  /** YYYY-MM-DD last calendar day of the period (Muscat). */
  endDate: string;
  timezone: string;
}

export interface ReconciliationSummaryTotals {
  /** Distinct (employeeId, businessDate) pairs with a closed session in the period (proxy for worked days). */
  scheduledDays: number;
  /** scheduledDays minus affected employee-days (approximate). */
  readyDays: number;
  /** Distinct employee-days flagged as holiday or leave attendance. */
  excludedDays: number;
  /** Count of action items where isPayrollBlocking = true. */
  payrollBlockingItems: number;
  /** Count of action items where isPayrollBlocking = false. */
  reviewItems: number;
  /** Distinct employee IDs referenced by any action item. */
  employeesAffected: number;
  missingCheckouts: number;
  pendingCorrections: number;
  pendingManualCheckins: number;
  scheduleConflicts: number;
  unscheduledAttendance: number;
  holidayAttendance: number;
  leaveAttendance: number;
}

export interface ReconciliationSummary {
  period: ReconciliationPeriod;
  totals: ReconciliationSummaryTotals;
  readinessStatus: ReconciliationReadinessStatus;
  /** Payroll-blocking items, sorted critical → high. */
  blockers: AttendanceActionQueueItem[];
  /** Review-only items (not payroll-blocking), sorted high → medium. */
  reviewItems: AttendanceActionQueueItem[];
  /** True only when readinessStatus === "ready" AND actor has canLockAttendancePeriod. */
  canLock: boolean;
  /** True only when readinessStatus === "ready" AND actor has canExportAttendanceReports. */
  canExportToPayroll: boolean;
  /** Union of all reasonCodes across items (sorted, deduplicated). */
  reasonCodes: string[];
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildReconciliationSummaryParams {
  period: ReconciliationPeriod;
  allItems: AttendanceActionQueueItem[];
  caps: {
    canLockAttendancePeriod: boolean;
    canExportAttendanceReports: boolean;
  };
  /** Approximate count of worked employee-days (closed sessions). 0 when unknown. */
  scheduledDays?: number;
}

/**
 * Aggregate action queue items for a full calendar period into a readiness summary.
 *
 * Pure — no side effects. Input items must already be deduplicated
 * (the server procedure is responsible for deduplication by category+employee+date).
 */
export function buildReconciliationSummary({
  period,
  allItems,
  caps,
  scheduledDays = 0,
}: BuildReconciliationSummaryParams): ReconciliationSummary {
  const blockers = sortAttendanceActionItems(allItems.filter((i) => i.isPayrollBlocking));
  const reviewOnlyItems = sortAttendanceActionItems(allItems.filter((i) => !i.isPayrollBlocking));

  const readinessStatus: ReconciliationReadinessStatus = hasPayrollBlockingItems(allItems)
    ? "blocked"
    : allItems.length > 0
      ? "needs_review"
      : "ready";

  // Distinct employees affected by any item.
  const employeesAffected = new Set(
    allItems.filter((i) => i.employeeId != null).map((i) => i.employeeId!),
  ).size;

  // Distinct employee-days with ANY action item.
  const affectedDayKeys = new Set(allItems.map((i) => `${i.employeeId ?? "?"}:${i.attendanceDate}`));

  // Excluded days: holiday or leave attendance items.
  const excludedDayKeys = new Set(
    allItems
      .filter((i) => i.category === "holiday_attendance" || i.category === "leave_attendance")
      .map((i) => `${i.employeeId ?? "?"}:${i.attendanceDate}`),
  );

  const readyDays = Math.max(0, scheduledDays - affectedDayKeys.size);

  const totals: ReconciliationSummaryTotals = {
    scheduledDays,
    readyDays,
    excludedDays: excludedDayKeys.size,
    payrollBlockingItems: blockers.length,
    reviewItems: reviewOnlyItems.length,
    employeesAffected,
    missingCheckouts: allItems.filter((i) => i.category === "missing_checkout").length,
    pendingCorrections: allItems.filter((i) => i.category === "pending_correction").length,
    pendingManualCheckins: allItems.filter((i) => i.category === "pending_manual_checkin").length,
    scheduleConflicts: allItems.filter((i) => i.category === "schedule_conflict").length,
    unscheduledAttendance: allItems.filter((i) => i.category === "unscheduled_attendance").length,
    holidayAttendance: allItems.filter((i) => i.category === "holiday_attendance").length,
    leaveAttendance: allItems.filter((i) => i.category === "leave_attendance").length,
  };

  const reasonCodes = [...new Set(allItems.flatMap((i) => i.reasonCodes))].sort();

  return {
    period,
    totals,
    readinessStatus,
    blockers,
    reviewItems: reviewOnlyItems,
    canLock: readinessStatus === "ready" && caps.canLockAttendancePeriod,
    canExportToPayroll: readinessStatus === "ready" && caps.canExportAttendanceReports,
    reasonCodes,
  };
}
