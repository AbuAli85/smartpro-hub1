/**
 * Phase 4 — single place to enforce Command Center layer boundaries.
 * Classify once, distribute once: blockers win, top actions next, heads-up last (no overlap).
 */
import type { EmployeeBlocker } from "./employeeBlockersModel";
import { suppressedActionKeysFromBlockers } from "./employeeBlockersModel";

/** Max chips in the Heads-up strip (informative, not the action queue). */
export const COMMAND_CENTER_HEADS_UP_MAX = 4;

/** Default cap for top actions (aligned with portal home). */
export const COMMAND_CENTER_TOP_ACTIONS_DEFAULT_MAX = 5;

export type CommandCenterClassificationResult<TAction extends { key: string }, THeads extends { key: string; signalKey: string }> = {
  blockers: EmployeeBlocker[];
  topActions: TAction[];
  headsUp: THeads[];
  /** Action keys suppressed because a blocker owns that work */
  suppressedByBlockers: string[];
  /** signalKey values removed from heads-up (blocker or top action already covers them) */
  headsUpDroppedSignals: string[];
};

export type BuildCommandCenterClassificationInput<TAction extends { key: string }, THeads extends { key: string; signalKey: string }> = {
  blockers: EmployeeBlocker[];
  /** Highest priority first */
  topActionCandidates: TAction[];
  /** Priority order; duplicates by signalKey should be avoided upstream */
  headsUpCandidates: THeads[];
  maxTopActions?: number;
  maxHeadsUp?: number;
};

/**
 * Enforces: blockers > top actions > heads-up. No signal appears in two operational layers.
 * Utility sections are not built here — they must not re-introduce these signals (caller contract).
 */
export function buildCommandCenterClassification<TAction extends { key: string }, THeads extends { key: string; signalKey: string }>(
  input: BuildCommandCenterClassificationInput<TAction, THeads>,
): CommandCenterClassificationResult<TAction, THeads> {
  const maxTop = input.maxTopActions ?? COMMAND_CENTER_TOP_ACTIONS_DEFAULT_MAX;
  const maxHeads = input.maxHeadsUp ?? COMMAND_CENTER_HEADS_UP_MAX;
  const blockers = input.blockers;
  const suppressed = suppressedActionKeysFromBlockers(blockers);
  const suppressedByBlockers = [...suppressed];

  const topActions: TAction[] = [];
  const seenTop = new Set<string>();
  for (const item of input.topActionCandidates) {
    if (suppressed.has(item.key)) continue;
    if (seenTop.has(item.key)) continue;
    seenTop.add(item.key);
    topActions.push(item);
    if (topActions.length >= maxTop) break;
  }

  const topKeys = new Set(topActions.map((t) => t.key));
  const headsUpDroppedSignals: string[] = [];
  const headsUp: THeads[] = [];
  const seenSignals = new Set<string>();

  for (const h of input.headsUpCandidates) {
    if (headsUp.length >= maxHeads) break;
    const sig = h.signalKey;
    if (suppressed.has(sig)) {
      headsUpDroppedSignals.push(sig);
      continue;
    }
    if (topKeys.has(sig)) {
      headsUpDroppedSignals.push(sig);
      continue;
    }
    if (seenSignals.has(sig)) continue;
    seenSignals.add(sig);
    headsUp.push(h);
  }

  return {
    blockers,
    topActions,
    headsUp,
    suppressedByBlockers,
    headsUpDroppedSignals,
  };
}

/** Avoid duplicating document blockers with the Documents shortcut chip. */
export function shouldShowDocumentsShortcutInHeadsUp(expiringCount: number, blockers: EmployeeBlocker[]): boolean {
  if (expiringCount === 0) return false;
  return !blockers.some((b) => b.id === "blocker-docs-expired" || b.id === "blocker-docs-soon");
}

/** Compliance strip only when it is not already a blocker card (urgent compliance). */
export function shouldShowComplianceHeadsUpStrip(
  overallStatus: string | null | undefined,
  blockers: EmployeeBlocker[],
): boolean {
  if (overallStatus !== "urgent" && overallStatus !== "needs_attention") return false;
  if (overallStatus === "urgent" && blockers.some((b) => b.id === "blocker-work-urgent")) return false;
  return true;
}
