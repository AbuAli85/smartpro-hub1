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
import { operationalIssueKey, type OperationalIssueKind } from "./attendanceOperationalIssueKeys";

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
  /** HR closes an open punch (requires confirmation + reason in UI). */
  FORCE_CHECKOUT_OPEN: "force_checkout_open",
  /** Triage: mark operational issue acknowledged (all issue kinds). */
  ACKNOWLEDGE_OPERATIONAL_ISSUE: "acknowledge_operational_issue",
  /** Triage: resolve with a note (all issue kinds). */
  RESOLVE_OPERATIONAL_ISSUE: "resolve_operational_issue",
  /** Triage: assign to a company user. */
  ASSIGN_OPERATIONAL_ISSUE: "assign_operational_issue",
  /** @deprecated Use ACKNOWLEDGE_OPERATIONAL_ISSUE */
  ACKNOWLEDGE_OVERDUE: "acknowledge_operational_issue",
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
  /** Stable key matching `attendance_operational_issues.issue_key`. */
  issueKey?: string;
  /** Payload for `attendance.setOperationalIssueStatus` (avoid duplicating switch logic in pages). */
  triage?: {
    businessDateYmd: string;
    kind: OperationalIssueKind;
    attendanceRecordId?: number;
    scheduleId?: number;
    correctionId?: number;
    manualCheckinRequestId?: number;
  };
  /** From `attendance_operational_issues` when loaded (e.g. overdue checkout). */
  issueResolutionStatus?: string | null;
  assignedToUserId?: number | null;
  reviewedByUserId?: number | null;
  reviewedAt?: string | Date | null;
  resolutionNote?: string | null;
  /** Suggested actions for the client — resolve buttons from this list. */
  actions: AttendanceActionId[];
}

/** Optional triage row from `attendance_operational_issues` (subset for UI). */
export type OperationalIssueLite = {
  status: string;
  assignedToUserId?: number | null;
  acknowledgedByUserId?: number | null;
  reviewedByUserId?: number | null;
  reviewedAt?: Date | string | null;
  resolutionNote?: string | null;
} | null;

/** Overdue checkout row shape (matches scheduling.getOverdueCheckouts items). */
export type OverdueCheckoutRow = {
  employeeDisplayName: string;
  employeeUserId: number;
  shiftName: string | null;
  siteName: string | null;
  expectedEnd: string;
  minutesOverdue: number;
  checkInAt: Date | string;
  attendanceRecordId: number;
  operationalIssue?: OperationalIssueLite;
};

function issueFromIndex(
  issuesByKey: Record<string, OperationalIssueLite | undefined>,
  key: string,
): OperationalIssueLite {
  return issuesByKey[key] ?? { status: "open" };
}

function statusSuffix(st: string): string {
  if (st === "acknowledged") return " · Acknowledged";
  if (st === "resolved") return " · Resolved";
  return "";
}

function appendTriageActions(
  actions: AttendanceActionId[],
  issueSt: string,
  opts: { includeForceCheckout?: boolean; includeRemind?: boolean },
) {
  const triageOpen = issueSt === "open" || issueSt === "acknowledged";
  if (opts.includeForceCheckout) {
    actions.push(ATTENDANCE_ACTION.FORCE_CHECKOUT_OPEN);
  }
  if (triageOpen) {
    actions.push(ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE);
    actions.push(ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE);
    actions.push(ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE);
  }
  if (opts.includeRemind) {
    actions.push(ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER);
  }
  actions.push(ATTENDANCE_ACTION.VIEW_TODAY_BOARD);
}

/**
 * Keys needed to hydrate triage state for the queue (batch with `listOperationalIssuesByIssueKeys`).
 */
export function collectOperationalIssueKeysForQueue(params: {
  businessDateYmd: string;
  boardRows: Array<{ status: AdminBoardRowStatus; scheduleId: number }>;
  overdueCheckouts: Array<{ attendanceRecordId: number }>;
  pendingCorrections: Array<{ id: number }>;
  pendingManual: Array<{ id: number }>;
}): string[] {
  const keys: string[] = [];
  for (const o of params.overdueCheckouts) {
    keys.push(operationalIssueKey({ kind: "overdue_checkout", attendanceRecordId: o.attendanceRecordId }));
  }
  for (const row of params.boardRows) {
    if (row.status === "absent") {
      keys.push(
        operationalIssueKey({
          kind: "missed_shift",
          scheduleId: row.scheduleId,
          businessDateYmd: params.businessDateYmd,
        }),
      );
    }
  }
  for (const c of params.pendingCorrections) {
    keys.push(operationalIssueKey({ kind: "correction_pending", correctionId: c.id }));
  }
  for (const m of params.pendingManual) {
    keys.push(operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: m.id }));
  }
  return keys;
}

export type OperationalQueueFilter = "all" | "unresolved" | "assigned_to_me" | "acknowledged" | "resolved";

export function filterOperationalQueueItems(
  items: OperationalExceptionItem[],
  filter: OperationalQueueFilter,
  currentUserId: number | null,
): OperationalExceptionItem[] {
  if (filter === "all") return items;
  return items.filter((it) => {
    const st = it.issueResolutionStatus ?? "open";
    if (filter === "resolved") return st === "resolved";
    if (filter === "acknowledged") return st === "acknowledged";
    if (filter === "assigned_to_me") {
      return currentUserId != null && it.assignedToUserId === currentUserId;
    }
    if (filter === "unresolved") return st !== "resolved";
    return true;
  });
}

/**
 * Build a prioritized action queue for HR (max `limit` items). Pure — safe to run on client or server.
 */
export function buildOperationalActionQueue(params: {
  businessDateYmd: string;
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
  /** `businessDateYmd` must match the persisted issue row (e.g. correction requested date). */
  pendingCorrections: Array<{ id: number; employeeLabel: string; businessDateYmd: string }>;
  pendingManual: Array<{ id: number; employeeLabel: string; businessDateYmd: string }>;
  /** From `attendance.listOperationalIssuesByIssueKeys` keyed by `issue_key`. */
  issuesByKey: Record<string, OperationalIssueLite | undefined>;
  limit?: number;
}): OperationalExceptionItem[] {
  const limit = params.limit ?? 24;
  const out: OperationalExceptionItem[] = [];
  const bd = params.businessDateYmd;

  for (const o of params.overdueCheckouts) {
    const ikey = operationalIssueKey({ kind: "overdue_checkout", attendanceRecordId: o.attendanceRecordId });
    const iss = issueFromIndex(params.issuesByKey, ikey);
    const issueSt = iss?.status ?? o.operationalIssue?.status ?? "open";
    const actions: AttendanceActionId[] = [];
    if (issueSt === "resolved") {
      actions.push(ATTENDANCE_ACTION.VIEW_TODAY_BOARD);
    } else {
      appendTriageActions(actions, issueSt, { includeForceCheckout: true, includeRemind: true });
    }
    out.push({
      kind: "open_checkout_overdue",
      riskLevel: "critical",
      title: `Still clocked in after shift end${statusSuffix(issueSt)}`,
      detail: `${o.shiftName ? `${o.shiftName} · ` : ""}Ended ${o.expectedEnd} · ${o.minutesOverdue}m overdue`,
      employeeLabel: o.employeeDisplayName,
      attendanceRecordId: o.attendanceRecordId,
      issueKey: ikey,
      triage: { businessDateYmd: bd, kind: "overdue_checkout", attendanceRecordId: o.attendanceRecordId },
      issueResolutionStatus: issueSt,
      assignedToUserId: iss?.assignedToUserId ?? o.operationalIssue?.assignedToUserId ?? null,
      reviewedByUserId: iss?.reviewedByUserId ?? null,
      reviewedAt: iss?.reviewedAt ?? null,
      resolutionNote: iss?.resolutionNote ?? null,
      actions,
    });
  }

  for (const row of params.boardRows) {
    if (row.status === "absent") {
      const ikey = operationalIssueKey({
        kind: "missed_shift",
        scheduleId: row.scheduleId,
        businessDateYmd: bd,
      });
      const iss = issueFromIndex(params.issuesByKey, ikey);
      const issueSt = iss?.status ?? "open";
      const actions: AttendanceActionId[] = [];
      if (issueSt === "resolved") {
        actions.push(ATTENDANCE_ACTION.VIEW_TODAY_BOARD, ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS);
      } else {
        actions.push(
          ATTENDANCE_ACTION.VIEW_TODAY_BOARD,
          ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS,
          ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE,
          ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE,
          ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE,
        );
      }
      out.push({
        kind: "missed_shift",
        riskLevel: "critical",
        title: `No check-in after shift end${statusSuffix(issueSt)}`,
        detail: `Scheduled ${row.expectedStart}–${row.expectedEnd}${row.siteName ? ` · ${row.siteName}` : ""}`,
        employeeLabel: row.employeeDisplayName,
        scheduleId: row.scheduleId,
        attendanceRecordId: row.attendanceRecordId,
        issueKey: ikey,
        triage: { businessDateYmd: bd, kind: "missed_shift", scheduleId: row.scheduleId },
        issueResolutionStatus: issueSt,
        assignedToUserId: iss?.assignedToUserId ?? null,
        reviewedByUserId: iss?.reviewedByUserId ?? null,
        reviewedAt: iss?.reviewedAt ?? null,
        resolutionNote: iss?.resolutionNote ?? null,
        actions,
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

  for (const c of params.pendingCorrections) {
    const ikey = operationalIssueKey({ kind: "correction_pending", correctionId: c.id });
    const iss = issueFromIndex(params.issuesByKey, ikey);
    const issueSt = iss?.status ?? "open";
    const actions: AttendanceActionId[] = [ATTENDANCE_ACTION.OPEN_CORRECTIONS];
    if (issueSt !== "resolved") {
      actions.push(
        ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE,
        ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE,
        ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE,
      );
    }
    out.push({
      kind: "correction_pending",
      riskLevel: "warning",
      title: `Correction review${statusSuffix(issueSt)}`,
      detail: "Approve or reject time adjustments before payroll close.",
      employeeLabel: c.employeeLabel,
      issueKey: ikey,
      triage: { businessDateYmd: c.businessDateYmd, kind: "correction_pending", correctionId: c.id },
      issueResolutionStatus: issueSt,
      assignedToUserId: iss?.assignedToUserId ?? null,
      reviewedByUserId: iss?.reviewedByUserId ?? null,
      reviewedAt: iss?.reviewedAt ?? null,
      resolutionNote: iss?.resolutionNote ?? null,
      actions,
    });
  }

  for (const m of params.pendingManual) {
    const ikey = operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: m.id });
    const iss = issueFromIndex(params.issuesByKey, ikey);
    const issueSt = iss?.status ?? "open";
    const actions: AttendanceActionId[] = [ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS];
    if (issueSt !== "resolved") {
      actions.push(
        ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE,
        ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE,
        ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE,
      );
    }
    out.push({
      kind: "manual_checkin_pending",
      riskLevel: "warning",
      title: `Manual check-in approval${statusSuffix(issueSt)}`,
      detail: "Employee could not self check-in — review and approve or reject.",
      employeeLabel: m.employeeLabel,
      issueKey: ikey,
      triage: { businessDateYmd: m.businessDateYmd, kind: "manual_pending", manualCheckinRequestId: m.id },
      issueResolutionStatus: issueSt,
      assignedToUserId: iss?.assignedToUserId ?? null,
      reviewedByUserId: iss?.reviewedByUserId ?? null,
      reviewedAt: iss?.reviewedAt ?? null,
      resolutionNote: iss?.resolutionNote ?? null,
      actions,
    });
  }

  const criticalFirst = (a: OperationalExceptionItem, b: OperationalExceptionItem) => {
    const order = { critical: 0, warning: 1, normal: 2 };
    return order[a.riskLevel] - order[b.riskLevel];
  };

  return [...out].sort(criticalFirst).slice(0, limit);
}
