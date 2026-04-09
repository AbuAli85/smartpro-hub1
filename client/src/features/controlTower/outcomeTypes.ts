import type { EscalationLevel, SlaState } from "./escalationTypes";
import type { ControlTowerDomain } from "./domainNarrativeTypes";

/**
 * Minimal per-row identity for outcome diffing — no titles or sensitive text.
 */
export interface SnapshotItemRef {
  id: string;
  escalationLevel?: EscalationLevel;
  slaState?: SlaState;
  assigned?: boolean;
  /** High/critical unassigned gap (matches execution.needsOwner). */
  needsOwner?: boolean;
  /** Set on new snapshots (P7); omitted in older localStorage payloads */
  domain?: ControlTowerDomain;
}

export interface ControlTowerOutcomeSummary {
  newItemsCount: number;
  resolvedItemsCount: number;

  escalationsClearedCount: number;
  escalationsAddedCount: number;

  breachesRecoveredCount: number;
  breachesAddedCount: number;

  ownershipGapsClosedCount: number;
  ownershipGapsAddedCount: number;
}
