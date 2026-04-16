import { describe, expect, it } from "vitest";
import { evaluatePromoterAssignmentHealth } from "./promoterAssignmentHealth";

function base() {
  return {
    assignmentStatus: "active" as const,
    startDate: "2026-01-01",
    endDate: null as string | null,
    clientSiteId: 1 as number | null,
    supervisorUserId: 2 as number | null,
    billingRate: "100.0000" as string | null,
    rateSource: "assignment_override" as string | null,
    suspensionReason: null as string | null,
    terminationReason: null as string | null,
    cmsSyncState: "synced" as string | null,
  };
}

describe("evaluatePromoterAssignmentHealth", () => {
  it("flags missing site and supervisor", () => {
    const f = evaluatePromoterAssignmentHealth(
      { ...base(), clientSiteId: null, supervisorUserId: null },
      {},
    );
    expect(f).toContain("missing_site");
    expect(f).toContain("missing_supervisor");
  });

  it("flags CMS skipped state", () => {
    const f = evaluatePromoterAssignmentHealth(
      { ...base(), cmsSyncState: "skipped" },
      {},
    );
    expect(f).toContain("cms_sync_skipped_or_blocked");
  });

  it("flags suspended without reason", () => {
    const f = evaluatePromoterAssignmentHealth(
      {
        ...base(),
        assignmentStatus: "suspended",
        suspensionReason: "",
      },
      {},
    );
    expect(f).toContain("suspended_without_reason");
  });
});
