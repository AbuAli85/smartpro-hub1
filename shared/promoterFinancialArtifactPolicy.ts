/**
 * Phase 3.5 — artifact generation, regeneration, and immutability rules.
 */

/** Payroll CSV may be generated only when run is approved or later (re-export allowed). */
export function mayGeneratePayrollExportCsv(status: string): boolean {
  return status === "approved" || status === "exported" || status === "paid";
}

/**
 * Repeat export: allowed; each successful upload increments `exportGeneration` in DB.
 * Latest key/url on the run row points to the most recent upload; full history lives in audit logs.
 */
export function payrollExportRegenerationPolicy(): "increment_generation_replace_pointer" {
  return "increment_generation_replace_pointer";
}

/** Issued invoice HTML is immutable; draft/review may be regenerated before issue. */
export function mayRegenerateInvoiceArtifact(status: string): boolean {
  return status === "draft" || status === "review_ready";
}

export function invoiceArtifactImmutableAfterIssue(status: string): boolean {
  return status !== "draft" && status !== "review_ready" && status !== "cancelled";
}
