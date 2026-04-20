import * as schema from "../../drizzle/schema";
import type { SanadQueueCenterSnapshot } from "@shared/sanadQueueSignals";

/**
 * DB row for daily queue (see `listSanadCenterRowsForDailyActionQueue`).
 * Explicit interface avoids circular `Awaited<ReturnType<…>>` typing.
 */
export interface SanadQueueListSourceRow {
  center: typeof schema.sanadIntelCenters.$inferSelect;
  ops: typeof schema.sanadIntelCenterOperations.$inferSelect | null;
  pipeline: typeof schema.sanadCentresPipeline.$inferSelect | null;
  pipelineOwnerName: string | null;
  pipelineOwnerEmail: string | null;
  /** 0/1 when linked office row exists; `null` when not linked or office join missing. */
  linkedOfficeIsPublicListed: number | null;
  /** 0/1 when linked office row exists; `null` when not linked. */
  linkedOfficeHasActiveCatalogue: number | null;
  /** 0/1 when linked office row exists; `null` when not linked. */
  rosterSoloOwnerOnly: number | null;
}

/**
 * Single mapping contract (P2): `SanadQueueCenterSnapshot` for `@shared/sanadQueueSignals`.
 * Office/roster optional fields are set **only** when SQL supplied non-null facts for a linked office.
 */
export function mapListCentersRowToSnapshot(row: SanadQueueListSourceRow): SanadQueueCenterSnapshot {
  const c = row.center;
  const ops = row.ops;
  const pl = row.pipeline;

  const linkedId = ops?.linkedSanadOfficeId ?? null;
  const hasLinkedOfficeFacts =
    linkedId != null &&
    row.linkedOfficeIsPublicListed !== null &&
    row.linkedOfficeHasActiveCatalogue !== null &&
    row.rosterSoloOwnerOnly !== null;

  const snap: SanadQueueCenterSnapshot = {
    centerId: c.id,
    isArchived: pl?.isArchived ?? 0,
    contactNumber: c.contactNumber,
    pipelineStatus: pl?.pipelineStatus ?? null,
    ownerUserId: pl?.ownerUserId ?? null,
    nextActionDueAt: pl?.nextActionDueAt ?? null,
    lastContactedAt: pl?.lastContactedAt ?? null,
    inviteSentAt: ops?.inviteSentAt ?? null,
    registeredUserId: ops?.registeredUserId ?? null,
    linkedSanadOfficeId: linkedId,
    onboardingStatus: ops?.onboardingStatus ?? null,
    surveyOutreachReplyEmail: ops?.surveyOutreachReplyEmail ?? null,
    isInvalid: pl?.isInvalid ?? null,
    isDuplicate: pl?.isDuplicate ?? null,
  };

  if (hasLinkedOfficeFacts) {
    snap.officeIsPublicListed = row.linkedOfficeIsPublicListed === 1;
    snap.officeHasActiveCatalogue = row.linkedOfficeHasActiveCatalogue === 1;
    snap.rosterIsSoloOwnerOnly = row.rosterSoloOwnerOnly === 1;
  }

  return snap;
}
