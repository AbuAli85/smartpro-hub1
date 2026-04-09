export interface ControlTowerSnapshot {
  timestamp: string;

  totalItems: number;

  escalatedCount: number;
  attentionCount: number;
  breachedCount: number;

  unassignedHighCount: number;
  stuckCount: number;

  prioritiesCount: number;
}

export interface TrendComparison {
  current: ControlTowerSnapshot;
  previous: ControlTowerSnapshot | null;
}
