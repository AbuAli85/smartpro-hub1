/**
 * Attendance client approval lifecycle hooks.
 *
 * Called after a batch transitions to an approved state (internal HR approve
 * or public client-portal token approve). Currently a structured-log stub —
 * the billing integration point is reserved here for Phase 12.
 *
 * Design: keep the signature stable so callers don't need to change when the
 * implementation grows.
 */

export interface ClientApprovalCompleteParams {
  batchId: number;
  companyId: number;
  /** The internal userId who approved, or null for token-based (external) approvals. */
  approvedByUserId?: number | null;
  /** "internal" = HR/admin protected procedure; "client_portal_token" = public JWT path. */
  source: "internal" | "client_portal_token";
}

/**
 * Called when a client approval batch is fully approved (by any path).
 *
 * TODO (Phase 12): trigger invoice generation, WPS batch, or billing event here.
 * Current: structured log only so the call is traceable in production.
 *
 * Both call sites already wrap this in `.catch(() => {})` so a failure here
 * will never roll back or fail the approval response.
 */
export async function onClientApprovalComplete(
  params: ClientApprovalCompleteParams,
): Promise<void> {
  // Billing integration stub — replace this body in Phase 12.
  // The call sites (approveClientApprovalBatch, clientApproveByToken) are stable.
  const { batchId, companyId, source } = params;
  console.log(
    `[attendance] client_approval_complete batchId=${batchId} companyId=${companyId} source=${source}`,
  );
}

// ─── Disputed-item billing policy ────────────────────────────────────────────
//
// Policy (Phase 12A, established here):
//   • Items with status "approved" are billable and included in automated draft invoices.
//   • Items with status "disputed" remain disputed after batch approval — they are NOT
//     automatically resolved and must be reviewed manually by HR or finance before billing.
//   • Items with status "rejected" or "pending" are excluded from billing.
//
// Consequence: a batch can be fully approved while still containing disputed items.
// Phase 12 billing must always call getBillableApprovalItems() rather than
// querying all items, to ensure disputed items never silently appear on an invoice.

/** Minimal shape required from a client approval item to determine billing eligibility. */
export interface ApprovalItemBillabilityShape {
  status: string;
  dailyStateJson?: Record<string, unknown> | null;
}

/**
 * Returns only the items that are eligible for automated draft-invoice creation.
 * Excluded: disputed, rejected, and pending items.
 *
 * Phase 12 billing must call this before building invoice lines, not filter manually.
 */
export function getBillableApprovalItems<T extends ApprovalItemBillabilityShape>(
  items: T[],
): T[] {
  return items.filter((item) => item.status === "approved");
}
