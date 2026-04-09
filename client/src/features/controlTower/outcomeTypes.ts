import type { EscalationLevel, SlaState } from "./escalationTypes";

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
