/**
 * Promoter Assignment Lifecycle — End-to-End Vitest
 * ──────────────────────────────────────────────────
 * Tests the full lifecycle of a promoter assignment using only pure shared/
 * service functions (no real DB, no HTTP).  Each "stage" asserts the expected
 * state transitions and computed values.
 *
 * Lifecycle under test:
 *   1. DRAFT  — assignment created, temporal state = "draft"
 *   2. ACTIVE — assignment activated, temporal state = "operational"
 *   3. PAYROLL STAGING — staging row computed for the period, readiness assessed
 *   4. BILLING STAGING — billing row computed, summarizeStaging aggregation correct
 *   5. SUSPENSION — assignment suspended, temporal state = "suspended"
 *   6. COMPLETION — assignment completed, temporal state = "completed"
 */

import { describe, expect, it } from "vitest";
import {
  getAssignmentTemporalState,
  isAssignmentOperationalOnReferenceDate,
  isAssignmentFutureScheduled,
  isAssignmentEndedOnReferenceDate,
} from "../shared/promoterAssignmentTemporal";
import {
  getAssignmentPayableWindow,
  getAssignmentBillableWindow,
  countOverlapCalendarDays,
} from "../shared/promoterAssignmentPeriodHelpers";
import {
  resolvePromoterAssignmentCommercial,
  computeBillableUnits,
} from "../shared/promoterAssignmentCommercialResolution";
import {
  evaluateStagingReadiness,
} from "../shared/promoterAssignmentStagingReadiness";
import { summarizeStaging } from "./promoterAssignmentOps.service";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PERIOD_START = "2026-04-01";
const PERIOD_END   = "2026-04-30";
const REF_DATE     = "2026-04-17"; // mid-period reference date

/** A fully-specified assignment that spans the entire April period. */
const BASE_ASSIGNMENT = {
  assignmentStatus: "active" as const,
  startDate: "2026-04-01",
  endDate:   "2026-04-30",
};

// ── Stage 1: DRAFT ────────────────────────────────────────────────────────────

describe("Stage 1 — Draft", () => {
  const draft = { ...BASE_ASSIGNMENT, assignmentStatus: "draft" as const };

  it("temporal state is 'draft' regardless of dates", () => {
    expect(getAssignmentTemporalState(draft, REF_DATE)).toBe("draft");
  });

  it("is NOT operational on the reference date", () => {
    expect(isAssignmentOperationalOnReferenceDate(draft, REF_DATE)).toBe(false);
  });

  it("is NOT future-scheduled while in draft", () => {
    expect(isAssignmentFutureScheduled(draft, REF_DATE)).toBe(false);
  });
});

// ── Stage 2: ACTIVE ───────────────────────────────────────────────────────────

describe("Stage 2 — Active (operational)", () => {
  it("temporal state is 'operational' when ref date is within start/end", () => {
    expect(getAssignmentTemporalState(BASE_ASSIGNMENT, REF_DATE)).toBe("operational");
  });

  it("temporal state is 'scheduled_future' when ref date is before start", () => {
    expect(getAssignmentTemporalState(BASE_ASSIGNMENT, "2026-03-31")).toBe("scheduled_future");
  });

  it("temporal state is 'ended' when ref date is after end", () => {
    expect(getAssignmentTemporalState(BASE_ASSIGNMENT, "2026-05-01")).toBe("ended");
  });

  it("isAssignmentOperationalOnReferenceDate returns true mid-period", () => {
    expect(isAssignmentOperationalOnReferenceDate(BASE_ASSIGNMENT, REF_DATE)).toBe(true);
  });

  it("open-ended assignment (no endDate) is operational indefinitely", () => {
    const openEnded = { ...BASE_ASSIGNMENT, endDate: null };
    expect(getAssignmentTemporalState(openEnded, "2030-01-01")).toBe("operational");
  });
});

// ── Stage 3: PAYROLL STAGING ──────────────────────────────────────────────────

describe("Stage 3 — Payroll staging", () => {
  it("payable window covers full April when assignment spans full April", () => {
    const window = getAssignmentPayableWindow(PERIOD_START, PERIOD_END, BASE_ASSIGNMENT);
    expect(window).not.toBeNull();
    expect(window!.overlapStart).toBe("2026-04-01");
    expect(window!.overlapEnd).toBe("2026-04-30");
  });

  it("payable window is null for a draft assignment (no overlap)", () => {
    const draft = { ...BASE_ASSIGNMENT, assignmentStatus: "draft" as const };
    const window = getAssignmentPayableWindow(PERIOD_START, PERIOD_END, draft);
    expect(window).toBeNull();
  });

  it("payable window is clipped when assignment starts mid-period", () => {
    const midStart = { ...BASE_ASSIGNMENT, startDate: "2026-04-15" };
    const window = getAssignmentPayableWindow(PERIOD_START, PERIOD_END, midStart);
    expect(window).not.toBeNull();
    expect(window!.overlapStart).toBe("2026-04-15");
    expect(window!.overlapEnd).toBe("2026-04-30");
  });

  it("payable window is null when assignment ends before period starts", () => {
    const ended = { ...BASE_ASSIGNMENT, endDate: "2026-03-31" };
    const window = getAssignmentPayableWindow(PERIOD_START, PERIOD_END, ended);
    expect(window).toBeNull();
  });

  it("countOverlapCalendarDays returns 30 for full April", () => {
    const window = getAssignmentPayableWindow(PERIOD_START, PERIOD_END, BASE_ASSIGNMENT)!;
    expect(countOverlapCalendarDays(window)).toBe(30);
  });

  it("countOverlapCalendarDays returns 16 for Apr 15–30", () => {
    const midStart = { ...BASE_ASSIGNMENT, startDate: "2026-04-15" };
    const window = getAssignmentPayableWindow(PERIOD_START, PERIOD_END, midStart)!;
    expect(countOverlapCalendarDays(window)).toBe(16);
  });

  it("commercial resolution returns 'ready' when salary and rate are present", () => {
    const resolution = resolvePromoterAssignmentCommercial(
      {
        assignmentStatus: "active",
        billingModel: "per_month",
        billingRate: "500",
        currencyCode: "OMR",
        rateSource: "assignment_override",
        employeeSalary: "400",
      },
      { intent: "payroll" },
    );
    expect(resolution.blockers).toHaveLength(0);
    expect(resolution.payrollBasisAmount).toBe("400");
  });

  it("commercial resolution blocks when employee salary is missing", () => {
    const resolution = resolvePromoterAssignmentCommercial(
      {
        assignmentStatus: "active",
        billingModel: "per_month",
        billingRate: "500",
        currencyCode: "OMR",
        rateSource: "assignment_override",
        employeeSalary: null,
      },
      { intent: "payroll" },
    );
    expect(resolution.blockers).toContain("missing_payroll_basis");
  });

  it("evaluateStagingReadiness returns 'ready' when no blockers or warnings", () => {
    expect(evaluateStagingReadiness({ blockers: [], warnings: [] })).toBe("ready");
  });

  it("evaluateStagingReadiness returns 'blocked' when blockers present", () => {
    expect(evaluateStagingReadiness({ blockers: ["missing_payroll_basis"], warnings: [] })).toBe("blocked");
  });

  it("evaluateStagingReadiness returns 'warning' when only warnings present", () => {
    expect(evaluateStagingReadiness({ blockers: [], warnings: ["monthly_estimate_only"] })).toBe("warning");
  });
});

// ── Stage 4: BILLING STAGING + AGGREGATION ────────────────────────────────────

describe("Stage 4 — Billing staging and summarizeStaging aggregation", () => {
  it("billable window covers full April for per_month assignment", () => {
    const window = getAssignmentBillableWindow(PERIOD_START, PERIOD_END, BASE_ASSIGNMENT);
    expect(window).not.toBeNull();
    expect(window!.overlapStart).toBe("2026-04-01");
    expect(window!.overlapEnd).toBe("2026-04-30");
  });

  it("computeBillableUnits returns 1 unit for per_month full-period assignment", () => {
    const result = computeBillableUnits({
      billingModel: "per_month",
      overlapDays: 30,
      attendanceHours: null,
      monthlyMode: "flat_if_any_overlap",
      periodStartYmd: "2026-04-01",
      periodEndYmd: "2026-04-30",
    });
    expect(result.units).toBe(1);
  });

  it("computeBillableUnits returns prorated units for per_month partial-period", () => {
    // April has 30 days; 15 overlap days → 0.5 units.
    const result = computeBillableUnits({
      billingModel: "per_month",
      overlapDays: 15,
      attendanceHours: null,
      monthlyMode: "prorated_by_calendar_days",
      periodStartYmd: "2026-04-01",
      periodEndYmd: "2026-04-30",
    });
    // 15 / 30 = 0.5
    expect(result.units).toBeCloseTo(0.5);
  });

  it("computeBillableUnits returns day count for per_day billing model", () => {
    const result = computeBillableUnits({
      billingModel: "per_day",
      overlapDays: 22,
      attendanceHours: null,
    });
    expect(result.units).toBe(22);
  });

  it("summarizeStaging correctly aggregates a mixed set of staging rows", () => {
    const rows = [
      { readiness: "ready"   as const, blockers: [], warnings: [],                        billableAmount: 500 },
      { readiness: "ready"   as const, blockers: [], warnings: [],                        billableAmount: 300 },
      { readiness: "warning" as const, blockers: [], warnings: ["monthly_estimate_only"], billableAmount: 200 },
      { readiness: "blocked" as const, blockers: ["missing_billing_rate"], warnings: [],  billableAmount: null },
      { readiness: "not_applicable" as const, blockers: ["not_applicable"], warnings: [], billableAmount: null },
    ];
    const summary = summarizeStaging(rows, "billableAmount");

    expect(summary.totalRows).toBe(5);
    expect(summary.ready).toBe(2);
    expect(summary.warning).toBe(1);
    expect(summary.blocked).toBe(1);
    expect(summary.notApplicable).toBe(1);
    expect(summary.totalBillableAmount).toBe(1000); // 500 + 300 + 200 (null excluded)
    expect(summary.topBlockers[0].reason).toBe("missing_billing_rate");
    expect(summary.topWarnings[0].reason).toBe("monthly_estimate_only");
  });

  it("summarizeStaging returns zero totals for an empty input", () => {
    const summary = summarizeStaging([]);
    expect(summary.totalRows).toBe(0);
    expect(summary.ready).toBe(0);
    expect(summary.totalBillableAmount).toBe(0);
  });
});

// ── Stage 5: SUSPENSION ───────────────────────────────────────────────────────

describe("Stage 5 — Suspension", () => {
  const suspended = { ...BASE_ASSIGNMENT, assignmentStatus: "suspended" as const };

  it("temporal state is 'suspended'", () => {
    expect(getAssignmentTemporalState(suspended, REF_DATE)).toBe("suspended");
  });

  it("is NOT operational while suspended", () => {
    expect(isAssignmentOperationalOnReferenceDate(suspended, REF_DATE)).toBe(false);
  });

  it("is NOT counted as ended while suspended", () => {
    expect(isAssignmentEndedOnReferenceDate(suspended, REF_DATE)).toBe(false);
  });
});

// ── Stage 6: COMPLETION ───────────────────────────────────────────────────────

describe("Stage 6 — Completion", () => {
  const completed = { ...BASE_ASSIGNMENT, assignmentStatus: "completed" as const };

  it("temporal state is 'completed'", () => {
    expect(getAssignmentTemporalState(completed, REF_DATE)).toBe("completed");
  });

  it("isAssignmentEndedOnReferenceDate returns true for completed", () => {
    expect(isAssignmentEndedOnReferenceDate(completed, REF_DATE)).toBe(true);
  });

  it("terminated assignment also counts as ended", () => {
    const terminated = { ...BASE_ASSIGNMENT, assignmentStatus: "terminated" as const };
    expect(isAssignmentEndedOnReferenceDate(terminated, REF_DATE)).toBe(true);
  });
});
