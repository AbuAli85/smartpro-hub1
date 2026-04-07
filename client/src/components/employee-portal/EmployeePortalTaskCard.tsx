import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Play, Check, TrendingUp, Ban, X } from "lucide-react";
import { getDueUrgency, slaLabel, actionRequiredOverdueLabel, dueTimingPhrase } from "@/lib/taskSla";
import { fmtDateLong } from "@/lib/dateUtils";

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "blocked";
type Priority = "low" | "medium" | "high" | "urgent";

const TASK_STATUS_ICON: Record<TaskStatus, React.ReactElement> = {
  pending: <Clock className="w-4 h-4 text-amber-500" />,
  in_progress: <TrendingUp className="w-4 h-4 text-blue-500" />,
  blocked: <Ban className="w-4 h-4 text-orange-600" />,
  completed: <Check className="w-4 h-4 text-green-500" />,
  cancelled: <X className="w-4 h-4 text-muted-foreground" />,
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return fmtDateLong(ts);
}

export interface EmployeePortalTaskCardProps {
  task: any;
  onOpenDetail: (task: any) => void;
  onMarkDone: (taskId: number) => void;
  onStart: (taskId: number) => void;
  startPending: boolean;
  completePending: boolean;
}

export function EmployeePortalTaskCard({
  task,
  onOpenDetail,
  onMarkDone,
  onStart,
  startPending,
  completePending,
}: EmployeePortalTaskCardProps) {
  const urgency = getDueUrgency(task.dueDate, task.status);
  const sla = slaLabel(task.dueDate, task.status);
  const actionOverdue = actionRequiredOverdueLabel(task.dueDate, task.status);
  const duePhrase = dueTimingPhrase(task.dueDate, task.status);
  const st = task.status as TaskStatus;
  const statusIcon = TASK_STATUS_ICON[st] ?? TASK_STATUS_ICON.pending;
  const cardTone =
    urgency === "overdue"
      ? "border-red-400 bg-red-50/90 dark:bg-red-950/35 ring-2 ring-red-200 dark:ring-red-900/60 shadow-sm"
      : urgency === "due_today"
        ? "border-amber-400 bg-amber-50/70 dark:bg-amber-950/25 ring-1 ring-amber-200"
        : "";

  return (
    <Card className={`overflow-hidden transition-shadow ${cardTone}`}>
      <CardContent className="p-0">
        <div className="flex min-h-[3.25rem] items-stretch">
          <button
            type="button"
            className="flex min-h-[3.25rem] flex-1 min-w-0 gap-3 rounded-l-xl p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-manipulation"
            onClick={() => onOpenDetail(task)}
          >
            <div className="mt-0.5 shrink-0">{statusIcon}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p
                  className={`text-sm font-semibold leading-snug ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}
                >
                  {task.title}
                </p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_COLOR[task.priority as Priority]}`}
                >
                  {task.priority}
                </span>
              </div>
              {task.description?.trim() && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
              )}
              {task.status === "blocked" && task.blockedReason?.trim() && (
                <p className="mt-1 line-clamp-2 text-xs font-medium text-orange-800 dark:text-orange-300">
                  Blocked: {task.blockedReason}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center rounded-full border bg-background/80 px-2 py-0.5 capitalize text-muted-foreground">
                  {TASK_STATUS_LABEL[st] ?? task.status}
                </span>
                {task.dueDate && (
                  <span
                    className={
                      urgency === "overdue"
                        ? "inline-flex items-center gap-1 font-bold text-red-700 dark:text-red-400"
                        : urgency === "due_today"
                          ? "inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-400"
                          : "inline-flex items-center gap-1 text-muted-foreground"
                    }
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formatDate(task.dueDate)}</span>
                    {duePhrase && <span className="ml-1 font-medium opacity-90">· {duePhrase}</span>}
                    {!duePhrase && sla && <span className="ml-1 opacity-90">· {sla}</span>}
                  </span>
                )}
                {urgency === "overdue" && actionOverdue && (
                  <Badge
                    variant="destructive"
                    className="h-auto max-w-[14rem] min-h-5 whitespace-normal px-1.5 py-0.5 text-left text-[10px] leading-tight"
                  >
                    {actionOverdue}
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Tap for details</p>
            </div>
          </button>
          {task.status !== "completed" && task.status !== "cancelled" && (
            <div
              className="flex shrink-0 flex-col items-stretch justify-center gap-2 border-l bg-muted/20 p-3"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {(task.status === "pending" || task.status === "blocked") && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-11 text-xs whitespace-nowrap"
                  disabled={startPending || completePending}
                  onClick={() => onStart(task.id)}
                >
                  <Play className="mr-1 h-3 w-3" /> Start
                </Button>
              )}
              <Button
                size="sm"
                variant={urgency === "overdue" ? "default" : "outline"}
                className="min-h-11 text-xs whitespace-nowrap"
                disabled={completePending || startPending}
                onClick={() => onMarkDone(task.id)}
              >
                <Check className="mr-1 h-3 w-3" /> Done
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
