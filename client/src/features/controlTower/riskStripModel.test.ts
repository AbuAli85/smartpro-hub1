import { describe, expect, it } from "vitest";
import { buildRiskStripCards } from "./riskStripModel";

const BASE = {
  loading: false,
  expiredPermits: 0,
  wpsBlocked: false,
  complianceFailCount: 0,
  permitsExpiring7d: 0,
  slaBreaches: 0,
  complianceWarnCount: 0,
  openSignalsBySeverity: null,
} as const;

describe("buildRiskStripCards", () => {
  it("uses three semantic buckets with scan-friendly helper copy", () => {
    const cards = buildRiskStripCards({
      ...BASE,
      expiredPermits: 1,
      wpsBlocked: true,
      permitsExpiring7d: 2,
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

  it("null openSignalsBySeverity → existing compliance-only behavior unchanged", () => {
    const cards = buildRiskStripCards({
      ...BASE,
      expiredPermits: 1,
      wpsBlocked: true,
      complianceFailCount: 2,
      permitsExpiring7d: 3,
      slaBreaches: 1,
      complianceWarnCount: 4,
      openSignalsBySeverity: null,
    });
    expect(cards[0].count).toBe(1 + 1 + 2); // expired + wps + failCount
    expect(cards[1].count).toBe(3 + 1); // expiring7d + slaBreaches
    expect(cards[2].count).toBe(4); // warnCount only
  });

  it("{medium:1} → Upcoming = 1 even with zero compliance inputs (screenshot bug)", () => {
    const cards = buildRiskStripCards({
      ...BASE,
      openSignalsBySeverity: { critical: 0, high: 0, medium: 1, low: 0 },
    });
    expect(cards[0].count).toBe(0);
    expect(cards[1].count).toBe(0);
    expect(cards[2].count).toBe(1);
  });

  it("{critical:2, high:1, medium:0, low:5} → Blocked +=2, At risk +=1, Upcoming +=0", () => {
    const cards = buildRiskStripCards({
      ...BASE,
      openSignalsBySeverity: { critical: 2, high: 1, medium: 0, low: 5 },
    });
    expect(cards[0].count).toBe(2);
    expect(cards[1].count).toBe(1);
    expect(cards[2].count).toBe(0);
  });

  it("low severity signals do not feed any strip tier", () => {
    const cards = buildRiskStripCards({
      ...BASE,
      openSignalsBySeverity: { critical: 0, high: 0, medium: 0, low: 99 },
    });
    expect(cards[0].count).toBe(0);
    expect(cards[1].count).toBe(0);
    expect(cards[2].count).toBe(0);
  });

  it("signals combine with compliance inputs correctly", () => {
    const cards = buildRiskStripCards({
      ...BASE,
      expiredPermits: 1,
      wpsBlocked: true,
      complianceFailCount: 1,
      permitsExpiring7d: 2,
      slaBreaches: 1,
      complianceWarnCount: 3,
      openSignalsBySeverity: { critical: 2, high: 1, medium: 1, low: 5 },
    });
    expect(cards[0].count).toBe(1 + 1 + 1 + 2); // expired + wps + fail + critical
    expect(cards[1].count).toBe(2 + 1 + 1); // expiring7d + sla + high
    expect(cards[2].count).toBe(3 + 1); // warn + medium
  });

  it("loading state hides counts regardless of signal inputs", () => {
    const cards = buildRiskStripCards({
      ...BASE,
      loading: true,
      openSignalsBySeverity: { critical: 5, high: 5, medium: 5, low: 5 },
    });
    expect(cards[0].count).toBeNull();
    expect(cards[1].count).toBeNull();
    expect(cards[2].count).toBeNull();
  });
});
