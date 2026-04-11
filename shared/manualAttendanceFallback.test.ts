import { describe, expect, it } from "vitest";
import { CheckInEligibilityReasonCode } from "./attendanceCheckInEligibility";
import {
  isManualAttendanceFallbackAllowedForDenialCode,
  shouldOfferManualAttendanceFallback,
} from "./manualAttendanceFallback";

describe("manualAttendanceFallback", () => {
  it("allows typical blocked-self-service codes", () => {
    expect(isManualAttendanceFallbackAllowedForDenialCode(CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED)).toBe(
      true
    );
    expect(isManualAttendanceFallbackAllowedForDenialCode(CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE)).toBe(true);
    expect(isManualAttendanceFallbackAllowedForDenialCode(CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION)).toBe(
      true
    );
  });

  it("disallows wait / correction / complete states", () => {
    expect(isManualAttendanceFallbackAllowedForDenialCode(CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY)).toBe(false);
    expect(
      isManualAttendanceFallbackAllowedForDenialCode(CheckInEligibilityReasonCode.ATTENDANCE_DATA_INCONSISTENT)
    ).toBe(false);
    expect(isManualAttendanceFallbackAllowedForDenialCode(CheckInEligibilityReasonCode.ALREADY_CHECKED_IN)).toBe(false);
    expect(isManualAttendanceFallbackAllowedForDenialCode(CheckInEligibilityReasonCode.DAY_ALREADY_RECORDED)).toBe(false);
  });

  it("shouldOffer requires site id and blocked check-in", () => {
    expect(
      shouldOfferManualAttendanceFallback({
        denialCode: CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED,
        hasPendingManualCheckIn: false,
        canCheckIn: false,
        siteId: 5,
      })
    ).toBe(true);
    expect(
      shouldOfferManualAttendanceFallback({
        denialCode: CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED,
        hasPendingManualCheckIn: false,
        canCheckIn: false,
        siteId: null,
      })
    ).toBe(false);
    expect(
      shouldOfferManualAttendanceFallback({
        denialCode: CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED,
        hasPendingManualCheckIn: false,
        canCheckIn: true,
        siteId: 5,
      })
    ).toBe(false);
  });
});
