import { describe, expect, it } from "vitest";
import {
  BLOCKER_SUPPRESSED_ACTION_KEYS,
  buildEmployeeBlockers,
  suppressedActionKeysFromBlockers,
} from "./employeeBlockersModel";
import type { OverviewShiftCardPresentation } from "./employeePortalOverviewPresentation";

const baseShift = (over: Partial<OverviewShiftCardPresentation> = {}): OverviewShiftCardPresentation => ({
  operational: null,
  phase: null,
  primaryCtaLabel: "Go to attendance",
  showSecondaryLogWork: false,
  showMissedActiveWarning: false,
  showMissedEndedWarning: false,
  attendancePending: false,
  attendanceInconsistent: false,
  correctionPendingNote: null,
  warningTone: "none",
  ...over,
});

describe("buildEmployeeBlockers", () => {
  it("adds missing check-out blocker when checked in past shift end", () => {
    const list = buildEmployeeBlockers({
      shiftOverview: baseShift({ phase: "ended" }),
      phase: "ended",
      checkIn: new Date("2026-04-10T09:00:00"),
      checkOut: null,
      workStatusSummary: undefined,
      expiredDocCount: 0,
      criticalSoonDocCount: 0,
      profileReminder: null,
    });
    expect(list.some((b) => b.id === "blocker-missing-checkout")).toBe(true);
  });

  it("sorts by rank ascending and caps at three", () => {
    const list = buildEmployeeBlockers({
      shiftOverview: baseShift({
        attendanceInconsistent: true,
        showMissedEndedWarning: true,
        phase: "ended",
      }),
      phase: "ended",
      checkIn: new Date("2026-04-10T09:00:00"),
      checkOut: null,
      workStatusSummary: undefined,
      expiredDocCount: 1,
      criticalSoonDocCount: 2,
      profileReminder: "Add emergency contact",
    });
    expect(list.length).toBeLessThanOrEqual(3);
    const ranks = list.map((b) => b.rank);
    expect([...ranks].sort((a, c) => a - c)).toEqual(ranks);
  });
});

describe("suppressedActionKeysFromBlockers", () => {
  it("maps blocker ids to suppressed top-action keys", () => {
    expect(BLOCKER_SUPPRESSED_ACTION_KEYS["blocker-missing-checkout"]).toContain("check-in");
    const keys = suppressedActionKeysFromBlockers([
      {
        id: "blocker-att-inconsistent",
        type: "attendance",
        title: "x",
        actionLabel: "y",
        actionTab: "attendance",
        severity: "critical",
        rank: 1,
      },
    ]);
    expect(keys.has("att-inconsistent")).toBe(true);
  });
});
