import {
  SANAD_QUEUE_DEFAULT_CAP,
  detectSignalsForCenter,
  getSanadSignalDedupeTier,
  pickPrimarySignal,
  utcDayId,
  type SanadQueueCenterSnapshot,
  type SanadQueueSignalKey,
} from "@shared/sanadQueueSignals";

export type SanadQueueViewer = "operator" | "reviewer";

export type SanadActionQueueGeneratorRow = SanadQueueCenterSnapshot & {
  centerName: string;
  governorateLabelRaw?: string | null;
  pipelineOwnerName?: string | null;
  pipelineOwnerEmail?: string | null;
};

export type SanadDailyActionQueueItemDto = {
  id: string;
  centerId: number;
  signalKey: SanadQueueSignalKey;
  centerName: string;
  governorateLabelRaw: string | null;
  pipelineStatus: string | null;
  primaryScore: number;
  secondarySignalKeys: SanadQueueSignalKey[];
  sortScore: number;
  ownerUserId: number | null;
  ownerLabel: string | null;
  nextActionDueAtIso: string | null;
  /** Directory deep link (see `docs/sanad/SANAD_DAILY_QUEUE_DEEPLINK.md`). */
  href: string;
  viewer: SanadQueueViewer;
  /** Stable key for P3 i18n / CTA wiring. */
  recommendedActionKey: string;
  ctaVariant: "mutating" | "read_only";
};

function ownerLabelFromRow(row: SanadActionQueueGeneratorRow): string | null {
  const n = row.pipelineOwnerName?.trim();
  if (n) return n;
  const e = row.pipelineOwnerEmail?.trim();
  if (e) return e;
  return row.ownerUserId == null ? "Unassigned — SANAD pool" : null;
}

function operatorRecommendedActionKey(key: SanadQueueSignalKey): string {
  switch (key) {
    case "SANAD_UNASSIGNED_PIPELINE":
      return "assign_pipeline_owner";
    case "SANAD_OVERDUE_FOLLOWUP":
    case "SANAD_DUE_TODAY":
      return "update_follow_up";
    case "SANAD_STALE_CONTACT":
      return "record_contact_or_advance";
    case "SANAD_INVITED_NO_ACCOUNT":
      return "invite_onboarding_nudge";
    case "SANAD_LINKED_NOT_ACTIVATED":
    case "SANAD_STUCK_ONBOARDING":
    case "SANAD_LICENSED_NO_OFFICE":
      return "onboarding_escalation";
    case "SANAD_ACTIVATED_UNLISTED":
      return "listing_review";
    case "SANAD_LISTED_NO_CATALOGUE":
      return "catalogue_setup";
    case "SANAD_SOLO_OWNER_ROSTER":
      return "roster_expand";
    case "SANAD_NO_PHONE":
    case "SANAD_PHONE_NO_REPLY_EMAIL":
      return "contact_hygiene";
    case "SANAD_RECORD_QUALITY":
      return "data_quality_review";
    default:
      return "open_directory";
  }
}

function buildHref(centerId: number): string {
  return `/admin/sanad/directory?highlight=${centerId}`;
}

export type DailyQueueOwnerScope = "all" | "mine_and_unassigned";

/** Pure filter for operator queue scope (applied before scoring). */
export function filterSanadQueueRowsByOwnerScope(
  rows: SanadActionQueueGeneratorRow[],
  scope: DailyQueueOwnerScope,
  viewerUserId: number,
): SanadActionQueueGeneratorRow[] {
  if (scope === "all") return rows;
  return rows.filter((row) => row.ownerUserId == null || row.ownerUserId === viewerUserId);
}

export type GenerateSanadActionQueueOptions = {
  /** Max items after global sort (server default 15). */
  limit?: number;
  /** UTC `YYYY-MM-DD` bucket for stable ids (use `utcDayId(referenceTime)`). */
  dateBucketYmd: string;
  viewer: SanadQueueViewer;
};

/**
 * Pure queue builder: no DB, no `Date.now()`, no RBAC loading — caller passes rows + clock + viewer mode.
 * Applies per-centre primary signal, global ordering, and cap.
 */
export function generateSanadActionQueue(
  rows: SanadActionQueueGeneratorRow[],
  referenceTime: Date,
  options: GenerateSanadActionQueueOptions,
): SanadDailyActionQueueItemDto[] {
  const limit = Math.min(25, Math.max(1, options.limit ?? SANAD_QUEUE_DEFAULT_CAP));
  const viewer = options.viewer;
  const dateBucket = options.dateBucketYmd;

  const candidates: SanadDailyActionQueueItemDto[] = [];

  for (const row of rows) {
    const detected = detectSignalsForCenter(row, referenceTime);
    if (detected.length === 0) continue;

    const { primary, secondaryKeys } = pickPrimarySignal(detected);
    const tier = getSanadSignalDedupeTier(primary.key);
    const sortScore = tier * 1000 + primary.score;

    let nextDue: string | null = null;
    if (row.nextActionDueAt) {
      const d = new Date(row.nextActionDueAt as string | Date);
      nextDue = Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    const recommendedActionKey =
      viewer === "reviewer" ? "view_in_directory" : operatorRecommendedActionKey(primary.key);
    const ctaVariant: "mutating" | "read_only" = viewer === "reviewer" ? "read_only" : "mutating";

    candidates.push({
      id: `sanad:${row.centerId}:${primary.key}:${dateBucket}`,
      centerId: row.centerId,
      signalKey: primary.key,
      centerName: row.centerName,
      governorateLabelRaw: row.governorateLabelRaw ?? null,
      pipelineStatus: row.pipelineStatus ?? null,
      primaryScore: primary.score,
      secondarySignalKeys: secondaryKeys,
      sortScore,
      ownerUserId: row.ownerUserId ?? null,
      ownerLabel: ownerLabelFromRow(row),
      nextActionDueAtIso: nextDue,
      href: buildHref(row.centerId),
      viewer,
      recommendedActionKey,
      ctaVariant,
    });
  }

  candidates.sort((a, b) => {
    if (b.sortScore !== a.sortScore) return b.sortScore - a.sortScore;
    return a.centerName.localeCompare(b.centerName);
  });

  return candidates.slice(0, limit);
}
