import { describe, expect, it } from "vitest";
import {
  buildOperationalActionQueue,
  collectOperationalIssueKeysForQueue,
  compareOperationalBands,
  derivePayrollHintsFromBoardRow,
  filterOperationalQueueItems,
  operationalBandFromBoardStatus,
  OPERATIONAL_BAND_ORDER,
  riskLevelFromBoardStatus,
} from "./attendanceIntelligence";
import { operationalIssueKey } from "./attendanceOperationalIssueKeys";
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

describe("collectOperationalIssueKeysForQueue", () => {
  it("returns stable keys for all major kinds", () => {
    const keys = collectOperationalIssueKeysForQueue({
      businessDateYmd: "2026-04-14",
      boardRows: [{ status: "absent" as const, scheduleId: 7 }],
      overdueCheckouts: [{ attendanceRecordId: 500 }],
      pendingCorrections: [{ id: 99 }],
      pendingManual: [{ id: 3 }],
    });
    expect(keys).toContain(operationalIssueKey({ kind: "overdue_checkout", attendanceRecordId: 500 }));
    expect(keys).toContain(
      operationalIssueKey({ kind: "missed_shift", scheduleId: 7, businessDateYmd: "2026-04-14" }),
    );
    expect(keys).toContain(operationalIssueKey({ kind: "correction_pending", correctionId: 99 }));
    expect(keys).toContain(operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: 3 }));
  });
});

describe("filterOperationalQueueItems", () => {
  const sample = [
    {
      kind: "open_checkout_overdue" as const,
      riskLevel: "critical" as const,
      title: "t",
      detail: "d",
      employeeLabel: "e",
      issueResolutionStatus: "resolved",
      assignedToUserId: 1 as number | null,
      actions: [],
    },
    {
      kind: "missed_shift" as const,
      riskLevel: "critical" as const,
      title: "m",
      detail: "d",
      employeeLabel: "e",
      issueResolutionStatus: "open",
      assignedToUserId: 2 as number | null,
      actions: [],
    },
  ];

  it("filters unresolved", () => {
    const f = filterOperationalQueueItems(sample, "unresolved", null);
    expect(f.length).toBe(1);
    expect(f[0]?.kind).toBe("missed_shift");
  });

  it("filters assigned to me", () => {
    const f = filterOperationalQueueItems(sample, "assigned_to_me", 2);
    expect(f.length).toBe(1);
    expect(f[0]?.kind).toBe("missed_shift");
  });
});

describe("buildOperationalActionQueue", () => {
  it("prioritizes overdue checkouts and absent rows", () => {
    const q = buildOperationalActionQueue({
      businessDateYmd: "2026-04-14",
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
          attendanceRecordId: 500,
          operationalIssue: { status: "open" },
        },
      ],
      pendingCorrections: [],
      pendingManual: [],
      issuesByKey: {},
      limit: 10,
    });
    expect(q[0]?.kind).toBe("open_checkout_overdue");
    expect(q.find((x) => x.kind === "missed_shift")).toBeTruthy();
  });

  it("emits one row per pending correction and manual with triage keys", () => {
    const q = buildOperationalActionQueue({
      businessDateYmd: "2026-04-14",
      boardRows: [],
      overdueCheckouts: [],
      pendingCorrections: [
        { id: 10, employeeLabel: "E1", businessDateYmd: "2026-04-14" },
        { id: 11, employeeLabel: "E2", businessDateYmd: "2026-04-15" },
      ],
      pendingManual: [{ id: 20, employeeLabel: "M1", businessDateYmd: "2026-04-14" }],
      issuesByKey: {
        [operationalIssueKey({ kind: "correction_pending", correctionId: 10 })]: { status: "acknowledged" },
      },
      limit: 20,
    });
    expect(q.filter((x) => x.kind === "correction_pending").length).toBe(2);
    expect(q.filter((x) => x.kind === "manual_checkin_pending").length).toBe(1);
    const c10 = q.find((x) => x.triage?.correctionId === 10);
    expect(c10?.issueResolutionStatus).toBe("acknowledged");
  });
});
