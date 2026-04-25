/**
 * Phase 12E/12F — centralized transition rules for attendance invoices.
 *
 * Policy:
 *  - cancel  = draft/review_ready → cancelled   (no reason required)
 *  - void    = issued/sent → cancelled           (mandatory reason, handled by router)
 *  - paid is terminal; no further transitions allowed
 *  - issued → paid allowed directly (client pays on receipt, no sent step required)
 */

export type AttendanceInvoiceStatus =
  | "draft"
  | "review_ready"
  | "issued"
  | "sent"
  | "paid"
  | "cancelled";

const ATTENDANCE_INVOICE_EDGES: Record<AttendanceInvoiceStatus, AttendanceInvoiceStatus[]> = {
  draft:        ["review_ready", "issued", "cancelled"],
  review_ready: ["issued", "cancelled"],
  issued:       ["sent", "paid", "cancelled"],
  sent:         ["paid", "cancelled"],
  paid:         [],
  cancelled:    [],
};

export function isAllowedAttendanceInvoiceTransition(
  from: AttendanceInvoiceStatus,
  to: AttendanceInvoiceStatus,
): boolean {
  return ATTENDANCE_INVOICE_EDGES[from]?.includes(to) ?? false;
}

export function assertAttendanceInvoiceTransition(
  from: AttendanceInvoiceStatus,
  to: AttendanceInvoiceStatus,
): void {
  if (!isAllowedAttendanceInvoiceTransition(from, to)) {
    throw new Error(
      `Invalid attendance invoice transition: '${from}' → '${to}'. Allowed from '${from}': [${(ATTENDANCE_INVOICE_EDGES[from] ?? []).join(", ") || "none"}].`,
    );
  }
}

/** Returns true when the invoice may be issued (draft or review_ready). */
export function canIssueAttendanceInvoice(status: AttendanceInvoiceStatus): boolean {
  return status === "draft" || status === "review_ready";
}

/** Returns true when the invoice may be cancelled without a void reason (pre-issued). */
export function canCancelAttendanceInvoice(status: AttendanceInvoiceStatus): boolean {
  return status === "draft" || status === "review_ready";
}

/** Returns true when the invoice may be voided (post-issue; requires a reason). */
export function canVoidAttendanceInvoice(status: AttendanceInvoiceStatus): boolean {
  return status === "issued" || status === "sent";
}

/** Returns true when a manual payment may be recorded against the invoice. */
export function canRecordAttendanceInvoicePayment(status: AttendanceInvoiceStatus): boolean {
  return status === "issued" || status === "sent";
}
