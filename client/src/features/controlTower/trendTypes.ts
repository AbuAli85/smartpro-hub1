import type { SnapshotItemRef } from "./outcomeTypes";

export interface ControlTowerSnapshot {
  timestamp: string;

  totalItems: number;

  escalatedCount: number;
  attentionCount: number;
  breachedCount: number;

  unassignedHighCount: number;
  stuckCount: number;

  prioritiesCount: number;

  /** Present for snapshots written after P6; omitted in older localStorage payloads */
  itemRefs?: SnapshotItemRef[];
}

export interface TrendComparison {
  current: ControlTowerSnapshot;
  previous: ControlTowerSnapshot | null;
}
