import { CheckInEligibilityReasonCode, type CheckInDenialReasonCode } from "./attendanceCheckInEligibility";

/**
 * Denial reasons where a manual HR-reviewed check-in request is a valid employee fallback
 * (self-service check-in is blocked for policy/location/window reasons — not data-fix or “wait”).
 *
 * Explicitly excluded:
 * - HOLIDAY / day off → no attendance expected
 * - CHECK_IN_TOO_EARLY → wait for window
 * - ATTENDANCE_DATA_INCONSISTENT → correction flow
 * - ALREADY_CHECKED_IN / DAY_ALREADY_RECORDED → not a check-in problem
 */
const MANUAL_FALLBACK_ALLOWED = new Set<CheckInDenialReasonCode>([
  CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE,
  CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED,
  CheckInEligibilityReasonCode.NO_SHIFT_ASSIGNED,
  CheckInEligibilityReasonCode.SHIFT_TIMES_MISSING,
  CheckInEligibilityReasonCode.LOCATION_REQUIRED_FOR_SITE,
  CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION,
  CheckInEligibilityReasonCode.SITE_OPERATING_HOURS_CLOSED,
]);

export function isManualAttendanceFallbackAllowedForDenialCode(
  code: string | null | undefined
): code is CheckInDenialReasonCode {
  if (code == null || code === "") return false;
  return MANUAL_FALLBACK_ALLOWED.has(code as CheckInDenialReasonCode);
}

/**
 * Whether to show the portal secondary CTA for manual attendance (requires a target site id on the client).
 */
export function shouldOfferManualAttendanceFallback(params: {
  denialCode: string | null | undefined;
  hasPendingManualCheckIn: boolean;
  canCheckIn: boolean;
  /** Today’s assigned / schedulable site (attendance_sites.id) — required to submit */
  siteId: number | null | undefined;
}): boolean {
  if (params.hasPendingManualCheckIn) return false;
  if (params.canCheckIn) return false;
  if (params.siteId == null) return false;
  return isManualAttendanceFallbackAllowedForDenialCode(params.denialCode);
}
