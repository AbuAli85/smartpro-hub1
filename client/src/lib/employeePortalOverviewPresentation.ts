/**
 * Pure presentation decisions for the employee portal overview / attendance strip.
 * Defaults and labels only — HR policy, entitlements, and business date stay server-owned.
 */
import {
  getShiftOperationalState,
  type ShiftOperationalState,
  type ShiftPhase,
} from "./employeePortalUtils";

export type WarningTone = "none" | "amber" | "red";

/**
 * Pure presentation decisions for the overview “today’s shift” card.
 * Server/business date and entitlements remain authoritative; this only maps known inputs to UI.
 */
export interface OverviewShiftCardPresentation {
  operational: ShiftOperationalState | null;
  phase: ShiftPhase | null;
  primaryCtaLabel: string;
  showSecondaryLogWork: boolean;
  showMissedActiveWarning: boolean;
  showMissedEndedWarning: boolean;
  attendancePending: boolean;
  /** check-out present without check-in (integrity) */
  attendanceInconsistent: boolean;
  correctionPendingNote: string | null;
  warningTone: WarningTone;
}

export function getOverviewShiftCardPresentation(input: {
  startTime?: string | null;
  endTime?: string | null;
  now: Date;
  attendanceLoading: boolean;
  checkIn?: Date | string | null;
  checkOut?: Date | string | null;
  pendingCorrectionCount?: number;
}): OverviewShiftCardPresentation {
  const pendingCorrectionCount = input.pendingCorrectionCount ?? 0;
  const operational =
    input.startTime && input.endTime
      ? getShiftOperationalState(input.startTime, input.endTime, input.now)
      : null;
  const phase = operational?.phase ?? null;

  const hasIn = !!input.checkIn;
  const hasOut = !!input.checkOut;
  const attendancePending = input.attendanceLoading;
  const attendanceInconsistent = !attendancePending && !hasIn && hasOut;

  let showMissedActive = false;
  let showMissedEnded = false;
  if (!attendancePending && phase === "active" && !hasIn) showMissedActive = true;
  if (!attendancePending && phase === "ended" && !hasIn) showMissedEnded = true;

  let primaryCtaLabel = "Open attendance";
  if (attendancePending) {
    if (phase === "upcoming") primaryCtaLabel = "Prepare";
    else primaryCtaLabel = "Open attendance";
  } else if (phase === "upcoming") {
    primaryCtaLabel = "Prepare";
  } else if (phase === "active") {
    if (!hasIn) primaryCtaLabel = "Check in now";
    else if (!hasOut) primaryCtaLabel = "Check out";
    else primaryCtaLabel = "Open attendance";
  } else if (phase === "ended") {
    if (hasIn && !hasOut) primaryCtaLabel = "Check out";
    else if (hasIn) primaryCtaLabel = "Open attendance";
    else if (pendingCorrectionCount > 0) primaryCtaLabel = "Open attendance";
    else primaryCtaLabel = "Request correction";
  }

  if (attendanceInconsistent) primaryCtaLabel = "Open attendance";

  const correctionPendingNote =
    !attendancePending && phase === "ended" && !hasIn && pendingCorrectionCount > 0
      ? "You have a pending correction request for today — HR will review it."
      : null;

  let warningTone: WarningTone = "none";
  if (attendanceInconsistent || showMissedEnded) warningTone = "red";
  else if (showMissedActive) warningTone = "amber";

  return {
    operational,
    phase,
    primaryCtaLabel,
    showSecondaryLogWork: phase === "ended",
    showMissedActiveWarning: showMissedActive,
    showMissedEndedWarning: showMissedEnded,
    attendancePending,
    attendanceInconsistent,
    correctionPendingNote,
    warningTone,
  };
}

export interface AttendanceTodayStripPresentation {
  showCheckIn: boolean;
  showCheckOut: boolean;
  showCorrectionButton: boolean;
  notCheckedInHeadline: string;
  notCheckedInSubline: string;
  attendanceInconsistent: boolean;
  inconsistentHeadline: string;
  inconsistentSubline: string;
  usePositiveCardStyle: boolean;
}

/**
 * Presentation for the attendance tab “today” status strip (check-in row + action buttons).
 */
export function getAttendanceTodayStripPresentation(input: {
  hasSchedule: boolean;
  isWorkingDay: boolean;
  hasShift: boolean;
  checkIn: Date | null;
  checkOut: Date | null;
  shiftStartTime?: string | null;
  shiftEndTime?: string | null;
  workingDayNames?: string;
}): AttendanceTodayStripPresentation {
  const hasIn = !!input.checkIn;
  const hasOut = !!input.checkOut;
  const attendanceInconsistent = !hasIn && hasOut;

  /** Correction entry stays available even on holidays (wrong-day / data fixes). */
  const showCorrectionButton = true;

  let showCheckIn =
    !hasIn && input.hasSchedule && input.isWorkingDay && !attendanceInconsistent;
  const showCheckOut = hasIn && !hasOut && !attendanceInconsistent;

  if (attendanceInconsistent) {
    showCheckIn = false;
  }

  let notCheckedInHeadline = "Not checked in yet";
  let notCheckedInSubline =
    input.hasSchedule && input.hasShift
      ? `Shift starts at ${input.shiftStartTime ?? "—"}`
      : "No shift scheduled";

  if (!input.isWorkingDay && input.hasSchedule) {
    notCheckedInHeadline = "Day Off";
    notCheckedInSubline = input.hasShift
      ? `Your shift (${input.shiftStartTime ?? "—"}–${input.shiftEndTime ?? "—"}) runs on ${input.workingDayNames || "scheduled days"}`
      : "No shift today";
  }

  return {
    showCheckIn,
    showCheckOut,
    showCorrectionButton,
    notCheckedInHeadline,
    notCheckedInSubline,
    attendanceInconsistent,
    inconsistentHeadline: "Attendance needs review",
    inconsistentSubline:
      "A check-out exists without a check-in — open Correction so HR can fix the record.",
    usePositiveCardStyle: hasIn && !attendanceInconsistent,
  };
}

/** Semantic IDs only — labels, icons, and handlers are mapped on the page. */
export type QuickActionId = "request_leave" | "log_work" | "open_documents";

export interface QuickActionPresentationItem {
  id: QuickActionId;
  /** When false, the FAB omits this row (feature flags / entitlements later). */
  visible: boolean;
}

/**
 * Single choke point for which quick actions exist and whether they show.
 * Does not perform navigation or mutations.
 */
export function getQuickActionsPresentation(): QuickActionPresentationItem[] {
  return [
    { id: "request_leave", visible: true },
    { id: "log_work", visible: true },
    { id: "open_documents", visible: true },
  ];
}
