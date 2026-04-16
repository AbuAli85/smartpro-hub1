/**
 * Phase 3.5 — centralized transition rules for promoter payroll runs and invoices.
 */

export type PromoterPayrollRunStatus =
  | "draft"
  | "review_ready"
  | "approved"
  | "exported"
  | "paid"
  | "cancelled";

export type PromoterInvoiceStatus =
  | "draft"
  | "review_ready"
  | "issued"
  | "sent"
  | "partially_paid"
  | "paid"
  | "cancelled";

const PAYROLL_EDGES: Record<PromoterPayrollRunStatus, PromoterPayrollRunStatus[]> = {
  draft: ["review_ready", "approved", "cancelled"],
  review_ready: ["approved", "cancelled"],
  approved: ["exported", "paid", "cancelled"],
  exported: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

const INVOICE_EDGES: Record<PromoterInvoiceStatus, PromoterInvoiceStatus[]> = {
  draft: ["review_ready", "issued", "cancelled"],
  review_ready: ["issued", "cancelled"],
  /** `paid` allowed from issued when AR does not use a separate "sent" step (UI issues then closes). */
  issued: ["sent", "paid", "cancelled"],
  sent: ["partially_paid", "paid", "cancelled"],
  partially_paid: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function isAllowedPayrollTransition(
  from: PromoterPayrollRunStatus,
  to: PromoterPayrollRunStatus,
): boolean {
  return PAYROLL_EDGES[from]?.includes(to) ?? false;
}

export function isAllowedInvoiceTransition(
  from: PromoterInvoiceStatus,
  to: PromoterInvoiceStatus,
): boolean {
  return INVOICE_EDGES[from]?.includes(to) ?? false;
}
