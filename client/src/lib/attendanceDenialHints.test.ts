import { describe, expect, it } from "vitest";
import {
  ALL_CHECK_IN_DENIAL_REASON_CODES,
  CheckInEligibilityReasonCode,
} from "@shared/attendanceCheckInEligibility";
import {
  attendanceMutationIsRetryable,
  getCheckInDenialPresentation,
} from "@/lib/attendanceDenialHints";

describe("getCheckInDenialPresentation", () => {
  it("maps every known denial code with label, severity, and next step", () => {
    for (const code of ALL_CHECK_IN_DENIAL_REASON_CODES) {
      const p = getCheckInDenialPresentation(code);
      expect(p, code).not.toBeNull();
      expect(p!.shortLabel.trim().length, code).toBeGreaterThan(0);
      expect(p!.nextStep.trim().length, code).toBeGreaterThan(0);
      expect(["critical", "warning", "info", "success"]).toContain(p!.severity);
    }
  });

  it("returns null for empty / null codes", () => {
    expect(getCheckInDenialPresentation(null)).toBeNull();
    expect(getCheckInDenialPresentation("")).toBeNull();
  });

  it("returns a safe fallback for unknown server strings", () => {
    const p = getCheckInDenialPresentation("FUTURE_CODE_XYZ");
    expect(p).not.toBeNull();
    expect(p!.shortLabel.toLowerCase()).toContain("check");
  });
});

describe("attendanceMutationIsRetryable", () => {
  it("marks location / geofence / site hours as retryable", () => {
    expect(attendanceMutationIsRetryable(CheckInEligibilityReasonCode.LOCATION_REQUIRED_FOR_SITE)).toBe(
      true,
    );
    expect(attendanceMutationIsRetryable(CheckInEligibilityReasonCode.SITE_GEOFENCE_VIOLATION)).toBe(true);
    expect(
      attendanceMutationIsRetryable(CheckInEligibilityReasonCode.SITE_OPERATING_HOURS_CLOSED),
    ).toBe(true);
  });

  it("does not mark policy blocks as retryable", () => {
    expect(attendanceMutationIsRetryable(CheckInEligibilityReasonCode.NO_SHIFT_ASSIGNED)).toBe(false);
    expect(attendanceMutationIsRetryable(CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE)).toBe(false);
    expect(attendanceMutationIsRetryable("UNKNOWN")).toBe(false);
  });
});

describe("ALL_CHECK_IN_DENIAL_REASON_CODES", () => {
  it("includes every non-null CheckInEligibilityReasonCode value", () => {
    const fromConst = Object.values(CheckInEligibilityReasonCode).filter((v) => v != null) as string[];
    const fromAll = [...ALL_CHECK_IN_DENIAL_REASON_CODES];
    expect(fromAll.sort()).toEqual([...new Set(fromConst)].sort());
  });
});
