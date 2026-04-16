import { describe, expect, it } from "vitest";
import { evaluateStagingReadiness } from "./promoterAssignmentStagingReadiness";

describe("evaluateStagingReadiness", () => {
  it("returns ready when no blockers or warnings", () => {
    expect(evaluateStagingReadiness({ blockers: [], warnings: [] })).toBe("ready");
  });

  it("returns blocked when blockers present", () => {
    expect(evaluateStagingReadiness({ blockers: ["x"], warnings: ["y"] })).toBe("blocked");
  });

  it("returns warning when only warnings", () => {
    expect(evaluateStagingReadiness({ blockers: [], warnings: ["monthly_estimate_only"] })).toBe("warning");
  });
});
