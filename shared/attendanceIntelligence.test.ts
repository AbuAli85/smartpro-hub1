import { describe, expect, it } from "vitest";
import {
  buildOperationalActionQueue,
  compareOperationalBands,
  derivePayrollHintsFromBoardRow,
  operationalBandFromBoardStatus,
  OPERATIONAL_BAND_ORDER,
  riskLevelFromBoardStatus,
} from "./attendanceIntelligence";
import type { AdminBoardRowStatus } from "./attendanceBoardStatus";

describe("riskLevelFromBoardStatus", () => {
  it("marks absent as critical", () => {
    expect(riskLevelFromBoardStatus("absent")).toBe("critical");
  });

  it("marks late / grace / early checkout as warning", () => {
    expect(riskLevelFromBoardStatus("late_no_checkin")).toBe("warning");
    expect(riskLevelFromBoardStatus("not_checked_in")).toBe("warning");
    expect(riskLevelFromBoardStatus("checked_in_late")).toBe("warning");
    expect(riskLevelFromBoardStatus("early_checkout")).toBe("warning");
  });

  it("marks neutral paths as normal", () => {
    expect(riskLevelFromBoardStatus("upcoming")).toBe("normal");
    expect(riskLevelFromBoardStatus("checked_in_on_time")).toBe("normal");
    expect(riskLevelFromBoardStatus("checked_out")).toBe("normal");
    expect(riskLevelFromBoardStatus("holiday")).toBe("normal");
  });
});

describe("operationalBandFromBoardStatus", () => {
  it("orders critical and completed distinctly", () => {
    expect(operationalBandFromBoardStatus("absent")).toBe("critical");
    expect(operationalBandFromBoardStatus("completed")).toBe("completed");
    expect(operationalBandFromBoardStatus("checked_out")).toBe("completed");
    expect(compareOperationalBands("critical", "completed")).toBeLessThan(0);
    expect(OPERATIONAL_BAND_ORDER.critical).toBeLessThan(OPERATIONAL_BAND_ORDER.needs_attention);
  });
});

describe("derivePayrollHintsFromBoardRow", () => {
  it("flags absent as payroll_relevant", () => {
    const h = derivePayrollHintsFromBoardRow({
      status: "absent" as AdminBoardRowStatus,
      durationMinutes: null,
      delayMinutes: null,
    });
    expect(h.payrollImpact).toBe("payroll_relevant");
    expect(h.workedMinutes).toBeNull();
  });

  it("passes through duration as worked/payable when present", () => {
    const h = derivePayrollHintsFromBoardRow({
      status: "completed" as AdminBoardRowStatus,
      durationMinutes: 120,
      delayMinutes: null,
    });
    expect(h.workedMinutes).toBe(120);
    expect(h.payableMinutes).toBe(120);
  });
});

describe("buildOperationalActionQueue", () => {
  it("prioritizes overdue checkouts and absent rows", () => {
    const q = buildOperationalActionQueue({
      boardRows: [
        {
          status: "absent" as AdminBoardRowStatus,
          scheduleId: 1,
          employeeDisplayName: "A",
          attendanceRecordId: null,
          expectedStart: "09:00",
          expectedEnd: "17:00",
          siteName: "HQ",
        },
      ],
      overdueCheckouts: [
        {
          employeeDisplayName: "B",
          employeeUserId: 2,
          shiftName: "Morning",
          siteName: "Site",
          expectedEnd: "13:00",
          checkInAt: new Date(),
          minutesOverdue: 30,
        },
      ],
      pendingCorrectionCount: 0,
      pendingManualCount: 0,
      limit: 10,
    });
    expect(q[0]?.kind).toBe("open_checkout_overdue");
    expect(q.find((x) => x.kind === "missed_shift")).toBeTruthy();
  });

  it("includes aggregate correction and manual rows", () => {
    const q = buildOperationalActionQueue({
      boardRows: [],
      overdueCheckouts: [],
      pendingCorrectionCount: 2,
      pendingManualCount: 1,
      limit: 20,
    });
    expect(q.some((x) => x.kind === "correction_pending")).toBe(true);
    expect(q.some((x) => x.kind === "manual_checkin_pending")).toBe(true);
  });
});
