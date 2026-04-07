import {
  CheckInEligibilityReasonCode,
  ALL_CHECK_IN_DENIAL_REASON_CODES,
  type CheckInDenialReasonCode,
} from "@shared/attendanceCheckInEligibility";

/** Maps to UI treatment — not HR policy */
export type AttendanceDenialSeverity = "critical" | "warning" | "info" | "success";

export interface CheckInDenialPresentation {
  /** Short status chip (always paired with severity styling + text, not color alone) */
  shortLabel: string;
  severity: AttendanceDenialSeverity;
  /** Imperative next step for the employee */
  nextStep: string;
  /** Emphasize Correction in the action column */
  correctionPrimary: boolean;
}

/**
 * Full client contract for `checkInDenialCode` from `getMyOperationalHints` / gate evaluation.
 * Server `eligibilityHeadline` / `eligibilityDetail` stay authoritative for copy; this adds consistent severity + next-step + CTA hints.
 */
export function getCheckInDenialPresentation(code: string | null | undefined): CheckInDenialPresentation | null {
  if (code == null || code === "") return null;

  switch (code) {
    case CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY:
      return {
        shortLabel: "Too early",
        severity: "info",
        nextStep: "Come back when check-in opens (see server time above).",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED:
      return {
        shortLabel: "Missed check-in",
        severity: "warning",
        nextStep: "If you worked, open Correction and request a fix.",
        correctionPrimary: true,
      };
    case CheckInEligibilityReasonCode.HOLIDAY_NO_ATTENDANCE:
      return {
        shortLabel: "Holiday",
        severity: "info",
        nextStep: "No attendance needed today.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.NO_SHIFT_ASSIGNED:
      return {
        shortLabel: "No schedule",
        severity: "warning",
        nextStep: "Contact HR to assign your shift.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.SHIFT_TIMES_MISSING:
      return {
        shortLabel: "Setup issue",
        severity: "warning",
        nextStep: "HR must set shift times on your schedule.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.NOT_WORKING_DAY:
      return {
        shortLabel: "Day off",
        severity: "info",
        nextStep: "You’re not scheduled to work today.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.ATTENDANCE_DATA_INCONSISTENT:
      return {
        shortLabel: "Record error",
        severity: "critical",
        nextStep: "Use Correction — HR must fix check-in/check-out data.",
        correctionPrimary: true,
      };
    case CheckInEligibilityReasonCode.ALREADY_CHECKED_IN:
      return {
        shortLabel: "Checked in",
        severity: "success",
        nextStep: "When you leave, use Check out now.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.DAY_ALREADY_RECORDED:
      return {
        shortLabel: "Complete",
        severity: "success",
        nextStep: "Today’s attendance is already recorded.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE:
      return {
        shortLabel: "Wrong site",
        severity: "critical",
        nextStep: "Use the site on your schedule or ask HR.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.LOCATION_REQUIRED_FOR_SITE:
      return {
        shortLabel: "Location needed",
        severity: "warning",
        nextStep: "Allow Location for this app, then tap Check in again.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION:
      return {
        shortLabel: "Outside area",
        severity: "warning",
        nextStep: "Move to your work site, then try again.",
        correctionPrimary: false,
      };
    case CheckInEligibilityReasonCode.SITE_OPERATING_HOURS_CLOSED:
      return {
        shortLabel: "Site closed",
        severity: "warning",
        nextStep: "Try again during site opening hours or contact HR.",
        correctionPrimary: false,
      };
    default: {
      if (
        import.meta.env.DEV &&
        ALL_CHECK_IN_DENIAL_REASON_CODES.includes(code as CheckInDenialReasonCode)
      ) {
        console.error(
          "[attendanceDenialHints] Denial code in ALL_CHECK_IN_DENIAL_REASON_CODES but missing from switch:",
          code,
        );
      }
      return {
        shortLabel: "Can’t check in",
        severity: "warning",
        nextStep: "If this persists, contact HR with a screenshot.",
        correctionPrimary: true,
      };
    }
  }
}

/** @deprecated use getCheckInDenialPresentation(code)?.nextStep */
export function attendanceDenialNextStep(code: string | null | undefined): string | null {
  return getCheckInDenialPresentation(code)?.nextStep ?? null;
}

/** Server uses same codes as check-in eligibility; retry after user fixes context (location, site, hours). */
const RETRY_MUTATION_CODES = new Set<string>([
  CheckInEligibilityReasonCode.LOCATION_REQUIRED_FOR_SITE,
  CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION,
  CheckInEligibilityReasonCode.SITE_OPERATING_HOURS_CLOSED,
]);

export function attendanceMutationIsRetryable(code: string): boolean {
  return RETRY_MUTATION_CODES.has(code);
}

/** Visible + screen-reader text — do not rely on color alone for severity */
export function checkInDenialSeverityPlainLabel(severity: AttendanceDenialSeverity): string {
  switch (severity) {
    case "critical":
      return "Action required";
    case "warning":
      return "Needs attention";
    case "info":
      return "Heads up";
    case "success":
      return "All set";
  }
}

export function checkInDenialCardAccentClass(severity: AttendanceDenialSeverity): string {
  switch (severity) {
    case "critical":
      return "border-l-4 border-l-red-600";
    case "warning":
      return "border-l-4 border-l-amber-500";
    case "info":
      return "border-l-4 border-l-sky-500";
    case "success":
      return "border-l-4 border-l-emerald-600";
  }
}

export function checkInDenialInlineBadgeClass(severity: AttendanceDenialSeverity): string {
  switch (severity) {
    case "critical":
      return "border border-red-300 bg-red-100 text-red-950 dark:bg-red-950/50 dark:text-red-50 dark:border-red-800";
    case "warning":
      return "border border-amber-300 bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50 dark:border-amber-800";
    case "info":
      return "border border-sky-300 bg-sky-100 text-sky-950 dark:bg-sky-950/40 dark:text-sky-50 dark:border-sky-800";
    case "success":
      return "border border-emerald-300 bg-emerald-100 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-50 dark:border-emerald-800";
  }
}
