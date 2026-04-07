import { describe, expect, it } from "vitest";
import { buildManagementCadenceBundle } from "./managementCadence";

const emptyInsight = { headline: "H", bullets: ["a", "b"], severity: "calm" as const };

describe("buildManagementCadenceBundle", () => {
  it("sets distinct cash amounts per window from revenue snapshot", () => {
    const bundle = buildManagementCadenceBundle({
      revenue: {
        basis: "test",
        officerProPaid: { todayOmr: 1, weekOmr: 10, monthToDateOmr: 100 },
        platformSubscriptionPaid: { todayOmr: 2, weekOmr: 20, monthToDateOmr: 200 },
        combinedPaid: { todayOmr: 3, weekOmr: 30, monthToDateOmr: 300 },
      },
      agedReceivables: {
        basis: "ar",
        officerPro: { totalOmr: 0, rowCount: 0, buckets: [] },
        platformSubscription: { totalOmr: 0, rowCount: 0, buckets: [] },
        combinedAtRiskOmr: 50,
      },
      decisionsQueue: { basis: "d", items: [], totalOpenCount: 2 },
      riskCompliance: {
        basis: "r",
        contractsPendingSignature: 0,
        contractsExpiringNext30Days: 0,
        renewalWorkflowsFailed: 0,
        renewalWorkflowsStuckPending: 0,
        employeeDocsExpiring7Days: 0,
        companyDocsExpiring30Days: 0,
        workPermitsExpiring7Days: 0,
        slaOpenBreaches: 0,
      },
      insightSummary: emptyInsight,
      clientHealthTop: [],
      delivery: { employeeTasksOverdue: 0, employeeTasksBlocked: 0 },
      overdueArInvoiceCount: 1,
      now: new Date("2026-04-07T12:00:00Z"),
    });
    expect(bundle.windows.today.cashReceivedOmr).toBe(3);
    expect(bundle.windows.this_week.cashReceivedOmr).toBe(30);
    expect(bundle.windows.this_month.cashReceivedOmr).toBe(300);
    expect(bundle.windows.today.receivablesAtRiskOmr).toBe(50);
    expect(bundle.windows.this_month.receivablesAtRiskOmr).toBe(50);
  });
});
