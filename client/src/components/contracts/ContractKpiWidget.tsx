/**
 * ContractKpiWidget
 *
 * Self-contained, reusable KPI widget for Promoter Contracts.
 * Owns its data fetch via `useContractKpis` — callers provide only `variant`.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  STATE MACHINE  (resolved before any variant logic runs)               │
 * │                                                                         │
 * │  loading          → skeleton grid sized to the variant                 │
 * │  permission-error → access-restricted callout (quiet for compact)      │
 * │  error            → generic error callout (quiet for compact)          │
 * │  empty            → no-contracts notice + link (varies by variant)     │
 * │  ready            → variant-specific render path (see below)           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  VARIANT BOUNDARIES  (ready state only)                                │
 * │                                                                         │
 * │  compact   → 3 key tiles + ScopePill + ComplianceBadge + "View all"   │
 * │  stats-bar → 6-tile responsive grid + optional title row               │
 * │              (ScopePill + ComplianceBadge + "View contracts" link)     │
 * │  full      → stats-bar tiles + risk panels + company breakdown         │
 * │              ScopePill is shown as a subtle meta row above the tiles   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * META SURFACE
 * ────────────
 *   kpis.meta.scope       → "company" | "platform"  — ScopePill color + label
 *   kpis.meta.generatedAt → ISO string               — relative-time subtitle
 *   kpis.compliance.overallScore → 0-100             — ComplianceBadge color
 *
 * CACHE / INVALIDATION
 * ────────────────────
 * React Query deduplicates concurrent calls — mounting this widget alongside
 * another `useContractKpis` consumer on the same page issues only one request.
 *
 * After a mutation that changes contract data:
 *   const utils = trpc.useUtils();
 *   void utils.contractManagement.kpis.invalidate();
 */

import React from "react";
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
  Globe,
  Lock,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import { useContractKpis, type ContractKpisData } from "@/hooks/useContractKpis";

// ─── Public API ───────────────────────────────────────────────────────────────

export type ContractKpiVariant = "compact" | "stats-bar" | "full";

export interface ContractKpiWidgetProps {
  /**
   * Controls how much detail is rendered.
   * Default: "stats-bar"
   */
  variant?: ContractKpiVariant;
  /** Extra classes applied to the outermost wrapper div. */
  className?: string;
  /**
   * Render a title row with scope label, compliance badge, and link.
   * Applies to "stats-bar" and "full" variants only.
   * Default: true for those variants, not applicable for "compact".
   */
  showTitle?: boolean;
}

// ─── Internal state machine ───────────────────────────────────────────────────

type WidgetState = "loading" | "permission-error" | "error" | "empty" | "ready";

function resolveState(
  isLoading: boolean,
  isError: boolean,
  isPermissionError: boolean,
  kpis: ContractKpisData | undefined,
): WidgetState {
  if (isLoading) return "loading";
  if (isError && isPermissionError) return "permission-error";
  if (isError) return "error";
  if (!kpis || kpis.totals.total === 0) return "empty";
  return "ready";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts an ISO timestamp to a human-readable relative string.
 * e.g. "updated just now", "updated 4m ago", "updated 2h ago"
 */
function fmtRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `updated ${hours}h ago`;
  return `updated ${Math.floor(hours / 24)}d ago`;
}

// ─── Shared micro-components (pure, no hooks) ─────────────────────────────────

/** Scope pill: "My company" (blue) or "Platform-wide" (purple). */
function ScopePill({
  scope,
  generatedAt,
}: {
  scope: "company" | "platform";
  generatedAt?: string;
}) {
  const isPlatform = scope === "platform";
  const pillCls = isPlatform
    ? "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-300 dark:border-purple-800"
    : "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-300 dark:border-blue-800";
  const Icon = isPlatform ? Globe : Building2;
  const label = isPlatform ? "Platform-wide" : "My company";

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${pillCls}`}
      >
        <Icon className="h-2.5 w-2.5" />
        {label}
      </span>
      {generatedAt && (
        <span className="text-[10px] text-muted-foreground leading-none">
          {fmtRelativeTime(generatedAt)}
        </span>
      )}
    </span>
  );
}

/** Compliance badge: green ≥90, amber ≥70, red <70. */
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

/** Tile definition passed to TileGrid — pure data, no logic. */
type TileDef = {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  bg: string;
  highlight?: boolean;
};

/**
 * Renders a CSS grid of stat tiles.
 * Pass the full `gridClass` string so Tailwind can detect it at build time —
 * do NOT assemble it dynamically from template literals.
 */
function TileGrid({
  tiles,
  gridClass = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
}: {
  tiles: TileDef[];
  /** Full Tailwind grid class string. Default: 6-col responsive. */
  gridClass?: string;
}) {
  return (
    <div className={`grid ${gridClass} gap-3`}>
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

// ─── Non-ready state renderers ────────────────────────────────────────────────

/**
 * Skeleton shown while data is loading.
 * `sixCol` = true → 6 boxes (stats-bar / full)
 * `sixCol` = false → 3 boxes (compact)
 */
function LoadingSkeleton({ sixCol }: { sixCol: boolean }) {
  const count = sixCol ? 6 : 3;
  const gridClass = sixCol
    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
    : "grid-cols-3";
  return (
    <div className={`grid ${gridClass} gap-3 animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[72px] rounded-xl bg-muted/60 border" />
      ))}
    </div>
  );
}

/** Permission-restricted callout — styled per variant. */
function PermissionState({ variant }: { variant: ContractKpiVariant }) {
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
        <Lock className="h-3 w-3 shrink-0" />
        <span>Access restricted</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-muted bg-muted/30 px-4 py-3">
      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
      <div>
        <p className="text-sm font-medium">Access restricted</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          You need contract management permissions to view this data.
        </p>
      </div>
    </div>
  );
}

/** Generic error callout — styled per variant. */
function ErrorState({ variant }: { variant: ContractKpiVariant }) {
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-600 py-1">
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span>Could not load contracts</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-950/20 px-4 py-3">
      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
      <div>
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          Could not load contract KPIs
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Refresh the page or try again in a moment.
        </p>
      </div>
    </div>
  );
}

/** Empty state — no contracts visible to this user. */
function EmptyState({ variant }: { variant: ContractKpiVariant }) {
  if (variant === "compact") {
    return (
      <div className="text-xs text-muted-foreground py-1">
        No contracts yet.{" "}
        <Link href="/hr/contracts">
          <span className="text-primary hover:underline cursor-pointer">
            Create one →
          </span>
        </Link>
      </div>
    );
  }
  // stats-bar and full: show a subtle row with a link
  return (
    <div className="flex items-center justify-between rounded-xl border border-dashed bg-muted/20 px-4 py-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted/40">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            No contracts visible
          </p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            No promoter contracts are associated with your company yet.
          </p>
        </div>
      </div>
      <Link href="/hr/contracts">
        <span className="text-xs text-primary hover:underline cursor-pointer whitespace-nowrap">
          Go to contracts →
        </span>
      </Link>
    </div>
  );
}

// ─── Data-driven panels (used by full variant only) ───────────────────────────

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

// ─── Ready-state variant views (pure: receive data, render nothing else) ──────

/**
 * "compact" — 3 key tiles.
 *
 * Header row:  "Promoter Contracts"   [ScopePill]  [ComplianceBadge]  [View all →]
 * Body:        3 tiles (Active / Expiring / Promoters)
 * Empty note:  inline "No contracts yet." when total = 0
 */
function CompactReady({ kpis }: { kpis: ContractKpisData }) {
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
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Promoter Contracts
          </span>
          <ScopePill
            scope={kpis.meta.scope}
            generatedAt={kpis.meta.generatedAt}
          />
        </div>
        <div className="flex items-center gap-2">
          <ComplianceBadge score={kpis.compliance.overallScore} />
          <Link href="/hr/contracts">
            <span className="text-xs text-primary hover:underline cursor-pointer">
              View all →
            </span>
          </Link>
        </div>
      </div>

      {/* Tiles */}
      <TileGrid tiles={tiles} gridClass="grid-cols-3" />
    </div>
  );
}

/**
 * "stats-bar" — 6-tile grid.
 *
 * Title row (when showTitle):
 *   [📄 icon]  "Promoter Contract KPIs"   [ScopePill]  [ComplianceBadge]  [View contracts →]
 * Subtitle:
 *   scope + relative timestamp
 * Body:
 *   6 tiles (Total / Active / Draft / Expiring / Expired / Promoters)
 */
function StatsBarReady({
  kpis,
  showTitle,
}: {
  kpis: ContractKpisData;
  showTitle: boolean;
}) {
  const tiles: TileDef[] = [
    {
      label: "Total Contracts",
      value: kpis.totals.total,
      icon: <FileText className="h-4 w-4" />,
      bg: "bg-muted/60",
    },
    {
      label: "Active",
      value: kpis.totals.active,
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      bg: kpis.totals.active > 0 ? "bg-emerald-500/8" : "bg-muted/60",
    },
    {
      label: "Draft",
      value: kpis.totals.draft,
      icon: <Building2 className="h-4 w-4 text-zinc-400" />,
      bg: "bg-muted/60",
    },
    {
      label: "Expiring ≤30d",
      value: kpis.totals.expiringIn30Days,
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      bg: kpis.totals.expiringIn30Days > 0 ? "bg-amber-500/8" : "bg-muted/60",
      highlight: kpis.totals.expiringIn30Days > 0,
    },
    {
      label: "Expired",
      value: kpis.totals.expired,
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      bg: kpis.totals.expired > 0 ? "bg-red-500/8" : "bg-muted/60",
    },
    {
      label: "Promoters Deployed",
      value: kpis.promotersDeployed,
      icon: <UserCheck className="h-4 w-4 text-blue-500" />,
      bg: "bg-blue-500/8",
    },
  ];

  return (
    <div className="space-y-3">
      {showTitle && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Promoter Contract KPIs</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ComplianceBadge score={kpis.compliance.overallScore} />
              <Link href="/hr/contracts">
                <span className="text-xs text-primary hover:underline cursor-pointer">
                  View contracts →
                </span>
              </Link>
            </div>
          </div>
          {/* Scope + timestamp subtitle */}
          <ScopePill
            scope={kpis.meta.scope}
            generatedAt={kpis.meta.generatedAt}
          />
        </div>
      )}
      <TileGrid tiles={tiles} />
    </div>
  );
}

/**
 * "full" — tiles + risk panels + company breakdown.
 *
 * Meta row:  [ScopePill + timestamp]    [ComplianceBadge]
 * Body:      6 tiles
 * Risk:      Expiring Soon panel + Missing Documents panel (when non-empty)
 * Breakdown: Contracts by client company (when >1 client)
 */
function FullReady({ kpis }: { kpis: ContractKpisData }) {
  const tiles: TileDef[] = [
    {
      label: "Total Contracts",
      value: kpis.totals.total,
      icon: <FileText className="h-4 w-4" />,
      bg: "bg-muted/60",
    },
    {
      label: "Active",
      value: kpis.totals.active,
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      bg: kpis.totals.active > 0 ? "bg-emerald-500/8" : "bg-muted/60",
    },
    {
      label: "Draft",
      value: kpis.totals.draft,
      icon: <Building2 className="h-4 w-4 text-zinc-400" />,
      bg: "bg-muted/60",
    },
    {
      label: "Expiring ≤30d",
      value: kpis.totals.expiringIn30Days,
      icon: <Clock className="h-4 w-4 text-amber-500" />,
      bg: kpis.totals.expiringIn30Days > 0 ? "bg-amber-500/8" : "bg-muted/60",
      highlight: kpis.totals.expiringIn30Days > 0,
    },
    {
      label: "Expired",
      value: kpis.totals.expired,
      icon: <AlertCircle className="h-4 w-4 text-red-500" />,
      bg: kpis.totals.expired > 0 ? "bg-red-500/8" : "bg-muted/60",
    },
    {
      label: "Promoters Deployed",
      value: kpis.promotersDeployed,
      icon: <UserCheck className="h-4 w-4 text-blue-500" />,
      bg: "bg-blue-500/8",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Scope meta row — subtle, sits above the tiles */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <ScopePill
          scope={kpis.meta.scope}
          generatedAt={kpis.meta.generatedAt}
        />
        <ComplianceBadge score={kpis.compliance.overallScore} />
      </div>

      {/* Tiles */}
      <TileGrid tiles={tiles} />

      {/* Risk panels */}
      <RiskPanel kpis={kpis} />

      {/* Company breakdown */}
      <CompanyBreakdown kpis={kpis} />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Drop-in KPI widget for Promoter Contracts.
 *
 * ```tsx
 * // Dashboard summary card
 * <ContractKpiWidget variant="compact" />
 *
 * // Admin / Reports page section
 * <ContractKpiWidget variant="stats-bar" showTitle />
 *
 * // ContractManagementPage body
 * <ContractKpiWidget variant="full" />
 * ```
 *
 * The widget handles all non-ready states (loading, error, permission error,
 * empty) internally — callers do not need to wrap it in conditionals.
 */
export function ContractKpiWidget({
  variant = "stats-bar",
  className,
  showTitle,
}: ContractKpiWidgetProps) {
  const { data: kpis, isLoading, isError, isPermissionError } = useContractKpis();

  const state = resolveState(isLoading, isError, isPermissionError, kpis);
  const resolvedShowTitle = showTitle ?? true; // explicit default: always show title unless overridden

  return (
    <div className={className}>
      {/* ── Non-ready states ────────────────────────────────────────────── */}
      {state === "loading" && (
        <LoadingSkeleton sixCol={variant !== "compact"} />
      )}
      {state === "permission-error" && <PermissionState variant={variant} />}
      {state === "error" && <ErrorState variant={variant} />}
      {state === "empty" && <EmptyState variant={variant} />}

      {/* ── Ready states — routed to variant view ───────────────────────── */}
      {state === "ready" && kpis && variant === "compact" && (
        <CompactReady kpis={kpis} />
      )}
      {state === "ready" && kpis && variant === "stats-bar" && (
        <StatsBarReady kpis={kpis} showTitle={resolvedShowTitle} />
      )}
      {state === "ready" && kpis && variant === "full" && (
        <FullReady kpis={kpis} />
      )}
    </div>
  );
}
