/**
 * Canonical employee attendance presentation for Command Center (Phase 2).
 * Single source for hero chip tone, headline, and primary CTA intent — keep UI dumb.
 *
 * Canonical employee-facing status vocabulary (used as badgeLabel):
 *   Upcoming | Active | Completed | Missed | Correction requested
 *
 * Special non-shift states (holiday, day_off, leave, no_schedule, loading) retain
 * their own labels since they are not part of the shift-attendance lifecycle.
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
  /** Short label for badge / chip — always one of the canonical vocabulary words */
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
      headline: "Checking today's attendance…",
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

  // Canonical: "Correction requested" — data integrity issue needs HR correction
  if (input.shiftOverview.attendanceInconsistent) {
    return {
      state: "exception_pending",
      severity: "critical",
      badgeLabel: "Correction requested",
      headline: "Attendance record is inconsistent",
      supportingText:
        "A check-out exists without a check-in. Open Fix attendance so HR can correct the record.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Fix attendance",
      isBlocking: true,
    };
  }

  // Canonical: "Missed" — shift ended with no attendance recorded
  if (input.shiftOverview.showMissedEndedWarning) {
    return {
      state: "exception_pending",
      severity: "critical",
      badgeLabel: "Missed",
      headline: "No record for today's shift",
      supportingText:
        input.pendingCorrectionCount > 0
          ? "A correction is already with HR — you can add more details in Attendance."
          : "Submit a correction request if you worked today so HR can record it.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Fix attendance",
      isBlocking: true,
    };
  }

  // Canonical: "Active" — open session (checked in, shift still running)
  if (hasIn && !hasOut) {
    if (phase === "ended") {
      return {
        state: "missing_check_out",
        severity: "critical",
        badgeLabel: "Active",
        headline: "Shift ended — check out to close your session",
        supportingText:
          "Your check-in is saved. Tap Check out now, or use Fix attendance if the time is wrong.",
        primaryActionTab: "attendance",
        primaryActionLabel: "Fix attendance",
        isBlocking: true,
      };
    }
    return {
      state: "checked_in",
      severity: "success",
      badgeLabel: "Active",
      headline: "You are clocked in",
      supportingText: "Tap Check out when your shift ends.",
      primaryActionTab: "attendance",
      primaryActionLabel: input.shiftOverview.primaryCtaLabel,
      isBlocking: false,
    };
  }

  // Canonical: "Completed" — full punch pair recorded
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

  // Canonical: "Missed" — past grace window, no check-in
  if (input.shiftTiming?.isLateNoCheckIn) {
    return {
      state: "late",
      severity: "critical",
      badgeLabel: "Missed",
      headline: "No check-in — past grace period",
      supportingText: input.shiftTiming.lateDetail,
      primaryActionTab: "attendance",
      primaryActionLabel: "Check in now",
      isBlocking: true,
    };
  }

  // Canonical: "Active" — inside grace window, check-in still allowed
  if (phase === "active" && input.shiftTiming?.lateRiskCheckIn) {
    return {
      state: "late_risk",
      severity: "warning",
      badgeLabel: "Active",
      headline: "Grace period — check in now to avoid a late mark",
      supportingText: "You are inside the check-in window before a late mark applies.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Check in now",
      isBlocking: true,
    };
  }

  // Canonical: "Active" — shift window is running, check-in not yet submitted
  if (phase === "active") {
    return {
      state: "check_in_open",
      severity: "warning",
      badgeLabel: "Active",
      headline: "Shift in progress — check in now",
      supportingText: "Record your check-in to match your schedule.",
      primaryActionTab: "attendance",
      primaryActionLabel: "Check in now",
      isBlocking: true,
    };
  }

  // Canonical: "Upcoming" — shift has not started yet
  if (phase === "upcoming") {
    return {
      state: "before_shift",
      severity: "neutral",
      badgeLabel: "Upcoming",
      headline: "Shift has not started yet",
      supportingText: null,
      primaryActionTab: "attendance",
      primaryActionLabel: input.shiftOverview.primaryCtaLabel,
      isBlocking: false,
    };
  }

  // Canonical: "Completed" — shift window ended (with or without record)
  if (phase === "ended") {
    return {
      state: "completed",
      severity: "neutral",
      badgeLabel: "Completed",
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
    badgeLabel: "Upcoming",
    headline: "Attendance",
    primaryActionTab: "attendance",
    primaryActionLabel: input.shiftOverview.primaryCtaLabel,
    isBlocking: false,
  };
}

// ─── Attendance log grouping ──────────────────────────────────────────────────

/**
 * A single self-service attendance record as received from the portal API.
 * Uses `unknown` for Date-ish fields to stay compatible with tRPC-inferred types.
 */
export interface AttendanceRecordRaw {
  id: number;
  checkIn: string | Date;
  checkOut?: string | Date | null;
  shiftName?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  siteName?: string | null;
  completionStatus?: string | null;
  /** scheduleId from the HR board — used as the most precise grouping key when available. */
  scheduleId?: number | null;
}

/**
 * A group of attendance records that all belong to the same employee + business-date + shift.
 * The `primary` record is the open session (preferred) or the most recent closed session.
 * `earlier` holds all remaining closed records for the same shift, sorted oldest-first.
 */
export interface AttendanceRecordGroup {
  groupKey: string;
  /** YYYY-MM-DD derived from the primary record's checkIn */
  date: string;
  shiftName: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  /** Open record if one exists; otherwise the most-recent closed record */
  primary: AttendanceRecordRaw;
  /** Earlier closed records for the same shift, sorted oldest-first */
  earlier: AttendanceRecordRaw[];
}

/**
 * Groups a flat list of self-service attendance records by (date, shift).
 *
 * Grouping key priority:
 *  1. `scheduleId` — exact schedule identity (most precise)
 *  2. `shiftStart + shiftEnd + shiftName` — time-window fingerprint (fallback)
 *
 * Within each group, an open record (no `checkOut`) is promoted to `primary`;
 * all other closed records become `earlier` (sorted oldest-first).
 * Groups are sorted by date descending, then by `shiftStart` ascending.
 */
export function groupAttendanceRecords(
  records: AttendanceRecordRaw[],
): AttendanceRecordGroup[] {
  const map = new Map<string, AttendanceRecordRaw[]>();

  for (const r of records) {
    const date = new Date(r.checkIn).toISOString().split("T")[0] ?? "";
    const key =
      r.scheduleId != null
        ? `${date}||sid:${r.scheduleId}`
        : `${date}||${r.shiftStart ?? ""}||${r.shiftEnd ?? ""}||${r.shiftName ?? ""}`;
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(r);
    } else {
      map.set(key, [r]);
    }
  }

  const groups: AttendanceRecordGroup[] = [];

  for (const [groupKey, recs] of map) {
    // Sort ascending by checkIn so "earlier" records come first
    const sorted = [...recs].sort(
      (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
    );

    // Prefer the open record (no checkOut) as the primary
    const openIdx = sorted.findIndex((r) => !r.checkOut);
    let primary: AttendanceRecordRaw;
    let earlier: AttendanceRecordRaw[];

    if (openIdx !== -1) {
      primary = sorted[openIdx]!;
      earlier = sorted.filter((_, i) => i !== openIdx);
    } else {
      // All closed — use the most recent as primary
      primary = sorted[sorted.length - 1]!;
      earlier = sorted.slice(0, -1);
    }

    const date = new Date(primary.checkIn).toISOString().split("T")[0] ?? "";
    const representative = sorted[0]!;

    groups.push({
      groupKey,
      date,
      shiftName: representative.shiftName ?? null,
      shiftStart: representative.shiftStart ?? null,
      shiftEnd: representative.shiftEnd ?? null,
      primary,
      earlier,
    });
  }

  // Date descending, then shiftStart ascending
  groups.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return (a.shiftStart ?? "").localeCompare(b.shiftStart ?? "");
  });

  return groups;
}
