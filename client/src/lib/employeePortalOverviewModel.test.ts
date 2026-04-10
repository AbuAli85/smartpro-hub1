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
  primaryCtaLabel: "Go to attendance",
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
    const sig = buildLeaveOverviewSignals([], { annual: 1, sick: 14, emergency: 5 }, { annual: 30, sick: 15, emergency: 6 });
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

  it("surfaces attendance inconsistency as a blocker, not duplicated in top actions", () => {
    const m = buildOverviewDashboardModel({
      shiftOverview: { ...baseShiftPresentation(), attendanceInconsistent: true },
      myActiveSchedule: null,
      todayAttendanceRecord: null,
      workStatusSummary: undefined,
      expiringDocs: [],
      tasks: [],
      leave: [],
      balance: { annual: 20, sick: 10, emergency: 5 },
      entitlements: { annual: 30, sick: 15, emergency: 6 },
      productivity,
      attSummary: { present: 10, late: 0, absent: 0, total: 10 },
      notifications: [],
    });
    expect(m.blockers.some((b) => b.id === "blocker-att-inconsistent")).toBe(true);
    expect(m.actionCenter.some((a) => a.key === "att-inconsistent")).toBe(false);
    expect(m.actionCenter.length).toBeGreaterThan(0);
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
      entitlements: { annual: 30, sick: 15, emergency: 6 },
      productivity,
      attSummary: { present: 0, late: 0, absent: 0, total: 0 },
      notifications: [],
    });
    expect(m.actionCenter.some((a) => a.key === "all-clear")).toBe(true);
  });

  it("caps action center at five items", () => {
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
      entitlements: { annual: 30, sick: 15, emergency: 6 },
      productivity,
      attSummary: { present: 10, late: 0, absent: 0, total: 10 },
      notifications: [],
      pendingShiftRequests: 2,
      pendingExpenses: 1,
    });
    expect(m.actionCenter.length).toBeLessThanOrEqual(5);
  });

  it("exposes attendancePresentation and blockers for inconsistent attendance", () => {
    const m = buildOverviewDashboardModel({
      shiftOverview: { ...baseShiftPresentation(), attendanceInconsistent: true },
      myActiveSchedule: null,
      todayAttendanceRecord: null,
      todayAttendanceLoading: false,
      workStatusSummary: undefined,
      expiringDocs: [],
      tasks: [],
      leave: [],
      balance: { annual: 20, sick: 10, emergency: 5 },
      entitlements: { annual: 30, sick: 15, emergency: 6 },
      productivity,
      attSummary: { present: 10, late: 0, absent: 0, total: 10 },
      notifications: [],
    });
    expect(m.attendancePresentation?.state).toBe("exception_pending");
    expect(m.blockers.some((b) => b.id === "blocker-att-inconsistent")).toBe(true);
    expect(m.actionCenter.some((a) => a.key === "att-inconsistent")).toBe(false);
    expect(m.attentionItems.some((a) => a.signalKey === "att-inconsistent")).toBe(false);
  });

  it("does not duplicate top action signals in heads-up chips", () => {
    const m = buildOverviewDashboardModel({
      shiftOverview: baseShiftPresentation(),
      myActiveSchedule: null,
      todayAttendanceRecord: null,
      workStatusSummary: undefined,
      expiringDocs: [],
      tasks: [{ id: 1, title: "Late", status: "pending", priority: "medium", dueDate: "2020-01-01" }],
      leave: [],
      balance: { annual: 20, sick: 10, emergency: 5 },
      entitlements: { annual: 30, sick: 15, emergency: 6 },
      productivity,
      attSummary: { present: 10, late: 0, absent: 0, total: 10 },
      notifications: [],
    });
    expect(m.actionCenter.some((a) => a.key === "tasks-overdue")).toBe(true);
    expect(m.attentionItems.some((a) => a.signalKey === "tasks-overdue")).toBe(false);
  });

  it("caps heads-up items after classification", () => {
    const m = buildOverviewDashboardModel({
      shiftOverview: { ...baseShiftPresentation(), showMissedActiveWarning: true },
      myActiveSchedule: {
        isHoliday: false,
        schedule: {},
        shift: { name: "Day", startTime: "09:00", endTime: "17:00" },
        isWorkingDay: true,
        hasSchedule: true,
      },
      todayAttendanceRecord: null,
      workStatusSummary: undefined,
      expiringDocs: [{ id: 1, expiresAt: new Date(2030, 0, 1).toISOString() }],
      tasks: [
        { id: 1, title: "A", status: "blocked", priority: "medium", dueDate: "2026-05-01" },
        { id: 2, title: "B", status: "pending", priority: "medium", dueDate: new Date(2026, 3, 10).toISOString() },
      ],
      myTraining: [{ trainingStatus: "overdue" }],
      mySelfReviews: [{ reviewStatus: "draft" }],
      leave: [],
      balance: { annual: 20, sick: 10, emergency: 5 },
      entitlements: { annual: 30, sick: 15, emergency: 6 },
      productivity,
      attSummary: { present: 10, late: 0, absent: 0, total: 10 },
      notifications: [],
    });
    expect(m.attentionItems.length).toBeLessThanOrEqual(4);
  });
});
