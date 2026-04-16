import { describe, expect, it } from "vitest";
import { summarizeStaging } from "./promoterAssignmentOps.service";

describe("summarizeStaging", () => {
  it("counts ready/blocked and totals amount", () => {
    const s = summarizeStaging(
      [
        { readiness: "ready", blockers: [], billableAmount: 100 },
        { readiness: "blocked", blockers: ["x"], billableAmount: null },
      ],
      "billableAmount",
    );
    expect(s.ready).toBe(1);
    expect(s.blocked).toBe(1);
    expect(s.totalBillableAmount).toBe(100);
  });
});
