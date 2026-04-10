/**
 * Canonical employee attendance presentation for Command Center (Phase 2).
 * Single source for hero chip tone, headline, and primary CTA intent — keep UI dumb.
 */
import type { OverviewShiftCardPresentation } from "@/lib/employeePortalOverviewPresentation";
import type { ShiftPhase } from "@/lib/employeePortalUtils";

export type EmployeeAttendanceUiState =
  | "day_off"
  | "leave"
  | "holiday"
  | "before_shift"
  | "check_in_open"
  | "late_risk"
  | "late"
  | "checked_in"
  | "on_break"
  | "missing_check_out"
  | "completed"
  | "exception_pending"
  | "remote_today"
  | "offsite_today"
  | "no_schedule"
  | "loading";

export type EmployeeAttendanceSeverity = "neutral" | "info" | "success" | "warning" | "critical";

export type EmployeeAttendancePresentation = {
  state: EmployeeAttendanceUiState;
  severity: EmployeeAttendanceSeverity;
  /** Short label for badge / chip */
  badgeLabel: string;
  /** One line under the shift title */
  headline: string;
  supportingText?: string | null;
  /** Maps to portal tab navigation */
  primaryActionTab: "attendance" | "leave" | "requests" | "documents" | "profile";
  primaryActionLabel: string;
  secondaryActionTab?: "attendance" | "leave" | "requests" | "worklog";
  secondaryActionLabel?: string;
  isBlocking: boolean;
};

export type AttendanceTimingContext = {
  isLateNoCheckIn: boolean;
  lateRiskCheckIn: boolean;
  lateDetail: string | null;
};

type ScheduleLike = {
  isHoliday?: boolean;
  holiday?: { name?: string | null };
  schedule?: unknown;
  shift?: { startTime?: string | null; endTime?: string | null; name?: string | null } | null;
  site?: { name?: string | null } | null;
  hasSchedule?: boolean;
  isWorkingDay?: boolean;
} | null | undefined;

function mapSeverityToHero(sev: EmployeeAttendanceSeverity): "critical" | "warning" | "normal" {
  if (sev === "critical") return "critical";
  if (sev === "warning" || sev === "info") return "warning";
  return "normal";
}

/** For legacy `HeroPresentation` consumers */
export function attendancePresentationToHeroSeverity(
  p: EmployeeAttendancePresentation,
): "critical" | "warning" | "normal" {
  return mapSeverityToHero(p.severity);
}

export function buildEmployeeAttendancePresentation(input: {
  todayAttendanceLoading: boolean;
  myActiveSchedule: ScheduleLike;
  shiftOverview: OverviewShiftCardPresentation;
  shiftTiming: AttendanceTimingContext | null;
  checkIn: Date | null;
  checkOut: Date | null;
  /** True when an approved leave covers local calendar today */
  onApprovedLeaveToday: boolean;
  pendingCorrectionCount: number;
}): EmployeeAttendancePresentation {
  if (input.todayAttendanceLoading) {
    return {
      state: "loading",
      severity: "neutral",
      badgeLabel: "Loading",
      headline: "Checking today’s attendance…",
      primaryActionTab: "attendance",
      primaryActionLabel: "Go to attendance",
      isBlocking: false,
    };
  }

  const s = input.myActiveSchedule;
  const phase: ShiftPhase | null = input.shiftOverview.phase;
  const hasIn = !!input.checkIn;
  const hasOut = !!input.checkOut;

  if (s?.isHoliday) {
    return {
      state: "holiday",
      severity: "neutral",
      badgeLabel: "Holiday",
      headline: s.holiday?.name ?? "Public holiday",
      supportingText: "No attendance required today.",
      primaryActionTab: "attendance",
      primaryActionLabel: "View attendance",
      isBlocking: false,
    };
  }

  if (s != null && s.hasSchedule === false) {
    return {
      state: "no_schedule",
      severity: "warning",
      badgeLabel: "No schedule",
      headline: "No shift assigned for today",
      supportingText: "Ask HR to assign your shift so you can check in.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Go to attendance",
      isBlocking: true,
    };
  }

  const hasShift = !!(s?.schedule && s?.shift);
  if (hasShift && s?.isWorkingDay === false) {
    return {
      state: "day_off",
      severity: "neutral",
      badgeLabel: "Day off",
      headline: "Not a working day",
      supportingText: "No check-in expected today.",
      primaryActionTab: "attendance",
      primaryActionLabel: "View attendance",
      isBlocking: false,
    };
  }

  if (input.onApprovedLeaveToday) {
    return {
      state: "leave",
      severity: "info",
      badgeLabel: "On leave",
      headline: "Approved leave today",
      supportingText: "Attendance is not required unless HR told you otherwise.",
      primaryActionTab: "leave",
      primaryActionLabel: "View leave",
      isBlocking: false,
    };
  }

  if (input.shiftOverview.attendanceInconsistent) {
    return {
      state: "exception_pending",
      severity: "critical",
      badgeLabel: "Action needed",
      headline: "Attendance record is inconsistent",
      supportingText: "Check-out without check-in — use Correction on the Attendance tab.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Fix attendance",
      isBlocking: true,
    };
  }

  if (input.shiftOverview.showMissedEndedWarning) {
    return {
      state: "exception_pending",
      severity: "critical",
      badgeLabel: "Missed attendance",
      headline: "No record for today’s shift",
      supportingText:
        input.pendingCorrectionCount > 0
          ? "A correction may already be with HR — you can still add details in Attendance."
          : "Request a correction if you worked today.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Fix attendance",
      isBlocking: true,
    };
  }

  if (hasIn && !hasOut) {
    if (phase === "ended") {
      return {
        state: "missing_check_out",
        severity: "critical",
        badgeLabel: "Missing check-out",
        headline: "You checked in but did not check out",
        supportingText: "This can affect attendance closure and payroll — complete check-out or submit a correction.",
        primaryActionTab: "attendance",
        primaryActionLabel: "Fix attendance",
        isBlocking: true,
      };
    }
    return {
      state: "checked_in",
      severity: "success",
      badgeLabel: "Checked in",
      headline: "You are clocked in",
      supportingText: "Remember to check out when your shift ends.",
      primaryActionTab: "attendance",
      primaryActionLabel: input.shiftOverview.primaryCtaLabel,
      isBlocking: false,
    };
  }

  if (hasIn && hasOut) {
    return {
      state: "completed",
      severity: "success",
      badgeLabel: "Completed",
      headline: "Check-in and check-out recorded",
      supportingText: null,
      primaryActionTab: "attendance",
      primaryActionLabel: "View attendance",
      isBlocking: false,
    };
  }

  if (input.shiftTiming?.isLateNoCheckIn) {
    return {
      state: "late",
      severity: "critical",
      badgeLabel: "Late",
      headline: "No check-in — past grace period",
      supportingText: input.shiftTiming.lateDetail,
      primaryActionTab: "attendance",
      primaryActionLabel: "Check in now",
      isBlocking: true,
    };
  }

  if (phase === "active" && input.shiftTiming?.lateRiskCheckIn) {
    return {
      state: "late_risk",
      severity: "warning",
      badgeLabel: "Late risk",
      headline: "Grace period — check in now",
      supportingText: "You are inside the shift window before a late mark applies.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Check in now",
      isBlocking: true,
    };
  }

  if (phase === "active") {
    return {
      state: "check_in_open",
      severity: "warning",
      badgeLabel: "Check in",
      headline: "Shift in progress",
      supportingText: "Record your check-in to match your schedule.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Check in now",
      isBlocking: true,
    };
  }

  if (phase === "upcoming") {
    return {
      state: "before_shift",
      severity: "neutral",
      badgeLabel: "Before shift",
      headline: "Shift has not started yet",
      supportingText: null,
      primaryActionTab: "attendance",
      primaryActionLabel: input.shiftOverview.primaryCtaLabel,
      isBlocking: false,
    };
  }

  if (phase === "ended") {
    return {
      state: "completed",
      severity: "neutral",
      badgeLabel: "Shift ended",
      headline: "Shift window closed",
      supportingText: hasIn ? undefined : "No check-in was recorded.",
      primaryActionTab: "attendance",
      primaryActionLabel: input.shiftOverview.primaryCtaLabel,
      isBlocking: false,
    };
  }

  return {
    state: "before_shift",
    severity: "neutral",
    badgeLabel: "Today",
    headline: "Attendance",
    primaryActionTab: "attendance",
    primaryActionLabel: input.shiftOverview.primaryCtaLabel,
    isBlocking: false,
  };
}
