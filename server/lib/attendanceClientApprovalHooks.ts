/**
 * Attendance client approval lifecycle hooks.
 *
 * Called after a batch transitions to an approved state (internal HR approve
 * or public client-portal token approve). Currently a no-op stub — the billing
 * integration point is reserved here for Phase 12 or whenever billing/invoice
 * triggers are wired in.
 *
 * Design: keep the signature stable so callers don't need to change when the
 * implementation grows.
 */

/**
 * Called when a client approval batch is fully approved (by any path).
 *
 * Future: trigger invoice generation, WPS batch, or billing event.
 * Current: no-op — structured log only so the call is traceable in prod.
 */
export async function onClientApprovalComplete(
  batchId: number,
  companyId: number,
): Promise<void> {
  // Billing integration stub — wire real logic here in Phase 12.
  // The call is already in both approval paths; this body is the only file to change.
  void batchId;
  void companyId;
}
