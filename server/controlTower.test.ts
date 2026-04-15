import { describe, expect, it } from "vitest";
import {
  bucketKeyForDaysPastDue,
  buildExecutiveInsightNarrative,
  daysPastDue,
} from "./controlTower";

describe("daysPastDue", () => {
  it("returns 0 for future due dates", () => {
    const now = new Date(2026, 3, 7, 12, 0, 0);
    const due = new Date(2026, 3, 10);
    expect(daysPastDue(due, now)).toBe(0);
  });

  it("returns full days for past due", () => {
    const now = new Date(2026, 3, 7, 12, 0, 0);
    const due = new Date(2026, 3, 1);
    expect(daysPastDue(due, now)).toBe(6);
  });

  it("handles null due as 0", () => {
    expect(daysPastDue(null, new Date())).toBe(0);
  });
});

describe("bucketKeyForDaysPastDue", () => {
  it("buckets 0–30, 31–60, 61+", () => {
    expect(bucketKeyForDaysPastDue(0)).toBe("0_30");
    expect(bucketKeyForDaysPastDue(30)).toBe("0_30");
    expect(bucketKeyForDaysPastDue(31)).toBe("31_60");
    expect(bucketKeyForDaysPastDue(60)).toBe("31_60");
    expect(bucketKeyForDaysPastDue(61)).toBe("61_plus");
  });
});

describe("buildExecutiveInsightNarrative", () => {
  it("escalates to critical when SLA breaches exist", () => {
    const s = buildExecutiveInsightNarrative({
      revenueMtdOmr: 100,
      combinedAtRiskArOmr: 0,
      overdueArInvoiceCount: 0,
      decisionsOpen: 0,
      slaBreaches: 2,
      contractsPendingSignature: 0,
      renewalWorkflowsFailed: 0,
      rankedAccountsCount: 0,
      absentToday: 0,
      overdueCheckouts: 0,
    });
    expect(s.severity).toBe("critical");
    expect(s.bullets.some((b) => b.includes("SLA"))).toBe(true);
  });

  it("uses attention when AR at risk but no SLA", () => {
    const s = buildExecutiveInsightNarrative({
      revenueMtdOmr: 0,
      combinedAtRiskArOmr: 500,
      overdueArInvoiceCount: 3,
      decisionsOpen: 0,
      slaBreaches: 0,
      contractsPendingSignature: 0,
      renewalWorkflowsFailed: 0,
      rankedAccountsCount: 0,
      absentToday: 0,
      overdueCheckouts: 0,
    });
    expect(s.severity).toBe("attention");
    expect(s.bullets.some((b) => b.includes("aged receivables"))).toBe(true);
  });

  it("stays calm when nothing is hot", () => {
    const s = buildExecutiveInsightNarrative({
      revenueMtdOmr: 1000,
      combinedAtRiskArOmr: 0,
      overdueArInvoiceCount: 0,
      decisionsOpen: 0,
      slaBreaches: 0,
      contractsPendingSignature: 0,
      renewalWorkflowsFailed: 0,
      rankedAccountsCount: 0,
      absentToday: 0,
      overdueCheckouts: 0,
    });
    expect(s.severity).toBe("calm");
  });
});
