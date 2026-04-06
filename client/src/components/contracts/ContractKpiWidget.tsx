/**
 * ContractKpiWidget
 *
 * Self-contained, reusable KPI widget for Promoter Contracts.
 * Owns its data fetch via `useContractKpis` — callers do not need to
 * manage the query themselves.
 *
 * VARIANTS
 * ────────
 *   "compact"   — 3 key tiles + compliance badge + "View all" link.
 *                 Fits inside Dashboard cards and summary sidebars.
 *
 *   "stats-bar" — Full 6-tile grid + optional header with compliance
 *                 badge and link.  Suitable for Admin / Reports pages.
 *
 *   "full"      — Stats bar + risk panel (expiring soon / missing docs)
 *                 + contracts-by-company breakdown.
 *                 Used by ContractManagementPage as the canonical view.
 *
 * CACHE / INVALIDATION
 * ────────────────────
 * The underlying query is deduplicated by React Query — mounting this
 * widget on a page that already called `useContractKpis` elsewhere
 * does not issue a second network request.
 *
 * To trigger a refetch after a mutation:
 *   const utils = trpc.useUtils();
 *   void utils.contractManagement.kpis.invalidate();
 */

import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  FileWarning,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { useContractKpis, type ContractKpisData } from "@/hooks/useContractKpis";

// ─── Public API ──────────────────────────────────────────────────────────────

export type ContractKpiVariant = "compact" | "stats-bar" | "full";

interface ContractKpiWidgetProps {
  variant?: ContractKpiVariant;
  /** Extra classes applied to the outermost wrapper div. */
  className?: string;
  /**
   * Show a labelled header row with a compliance badge and link.
   * Defaults to `true` for "stats-bar" and "full"; `false` for "compact"
   * (compact has its own built-in header row).
   */
  showTitle?: boolean;
}

// ─── Compliance badge (shared) ───────────────────────────────────────────────

function ComplianceBadge({ score }: { score: number }) {
  const cls =
    score >= 90
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-200"
      : score >= 70
        ? "bg-amber-500/10 text-amber-700 border-amber-200"
        : "bg-red-500/10 text-red-700 border-red-200";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {score}% compliance
    </span>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function StatsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={`grid gap-3 grid-cols-${count <= 3 ? count : "2"} sm:grid-cols-${count <= 3 ? count : "3"} lg:grid-cols-${count} animate-pulse opacity-60`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[72px] rounded-xl bg-muted/60 border" />
      ))}
    </div>
  );
}

// ─── Pure tile grid ───────────────────────────────────────────────────────────

type TileDef = {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  bg: string;
  highlight?: boolean;
};

function TileGrid({ tiles, cols }: { tiles: TileDef[]; cols?: string }) {
  const gridCls =
    cols ??
    "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6";
  return (
    <div className={`grid ${gridCls} gap-3`}>
      {tiles.map((t) => (
        <div
          key={t.label}
          className={`rounded-xl border shadow-sm p-4 flex items-center gap-3 ${t.bg} ${
            t.highlight ? "border-amber-300 dark:border-amber-700" : ""
          }`}
        >
          <div className="p-2 rounded-lg bg-background/60 shrink-0">{t.icon}</div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{t.value}</p>
            <p className="text-xs text-muted-foreground leading-snug">{t.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Risk panel (expiring soon + missing docs) ────────────────────────────────

function RiskPanel({ kpis }: { kpis: ContractKpisData }) {
  if (kpis.expiringSoon.length === 0 && kpis.missingDocuments.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {kpis.expiringSoon.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-100/60 dark:bg-amber-900/20">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="font-semibold text-sm text-amber-800 dark:text-amber-300">
              Expiring Soon
            </span>
            <Badge
              variant="outline"
              className="ml-auto text-[11px] border-amber-300 text-amber-700 bg-amber-100"
            >
              {kpis.expiringSoon.length}
            </Badge>
          </div>
          <ul className="divide-y divide-amber-100 dark:divide-amber-900/50">
            {kpis.expiringSoon.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm gap-3"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/hr/contracts/${item.id}`}>
                    <span className="font-medium hover:underline cursor-pointer text-foreground truncate block">
                      {item.promoterName}
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground truncate block">
                    {item.firstPartyName}
                    {item.contractNumber ? ` · ${item.contractNumber}` : ""}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2 py-0.5 ${
                      item.daysLeft <= 7
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    <Calendar className="h-3 w-3" />
                    {item.daysLeft}d
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {item.expiryDate}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {kpis.missingDocuments.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-100/60 dark:bg-red-900/20">
            <FileWarning className="h-4 w-4 text-red-600" />
            <span className="font-semibold text-sm text-red-800 dark:text-red-300">
              Missing Documents
            </span>
            <Badge
              variant="outline"
              className="ml-auto text-[11px] border-red-300 text-red-700 bg-red-100"
            >
              {kpis.missingDocuments.length}
            </Badge>
          </div>
          <ul className="divide-y divide-red-100 dark:divide-red-900/50">
            {kpis.missingDocuments.slice(0, 8).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm gap-3"
              >
                <div className="min-w-0 flex-1">
                  <Link href={`/hr/contracts/${item.id}`}>
                    <span className="font-medium hover:underline cursor-pointer text-foreground truncate block">
                      {item.promoterName}
                    </span>
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {item.contractNumber ?? "No ref#"}
                  </span>
                </div>
                <div className="shrink-0 flex flex-wrap gap-1 justify-end max-w-[140px]">
                  {item.missingKinds.map((k) => (
                    <span
                      key={k}
                      className="text-[10px] font-medium bg-red-100 text-red-700 rounded px-1.5 py-0.5 whitespace-nowrap"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              </li>
            ))}
            {kpis.missingDocuments.length > 8 && (
              <li className="px-4 py-2 text-xs text-muted-foreground italic">
                +{kpis.missingDocuments.length - 8} more — upload documents from
                the contract detail page.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Company breakdown ────────────────────────────────────────────────────────

function CompanyBreakdown({ kpis }: { kpis: ContractKpisData }) {
  if (kpis.contractsPerCompany.length <= 1) return null;

  return (
    <div className="rounded-xl border bg-card/80 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold text-sm">Contracts by Client Company</span>
      </div>
      <div className="px-4 py-3">
        <div className="flex flex-wrap gap-3">
          {kpis.contractsPerCompany.map((co) => (
            <div
              key={co.companyId ?? co.companyName}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
            >
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate max-w-[180px]">
                {co.companyName}
              </span>
              <span className="text-muted-foreground tabular-nums">{co.total}</span>
              {co.active > 0 && (
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0">
                  {co.active} active
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Variant renderers ────────────────────────────────────────────────────────

/** "compact" — 3 key metrics for sidebar/dashboard use. */
function CompactView({ kpis, isLoading }: { kpis: ContractKpisData | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-muted/60 animate-pulse" />
        <StatsSkeleton count={3} />
      </div>
    );
  }
  if (!kpis) return null;

  const tiles: TileDef[] = [
    {
      label: "Active contracts",
      value: kpis.totals.active,
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      bg: kpis.totals.active > 0 ? "bg-emerald-500/8" : "bg-muted/60",
    },
    {
      label: "Expiring ≤30d",
      value: kpis.totals.expiringIn30Days,
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      bg: kpis.totals.expiringIn30Days > 0 ? "bg-amber-500/8" : "bg-muted/60",
      highlight: kpis.totals.expiringIn30Days > 0,
    },
    {
      label: "Promoters deployed",
      value: kpis.promotersDeployed,
      icon: <UserCheck className="h-4 w-4 text-blue-500" />,
      bg: "bg-blue-500/8",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Promoter Contracts
        </span>
        <div className="flex items-center gap-2">
          <ComplianceBadge score={kpis.compliance.overallScore} />
          <Link href="/hr/contracts">
            <span className="text-xs text-primary hover:underline cursor-pointer">
              View all →
            </span>
          </Link>
        </div>
      </div>
      <TileGrid tiles={tiles} cols="grid-cols-3" />
    </div>
  );
}

/** "stats-bar" — 6-tile grid with an optional header. */
function StatsBarView({
  kpis,
  isLoading,
  showTitle,
}: {
  kpis: ContractKpisData | undefined;
  isLoading: boolean;
  showTitle: boolean;
}) {
  const tiles: TileDef[] = [
    {
      label: "Total Contracts",
      value: kpis?.totals.total ?? "—",
      icon: <FileText className="h-4 w-4" />,
      bg: "bg-muted/60",
    },
    {
      label: "Active",
      value: kpis?.totals.active ?? "—",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      bg: kpis && kpis.totals.active > 0 ? "bg-emerald-500/8" : "bg-muted/60",
    },
    {
      label: "Draft",
      value: kpis?.totals.draft ?? "—",
      icon: <Building2 className="h-4 w-4 text-zinc-400" />,
      bg: "bg-muted/60",
    },
    {
      label: "Expiring ≤30d",
      value: kpis?.totals.expiringIn30Days ?? "—",
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      bg:
        kpis && kpis.totals.expiringIn30Days > 0
          ? "bg-amber-500/8"
          : "bg-muted/60",
      highlight: !!(kpis && kpis.totals.expiringIn30Days > 0),
    },
    {
      label: "Expired",
      value: kpis?.totals.expired ?? "—",
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      bg:
        kpis && kpis.totals.expired > 0 ? "bg-red-500/8" : "bg-muted/60",
    },
    {
      label: "Promoters Deployed",
      value: kpis?.promotersDeployed ?? "—",
      icon: <UserCheck className="h-4 w-4 text-blue-500" />,
      bg: "bg-blue-500/8",
    },
  ];

  return (
    <div className={`space-y-3 ${isLoading ? "opacity-60 animate-pulse" : ""}`}>
      {showTitle && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Promoter Contract KPIs</span>
          </div>
          <div className="flex items-center gap-2">
            {kpis && <ComplianceBadge score={kpis.compliance.overallScore} />}
            <Link href="/hr/contracts">
              <span className="text-xs text-primary hover:underline cursor-pointer">
                View contracts →
              </span>
            </Link>
          </div>
        </div>
      )}
      <TileGrid tiles={tiles} />
    </div>
  );
}

/** "full" — stats bar + risk panel + company breakdown. */
function FullView({ kpis, isLoading }: { kpis: ContractKpisData | undefined; isLoading: boolean }) {
  return (
    <div className="space-y-4">
      <StatsBarView kpis={kpis} isLoading={isLoading} showTitle={false} />
      {kpis &&
        (kpis.expiringSoon.length > 0 || kpis.missingDocuments.length > 0) && (
          <RiskPanel kpis={kpis} />
        )}
      {kpis && <CompanyBreakdown kpis={kpis} />}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Drop-in KPI widget.  Select `variant` to match the context:
 *
 * ```tsx
 * // Dashboard sidebar
 * <ContractKpiWidget variant="compact" />
 *
 * // Admin / Reports page section
 * <ContractKpiWidget variant="stats-bar" showTitle />
 *
 * // ContractManagementPage body
 * <ContractKpiWidget variant="full" />
 * ```
 */
export function ContractKpiWidget({
  variant = "stats-bar",
  className,
  showTitle,
}: ContractKpiWidgetProps) {
  const { data: kpis, isLoading } = useContractKpis();
  const resolvedShowTitle = showTitle ?? variant !== "compact";

  return (
    <div className={className}>
      {variant === "compact" && (
        <CompactView kpis={kpis} isLoading={isLoading} />
      )}
      {variant === "stats-bar" && (
        <StatsBarView kpis={kpis} isLoading={isLoading} showTitle={resolvedShowTitle} />
      )}
      {variant === "full" && (
        <FullView kpis={kpis} isLoading={isLoading} />
      )}
    </div>
  );
}
