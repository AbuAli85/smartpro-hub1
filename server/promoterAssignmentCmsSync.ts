/**
 * Best-effort mirror of promoter_assignments → outsourcing_contracts (CMS).
 *
 * RULE: Assignment rows are the staffing source of truth. CMS exists for documents / legal mirror.
 * Sync failure or skip MUST NOT block assignment lifecycle (see router mutations).
 *
 * When the assignment has no end date, we do not invent placeholder expiries in CMS v1 — we skip the mirror
 * until an end date is set (or a later phase adds open-ended CMS semantics).
 */

import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { promoterAssignments } from "../drizzle/schema";

export const CMS_SYNC_SKIP_OPEN_ENDED =
  "CMS mirror skipped: open-ended assignment (no end date). Staffing truth remains on promoter_assignments.";

export type CmsSyncState = "not_required" | "pending" | "synced" | "skipped" | "failed";

export type DbLike = MySql2Database<Record<string, never>>;

export async function setPromoterAssignmentCmsSyncState(
  db: DbLike,
  assignmentId: string,
  state: CmsSyncState,
  options?: { errorMessage?: string | null },
): Promise<void> {
  const now = new Date();
  await db
    .update(promoterAssignments)
    .set({
      cmsSyncState: state,
      lastSyncError: options?.errorMessage ?? null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(promoterAssignments.id, assignmentId));
}
