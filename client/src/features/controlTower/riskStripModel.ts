import type { ControlTowerSeverity } from "@shared/controlTowerTypes";

export type RiskTier = "blocked" | "at_risk" | "upcoming";

export type RiskStripCard = {
  tier: RiskTier;
  label: string;
  count: number | null;
  /** When true, count is hidden until data resolves */
  loading: boolean;
  href: string;
  helper?: string;
  semanticClass: "blocked" | "at_risk" | "upcoming";
};

export function buildRiskStripCards(input: {
  loading: boolean;
  /** Blocked: expired permits count */
  expiredPermits: number;
  /** Blocked: WPS / payroll file not in paid state */
  wpsBlocked: boolean;
  /** Blocked: compliance checks with fail */
  complianceFailCount: number;
  /** At risk: permits expiring ≤7d */
  permitsExpiring7d: number;
  /** At risk: open SLA breaches (tenant-scoped) */
  slaBreaches: number;
  /** Upcoming: checks in warn state (non-blocking) */
  complianceWarnCount: number;
  /**
   * Open signal counts by severity from the server-authoritative CT summary.
   * null when the summary is loading or unavailable — existing behavior is preserved.
   * low severity signals are informational and do not feed the strip.
   */
  openSignalsBySeverity: Record<ControlTowerSeverity, number> | null;
}): RiskStripCard[] {
  const ld = input.loading;
  const sig = input.openSignalsBySeverity;

  const blockedScore =
    input.expiredPermits +
    (input.wpsBlocked ? 1 : 0) +
    input.complianceFailCount +
    (sig?.critical ?? 0);
  const atRiskScore = input.permitsExpiring7d + input.slaBreaches + (sig?.high ?? 0);
  const upcomingScore = input.complianceWarnCount + (sig?.medium ?? 0);

  return [
    {
      tier: "blocked",
      label: "Blocked",
      count: ld ? null : blockedScore,
      loading: ld,
      href: "/compliance",
      helper: "Requires immediate action",
      semanticClass: "blocked",
    },
    {
      tier: "at_risk",
      label: "At risk",
      count: ld ? null : atRiskScore,
      loading: ld,
      href: "/workforce/permits?status=expiring_soon",
      helper: "Needs attention soon",
      semanticClass: "at_risk",
    },
    {
      tier: "upcoming",
      label: "Upcoming",
      count: ld ? null : upcomingScore,
      loading: ld,
      href: "/compliance",
      helper: "Monitor and prepare",
      semanticClass: "upcoming",
    },
  ];
}
