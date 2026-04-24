/**
 * Pure unit tests for the Phase 9C daily attendance digest builder.
 *
 * No database, no tRPC, no React.
 * All DailyAttendanceState fixtures are constructed inline.
 *
 * Tests:
 *   1.  Normal day (all on-time, no issues) → severity normal
 *   2.  Payroll blocked → severity critical
 *   3.  Needs review without blockers → severity attention
 *   4.  Late / no-arrival (no blockers) → severity attention
 *   5.  topIssues groups by category
 *   6.  topIssues sort order: critical first, then high, then count desc
 *   7.  reasonCodes are deduped and sorted
 *   8.  siteBreakdown aggregates per site (>1 site)
 *   9.  Empty rows → normal digest with zero totals
 */

import { describe, expect, it } from "vitest";
import { buildAttendanceDailyDigest } from "./attendanceDailyDigest";
import type { DailyAttendanceState } from "./attendanceDailyState";

const BIZ = "2026-04-24";
const CID = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(
  overrides: Partial<DailyAttendanceState> = {},
): DailyAttendanceState {
  return {
    companyId: CID,
    employeeId: 1,
    employeeName: "Test Employee",
    attendanceDate: BIZ,
    scheduleState: "scheduled",
    siteId: 1,
    canonicalStatus: "checked_in_on_time",
    payrollReadiness: "ready",
    riskLevel: "none",
    reasonCodes: [],
    actionItems: [],
    hasOpenSession: false,
    hasOfficialRecord: false,
    hasPendingCorrection: false,
    hasPendingManualCheckin: false,
    isHoliday: false,
    isOnLeave: false,
    ...overrides,
  };
}

function makeActionItem(
  category: string,
  severity: "low" | "medium" | "high" | "critical",
  isPayrollBlocking: boolean,
  employeeId = 1,
) {
  return {
    id: `${employeeId}-${category}`,
    employeeId,
    employeeName: `Employee #${employeeId}`,
    attendanceDate: BIZ,
    status: "absent_confirmed" as const,
    payrollReadiness: "blocked_missing_checkout" as const,
    riskLevel: "high" as const,
    reasonCodes: [],
    severity,
    category: category as never,
    titleKey: `attendance.actionQueue.categories.${category}`,
    descriptionKey: `attendance.actionQueue.descriptions.${category}`,
    isPayrollBlocking,
  };
}

// ---------------------------------------------------------------------------
// 1. Normal day
// ---------------------------------------------------------------------------

describe("1. normal day — all checked in on time", () => {
  it("produces severity 'normal' and zero actionItems", () => {
    const rows = [
      makeRow({ employeeId: 1, canonicalStatus: "checked_in_on_time", payrollReadiness: "ready", reasonCodes: ["CHECKED_IN_ON_TIME"] }),
      makeRow({ employeeId: 2, canonicalStatus: "checked_in_on_time", payrollReadiness: "ready", reasonCodes: ["CHECKED_IN_ON_TIME"] }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.severity).toBe("normal");
    expect(digest.totals.payrollBlocked).toBe(0);
    expect(digest.totals.actionItems).toBe(0);
    expect(digest.totals.checkedIn).toBe(2);
    expect(digest.headlineKey).toBe("attendance.dailyDigest.headline.normal");
    expect(digest.summaryLineKey).toBe("attendance.dailyDigest.summaryLine.normal");
    expect(digest.topIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Payroll blocked → critical
// ---------------------------------------------------------------------------

describe("2. payroll blocked → severity critical", () => {
  it("produces severity 'critical' when payrollBlocked > 0", () => {
    const rows = [
      makeRow({
        employeeId: 1,
        payrollReadiness: "blocked_missing_checkout",
        actionItems: [makeActionItem("missing_checkout", "high", true, 1)],
      }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.severity).toBe("critical");
    expect(digest.totals.payrollBlocked).toBe(1);
    expect(digest.totals.missingCheckout).toBe(1);
    expect(digest.totals.employeesAffected).toBe(1);
    expect(digest.headlineKey).toBe("attendance.dailyDigest.headline.critical");
  });

  it("produces severity 'critical' when a schedule_conflict action item exists", () => {
    const rows = [
      makeRow({
        employeeId: 2,
        scheduleState: "conflict",
        payrollReadiness: "blocked_schedule_conflict",
        actionItems: [makeActionItem("schedule_conflict", "critical", true, 2)],
      }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.severity).toBe("critical");
    expect(digest.topIssues[0].category).toBe("schedule_conflict");
    expect(digest.topIssues[0].severity).toBe("critical");
  });
});

// ---------------------------------------------------------------------------
// 3. Needs review without blockers → attention
// ---------------------------------------------------------------------------

describe("3. needs_review without blockers → severity attention", () => {
  it("produces severity 'attention'", () => {
    const rows = [
      makeRow({
        employeeId: 1,
        canonicalStatus: "needs_review",
        payrollReadiness: "needs_review",
      }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.severity).toBe("attention");
    expect(digest.totals.needsReview).toBe(1);
    expect(digest.totals.payrollBlocked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Late / no-arrival → attention
// ---------------------------------------------------------------------------

describe("4. late / no-arrival (no payroll block) → severity attention", () => {
  it("produces severity 'attention' when late > 0", () => {
    const rows = [
      makeRow({
        employeeId: 1,
        canonicalStatus: "checked_in_late",
        payrollReadiness: "ready",
        riskLevel: "medium",
      }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.severity).toBe("attention");
    expect(digest.totals.late).toBe(1);
    expect(digest.totals.payrollBlocked).toBe(0);
  });

  it("produces severity 'attention' when absentOrNoArrival > 0 (late_no_arrival)", () => {
    const rows = [
      makeRow({
        employeeId: 2,
        canonicalStatus: "late_no_arrival",
        payrollReadiness: "needs_review",
        riskLevel: "high",
        actionItems: [makeActionItem("late_no_arrival", "high", false, 2)],
      }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.severity).toBe("attention");
    expect(digest.totals.absentOrNoArrival).toBe(1);
    expect(digest.totals.late).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. topIssues groups by category
// ---------------------------------------------------------------------------

describe("5. topIssues groups by category", () => {
  it("merges multiple action items of the same category into one entry", () => {
    const rows = [
      makeRow({ employeeId: 1, payrollReadiness: "blocked_missing_checkout", actionItems: [makeActionItem("missing_checkout", "high", true, 1)] }),
      makeRow({ employeeId: 2, payrollReadiness: "blocked_missing_checkout", actionItems: [makeActionItem("missing_checkout", "high", true, 2)] }),
      makeRow({ employeeId: 3, payrollReadiness: "blocked_pending_correction", actionItems: [makeActionItem("pending_correction", "high", true, 3)] }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.topIssues).toHaveLength(2);
    const missingCheckout = digest.topIssues.find((i) => i.category === "missing_checkout");
    expect(missingCheckout?.count).toBe(2);
    const pendingCorrection = digest.topIssues.find((i) => i.category === "pending_correction");
    expect(pendingCorrection?.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6. topIssues sort order
// ---------------------------------------------------------------------------

describe("6. topIssues sort order: critical → high → medium → low, then count desc", () => {
  it("places critical before high, and higher count first within same severity", () => {
    const rows = [
      makeRow({ employeeId: 1, scheduleState: "conflict", payrollReadiness: "blocked_schedule_conflict", actionItems: [makeActionItem("schedule_conflict", "critical", true, 1)] }),
      makeRow({ employeeId: 2, payrollReadiness: "blocked_missing_checkout", actionItems: [makeActionItem("missing_checkout", "high", true, 2)] }),
      makeRow({ employeeId: 3, payrollReadiness: "blocked_missing_checkout", actionItems: [makeActionItem("missing_checkout", "high", true, 3)] }),
      makeRow({ employeeId: 4, canonicalStatus: "holiday", payrollReadiness: "needs_review", actionItems: [makeActionItem("holiday_attendance", "medium", false, 4)] }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.topIssues[0].category).toBe("schedule_conflict");
    expect(digest.topIssues[0].severity).toBe("critical");
    expect(digest.topIssues[1].category).toBe("missing_checkout");
    expect(digest.topIssues[1].severity).toBe("high");
    expect(digest.topIssues[1].count).toBe(2);
    expect(digest.topIssues[2].category).toBe("holiday_attendance");
    expect(digest.topIssues[2].severity).toBe("medium");
  });

  it("sorts items with equal severity by count descending", () => {
    const rows = [
      makeRow({ employeeId: 1, actionItems: [makeActionItem("missing_checkout", "high", true, 1)] }),
      makeRow({ employeeId: 2, actionItems: [makeActionItem("missing_checkout", "high", true, 2)] }),
      makeRow({ employeeId: 3, actionItems: [makeActionItem("pending_correction", "high", true, 3)] }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.topIssues[0].category).toBe("missing_checkout");
    expect(digest.topIssues[0].count).toBe(2);
    expect(digest.topIssues[1].category).toBe("pending_correction");
    expect(digest.topIssues[1].count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. reasonCodes are deduped and sorted
// ---------------------------------------------------------------------------

describe("7. reasonCodes are deduplicated and sorted alphabetically", () => {
  it("deduplicates across rows and returns sorted array", () => {
    const rows = [
      makeRow({ employeeId: 1, reasonCodes: ["MISSING_CHECKOUT", "CHECKED_IN_LATE"] }),
      makeRow({ employeeId: 2, reasonCodes: ["CHECKED_IN_ON_TIME"] }),
      makeRow({ employeeId: 3, reasonCodes: ["MISSING_CHECKOUT", "CHECKED_IN_ON_TIME"] }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.reasonCodes).toEqual([
      "CHECKED_IN_LATE",
      "CHECKED_IN_ON_TIME",
      "MISSING_CHECKOUT",
    ]);
  });

  it("returns empty array when all rows have empty reasonCodes", () => {
    const rows = [makeRow({ employeeId: 1, reasonCodes: [] })];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.reasonCodes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. siteBreakdown aggregates per site (>1 site)
// ---------------------------------------------------------------------------

describe("8. siteBreakdown aggregates per site", () => {
  it("populates siteBreakdown when rows span >1 site, sorted by scheduled desc", () => {
    const rows = [
      makeRow({ employeeId: 1, siteId: 10, scheduleState: "scheduled", payrollReadiness: "blocked_missing_checkout", canonicalStatus: "absent_confirmed" }),
      makeRow({ employeeId: 2, siteId: 10, scheduleState: "scheduled", payrollReadiness: "ready" }),
      makeRow({ employeeId: 3, siteId: 11, scheduleState: "scheduled", payrollReadiness: "needs_review", canonicalStatus: "late_no_arrival" }),
    ];
    const siteNameMap = new Map([[10, "Main Office"], [11, "Branch"]]);
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ, siteNameMap });

    expect(digest.siteBreakdown).toBeDefined();
    expect(digest.siteBreakdown).toHaveLength(2);

    const mainOffice = digest.siteBreakdown!.find((s) => s.siteName === "Main Office")!;
    expect(mainOffice.scheduled).toBe(2);
    expect(mainOffice.payrollBlocked).toBe(1);
    expect(mainOffice.absentOrNoArrival).toBe(1);

    const branch = digest.siteBreakdown!.find((s) => s.siteName === "Branch")!;
    expect(branch.scheduled).toBe(1);
    expect(branch.needsReview).toBe(1);
    expect(branch.absentOrNoArrival).toBe(1);
  });

  it("omits siteBreakdown when all rows belong to the same site", () => {
    const rows = [
      makeRow({ employeeId: 1, siteId: 10 }),
      makeRow({ employeeId: 2, siteId: 10 }),
    ];
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ });
    expect(digest.siteBreakdown).toBeUndefined();
  });

  it("uses siteNameMap names when provided", () => {
    const rows = [
      makeRow({ employeeId: 1, siteId: 5 }),
      makeRow({ employeeId: 2, siteId: 6 }),
    ];
    const siteNameMap = new Map([[5, "HQ"], [6, "Remote Office"]]);
    const digest = buildAttendanceDailyDigest(rows, { date: BIZ, siteNameMap });
    const names = digest.siteBreakdown!.map((s) => s.siteName);
    expect(names).toContain("HQ");
    expect(names).toContain("Remote Office");
  });
});

// ---------------------------------------------------------------------------
// 9. Empty rows → normal digest with zero totals
// ---------------------------------------------------------------------------

describe("9. empty rows → normal digest with zero totals", () => {
  it("returns severity normal and all zero totals", () => {
    const digest = buildAttendanceDailyDigest([], { date: BIZ });
    expect(digest.severity).toBe("normal");
    expect(digest.totals.scheduled).toBe(0);
    expect(digest.totals.checkedIn).toBe(0);
    expect(digest.totals.payrollBlocked).toBe(0);
    expect(digest.totals.actionItems).toBe(0);
    expect(digest.totals.employeesAffected).toBe(0);
    expect(digest.topIssues).toHaveLength(0);
    expect(digest.reasonCodes).toHaveLength(0);
    expect(digest.siteBreakdown).toBeUndefined();
    expect(digest.date).toBe(BIZ);
  });
});
