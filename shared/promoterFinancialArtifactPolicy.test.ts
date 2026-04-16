import { describe, expect, it } from "vitest";
import {
  invoiceArtifactImmutableAfterIssue,
  mayGeneratePayrollExportCsv,
  mayRegenerateInvoiceArtifact,
  payrollExportRegenerationPolicy,
} from "./promoterFinancialArtifactPolicy";

describe("promoterFinancialArtifactPolicy", () => {
  it("payroll export only after approval", () => {
    expect(mayGeneratePayrollExportCsv("draft")).toBe(false);
    expect(mayGeneratePayrollExportCsv("approved")).toBe(true);
    expect(mayGeneratePayrollExportCsv("exported")).toBe(true);
  });

  it("documents regeneration policy", () => {
    expect(payrollExportRegenerationPolicy()).toBe("increment_generation_replace_pointer");
  });

  it("invoice HTML mutable only in draft/review", () => {
    expect(mayRegenerateInvoiceArtifact("draft")).toBe(true);
    expect(mayRegenerateInvoiceArtifact("issued")).toBe(false);
    expect(invoiceArtifactImmutableAfterIssue("issued")).toBe(true);
  });
});
