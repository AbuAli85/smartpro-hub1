/**
 * Attendance client approval lifecycle hooks (Phase 12B).
 *
 * onClientApprovalComplete is called after a batch transitions to approved state
 * (internal HR approve or public client-portal token approve).
 *
 * Phase 12B: creates one draft AttendanceBillingCandidate per approved batch for
 * finance review. Does NOT issue a final invoice or send anything to the client.
 *
 * Both call sites wrap this in `.catch(() => {})` so any failure here will
 * never roll back or fail the approval response.
 */

import { eq, and } from "drizzle-orm";
import { requireDb } from "../db.client";
import {
  attendanceClientApprovalBatches,
  attendanceClientApprovalItems,
  attendanceBillingCandidates,
  type AttendanceBillingLineItem,
} from "../../drizzle/schema";

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
 * Behaviour:
 *  1. Loads batch and verifies it is still approved (guard against race conditions).
 *  2. Idempotency: if a billing candidate already exists for this batch, returns.
 *  3. Loads all items and filters to approved-only via getBillableApprovalItems().
 *  4. If no billable items, logs and returns without creating an artifact.
 *  5. Builds billing lines from each item's dailyStateJson snapshot.
 *     - If dailyStateJson is null (pre-Phase-12A item), line is included with
 *       snapshotMissing=true so finance can review it manually. Creation is NOT
 *       blocked because blocking would prevent old batches from ever getting a
 *       billing candidate. The snapshotMissingCount field flags the issue.
 *  6. Inserts one AttendanceBillingCandidate with status="draft".
 *
 * No final invoice is created. No client notification is sent.
 */
export async function onClientApprovalComplete(
  params: ClientApprovalCompleteParams,
): Promise<void> {
  const { batchId, companyId, source } = params;

  const db = await requireDb().catch(() => null);
  if (!db) {
    console.log(`[billing] db unavailable — skipping billing candidate for batch ${batchId}`);
    return;
  }

  // Load and verify batch is approved
  const batchRows = await db
    .select()
    .from(attendanceClientApprovalBatches)
    .where(
      and(
        eq(attendanceClientApprovalBatches.id, batchId),
        eq(attendanceClientApprovalBatches.companyId, companyId),
      ),
    )
    .limit(1);
  const batch = batchRows[0];
  if (!batch || batch.status !== "approved") {
    console.log(
      `[billing] skip batch ${batchId}: not in approved state (status=${batch?.status ?? "missing"})`,
    );
    return;
  }

  // Idempotency: one candidate per batch
  const existingRows = await db
    .select({ id: attendanceBillingCandidates.id })
    .from(attendanceBillingCandidates)
    .where(eq(attendanceBillingCandidates.batchId, batchId))
    .limit(1);
  if (existingRows.length > 0) {
    console.log(
      `[billing] skip batch ${batchId}: billing candidate already exists (id=${existingRows[0].id})`,
    );
    return;
  }

  // Load all items for this batch
  const items = await db
    .select()
    .from(attendanceClientApprovalItems)
    .where(eq(attendanceClientApprovalItems.batchId, batchId));

  // Phase 12A policy: only approved items are billable; disputed items stay out
  const billable = getBillableApprovalItems(items);

  if (billable.length === 0) {
    console.log(
      `[billing] skip batch ${batchId}: no billable items (total=${items.length}, disputed/pending excluded)`,
    );
    return;
  }

  // Build billing lines from immutable dailyStateJson snapshots
  let totalDurationMinutes = 0;
  let snapshotMissingCount = 0;
  const billingLines: AttendanceBillingLineItem[] = [];

  for (const item of billable) {
    if (!item.dailyStateJson) {
      // Item predates Phase 12A — no snapshot available. Include with flag for finance review.
      snapshotMissingCount++;
      billingLines.push({
        itemId: item.id,
        employeeId: item.employeeId,
        attendanceDate: item.attendanceDate,
        attendanceSessionId: item.attendanceSessionId ?? null,
        attendanceRecordId: item.attendanceRecordId ?? null,
        employeeDisplayName: null,
        checkInAt: null,
        checkOutAt: null,
        durationMinutes: null,
        sessionStatus: null,
        siteId: null,
        snapshotMissing: true,
        snapshotWarning:
          "dailyStateJson was null — item was created before Phase 12A snapshot population",
      });
      continue;
    }

    const snap = item.dailyStateJson;
    const dur = typeof snap.durationMinutes === "number" ? snap.durationMinutes : null;
    if (dur != null) totalDurationMinutes += dur;

    billingLines.push({
      itemId: item.id,
      employeeId: item.employeeId,
      attendanceDate: item.attendanceDate,
      attendanceSessionId: item.attendanceSessionId ?? null,
      attendanceRecordId: item.attendanceRecordId ?? null,
      employeeDisplayName:
        typeof snap.employeeDisplayName === "string" ? snap.employeeDisplayName : null,
      checkInAt: typeof snap.checkInAt === "string" ? snap.checkInAt : null,
      checkOutAt: typeof snap.checkOutAt === "string" ? snap.checkOutAt : null,
      durationMinutes: dur,
      sessionStatus: typeof snap.sessionStatus === "string" ? snap.sessionStatus : null,
      siteId: typeof snap.siteId === "number" ? snap.siteId : null,
    });
  }

  await db.insert(attendanceBillingCandidates).values({
    batchId,
    companyId,
    clientCompanyId: batch.clientCompanyId ?? null,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    source,
    status: "draft",
    approvedItemCount: billable.length,
    snapshotMissingCount,
    totalDurationMinutes: totalDurationMinutes > 0 ? totalDurationMinutes : null,
    billingLinesJson: billingLines,
  });

  console.log(
    `[billing] draft candidate created batch=${batchId} lines=${billingLines.length} durationMin=${totalDurationMinutes} snapshotMissing=${snapshotMissingCount}`,
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
