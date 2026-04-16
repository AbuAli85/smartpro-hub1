import { describe, expect, it } from "vitest";
import { isAllowedInvoiceTransition, isAllowedPayrollTransition } from "./promoterFinancialStateMachine";

describe("promoterFinancialStateMachine", () => {
  it("allows payroll draft → review_ready → approved → exported → paid", () => {
    expect(isAllowedPayrollTransition("draft", "review_ready")).toBe(true);
    expect(isAllowedPayrollTransition("review_ready", "approved")).toBe(true);
    expect(isAllowedPayrollTransition("approved", "exported")).toBe(true);
    expect(isAllowedPayrollTransition("exported", "paid")).toBe(true);
  });

  it("disallows illegal payroll regressions", () => {
    expect(isAllowedPayrollTransition("paid", "approved")).toBe(false);
    expect(isAllowedPayrollTransition("exported", "draft")).toBe(false);
  });

  it("allows invoice issued → paid when AR skips send", () => {
    expect(isAllowedInvoiceTransition("issued", "paid")).toBe(true);
  });

  it("disallows invoice paid → issued", () => {
    expect(isAllowedInvoiceTransition("paid", "issued")).toBe(false);
  });
});
