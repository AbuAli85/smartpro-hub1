/**
 * Canonical attendance action queue model (Phase 4).
 *
 * Pure module — no database calls, no React, no tRPC.
 * Converts resolveAttendanceDayState() output into typed, prioritized action items
 * that the HR action queue UI can render via i18n keys.
 *
 * Design decisions:
 *   - unscheduled_attendance → isPayrollBlocking: true (affects payable time)
 *   - holiday/leave attendance → isPayrollBlocking: false (review-only; leave module owns pay)
 *   - absent_confirmed/absent_pending → isPayrollBlocking: false (needs_review payroll, not blocked)
 *   - late_no_arrival → isPayrollBlocking: false (employee may still arrive)
 *   - blocked_* payrollReadiness values → isPayrollBlocking: true
 */

import {
  ATTENDANCE_REASON,
  type AttendanceDayRiskLevel,
  type AttendanceDayStateResult,
  type AttendanceDayStatus,
  type AttendancePayrollReadiness,
} from "./attendanceStatus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttendanceActionQueueCategory =
  | "missing_checkout"
  | "pending_correction"
  | "pending_manual_checkin"
  | "schedule_conflict"
  | "holiday_attendance"
  | "leave_attendance"
  | "late_no_arrival"
  | "absent_pending"
  | "unscheduled_attendance"
  | "manual_review";

export type AttendanceActionQueueSeverity = "low" | "medium" | "high" | "critical";

export interface AttendanceActionQueueItem {
  /** Deterministic ID for deduplication. */
  id: string;
  employeeId?: number;
  employeeName?: string;
  /** YYYY-MM-DD attendance date. */
  attendanceDate: string;
  /** Canonical status from resolveAttendanceDayState(). */
  status: AttendanceDayStatus;
  /** Payroll readiness from resolveAttendanceDayState(). */
  payrollReadiness: AttendancePayrollReadiness;
  /** Risk level from resolveAttendanceDayState() (5-level). */
  riskLevel: AttendanceDayRiskLevel;
  /** Machine-readable codes from resolveAttendanceDayState(). */
  reasonCodes: string[];
  /** Item-level severity for display ordering. */
  severity: AttendanceActionQueueSeverity;
  /** Action category — used to look up i18n title/description/recommended action. */
  category: AttendanceActionQueueCategory;
  /** i18n key for the item title. */
  titleKey: string;
  /** i18n key for the item description. */
  descriptionKey: string;
  /** i18n key for the recommended action text, if any. */
  recommendedActionKey?: string;
  /**
   * Tab ID the CTA navigates to in HRAttendancePage.
   * Values: "today" | "corrections" | "manual" | "records"
   */
  ctaHref?: string;
  /** i18n key for the CTA button label. */
  ctaLabelKey?: string;
  /** How many minutes ago this issue started (optional). */
  ageMinutes?: number;
  /** User ID assigned to this item (optional). */
  ownerUserId?: number | null;
  /**
   * True when this item must be resolved before payroll can run.
   * blocked_* payrollReadiness values → true.
   * unscheduled_attendance → true.
   * All others → false.
   */
  isPayrollBlocking: boolean;
  /** Database ID of the attendance record, if known. */
  attendanceRecordId?: number | null;
  /** Schedule ID, if known. */
  scheduleId?: number | null;
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

const CATEGORY_SEVERITY: Record<AttendanceActionQueueCategory, AttendanceActionQueueSeverity> = {
  schedule_conflict: "critical",
  missing_checkout: "high",
  pending_correction: "high",
  pending_manual_checkin: "high",
  late_no_arrival: "high",
  absent_pending: "high",
  unscheduled_attendance: "high",
  holiday_attendance: "medium",
  leave_attendance: "medium",
  manual_review: "medium",
};

const SEVERITY_ORDER: Record<AttendanceActionQueueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ---------------------------------------------------------------------------
// i18n key helpers
// ---------------------------------------------------------------------------

const BASE_KEY = "attendance.actionQueue";

function titleKey(category: AttendanceActionQueueCategory): string {
  return `${BASE_KEY}.categories.${category}`;
}

function descriptionKey(category: AttendanceActionQueueCategory): string {
  return `${BASE_KEY}.descriptions.${category}`;
}

function recommendedKey(category: AttendanceActionQueueCategory): string {
  return `${BASE_KEY}.recommendedActions.${category}`;
}

const CATEGORY_CTA: Record<AttendanceActionQueueCategory, { href: string; labelKey: string }> = {
  missing_checkout: { href: "today", labelKey: `${BASE_KEY}.cta.viewLiveBoard` },
  pending_correction: { href: "corrections", labelKey: `${BASE_KEY}.cta.openCorrections` },
  pending_manual_checkin: { href: "manual", labelKey: `${BASE_KEY}.cta.openManualCheckins` },
  schedule_conflict: { href: "today", labelKey: `${BASE_KEY}.cta.viewLiveBoard` },
  holiday_attendance: { href: "records", labelKey: `${BASE_KEY}.cta.viewRecords` },
  leave_attendance: { href: "records", labelKey: `${BASE_KEY}.cta.viewRecords` },
  late_no_arrival: { href: "today", labelKey: `${BASE_KEY}.cta.viewLiveBoard` },
  absent_pending: { href: "manual", labelKey: `${BASE_KEY}.cta.openManualCheckins` },
  unscheduled_attendance: { href: "records", labelKey: `${BASE_KEY}.cta.viewRecords` },
  manual_review: { href: "today", labelKey: `${BASE_KEY}.cta.viewLiveBoard` },
};

// ---------------------------------------------------------------------------
// Payroll blocking
// ---------------------------------------------------------------------------

function isPayrollBlocking(
  category: AttendanceActionQueueCategory,
  payrollReadiness: AttendancePayrollReadiness,
): boolean {
  if (payrollReadiness.startsWith("blocked_")) return true;
  if (category === "unscheduled_attendance") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildAttendanceActionItemsParams {
  resolvedState: AttendanceDayStateResult;
  attendanceDate: string;
  employeeId?: number;
  employeeName?: string;
  attendanceRecordId?: number | null;
  scheduleId?: number | null;
  ageMinutes?: number;
  ownerUserId?: number | null;
}

/**
 * Convert a resolved attendance day state into action queue items.
 *
 * Pure — no side effects. Returns 0..N items sorted by severity (critical first).
 * Does not produce items for ready/not_scheduled/scheduled/upcoming states.
 */
export function buildAttendanceActionItems(
  params: BuildAttendanceActionItemsParams,
): AttendanceActionQueueItem[] {
  const { resolvedState, attendanceDate, employeeId, employeeName, attendanceRecordId, scheduleId, ageMinutes, ownerUserId } = params;
  const { status, payrollReadiness, riskLevel, reasonCodes } = resolvedState;

  const items: AttendanceActionQueueItem[] = [];
  const empIdStr = employeeId ?? "x";

  function makeItem(category: AttendanceActionQueueCategory): AttendanceActionQueueItem {
    const cta = CATEGORY_CTA[category];
    const blocking = isPayrollBlocking(category, payrollReadiness);
    return {
      id: `${category}:${attendanceDate}:${empIdStr}:${attendanceRecordId ?? scheduleId ?? "0"}`,
      employeeId,
      employeeName,
      attendanceDate,
      status,
      payrollReadiness,
      riskLevel,
      reasonCodes,
      severity: CATEGORY_SEVERITY[category],
      category,
      titleKey: titleKey(category),
      descriptionKey: descriptionKey(category),
      recommendedActionKey: recommendedKey(category),
      ctaHref: cta.href,
      ctaLabelKey: cta.labelKey,
      ageMinutes,
      ownerUserId,
      isPayrollBlocking: blocking,
      attendanceRecordId,
      scheduleId,
    };
  }

  // ── Payroll-blocking items (driven by payrollReadiness) ───────────────────

  if (payrollReadiness === "blocked_schedule_conflict") {
    items.push(makeItem("schedule_conflict"));
  } else if (payrollReadiness === "blocked_pending_correction") {
    items.push(makeItem("pending_correction"));
  } else if (payrollReadiness === "blocked_pending_manual_checkin") {
    items.push(makeItem("pending_manual_checkin"));
  } else if (payrollReadiness === "blocked_missing_checkout") {
    items.push(makeItem("missing_checkout"));
  }

  // ── Holiday / leave attendance signals (driven by reasonCodes) ────────────

  if (reasonCodes.includes(ATTENDANCE_REASON.ATTENDANCE_ON_HOLIDAY)) {
    items.push(makeItem("holiday_attendance"));
  }
  if (reasonCodes.includes(ATTENDANCE_REASON.ATTENDANCE_DURING_LEAVE)) {
    items.push(makeItem("leave_attendance"));
  }

  // ── Status-driven items ───────────────────────────────────────────────────

  if (status === "late_no_arrival") {
    items.push(makeItem("late_no_arrival"));
  }

  if (status === "absent_pending") {
    // pending_manual_checkin is already in the list if blocked; avoid double entry
    const alreadyHasManual = items.some((i) => i.category === "pending_manual_checkin");
    if (!alreadyHasManual) {
      items.push(makeItem("absent_pending"));
    }
  }

  if (status === "unscheduled_attendance") {
    items.push(makeItem("unscheduled_attendance"));
  }

  if (status === "needs_review" && items.length === 0) {
    items.push(makeItem("manual_review"));
  }

  // Sort by severity (critical first), then by category name for determinism.
  items.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return a.category.localeCompare(b.category);
  });

  return items;
}

// ---------------------------------------------------------------------------
// Payroll-blocking summary helper
// ---------------------------------------------------------------------------

/**
 * Returns true if ANY item in the queue is payroll-blocking.
 * Useful for banner/badge at section level.
 */
export function hasPayrollBlockingItems(items: AttendanceActionQueueItem[]): boolean {
  return items.some((i) => i.isPayrollBlocking);
}

/**
 * Sort queue items by severity descending, then by employee name for stable display.
 */
export function sortAttendanceActionItems(
  items: AttendanceActionQueueItem[],
): AttendanceActionQueueItem[] {
  return [...items].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    const empA = a.employeeName ?? "";
    const empB = b.employeeName ?? "";
    return empA.localeCompare(empB);
  });
}
