import { describe, expect, it } from "vitest";
import {
  buildLeaveOverviewSignals,
  buildOverviewDashboardModel,
  buildOverviewTaskStats,
  profileCompletenessReminder,
} from "./employeePortalOverviewModel";
import type { OverviewShiftCardPresentation } from "./employeePortalOverviewPresentation";
import { computeProductivityScore } from "./employeePortalUtils";

const baseShiftPresentation = (): OverviewShiftCardPresentation => ({
  operational: null,
  phase: null,
  primaryCtaLabel: "Open attendance",
  showSecondaryLogWork: false,
  showMissedActiveWarning: false,
  showMissedEndedWarning: false,
  attendancePending: false,
  attendanceInconsistent: false,
  correctionPendingNote: null,
  warningTone: "none",
});

describe("buildOverviewTaskStats", () => {
  it("counts overdue and picks top task by urgency", () => {
    const now = new Date(2026, 3, 7, 12, 0, 0);
    const s = buildOverviewTaskStats(
      [
        { id: 1, title: "Later", status: "pending", priority: "low", dueDate: "2026-04-20" },
        { id: 2, title: "Overdue", status: "in_progress", priority: "medium", dueDate: "2026-04-01" },
        { id: 3, title: "Urgent future", status: "pending", priority: "urgent", dueDate: "2026-04-10" },
      ],
      now,
    );
    expect(s.openCount).toBe(3);
    expect(s.overdueCount).toBe(1);
    expect(s.topTask?.id).toBe(2);
  });
});

describe("buildLeaveOverviewSignals", () => {
  it("detects low balance", () => {
    const sig = buildLeaveOverviewSignals([], { annual: 1, sick: 14, emergency: 5 }, { annual: 30, sick: 15, emergency: 5 });
    expect(sig.warnings.some((w) => w.includes("Annual"))).toBe(true);
  });
});

describe("profileCompletenessReminder", () => {
  it("returns null when filled", () => {
    expect(
      profileCompletenessReminder({
        phone: "1",
        emergencyContact: "x",
        emergencyPhone: "2",
      }),
    ).toBeNull();
  });
});

describe("buildOverviewDashboardModel", () => {
  const productivity = computeProductivityScore({ attendanceRatePercent: 80, tasks: [{ status: "completed" }, { status: "pending" }] });

  it("prioritizes attendance inconsistency in action center", () => {
    const m = buildOverviewDashboardModel({
      shiftOverview: { ...baseShiftPresentation(), attendanceInconsistent: true },
      myActiveSchedule: null,
      todayAttendanceRecord: null,
      workStatusSummary: undefined,
      expiringDocs: [],
      tasks: [],
      leave: [],
      balance: { annual: 20, sick: 10, emergency: 5 },
      entitlements: { annual: 30, sick: 15, emergency: 5 },
      productivity,
      attSummary: { present: 10, late: 0, absent: 0, total: 10 },
      notifications: [],
    });
    expect(m.actionCenter[0]?.key).toBe("att-inconsistent");
    expect(m.actionCenter[0]?.actionType).toBe("attendance");
    expect(m.actionCenter[0]?.nextStep).toBeTruthy();
    expect(m.hero?.stateLabel).toBeTruthy();
    expect(Array.isArray(m.proactiveHints)).toBe(true);
  });

  it("falls back to all-clear when no signals", () => {
    const m = buildOverviewDashboardModel({
      shiftOverview: baseShiftPresentation(),
      myActiveSchedule: null,
      todayAttendanceRecord: null,
      workStatusSummary: undefined,
      expiringDocs: [],
      tasks: [],
      leave: [],
      balance: { annual: 20, sick: 10, emergency: 5 },
      entitlements: { annual: 30, sick: 15, emergency: 5 },
      productivity,
      attSummary: { present: 0, late: 0, absent: 0, total: 0 },
      notifications: [],
    });
    expect(m.actionCenter.some((a) => a.key === "all-clear")).toBe(true);
  });

  it("caps action center at three items", () => {
    const m = buildOverviewDashboardModel({
      shiftOverview: { ...baseShiftPresentation(), attendanceInconsistent: true, showMissedEndedWarning: true },
      myActiveSchedule: null,
      todayAttendanceRecord: null,
      workStatusSummary: {
        overallStatus: "urgent",
        permit: { status: "missing", expiryDate: null, label: "x" },
        documents: { status: "missing", expiringCount: 0, expiredCount: 0, label: "y" },
        tasks: { openCount: 1, overdueCount: 1, nextDueAt: null, label: "z" },
        primaryAction: { type: "open_tasks", label: "Tasks", tab: "tasks" },
      },
      expiringDocs: [{ id: 1, expiresAt: new Date(2020, 0, 1).toISOString() }],
      tasks: [{ id: 1, title: "T", status: "pending", dueDate: "2020-01-01" }],
      leave: [],
      balance: { annual: 20, sick: 10, emergency: 5 },
      entitlements: { annual: 30, sick: 15, emergency: 5 },
      productivity,
      attSummary: { present: 10, late: 0, absent: 0, total: 10 },
      notifications: [],
    });
    expect(m.actionCenter.length).toBeLessThanOrEqual(3);
  });
});
