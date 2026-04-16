import { describe, expect, it } from "vitest";
import { summarizeStaging } from "./promoterAssignmentOps.service";

describe("summarizeStaging", () => {
  it("counts ready/blocked/warning and totals amount", () => {
    const s = summarizeStaging(
      [
        { readiness: "ready", blockers: [], warnings: [], billableAmount: 100 },
        { readiness: "blocked", blockers: ["x"], warnings: [], billableAmount: null },
        { readiness: "warning", blockers: [], warnings: ["monthly_estimate_only"], billableAmount: 50 },
      ],
      "billableAmount",
    );
    expect(s.ready).toBe(1);
    expect(s.blocked).toBe(1);
    expect(s.warning).toBe(1);
    expect(s.totalBillableAmount).toBe(150);
    expect(s.topWarnings.some((w) => w.reason === "monthly_estimate_only")).toBe(true);
  });
});
