import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, AlertTriangle, ArrowUpRight } from "lucide-react";
import { queueStatusDescription, queueStatusHeadline } from "../actionQueueComputeStatus";
import { getPriorityBadgeLabel } from "../actionLabels";
import { priorityLevelBadgeClass, sourceLabel } from "../displayUtils";
import type { ActionQueueStatus } from "../actionQueueTypes";
import type { PriorityItemExecutionView } from "../escalationTypes";
import type { PriorityLevel } from "../priorityTypes";
import { ExecutionAccountabilityRow } from "./ExecutionAccountabilityRow";

export type PrioritiesSectionProps = {
  queueScopeActive: boolean;
  actionsLoading: boolean;
  queueStatus: ActionQueueStatus;
  priorityItems: PriorityItemExecutionView[];
  hasStrongPriorities: boolean;
  actionItemsLength: number;
};

function priorityCardShell(level: PriorityLevel) {
  if (level === "critical") {
    return "rounded-xl border-2 border-red-300/90 dark:border-red-800 shadow-md shadow-red-950/10 ring-1 ring-red-200/60 dark:ring-red-900/50 bg-gradient-to-br from-card via-card to-red-50/40 dark:to-red-950/25";
  }
  if (level === "important") {
    return "rounded-xl border border-amber-200/90 dark:border-amber-800/50 shadow-sm bg-card/90";
  }
  return "rounded-xl border border-dashed border-slate-300/80 dark:border-slate-600 bg-muted/25";
}

export function PrioritiesSection({
  queueScopeActive,
  actionsLoading,
  queueStatus,
  priorityItems,
  hasStrongPriorities,
  actionItemsLength,
}: PrioritiesSectionProps) {
  if (!queueScopeActive) return null;

  const showConfidenceNote =
    !actionsLoading && (queueStatus === "partial" || queueStatus === "error") && priorityItems.length > 0;

  return (
    <section aria-label="Today's priorities" className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-[var(--smartpro-orange)] shrink-0" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Today&apos;s priorities</h2>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Top 3</span>
      </div>

      {!actionsLoading && (queueStatus === "partial" || queueStatus === "error") && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200/90 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-950 dark:text-amber-50">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-80" aria-hidden />
          <p className="leading-snug">
            {queueStatus === "error" ? queueStatusDescription("error") : queueStatusDescription("partial")}
          </p>
        </div>
      )}

      <Card className="shadow-lg border-[var(--smartpro-orange)]/20 overflow-hidden">
        <CardHeader className="pb-3 space-y-1 border-b bg-muted/20">
          <CardTitle className="text-lg font-semibold tracking-tight">What matters most now</CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            {actionsLoading
              ? "Loading…"
              : queueStatus === "error"
                ? "Priorities may be incomplete until the queue loads reliably."
                : "Blocked and time-sensitive work first — same data as your action queue, with context."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5">
          {actionsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading priorities…
            </div>
          ) : queueStatus === "error" && priorityItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{queueStatusHeadline("error")}</p>
          ) : priorityItems.length === 0 ? (
            <div className="py-10 text-center space-y-2 px-2">
              <p className="text-base font-medium text-foreground">No critical priorities right now</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {actionItemsLength > 0
                  ? "Review the action queue below for the next operational items."
                  : "When items need attention, up to three will surface here with guidance."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {showConfidenceNote ? (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-1 h-1 rounded-full bg-amber-500" aria-hidden />
                  Treat priority order as best-effort while data is incomplete.
                </p>
              ) : null}
              {!hasStrongPriorities && actionItemsLength > 0 && (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-muted-foreground/25 px-3 py-2 leading-snug">
                  No critical priorities right now — showing watch-level items in a softer layout.
                </p>
              )}
              <ul className="space-y-4">
                {priorityItems.map((p) => (
                  <li
                    key={p.id}
                    className={`p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between ${priorityCardShell(p.priorityLevel)}`}
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={`text-[10px] font-semibold ${priorityLevelBadgeClass(p.priorityLevel)}`}>
                          {getPriorityBadgeLabel(p.priorityLevel)}
                        </Badge>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {sourceLabel(p.source)}
                        </span>
                      </div>
                      <p
                        className={`font-semibold leading-snug ${
                          p.priorityLevel === "critical" ? "text-base sm:text-lg" : "text-sm sm:text-base"
                        }`}
                      >
                        {p.title}
                      </p>
                      <p className="text-sm text-muted-foreground leading-snug line-clamp-3">{p.whyThisMatters}</p>
                      <p className="text-xs text-muted-foreground leading-snug">{p.recommendedAction}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground pt-0.5">
                        {p.dueLabel && p.dueLabel !== "No deadline" ? <span>{p.dueLabel}</span> : null}
                      </div>
                      <ExecutionAccountabilityRow execution={p.execution} escalation={p.escalation} variant="priority" />
                    </div>
                    <div className="flex sm:flex-col justify-end shrink-0">
                      <Button size="sm" className="gap-1 w-full sm:w-auto font-medium" asChild>
                        <Link href={p.href}>
                          {p.ctaLabel} <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
