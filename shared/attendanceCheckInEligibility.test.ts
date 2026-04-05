import { describe, expect, it } from "vitest";
import {
  CheckInEligibilityReasonCode,
  evaluateSelfServiceCheckInEligibility,
  formatCheckInRejection,
  parseCheckInRejectionMessage,
} from "./attendanceCheckInEligibility";

const base = {
  businessDate: "2026-04-05",
  startTime: "09:00",
  endTime: "17:00",
  gracePeriodMinutes: 15,
  isHoliday: false,
  isWorkingDay: true,
  hasSchedule: true,
  hasShift: true,
  checkIn: null as Date | null,
  checkOut: null as Date | null,
  assignedSiteId: 1 as number | null,
};

describe("evaluateSelfServiceCheckInEligibility", () => {
  it("CHECK_IN_TOO_EARLY before open window", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 8, 0, 0),
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY);
  });

  it("allows at opening boundary (start - grace)", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 8, 45, 0),
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(true);
  });

  it("allows mid window", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 12, 0, 0),
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(true);
  });

  it("CHECK_IN_WINDOW_CLOSED after shift end", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 18, 0, 0),
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED);
  });

  it("ALREADY_CHECKED_IN when open session", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 12, 0, 0),
      checkIn: new Date(2026, 3, 5, 9, 0, 0),
      checkOut: null,
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.ALREADY_CHECKED_IN);
  });

  it("WRONG_CHECK_IN_SITE when scan != assigned", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 12, 0, 0),
      assignedSiteId: 1,
      scannedSiteId: 99,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE);
  });

  it("ignores site match when scannedSiteId omitted (portal)", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 12, 0, 0),
      assignedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(true);
  });

  it("NO_SHIFT_ASSIGNED", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date(2026, 3, 5, 12, 0, 0),
      hasSchedule: false,
      hasShift: false,
      startTime: null,
      endTime: null,
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.NO_SHIFT_ASSIGNED);
  });
});

describe("formatCheckInRejection / parseCheckInRejectionMessage", () => {
  it("round-trips", () => {
    const s = formatCheckInRejection(CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY, "Too early.");
    expect(s.startsWith("CHECK_IN_TOO_EARLY|")).toBe(true);
    const { code, humanMessage } = parseCheckInRejectionMessage(s);
    expect(code).toBe("CHECK_IN_TOO_EARLY");
    expect(humanMessage).toBe("Too early.");
  });
});
