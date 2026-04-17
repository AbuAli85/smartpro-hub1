import React, { useMemo } from "react";
import { AlertTriangle, ArrowUpRight, RefreshCw, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type PnlSummary = RouterOutputs["financeHR"]["getPnlSummary"];
type PnlTrendPoint = RouterOutputs["financeHR"]["getPnlTrend"][number];

function formatOmr(value: number): string {
  return `OMR ${Number(value ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

function formatPercent(value: number): string {
  return `${Number(value ?? 0).toFixed(2)}%`;
}

function qualityTone(status: PnlSummary extends null ? never : NonNullable<PnlSummary>["dataQualityStatus"]) {
  if (status === "complete") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "partial") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-red-50 text-red-800 border-red-200";
}

function qualityLabel(status: PnlSummary extends null ? never : NonNullable<PnlSummary>["dataQualityStatus"]) {
  if (status === "complete") return "Complete";
  if (status === "partial") return "Partial data";
  return "Needs review";
}

function wpsScopeLabel(
  scope: PnlSummary extends null ? never : NonNullable<PnlSummary>["wpsQualityScope"],
) {
  if (scope === "period") return "Period-verified";
  if (scope === "company_fallback") return "Company fallback";
  return "No WPS evidence";
}

function wpsScopeTone(
  scope: PnlSummary extends null ? never : NonNullable<PnlSummary>["wpsQualityScope"],
) {
  if (scope === "period") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (scope === "company_fallback") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function wpsScopeHelperText(
  scope: PnlSummary extends null ? never : NonNullable<PnlSummary>["wpsQualityScope"],
): string | null {
  if (scope === "company_fallback") {
    return "Uses company-level WPS validation, not this period specifically.";
  }
  if (scope === "none") {
    return "No period-relevant WPS validation was found.";
  }
  return null;
}

function Metric({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={emphasize ? "text-base font-bold mt-1 tabular-nums" : "text-sm font-semibold mt-1 tabular-nums"}>
        {value}
      </p>
    </div>
  );
}

function MarginSparkline({ points }: { points: PnlTrendPoint[] }) {
  const values = points.map((p) => Number(p.netMarginOmr ?? 0));
  const width = 280;
  const height = 64;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const toX = (index: number) => pad + (index * (width - pad * 2)) / Math.max(values.length - 1, 1);
  const toY = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);

  const polylinePoints = values.map((v, idx) => `${toX(idx)},${toY(v)}`).join(" ");
  const trendUp = values[values.length - 1] >= values[0];
  const stroke = trendUp ? "#059669" : "#dc2626";

  return (
    <div className="rounded-lg border border-border/70 p-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Net margin trend (6m)</p>
        <Badge variant="outline" className="text-[10px]">
          {trendUp ? "Improving" : "Declining"}
        </Badge>
      </div>
      <svg
        data-testid="financial-trend-sparkline"
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-16"
        role="img"
        aria-label="Last six months net margin trend"
      >
        <polyline fill="none" stroke={stroke} strokeWidth="2.25" points={polylinePoints} />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{points[0]?.periodLabel ?? points[0]?.periodYm ?? "Start"}</span>
        <span>{points[points.length - 1]?.periodLabel ?? points[points.length - 1]?.periodYm ?? "Now"}</span>
      </div>
    </div>
  );
}

export function FinancialSummaryCard({
  companyId,
  canOpenFinanceOverview,
}: {
  companyId: number;
  canOpenFinanceOverview: boolean;
}) {
  const now = useMemo(() => new Date(), []);
  const summaryQuery = trpc.financeHR.getPnlSummary.useQuery(
    {
      companyId,
      periodYear: now.getFullYear(),
      periodMonth: now.getMonth() + 1,
    },
    { enabled: companyId > 0, staleTime: 60_000 },
  );
  const trendQuery = trpc.financeHR.getPnlTrend.useQuery(
    {
      companyId,
      months: 6,
    },
    { enabled: companyId > 0, staleTime: 60_000 },
  );

  const isLoading = summaryQuery.isLoading || trendQuery.isLoading;
  const hasError = Boolean(summaryQuery.error || trendQuery.error);
  const summary = summaryQuery.data;
  const trend = trendQuery.data ?? [];

  if (isLoading) {
    return (
      <Card className="border-border/70" data-testid="financial-summary-loading">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-600" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (hasError) {
    return (
      <Card className="border-red-200/80 bg-red-50/30 dark:bg-red-950/20" data-testid="financial-summary-error">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-600" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-800 dark:text-red-200">
            Unable to load financial summary right now.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => {
              void summaryQuery.refetch();
              void trendQuery.refetch();
            }}
          >
            <RefreshCw size={12} className="mr-1" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!summary || !summary.hasAnyData) {
    return (
      <Card className="border-border/70" data-testid="financial-summary-empty">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-600" />
            Financial Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm font-medium">No financial records yet</p>
          <p className="text-xs text-muted-foreground">
            Record revenue and employee cost entries to view P&amp;L performance.
          </p>
        </CardContent>
      </Card>
    );
  }

  const qualityClass = qualityTone(summary.dataQualityStatus);
  const warnings = summary.dataQualityMessages.slice(0, 2);
  const hasTrend = trend.length > 1;
  const wpsScope = summary.wpsQualityScope ?? "none";
  const wpsScopeClass = wpsScopeTone(wpsScope);
  const wpsHelperText = wpsScopeHelperText(wpsScope);

  return (
    <Card className="border-border/70" data-testid="financial-summary-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp size={14} className="text-emerald-600" />
              Financial Summary
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1">{summary.periodLabel}</p>
          </div>
          {canOpenFinanceOverview && (
            <Button variant="ghost" size="sm" className="text-xs h-7" asChild>
              <Link href="/finance/overview">
                View details <ArrowUpRight size={11} />
              </Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Metric label="Revenue" value={formatOmr(summary.revenueOmr)} />
          <Metric label="Employee cost" value={formatOmr(summary.employeeCostOmr)} />
          <Metric label="Overhead" value={formatOmr(summary.platformOverheadOmr)} />
          <Metric label="Margin" value={formatOmr(summary.netMarginOmr)} emphasize />
          <Metric label="Margin %" value={formatPercent(summary.netMarginPercent)} emphasize />
        </div>

        {hasTrend ? (
          <MarginSparkline points={trend} />
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
            Trend will appear once more monthly periods are recorded.
          </div>
        )}

        <div className="rounded-lg border border-border/70 p-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Data quality</p>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${qualityClass}`}>
                {qualityLabel(summary.dataQualityStatus)}
              </span>
              <span
                data-testid="financial-summary-wps-scope"
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${wpsScopeClass}`}
              >
                {wpsScopeLabel(wpsScope)}
              </span>
            </div>
          </div>
          {warnings.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {warnings.map((message) => (
                <li key={message} className="text-xs text-muted-foreground">
                  • {message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Data is complete for this period.</p>
          )}
          {wpsHelperText && (
            <p className="mt-1 text-[11px] text-muted-foreground">{wpsHelperText}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default FinancialSummaryCard;
