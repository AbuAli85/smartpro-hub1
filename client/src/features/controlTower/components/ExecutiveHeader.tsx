import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, Radar } from "lucide-react";
import type { ActionQueueStatus } from "../actionQueueTypes";

export type ExecutiveHeaderProps = {
  subtitle: string;
  companyName?: string | null;
  /** e.g. queue `lastUpdatedLabel` */
  freshnessLabel?: string | null;
  /** Derived escalation summary; omit when null/empty */
  escalationSummaryLine?: string | null;
  /** vs last saved snapshot (local); omit when no baseline */
  trendSummaryLine?: string | null;
  /** Resolution / outcome line (needs item-ref baseline); omit when unavailable */
  outcomeSummaryLine?: string | null;
  queueStatus: ActionQueueStatus;
  /** Tenant has company scope for queue */
  queueScopeActive: boolean;
  actionsLoading: boolean;
};

export function ExecutiveHeader({
  subtitle,
  companyName,
  freshnessLabel,
  escalationSummaryLine,
  trendSummaryLine,
  outcomeSummaryLine,
  queueStatus,
  queueScopeActive,
  actionsLoading,
}: ExecutiveHeaderProps) {
  const showConfidence =
    queueScopeActive && !actionsLoading && (queueStatus === "partial" || queueStatus === "error");

  return (
    <header className="border-b bg-card/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-start justify-between gap-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-[var(--smartpro-orange)]/15 flex items-center justify-center">
            <Radar className="w-5 h-5 text-[var(--smartpro-orange)]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Control Tower</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-snug">{subtitle}</p>
            {queueScopeActive && !actionsLoading && escalationSummaryLine ? (
              <p className="text-xs text-amber-950/90 dark:text-amber-100/90 mt-2 max-w-xl leading-snug font-medium">
                {escalationSummaryLine}
              </p>
            ) : null}
            {queueScopeActive && !actionsLoading && trendSummaryLine ? (
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 max-w-xl leading-snug">{trendSummaryLine}</p>
            ) : null}
            {queueScopeActive && !actionsLoading && outcomeSummaryLine ? (
              <p className="text-xs text-emerald-900/85 dark:text-emerald-100/85 mt-1 max-w-xl leading-snug">{outcomeSummaryLine}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-2 text-right min-w-[200px]">
          {companyName ? (
            <p className="text-xs font-medium text-foreground truncate max-w-full" title={companyName}>
              {companyName}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Company workspace</p>
          )}
          {freshnessLabel && queueScopeActive && !actionsLoading ? (
            <p className="text-[11px] text-muted-foreground">{freshnessLabel}</p>
          ) : null}
          {showConfidence ? (
            <Badge
              variant="outline"
              className="text-[10px] font-normal border-amber-300/80 text-amber-950 dark:text-amber-100 bg-amber-50/80 dark:bg-amber-950/30 self-end"
            >
              {queueStatus === "error" ? "Queue: limited confidence" : "Queue: partial data"}
            </Badge>
          ) : null}
          <div className="flex flex-wrap gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">Executive dashboard</Link>
            </Button>
            <Button size="sm" className="gap-1" asChild>
              <Link href="/operations">
                Operations centre <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
