/**
 * Phase 10A — Attendance Client Approval state machine.
 *
 * Pure shared logic: no DB, no tRPC, no React.
 * Used by the server router (mutations + list procedures) and by future
 * client portal procedures (Phase 10B).
 *
 * Batch lifecycle:
 *   draft → submitted → approved
 *                    ↘ rejected
 *   (any non-terminal) → cancelled
 *
 * Item lifecycle (within a batch):
 *   pending → approved | rejected | disputed
 */

// ─── Status enums ─────────────────────────────────────────────────────────────

export const BATCH_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const ITEM_STATUSES = ["pending", "approved", "rejected", "disputed"] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

// ─── Transition guards ────────────────────────────────────────────────────────

/** draft → submitted */
export function canSubmitBatch(status: BatchStatus): boolean {
  return status === "draft";
}

/** submitted → approved */
export function canApproveBatch(status: BatchStatus): boolean {
  return status === "submitted";
}

/** submitted → rejected */
export function canRejectBatch(status: BatchStatus): boolean {
  return status === "submitted";
}

/** Any non-terminal status → cancelled */
export function canCancelBatch(status: BatchStatus): boolean {
  return status === "draft" || status === "submitted";
}

/** Validates whether a batch-level transition is allowed. */
export function validateBatchTransition(
  from: BatchStatus,
  to: BatchStatus,
): { allowed: boolean; reason?: string } {
  if (to === "submitted" && !canSubmitBatch(from)) {
    return { allowed: false, reason: `Cannot submit a batch with status '${from}'.` };
  }
  if (to === "approved" && !canApproveBatch(from)) {
    return { allowed: false, reason: `Cannot approve a batch with status '${from}'.` };
  }
  if (to === "rejected" && !canRejectBatch(from)) {
    return { allowed: false, reason: `Cannot reject a batch with status '${from}'.` };
  }
  if (to === "cancelled" && !canCancelBatch(from)) {
    return { allowed: false, reason: `Cannot cancel a batch with status '${from}'.` };
  }
  return { allowed: true };
}

// ─── Item aggregation ─────────────────────────────────────────────────────────

export interface ItemStatusCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  disputed: number;
}

/** Counts item statuses for display / assertion. */
export function countItemStatuses(items: { status: ItemStatus }[]): ItemStatusCounts {
  const counts: ItemStatusCounts = { total: items.length, pending: 0, approved: 0, rejected: 0, disputed: 0 };
  for (const item of items) {
    counts[item.status]++;
  }
  return counts;
}

/**
 * Derives an aggregate batch status from its items.
 * Used for read-side display rather than for write-side transitions.
 *
 * Rules:
 *  - If any item is disputed → "attention_disputed"
 *  - If any item is rejected → "has_rejections"
 *  - If all items are approved → "all_approved"
 *  - Otherwise → "partial"
 */
export type ItemAggregateResult = "all_approved" | "has_rejections" | "attention_disputed" | "partial" | "empty";

export function aggregateBatchStatusFromItems(items: { status: ItemStatus }[]): ItemAggregateResult {
  if (items.length === 0) return "empty";
  const counts = countItemStatuses(items);
  if (counts.disputed > 0) return "attention_disputed";
  if (counts.rejected > 0) return "has_rejections";
  if (counts.approved === counts.total) return "all_approved";
  return "partial";
}

// ─── clientApprovalStatus helper for readiness output ────────────────────────

/**
 * Translates a batch + item aggregate into a readiness-style status token
 * that can be appended to daily/reconciliation output without blocking payroll.
 */
export type ClientApprovalReadinessStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected"
  | "disputed";

export function deriveClientApprovalReadiness(
  batchStatus: BatchStatus | null | undefined,
  itemAggregate: ItemAggregateResult | null | undefined,
): ClientApprovalReadinessStatus {
  if (!batchStatus) return "not_required";
  if (batchStatus === "cancelled") return "not_required";
  if (batchStatus === "draft" || batchStatus === "submitted") {
    if (itemAggregate === "attention_disputed") return "disputed";
    if (itemAggregate === "has_rejections") return "rejected";
    return "pending";
  }
  if (batchStatus === "approved") return "approved";
  if (batchStatus === "rejected") return "rejected";
  return "not_required";
}
