/**
 * Pure presentation decisions for the employee portal overview / attendance strip.
 * Defaults and labels only — HR policy, entitlements, and business date stay server-owned.
 */
import type { PortalOperationalHints } from "@shared/employeePortalOperationalHints";
import {
  getShiftOperationalState,
  type ShiftOperationalState,
  type ShiftPhase,
} from "./employeePortalUtils";

export type ServerEligibilityHints = Pick<
  PortalOperationalHints,
  | "canCheckIn"
  | "canCheckOut"
  | "canRequestCorrection"
  | "eligibilityHeadline"
  | "eligibilityDetail"
  | "shiftStatusLabel"
  | "shiftDetailLine"
  | "checkInDenialCode"
  | "hasPendingCorrection"
  | "checkInOpensAt"
>;

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

function applyServerEligibilityToOverviewCta(params: {
  heuristicLabel: string;
  phase: ShiftPhase | null;
  hasIn: boolean;
  hasOut: boolean;
  attendancePending: boolean;
  serverHintsReady: boolean;
  serverHints: ServerEligibilityHints | null | undefined;
}): string {
  const sh = params.serverHintsReady && params.serverHints != null ? params.serverHints : null;
  let label = params.heuristicLabel;
  if (sh) {
    // Prefer direct actions whenever the server says they are allowed (e.g. late check-in after shift end).
    if (sh.canCheckIn && !params.hasIn && !params.attendancePending) {
      label = "Check in now";
    } else if (sh.canCheckOut && params.hasIn && !params.hasOut && !params.attendancePending) {
      label = "Check out now";
    } else {
      if (!sh.canCheckIn && label === "Check in now") label = "Open attendance";
      if (!sh.canCheckOut && (label === "Check out" || label === "Check out now")) label = "Open attendance";
      if (!sh.canRequestCorrection && label === "Request correction") label = "Open attendance";
    }
  }
  return label;
}

export function getOverviewShiftCardPresentation(input: {
  startTime?: string | null;
  endTime?: string | null;
  now: Date;
  attendanceLoading: boolean;
  checkIn?: Date | string | null;
  checkOut?: Date | string | null;
  pendingCorrectionCount?: number;
  /**
   * When `serverHintsReady` is true and `serverHints` is non-null, `canCheckIn` / `canCheckOut` /
   * `canRequestCorrection` override CTA labels vs heuristics alone.
   */
  serverHintsReady?: boolean;
  serverHints?: ServerEligibilityHints | null;
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
    else if (!hasOut) primaryCtaLabel = "Check out now";
    else primaryCtaLabel = "Open attendance";
  } else if (phase === "ended") {
    if (hasIn && !hasOut) primaryCtaLabel = "Check out now";
    else if (hasIn) primaryCtaLabel = "Open attendance";
    else if (pendingCorrectionCount > 0) primaryCtaLabel = "Open attendance";
    else primaryCtaLabel = "Request correction";
  }

  if (attendanceInconsistent) primaryCtaLabel = "Open attendance";

  primaryCtaLabel = applyServerEligibilityToOverviewCta({
    heuristicLabel: primaryCtaLabel,
    phase,
    hasIn,
    hasOut,
    attendancePending,
    serverHintsReady: input.serverHintsReady ?? false,
    serverHints: input.serverHints,
  });

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
  /** While `myToday` is loading and server hints are not authoritative yet, suppress check-in (client path). */
  attendanceLoading?: boolean;
  serverHintsReady?: boolean;
  serverHints?: ServerEligibilityHints | null;
}): AttendanceTodayStripPresentation {
  const hasIn = !!input.checkIn;
  const hasOut = !!input.checkOut;
  const attendanceInconsistent = !hasIn && hasOut;

  const serverActive = input.serverHintsReady === true && input.serverHints != null;
  const hints = serverActive ? input.serverHints : null;

  let showCheckIn: boolean;
  let showCheckOut: boolean;
  let showCorrectionButton: boolean;

  if (hints) {
    showCheckIn = hints.canCheckIn && !attendanceInconsistent;
    showCheckOut = hints.canCheckOut && !attendanceInconsistent;
    showCorrectionButton = hints.canRequestCorrection;
  } else {
    showCheckIn =
      !hasIn && input.hasSchedule && input.isWorkingDay && !attendanceInconsistent;
    showCheckOut = hasIn && !hasOut && !attendanceInconsistent;
    showCorrectionButton = true;
    if (attendanceInconsistent) showCheckIn = false;
    if (input.attendanceLoading) showCheckIn = false;
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

  if (hints && !hasIn) {
    notCheckedInHeadline = hints.eligibilityHeadline;
    notCheckedInSubline = hints.eligibilityDetail;
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
