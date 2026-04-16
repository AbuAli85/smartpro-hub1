import { describe, expect, it } from "vitest";
import { promoterFinancialOpsRouter } from "./promoterFinancialOps";

/**
 * Regression: `createInvoicesFromStaging` once referenced undefined `ackInput` at module load,
 * crashing Node before the server could bind. Importing the router must not throw.
 */
describe("promoterFinancialOps router module", () => {
  it("exports a router (construction runs at import)", () => {
    expect(promoterFinancialOpsRouter).toBeDefined();
  });
});
