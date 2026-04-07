import { CheckInEligibilityReasonCode } from "@shared/attendanceCheckInEligibility";

/**
 * Short, mobile-friendly “what to do” line when check-in isn’t available or failed.
 * Server copy stays authoritative; this only adds consistent next-step framing.
 */
export function attendanceDenialNextStep(code: string | null | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY:
      return "Return when check-in opens (see time above).";
    case CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED:
      return "If you worked, request a correction.";
    case CheckInEligibilityReasonCode.LOCATION_REQUIRED_FOR_SITE:
      return "Turn on Location for this site, then try again.";
    case CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION:
      return "Move to the work site and try again.";
    case CheckInEligibilityReasonCode.SITE_OPERATING_HOURS_CLOSED:
      return "Site may be closed — try again during opening hours.";
    case CheckInEligibilityReasonCode.ATTENDANCE_DATA_INCONSISTENT:
      return "Use Correction so HR can fix the record.";
    case CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE:
      return "Check in from your assigned site.";
    default:
      return null;
  }
}
