import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import type { ActionExecutionMeta } from "../executionTypes";

function agingLabel(level: ActionExecutionMeta["agingLevel"]): string | null {
  if (level === "fresh") return "Fresh";
  if (level === "aging") return "Aging";
  if (level === "stale") return "Stale";
  return null;
}

function agingClass(level: ActionExecutionMeta["agingLevel"]) {
  if (level === "aging") return "text-amber-800 dark:text-amber-200 border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/30";
  if (level === "stale") return "text-orange-900 dark:text-orange-100 border-orange-400/70 bg-orange-50/70 dark:bg-orange-950/35";
  if (level === "fresh") return "text-slate-600 dark:text-slate-400 border-slate-200 bg-slate-50/80 dark:bg-slate-900/40";
  return "text-muted-foreground border-transparent bg-muted/40";
}

export type ExecutionAccountabilityRowProps = {
  execution: ActionExecutionMeta;
  /** Larger treatment for priority cards */
  variant?: "priority" | "queue";
  showAssign?: boolean;
};

export function ExecutionAccountabilityRow({ execution, variant = "priority", showAssign = true }: ExecutionAccountabilityRowProps) {
  const compact = variant === "queue";
  const aging = agingLabel(execution.agingLevel);

  return (
    <div className={`flex flex-col gap-2 ${compact ? "mt-1" : "mt-2 pt-2 border-t border-dashed border-border/60"}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] leading-tight">
        <span className="text-muted-foreground font-medium">Owner:</span>
        {execution.assigned && execution.ownerLabel ? (
          <span className="text-foreground font-medium">{execution.ownerLabel}</span>
        ) : (
          <span className="text-amber-900 dark:text-amber-100 font-medium rounded px-1.5 py-0.5 bg-amber-100/80 dark:bg-amber-950/50 border border-amber-200/80">
            Unassigned
          </span>
        )}
        {execution.assignedToSelf ? (
          <Badge variant="outline" className="text-[10px] h-5 border-primary/40 text-primary">
            Assigned to you
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {execution.overdue ? (
          <Badge className="text-[10px] h-5 bg-red-100 text-red-900 border-red-200 dark:bg-red-950/50 dark:text-red-100">
            Overdue
          </Badge>
        ) : null}
        {execution.agingLevel === "aging" || execution.agingLevel === "stale" ? (
          <Badge variant="outline" className={`text-[10px] h-5 ${agingClass(execution.agingLevel)}`}>
            {aging}
            {execution.ageDays != null && execution.ageDays > 0 ? ` · ${execution.ageDays}d` : ""}
          </Badge>
        ) : execution.agingLevel === "fresh" && !compact ? (
          <span className="text-[10px] text-muted-foreground">Fresh</span>
        ) : null}
        {execution.stuck ? (
          <Badge variant="outline" className="text-[10px] h-5 border-violet-300/80 text-violet-900 dark:text-violet-100 bg-violet-50/60 dark:bg-violet-950/30">
            Stuck
          </Badge>
        ) : null}
        {execution.needsOwner ? (
          <Badge variant="outline" className="text-[10px] h-5 border-rose-300/70 text-rose-900 dark:text-rose-100 bg-rose-50/70 dark:bg-rose-950/25">
            Needs owner
          </Badge>
        ) : null}
        {showAssign ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            title="Assign owner (coming soon)"
            aria-label="Assign owner"
            onClick={() => {
              /* UI-only placeholder until assignment API exists */
            }}
          >
            <UserPlus className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
