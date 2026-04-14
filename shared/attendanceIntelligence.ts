/**
 * Central attendance intelligence: risk, operational bands, payroll hints, and action IDs.
 * Single source of truth for HR today board, action queue, and monitoring views.
 *
 * Implementation plan (working note):
 * - Keep status computation in attendanceBoardStatus + scheduling.getTodayBoard; map to risk/band here.
 * - Extend server DTOs with derived fields; avoid recomputing in React except for presentation.
 * - Payroll numbers stay non-financial until rules are finalized — expose flags + minutes only.
 */
import type { AdminBoardRowStatus } from "./attendanceBoardStatus";

/** Severity for exceptions and queue rows — use consistently across HR UI. */
export type AttendanceRiskLevel = "critical" | "warning" | "normal";

/**
 * Coarse grouping for live board ordering (critical first, completed last).
 */
export type OperationalBand =
  | "critical"
  | "needs_attention"
  | "active"
  | "completed"
  | "upcoming"
  | "holiday";

export type PayrollImpactFlag = "none" | "review" | "payroll_relevant";

/** Canonical action identifiers for attendance workflows (UI routes by id). */
export const ATTENDANCE_ACTION = {
  VIEW_RECORD: "view_record",
  VIEW_TODAY_BOARD: "view_today_board",
  OPEN_CORRECTIONS: "open_corrections",
  OPEN_MANUAL_CHECKINS: "open_manual_checkins",
  SEND_OVERDUE_REMINDER: "send_overdue_reminder",
} as const;

export type AttendanceActionId = (typeof ATTENDANCE_ACTION)[keyof typeof ATTENDANCE_ACTION];

export function riskLevelFromBoardStatus(status: AdminBoardRowStatus): AttendanceRiskLevel {
  switch (status) {
    case "absent":
      return "critical";
    case "late_no_checkin":
    case "not_checked_in":
    case "checked_in_late":
    case "early_checkout":
      return "warning";
    default:
      return "normal";
  }
}

export function operationalBandFromBoardStatus(status: AdminBoardRowStatus): OperationalBand {
  switch (status) {
    case "absent":
      return "critical";
    case "late_no_checkin":
    case "not_checked_in":
    case "early_checkout":
      return "needs_attention";
    case "checked_in_on_time":
    case "checked_in_late":
      return "active";
    case "checked_out":
    case "completed":
      return "completed";
    case "upcoming":
      return "upcoming";
    case "holiday":
      return "holiday";
    default:
      return "needs_attention";
  }
}

/**
 * Sort key for board sections (lower = earlier on the page).
 */
export const OPERATIONAL_BAND_ORDER: Record<OperationalBand, number> = {
  critical: 0,
  needs_attention: 1,
  active: 2,
  completed: 3,
  upcoming: 4,
  holiday: 5,
};

export function compareOperationalBands(a: OperationalBand, b: OperationalBand): number {
  return OPERATIONAL_BAND_ORDER[a] - OPERATIONAL_BAND_ORDER[b];
}

export interface PayrollHints {
  /** Minutes attributed to the shift window (from server overlap math). */
  workedMinutes: number | null;
  /** Same as worked until payroll rules exist; placeholder for paid break deductions. */
  payableMinutes: number | null;
  overtimeMinutes: number | null;
  latenessMinutes: number | null;
  payrollImpact: PayrollImpactFlag;
}

/**
 * Derive payroll-readiness hints from an HR board row. Does not compute wages.
 */
export function derivePayrollHintsFromBoardRow(params: {
  status: AdminBoardRowStatus;
  durationMinutes: number | null;
  delayMinutes: number | null;
}): PayrollHints {
  const { status, durationMinutes, delayMinutes } = params;
  const worked = durationMinutes != null ? Math.max(0, durationMinutes) : null;
  let payrollImpact: PayrollImpactFlag = "none";
  if (status === "absent" || status === "early_checkout") payrollImpact = "payroll_relevant";
  else if (
    status === "checked_in_late" ||
    status === "late_no_checkin" ||
    status === "not_checked_in"
  )
    payrollImpact = "review";
  else if (status === "completed" || status === "checked_out") payrollImpact = "payroll_relevant";

  const lateness =
    delayMinutes != null && delayMinutes > 0 ? delayMinutes : null;

  return {
    workedMinutes: worked,
    payableMinutes: worked,
    overtimeMinutes: null,
    latenessMinutes: lateness,
    payrollImpact,
  };
}

export type ExceptionQueueKind =
  | "missed_shift"
  | "late_no_checkin"
  | "open_checkout_overdue"
  | "correction_pending"
  | "manual_checkin_pending";

export interface OperationalExceptionItem {
  kind: ExceptionQueueKind;
  riskLevel: AttendanceRiskLevel;
  title: string;
  detail: string;
  employeeLabel: string;
  scheduleId?: number;
  attendanceRecordId?: number | null;
  /** Suggested actions for the client — resolve buttons from this list. */
  actions: AttendanceActionId[];
}

/** Overdue checkout row shape (matches scheduling.getOverdueCheckouts items). */
export type OverdueCheckoutRow = {
  employeeDisplayName: string;
  employeeUserId: number;
  shiftName: string | null;
  siteName: string | null;
  expectedEnd: string;
  minutesOverdue: number;
  checkInAt: Date | string;
};

/**
 * Build a prioritized action queue for HR (max `limit` items). Pure — safe to run on client or server.
 */
export function buildOperationalActionQueue(params: {
  boardRows: Array<{
    status: AdminBoardRowStatus;
    scheduleId: number;
    employeeDisplayName: string;
    attendanceRecordId: number | null;
    expectedStart: string;
    expectedEnd: string;
    siteName: string | null;
  }>;
  overdueCheckouts: OverdueCheckoutRow[];
  pendingCorrectionCount: number;
  pendingManualCount: number;
  limit?: number;
}): OperationalExceptionItem[] {
  const limit = params.limit ?? 24;
  const out: OperationalExceptionItem[] = [];

  for (const o of params.overdueCheckouts) {
    out.push({
      kind: "open_checkout_overdue",
      riskLevel: "critical",
      title: "Still clocked in after shift end",
      detail: `${o.shiftName ? `${o.shiftName} · ` : ""}Ended ${o.expectedEnd} · ${o.minutesOverdue}m overdue`,
      employeeLabel: o.employeeDisplayName,
      actions: [ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER, ATTENDANCE_ACTION.VIEW_TODAY_BOARD],
    });
  }

  for (const row of params.boardRows) {
    if (row.status === "absent") {
      out.push({
        kind: "missed_shift",
        riskLevel: "critical",
        title: "No check-in after shift end",
        detail: `Scheduled ${row.expectedStart}–${row.expectedEnd}${row.siteName ? ` · ${row.siteName}` : ""}`,
        employeeLabel: row.employeeDisplayName,
        scheduleId: row.scheduleId,
        attendanceRecordId: row.attendanceRecordId,
        actions: [ATTENDANCE_ACTION.VIEW_TODAY_BOARD, ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS],
      });
    } else if (row.status === "late_no_checkin") {
      out.push({
        kind: "late_no_checkin",
        riskLevel: "warning",
        title: "Late — no check-in yet",
        detail: `Window ${row.expectedStart}–${row.expectedEnd}${row.siteName ? ` · ${row.siteName}` : ""}`,
        employeeLabel: row.employeeDisplayName,
        scheduleId: row.scheduleId,
        actions: [ATTENDANCE_ACTION.VIEW_TODAY_BOARD],
      });
    }
  }

  if (params.pendingCorrectionCount > 0) {
    out.push({
      kind: "correction_pending",
      riskLevel: "warning",
      title:
        params.pendingCorrectionCount === 1
          ? "1 correction awaiting review"
          : `${params.pendingCorrectionCount} corrections awaiting review`,
      detail: "Approve or reject time adjustments before payroll close.",
      employeeLabel: "—",
      actions: [ATTENDANCE_ACTION.OPEN_CORRECTIONS],
    });
  }

  if (params.pendingManualCount > 0) {
    out.push({
      kind: "manual_checkin_pending",
      riskLevel: "warning",
      title:
        params.pendingManualCount === 1
          ? "1 manual check-in awaiting approval"
          : `${params.pendingManualCount} manual check-ins awaiting approval`,
      detail: "Employees could not self check-in — review and approve or reject.",
      employeeLabel: "—",
      actions: [ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS],
    });
  }

  const criticalFirst = (a: OperationalExceptionItem, b: OperationalExceptionItem) => {
    const order = { critical: 0, warning: 1, normal: 2 };
    return order[a.riskLevel] - order[b.riskLevel];
  };

  return [...out].sort(criticalFirst).slice(0, limit);
}
