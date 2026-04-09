export type ControlTowerDomain =
  | "payroll"
  | "workforce"
  | "contracts"
  | "hr"
  | "compliance"
  | "operations"
  | "general";

export interface DomainNarrativeSummary {
  domain: ControlTowerDomain;

  currentCount: number;
  previousCount: number | null;

  escalatedCount: number;
  breachedCount: number;
  stuckCount: number;
  unassignedHighCount: number;

  escalationsAdded: number;
  escalationsCleared: number;

  breachesAdded: number;
  breachesRecovered: number;

  ownershipGapsClosed: number;
  ownershipGapsAdded: number;

  netChange: number | null;
}
