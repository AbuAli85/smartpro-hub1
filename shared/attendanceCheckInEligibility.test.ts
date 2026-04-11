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

// All `now` dates use explicit UTC instants so tests are timezone-agnostic.
// businessDate "2026-04-05", shift 09:00–17:00 Muscat (UTC+4):
//   shiftStart = 2026-04-05T05:00Z, window opens = 2026-04-05T04:45Z, shiftEnd = 2026-04-05T13:00Z
describe("evaluateSelfServiceCheckInEligibility", () => {
  it("CHECK_IN_TOO_EARLY before open window", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date("2026-04-05T04:00:00Z"), // Muscat 08:00 — before window opens at 08:45
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.CHECK_IN_TOO_EARLY);
  });

  it("allows at opening boundary (start - grace)", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date("2026-04-05T04:45:00Z"), // Muscat 08:45 — exactly at window open
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(true);
  });

  it("allows mid window", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date("2026-04-05T08:00:00Z"), // Muscat 12:00 — mid window
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(true);
  });

  it("CHECK_IN_WINDOW_CLOSED after shift end", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date("2026-04-05T14:00:00Z"), // Muscat 18:00 — after shift ends at 17:00
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.CHECK_IN_WINDOW_CLOSED);
  });

  it("ALREADY_CHECKED_IN when open session", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date("2026-04-05T08:00:00Z"), // Muscat 12:00
      checkIn: new Date("2026-04-05T05:00:00Z"), // Muscat 09:00
      checkOut: null,
      scannedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.ALREADY_CHECKED_IN);
  });

  it("WRONG_CHECK_IN_SITE when scan != assigned", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date("2026-04-05T08:00:00Z"), // Muscat 12:00
      assignedSiteId: 1,
      scannedSiteId: 99,
    });
    expect(r.canCheckIn).toBe(false);
    if (!r.canCheckIn) expect(r.reasonCode).toBe(CheckInEligibilityReasonCode.WRONG_CHECK_IN_SITE);
  });

  it("ignores site match when scannedSiteId omitted (portal)", () => {
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      now: new Date("2026-04-05T08:00:00Z"), // Muscat 12:00
      assignedSiteId: 1,
    });
    expect(r.canCheckIn).toBe(true);
  });

  it("does not treat day as complete when allShiftsHaveClosedAttendance is false (second shift same day)", () => {
    // Second shift 18:00–22:00 Muscat = UTC 14:00–18:00; now = Muscat 19:00 = UTC 15:00
    const r = evaluateSelfServiceCheckInEligibility({
      ...base,
      startTime: "18:00",
      endTime: "22:00",
      now: new Date("2026-04-05T15:00:00Z"), // Muscat 19:00 — mid second-shift window
      checkIn: new Date("2026-04-05T05:00:00Z"), // Muscat 09:00 — first shift check-in
      checkOut: new Date("2026-04-05T09:00:00Z"), // Muscat 13:00 — first shift check-out
      allShiftsHaveClosedAttendance: false,
      scannedSiteId: 1,
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
