/**
 * Pure SANAD daily-queue signal detection (Option C MVP — P1).
 * No DB, no tRPC, no Control Tower. Inputs mirror `listCenters`-style snapshots;
 * office/roster booleans may be precomputed on the server for SQL-heavy presets.
 *
 * @see docs/sanad/SANAD_INTELLIGENCE_ENGINE_DESIGN_SPEC.md v1.1 §4–§5.6
 */

import { parseSanadCentrePipelineStatus, type SanadCentrePipelineStatus } from "./sanadCentresPipeline";

/** Mirrors `STALE_LEAD_DAYS` in admin directory UX; keep in sync when changing heuristics. */
export const STALE_LEAD_DAYS = 14;

/** Default cap per spec §6.2 (server may override). */
export const SANAD_QUEUE_DEFAULT_CAP = 15;

export const SANAD_QUEUE_SIGNAL_KEYS = [
  "SANAD_UNASSIGNED_PIPELINE",
  "SANAD_OVERDUE_FOLLOWUP",
  "SANAD_DUE_TODAY",
  "SANAD_STALE_CONTACT",
  "SANAD_INVITED_NO_ACCOUNT",
  "SANAD_LINKED_NOT_ACTIVATED",
  "SANAD_STUCK_ONBOARDING",
  "SANAD_LICENSED_NO_OFFICE",
  "SANAD_ACTIVATED_UNLISTED",
  "SANAD_LISTED_NO_CATALOGUE",
  "SANAD_SOLO_OWNER_ROSTER",
  "SANAD_NO_PHONE",
  "SANAD_PHONE_NO_REPLY_EMAIL",
  "SANAD_RECORD_QUALITY",
] as const;

export type SanadQueueSignalKey = (typeof SANAD_QUEUE_SIGNAL_KEYS)[number];

/** MVP bands per spec §5.3 — avoid false “critical”; only important vs watch here. */
export type SanadQueueSignalBand = "important" | "watch";

export interface SanadQueueCenterSnapshot {
  centerId: number;
  /** Pipeline `is_archived` (0/1) or boolean */
  isArchived?: boolean | number | null;
  contactNumber?: string | null;
  pipelineStatus?: string | null;
  ownerUserId?: number | null;
  nextActionDueAt?: Date | string | null;
  lastContactedAt?: Date | string | null;
  inviteSentAt?: Date | string | null;
  registeredUserId?: number | null;
  linkedSanadOfficeId?: number | null;
  onboardingStatus?: string | null;
  surveyOutreachReplyEmail?: string | null;
  isInvalid?: boolean | number | null;
  isDuplicate?: boolean | number | null;
  /** Known linked office: public listed flag (`false` = unlisted). Omit/`null` = unknown → no signal. */
  officeIsPublicListed?: boolean | null;
  /** Known: office has ≥1 active catalogue row. `false` with public listed → hygiene signal. */
  officeHasActiveCatalogue?: boolean | null;
  /** Server SQL preset `solo_owner_roster_only`; omit/`null` = unknown → no signal. */
  rosterIsSoloOwnerOnly?: boolean | null;
}

export interface SanadDetectedSignal {
  key: SanadQueueSignalKey;
  band: SanadQueueSignalBand;
  /** Normalized 0–100 for ordering / future UI (spec §5.2). */
  score: number;
}

const STUCK_ONBOARDING = new Set(["intake", "documentation", "licensing_review", "blocked"]);

function isArchivedSnap(v: SanadQueueCenterSnapshot["isArchived"]): boolean {
  return v === true || v === 1;
}

function truthy01(v: boolean | number | null | undefined): boolean {
  return v === true || v === 1;
}

/** UTC calendar day `YYYY-MM-DD` — deterministic for unit tests; align server `now` when comparing to DB dates. */
export function utcDayId(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  const x = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
}

function pipelineStage(s: SanadQueueCenterSnapshot): SanadCentrePipelineStatus {
  return parseSanadCentrePipelineStatus(s.pipelineStatus) ?? "imported";
}

/** Stages that still benefit from pipeline owner assignment (spec §4 `SANAD_UNASSIGNED_PIPELINE`). */
function isTerminalForUnassignedPipeline(status: SanadCentrePipelineStatus): boolean {
  return status === "active";
}

export function isLeadStaleForQueue(
  snapshot: Pick<SanadQueueCenterSnapshot, "lastContactedAt" | "pipelineStatus">,
  referenceTime: Date,
): boolean {
  if (!snapshot.lastContactedAt) return false;
  const st = (snapshot.pipelineStatus ?? "imported") as string;
  if (st === "active" || st === "registered") return false;
  const ms = referenceTime.getTime() - new Date(snapshot.lastContactedAt).getTime();
  return ms > STALE_LEAD_DAYS * 86_400_000;
}

/** Per-key ordering for primary pick (spec §5.6): higher wins before score, then key ASC. */
export function getSanadSignalDedupeTier(key: SanadQueueSignalKey): number {
  const order: Record<SanadQueueSignalKey, number> = {
    SANAD_OVERDUE_FOLLOWUP: 1000,
    SANAD_STUCK_ONBOARDING: 990,
    SANAD_LICENSED_NO_OFFICE: 980,
    SANAD_UNASSIGNED_PIPELINE: 970,
    SANAD_INVITED_NO_ACCOUNT: 960,
    SANAD_DUE_TODAY: 950,
    SANAD_LINKED_NOT_ACTIVATED: 940,
    SANAD_STALE_CONTACT: 930,
    SANAD_ACTIVATED_UNLISTED: 920,
    SANAD_LISTED_NO_CATALOGUE: 910,
    SANAD_RECORD_QUALITY: 900,
    SANAD_SOLO_OWNER_ROSTER: 850,
    SANAD_PHONE_NO_REPLY_EMAIL: 840,
    SANAD_NO_PHONE: 830,
  };
  return order[key];
}

export const SANAD_QUEUE_SCORE_WEIGHTS = {
  wSev: 1.2,
  wUrg: 1.4,
  wOwn: 1.0,
  wAge: 0.8,
  wCoh: 0.5,
} as const;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function bandRank(b: SanadQueueSignalBand): number {
  return b === "important" ? 2 : 1;
}

/**
 * Normalized score 0–100 (spec §5.2). Tunable via {@link SANAD_QUEUE_SCORE_WEIGHTS}; deterministic for fixed inputs.
 */
export function computeSanadQueueSignalScore(
  snapshot: SanadQueueCenterSnapshot,
  key: SanadQueueSignalKey,
  referenceTime: Date,
): number {
  const nowYmd = utcDayId(referenceTime);
  const dueYmd = utcDayId(snapshot.nextActionDueAt);
  const overdue = nowYmd && dueYmd && dueYmd < nowYmd;
  const dueToday = nowYmd && dueYmd && dueYmd === nowYmd;
  const unassigned = snapshot.ownerUserId == null && !isTerminalForUnassignedPipeline(pipelineStage(snapshot));

  let sSev = 0.35;
  if (key === "SANAD_STUCK_ONBOARDING" && snapshot.onboardingStatus === "blocked") sSev = 0.95;
  else if (key === "SANAD_STUCK_ONBOARDING") sSev = 0.75;
  else if (key === "SANAD_LICENSED_NO_OFFICE") sSev = 0.7;
  else if (key === "SANAD_OVERDUE_FOLLOWUP") sSev = 0.65;
  else if (key === "SANAD_INVITED_NO_ACCOUNT") sSev = 0.55;
  else if (key === "SANAD_RECORD_QUALITY") sSev = 0.5;

  let sUrg = 0.3;
  if (overdue) sUrg = 1;
  else if (dueToday) sUrg = 0.75;
  else if (key === "SANAD_STALE_CONTACT") sUrg = 0.45;

  const sOwn = unassigned && key !== "SANAD_NO_PHONE" ? 0.85 : snapshot.ownerUserId == null ? 0.5 : 0.2;

  let sAge = 0.2;
  if (snapshot.lastContactedAt) {
    const days = (referenceTime.getTime() - new Date(snapshot.lastContactedAt).getTime()) / 86_400_000;
    sAge = clamp01(days / 30);
  }

  const { wSev, wUrg, wOwn, wAge, wCoh } = SANAD_QUEUE_SCORE_WEIGHTS;
  const raw = wSev * sSev + wUrg * sUrg + wOwn * sOwn + wAge * sAge + wCoh * 0;
  const scaled = (raw / (wSev + wUrg + wOwn + wAge + wCoh)) * 100;
  return Math.round(Math.max(0, Math.min(100, scaled)));
}

function bandForKey(key: SanadQueueSignalKey): SanadQueueSignalBand {
  switch (key) {
    case "SANAD_NO_PHONE":
    case "SANAD_PHONE_NO_REPLY_EMAIL":
    case "SANAD_SOLO_OWNER_ROSTER":
      return "watch";
    default:
      return "important";
  }
}

/**
 * All signals that apply to this centre at `referenceTime` (may overlap; use {@link pickPrimarySignal}).
 */
export function detectSignalsForCenter(
  snapshot: SanadQueueCenterSnapshot,
  referenceTime: Date,
): SanadDetectedSignal[] {
  if (isArchivedSnap(snapshot.isArchived)) return [];

  const out: SanadDetectedSignal[] = [];
  const nowYmd = utcDayId(referenceTime);
  const dueYmd = utcDayId(snapshot.nextActionDueAt);
  const hasPhone = Boolean(snapshot.contactNumber?.trim());
  const linked = snapshot.linkedSanadOfficeId != null;
  const reg = snapshot.registeredUserId != null;
  const onboard = snapshot.onboardingStatus ?? "not_started";
  const stuck = STUCK_ONBOARDING.has(onboard);

  if (snapshot.ownerUserId == null && !isTerminalForUnassignedPipeline(pipelineStage(snapshot))) {
    const k: SanadQueueSignalKey = "SANAD_UNASSIGNED_PIPELINE";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (nowYmd && dueYmd && dueYmd < nowYmd) {
    const k: SanadQueueSignalKey = "SANAD_OVERDUE_FOLLOWUP";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  } else if (nowYmd && dueYmd && dueYmd === nowYmd) {
    const k: SanadQueueSignalKey = "SANAD_DUE_TODAY";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (isLeadStaleForQueue(snapshot, referenceTime)) {
    const k: SanadQueueSignalKey = "SANAD_STALE_CONTACT";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (snapshot.inviteSentAt && !reg && !linked) {
    const k: SanadQueueSignalKey = "SANAD_INVITED_NO_ACCOUNT";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (reg && !linked) {
    if (stuck) {
      const k: SanadQueueSignalKey = "SANAD_STUCK_ONBOARDING";
      out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
    } else if (onboard === "licensed") {
      const k: SanadQueueSignalKey = "SANAD_LICENSED_NO_OFFICE";
      out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
    } else {
      const k: SanadQueueSignalKey = "SANAD_LINKED_NOT_ACTIVATED";
      out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
    }
  }

  if (linked && snapshot.officeIsPublicListed === false) {
    const k: SanadQueueSignalKey = "SANAD_ACTIVATED_UNLISTED";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (linked && snapshot.officeIsPublicListed === true && snapshot.officeHasActiveCatalogue === false) {
    const k: SanadQueueSignalKey = "SANAD_LISTED_NO_CATALOGUE";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (linked && snapshot.rosterIsSoloOwnerOnly === true) {
    const k: SanadQueueSignalKey = "SANAD_SOLO_OWNER_ROSTER";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (!hasPhone) {
    const k: SanadQueueSignalKey = "SANAD_NO_PHONE";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  } else if (!linked && !Boolean(snapshot.surveyOutreachReplyEmail?.trim())) {
    const k: SanadQueueSignalKey = "SANAD_PHONE_NO_REPLY_EMAIL";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  if (truthy01(snapshot.isInvalid) || truthy01(snapshot.isDuplicate)) {
    const k: SanadQueueSignalKey = "SANAD_RECORD_QUALITY";
    out.push({ key: k, band: bandForKey(k), score: computeSanadQueueSignalScore(snapshot, k, referenceTime) });
  }

  return out;
}

/** Spec §5.6: band desc, score desc, signal key asc — implemented via dedupe tier (monotonic with intent) then score then key. */
export function compareSignalsForPrimaryPick(a: SanadDetectedSignal, b: SanadDetectedSignal): number {
  const td = getSanadSignalDedupeTier(b.key) - getSanadSignalDedupeTier(a.key);
  if (td !== 0) return td;
  const bd = bandRank(b.band) - bandRank(a.band);
  if (bd !== 0) return bd;
  if (b.score !== a.score) return b.score - a.score;
  return a.key.localeCompare(b.key);
}

export function pickPrimarySignal(candidates: SanadDetectedSignal[]): {
  primary: SanadDetectedSignal;
  secondaryKeys: SanadQueueSignalKey[];
} {
  if (candidates.length === 0) {
    throw new Error("pickPrimarySignal: empty candidates");
  }
  const sorted = [...candidates].sort(compareSignalsForPrimaryPick);
  const primary = sorted[0]!;
  const secondaryKeys = sorted.slice(1).map((c) => c.key);
  secondaryKeys.sort((x, y) => x.localeCompare(y));
  return { primary, secondaryKeys };
}
