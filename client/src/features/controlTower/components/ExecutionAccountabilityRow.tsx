import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import type { ActionExecutionMeta } from "../executionTypes";
import type { EscalationMeta } from "../escalationTypes";
import { getFollowThroughLabel } from "../followThrough";

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

function slaBadgeClass(sla: EscalationMeta["slaState"], compact: boolean) {
  if (sla === "breached") {
    return compact
      ? "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/50 dark:text-red-100"
      : "bg-red-600 text-white border-red-700 hover:bg-red-600";
  }
  if (sla === "nearing_sla") {
    return "bg-amber-50 text-amber-950 border-amber-300/90 dark:bg-amber-950/40 dark:text-amber-50";
  }
  if (sla === "within_sla") {
    return "text-muted-foreground border-border/80 bg-muted/30 font-normal";
  }
  return "text-muted-foreground border-transparent bg-muted/25 font-normal";
}

function slaShortLabel(sla: EscalationMeta["slaState"], compact: boolean): string | null {
  if (sla === "breached") return compact ? "Breached" : "Breached SLA";
  if (sla === "nearing_sla") return compact ? "Nearing SLA" : "Nearing SLA";
  if (sla === "within_sla") return compact ? null : "Within SLA";
  return null;
}

function escalationLevelLabel(level: EscalationMeta["escalationLevel"], compact: boolean): string | null {
  if (level === "escalated") return compact ? "Escalated" : "Escalated";
  if (level === "attention") return compact ? "Attention" : "Attention";
  return null;
}

function escalationLevelClass(level: EscalationMeta["escalationLevel"]) {
  if (level === "escalated") return "border-red-400/80 text-red-950 bg-red-50 dark:bg-red-950/35 dark:text-red-50";
  if (level === "attention") return "border-amber-400/70 text-amber-950 bg-amber-50/90 dark:bg-amber-950/30 dark:text-amber-50";
  return "";
}

export type ExecutionAccountabilityRowProps = {
  execution: ActionExecutionMeta;
  escalation?: EscalationMeta | null;
  /** Larger treatment for priority cards */
  variant?: "priority" | "queue";
  showAssign?: boolean;
};

export function ExecutionAccountabilityRow({
  execution,
  escalation,
  variant = "priority",
  showAssign = true,
}: ExecutionAccountabilityRowProps) {
  const compact = variant === "queue";
  const aging = agingLabel(execution.agingLevel);
  const followLabel = escalation ? getFollowThroughLabel(escalation, execution) : null;

  return (
    <div className={`flex flex-col gap-2 ${compact ? "mt-1" : "mt-2 pt-2 border-t border-dashed border-border/60"}`}>
      {escalation ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {slaShortLabel(escalation.slaState, compact) ? (
            <Badge
              variant="outline"
              className={`text-[10px] h-5 ${slaBadgeClass(escalation.slaState, compact)}`}
            >
              {slaShortLabel(escalation.slaState, compact)}
            </Badge>
          ) : escalation.slaState === "unknown" && !compact ? (
            <span className="text-[10px] text-muted-foreground">SLA: unknown</span>
          ) : null}
          {escalationLevelLabel(escalation.escalationLevel, compact) ? (
            <Badge
              variant="outline"
              className={`text-[10px] h-5 font-medium ${escalationLevelClass(escalation.escalationLevel)}`}
            >
              {escalationLevelLabel(escalation.escalationLevel, compact)}
            </Badge>
          ) : null}
          {followLabel ? (
            <span
              className={`text-[10px] font-medium ${
                escalation.escalationLevel === "escalated"
                  ? "text-red-900 dark:text-red-100"
                  : "text-amber-900 dark:text-amber-100"
              }`}
            >
              {followLabel}
            </span>
          ) : null}
        </div>
      ) : null}

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
