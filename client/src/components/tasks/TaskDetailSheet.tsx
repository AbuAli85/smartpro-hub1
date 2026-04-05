import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { fmtDateLong, fmtDateTime } from "@/lib/dateUtils";
import { slaLabel, getDueUrgency } from "@/lib/taskSla";
import { Clock, CheckCircle2, Circle, PlayCircle, Ban, XCircle } from "lucide-react";

type TaskLike = {
  id?: number;
  title?: string;
  description?: string | null;
  notes?: string | null;
  priority?: string;
  status?: string;
  dueDate?: Date | string | null;
  createdAt?: Date | string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  employeeName?: string;
  employeeDepartment?: string | null;
};

const STATUS_META: Record<string, { label: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", icon: <Circle className="w-4 h-4 text-amber-500" /> },
  in_progress: { label: "In progress", icon: <PlayCircle className="w-4 h-4 text-blue-500" /> },
  blocked: { label: "Blocked", icon: <Ban className="w-4 h-4 text-orange-600" /> },
  completed: { label: "Completed", icon: <CheckCircle2 className="w-4 h-4 text-green-600" /> },
  cancelled: { label: "Cancelled", icon: <XCircle className="w-4 h-4 text-muted-foreground" /> },
};

function TimelineRow({
  label,
  at,
  done,
}: {
  label: string;
  at: Date | string | null | undefined;
  done?: boolean;
}) {
  if (!at) {
    return (
      <div className="flex gap-3 text-sm text-muted-foreground">
        <Clock className="w-4 h-4 shrink-0 mt-0.5 opacity-50" />
        <div>
          <p className="font-medium text-foreground/70">{label}</p>
          <p className="text-xs">—</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 text-sm">
      <div className={`mt-0.5 shrink-0 ${done ? "text-green-600" : "text-primary"}`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
      </div>
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{fmtDateTime(at)}</p>
      </div>
    </div>
  );
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  showInternalNotes,
  footer,
}: {
  task: TaskLike;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Admin-only: internal HR notes */
  showInternalNotes?: boolean;
  footer?: React.ReactNode;
}) {
  const st = task.status ?? "pending";
  const meta = STATUS_META[st] ?? STATUS_META.pending;
  const urgency = getDueUrgency(task.dueDate ?? null, st);
  const sla = slaLabel(task.dueDate ?? null, st);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left space-y-1 pr-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="capitalize">
              {task.priority ?? "medium"}
            </Badge>
            {sla && urgency === "overdue" && (
              <Badge variant="destructive" className="text-xs">
                {sla}
              </Badge>
            )}
            {sla && urgency === "due_today" && (
              <Badge className="text-xs bg-amber-500 hover:bg-amber-500/90 text-white border-0">
                {sla}
              </Badge>
            )}
            {sla && urgency === "upcoming" && (
              <Badge variant="outline" className="text-xs">
                {sla}
              </Badge>
            )}
          </div>
          <SheetTitle className="text-lg leading-snug">{task.title}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {meta.icon}
              <span>{meta.label}</span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 px-1">
          {(task.employeeName || task.employeeDepartment) && (
            <div className="text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignee</p>
              <p className="font-medium mt-1">{task.employeeName ?? "—"}</p>
              {task.employeeDepartment && (
                <p className="text-xs text-muted-foreground mt-0.5">{task.employeeDepartment}</p>
              )}
            </div>
          )}

          {task.dueDate && (
            <div className="text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due date</p>
              <p className="font-medium mt-1">{fmtDateLong(task.dueDate)}</p>
              {sla && <p className="text-xs text-muted-foreground mt-1">{sla}</p>}
            </div>
          )}

          {task.description?.trim() && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Description</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{task.description}</p>
            </div>
          )}

          {showInternalNotes && task.notes?.trim() && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Internal notes</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{task.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Timeline</p>
            <div className="space-y-4">
              <TimelineRow label="Assigned" at={task.createdAt} />
              <TimelineRow label="Started" at={task.startedAt} done={!!task.startedAt} />
              <TimelineRow label="Completed" at={task.completedAt} done={st === "completed"} />
            </div>
          </div>

          <Separator />

          {footer && <div className="pt-2">{footer}</div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
