import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { queueStatusDescription, queueStatusHeadline } from "../actionQueueComputeStatus";
import { severityBadgeClass, sourceLabel } from "../displayUtils";
import type { ActionQueueStatus } from "../actionQueueTypes";
import type { ActionQueueItemExecutionView } from "../escalationTypes";
import { fmtDate } from "@/lib/dateUtils";
import { ExecutionAccountabilityRow } from "./ExecutionAccountabilityRow";

export type ActionQueueSectionProps = {
  queueScopeActive: boolean;
  actionsLoading: boolean;
  queueStatus: ActionQueueStatus;
  queueUpdatedLabel?: string | null;
  queueForList: ActionQueueItemExecutionView[];
  actionItemsLength: number;
  /** Cleared / new queue items vs last snapshot */
  outcomeHintLine?: string | null;
  domainHintLine?: string | null;
};

export function ActionQueueSection({
  queueScopeActive,
  actionsLoading,
  queueStatus,
  queueUpdatedLabel,
  queueForList,
  actionItemsLength,
  outcomeHintLine,
  domainHintLine,
}: ActionQueueSectionProps) {
  return (
    <section aria-label="Action queue" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">Action queue</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg leading-relaxed">
            The next operational items after today&apos;s top priorities.
          </p>
          {queueScopeActive && !actionsLoading && outcomeHintLine ? (
            <p className="text-[10px] text-emerald-900/80 dark:text-emerald-100/80 mt-1 max-w-lg leading-snug">{outcomeHintLine}</p>
          ) : null}
          {queueScopeActive && !actionsLoading && domainHintLine ? (
            <p className="text-[10px] text-muted-foreground/90 mt-1 max-w-lg leading-snug">{domainHintLine}</p>
          ) : null}
        </div>
        {queueScopeActive && !actionsLoading && queueUpdatedLabel ? (
          <span className="text-[11px] text-muted-foreground">{queueUpdatedLabel}</span>
        ) : null}
      </div>

      <Card className="shadow-sm border-muted">
        <CardHeader className="pb-2 space-y-1">
          <CardTitle className="text-base font-medium text-muted-foreground flex flex-wrap items-center gap-2">
            {queueScopeActive ? queueStatusHeadline(queueStatus) : "Action queue"}
            <Badge variant="secondary" className="text-[10px] font-normal">
              Max 10
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            {queueScopeActive ? queueStatusDescription(queueStatus) : "Sign in with a company workspace to load tenant actions."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!queueScopeActive ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Select a company to load the action queue.</p>
          ) : actionsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading actions…
            </div>
          ) : queueStatus === "error" ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-4">
              <AlertCircle className="w-10 h-10 text-red-600" />
              <p className="text-sm font-medium text-red-900 dark:text-red-100">{queueStatusHeadline("error")}</p>
              <p className="text-xs text-muted-foreground max-w-sm">{queueStatusDescription("error")}</p>
            </div>
          ) : queueStatus === "partial" ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/25 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                {queueStatusDescription("partial")}
              </div>
              {queueForList.length > 0 ? (
                <ul className="divide-y rounded-lg border bg-background/50">
                  {queueForList.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                      <Badge className={`shrink-0 ${severityBadgeClass(a.severity)}`}>{a.severity}</Badge>
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-medium leading-snug">{a.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          <span>{sourceLabel(a.source)}</span>
                          {a.count != null && a.count > 1 && <span>×{a.count}</span>}
                          {a.dueAt && <span>Due {fmtDate(a.dueAt)}</span>}
                        </div>
                        {a.reason && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.reason}</p>}
                        <ExecutionAccountabilityRow execution={a.execution} escalation={a.escalation} variant="queue" />
                      </div>
                      <Button size="sm" variant="secondary" className="shrink-0 gap-1" asChild>
                        <Link href={a.href}>{a.ctaLabel}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : actionItemsLength > 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Every item in your queue is listed in Today&apos;s priorities above.
                </p>
              ) : null}
            </div>
          ) : queueStatus === "all_clear" ? (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">{queueStatusHeadline("all_clear")}</p>
              <p className="text-xs text-muted-foreground max-w-sm">{queueStatusDescription("all_clear")}</p>
            </div>
          ) : queueStatus === "no_urgent_blockers" ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 text-xs">
                {queueStatusDescription("no_urgent_blockers")}
              </div>
              {queueForList.length > 0 ? (
                <ul className="divide-y rounded-lg border bg-background/50">
                  {queueForList.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                      <Badge className={`shrink-0 ${severityBadgeClass(a.severity)}`}>{a.severity}</Badge>
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-medium leading-snug">{a.title}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                          <span>{sourceLabel(a.source)}</span>
                          {a.count != null && a.count > 1 && <span>×{a.count}</span>}
                          {a.dueAt && <span>Due {fmtDate(a.dueAt)}</span>}
                        </div>
                        <ExecutionAccountabilityRow execution={a.execution} escalation={a.escalation} variant="queue" />
                      </div>
                      <Button size="sm" variant="secondary" className="shrink-0 gap-1" asChild>
                        <Link href={a.href}>{a.ctaLabel}</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : actionItemsLength > 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Every item in your queue is listed in Today&apos;s priorities above.
                </p>
              ) : null}
            </div>
          ) : queueForList.length > 0 ? (
            <ul className="divide-y rounded-lg border bg-background/50">
              {queueForList.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                  <Badge className={`shrink-0 ${severityBadgeClass(a.severity)}`}>{a.severity}</Badge>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium leading-snug">{a.title}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                      <span>{sourceLabel(a.source)}</span>
                      {a.count != null && a.count > 1 && <span>×{a.count}</span>}
                      {a.dueAt && <span>Due {fmtDate(a.dueAt)}</span>}
                    </div>
                    {a.reason && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{a.reason}</p>}
                    <ExecutionAccountabilityRow execution={a.execution} escalation={a.escalation} variant="queue" />
                  </div>
                  <Button size="sm" variant="secondary" className="shrink-0 gap-1" asChild>
                    <Link href={a.href}>{a.ctaLabel}</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : actionItemsLength > 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Every item in your queue is listed in Today&apos;s priorities above.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No additional items in the queue.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
