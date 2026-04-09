import { describe, expect, it } from "vitest";
import { buildRiskStripCards } from "./riskStripModel";

describe("buildRiskStripCards", () => {
  it("uses three semantic buckets with scan-friendly helper copy", () => {
    const cards = buildRiskStripCards({
      loading: false,
      expiredPermits: 1,
      wpsBlocked: true,
      complianceFailCount: 0,
      permitsExpiring7d: 2,
      slaBreaches: 0,
      complianceWarnCount: 3,
    });
    expect(cards).toHaveLength(3);
    expect(cards[0].label).toBe("Blocked");
    expect(cards[0].helper).toBe("Requires immediate action");
    expect(cards[1].label).toBe("At risk");
    expect(cards[1].helper).toBe("Needs attention soon");
    expect(cards[2].label).toBe("Upcoming");
    expect(cards[2].helper).toBe("Monitor and prepare");
  });
});
