/**
 * Calendar overlap between payroll/billing periods and assignment effective windows.
 * Dates are YYYY-MM-DD (Muscat business dates).
 */

import type { AssignmentStatus } from "./promoterAssignmentLifecycle";

export type AssignmentLikeForPeriod = {
  assignmentStatus: AssignmentStatus;
  startDate: Date | string;
  endDate: Date | string | null;
};

function ymd(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Inclusive overlap of [periodStart, periodEnd] with assignment effective window. Open end → far future. */
export function getAssignmentEffectiveOverlap(
  periodStartYmd: string,
  periodEndYmd: string,
  a: AssignmentLikeForPeriod,
): { overlapStart: string; overlapEnd: string } | null {
  const ps = periodStartYmd.slice(0, 10);
  const pe = periodEndYmd.slice(0, 10);
  const start = ymd(a.startDate);
  const end = a.endDate == null ? "2099-12-31" : ymd(a.endDate);

  if (end < ps || start > pe) return null;

  const overlapStart = start > ps ? start : ps;
  const overlapEnd = end < pe ? end : pe;
  if (overlapStart > overlapEnd) return null;
  return { overlapStart, overlapEnd };
}

/** Count calendar days in overlap (inclusive). */
export function countOverlapCalendarDays(overlap: { overlapStart: string; overlapEnd: string }): number {
  const s = new Date(`${overlap.overlapStart}T12:00:00Z`).getTime();
  const e = new Date(`${overlap.overlapEnd}T12:00:00Z`).getTime();
  const dayMs = 86400000;
  return Math.floor((e - s) / dayMs) + 1;
}

/**
 * Payable window: same as effective overlap, but zero if assignment not payable (suspended/draft in period).
 * Phase 2: draft not payable; suspended → not payable for the period.
 */
export function getAssignmentPayableWindow(
  periodStartYmd: string,
  periodEndYmd: string,
  a: AssignmentLikeForPeriod,
): { overlapStart: string; overlapEnd: string } | null {
  if (a.assignmentStatus === "draft" || a.assignmentStatus === "suspended") return null;
  if (a.assignmentStatus === "completed" || a.assignmentStatus === "terminated") {
    /** Terminal: only pay if overlap with worked period — still use date overlap. */
    return getAssignmentEffectiveOverlap(periodStartYmd, periodEndYmd, a);
  }
  return getAssignmentEffectiveOverlap(periodStartYmd, periodEndYmd, a);
}

/**
 * Billable window: commercial recognition window (same geometry as payable for Phase 2).
 * Billing rules (per_day vs per_month) apply in separate calculators.
 */
export function getAssignmentBillableWindow(
  periodStartYmd: string,
  periodEndYmd: string,
  a: AssignmentLikeForPeriod,
): { overlapStart: string; overlapEnd: string } | null {
  if (a.assignmentStatus === "draft") return null;
  return getAssignmentEffectiveOverlap(periodStartYmd, periodEndYmd, a);
}
