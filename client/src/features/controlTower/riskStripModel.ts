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
}): RiskStripCard[] {
  const ld = input.loading;
  const blockedScore =
    input.expiredPermits + (input.wpsBlocked ? 1 : 0) + input.complianceFailCount;
  const atRiskScore = input.permitsExpiring7d + input.slaBreaches;

  return [
    {
      tier: "blocked",
      label: "Blocked",
      count: ld ? null : blockedScore,
      loading: ld,
      href: "/compliance",
      helper: "Expired permits, payroll/WPS blockers, failed compliance checks",
      semanticClass: "blocked",
    },
    {
      tier: "at_risk",
      label: "At risk",
      count: ld ? null : atRiskScore,
      loading: ld,
      href: "/workforce/permits?status=expiring_soon",
      helper: "Due soon (≤7d) and open SLA breaches",
      semanticClass: "at_risk",
    },
    {
      tier: "upcoming",
      label: "Watch list",
      count: ld ? null : input.complianceWarnCount,
      loading: ld,
      href: "/compliance",
      helper: "Non-blocking compliance warnings",
      semanticClass: "upcoming",
    },
  ];
}
