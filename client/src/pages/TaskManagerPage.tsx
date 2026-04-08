import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CheckSquare, Plus, Pencil, Trash2, Clock, AlertCircle,
  CheckCircle2, Circle, User, Ban, Check,
} from "lucide-react";
import { fmtDateLong } from "@/lib/dateUtils";
import { getDueUrgency, slaLabel, actionRequiredOverdueLabel } from "@/lib/taskSla";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { TaskAssignDialog } from "@/components/tasks/TaskAssignDialog";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "pending" | "in_progress" | "completed" | "cancelled" | "blocked";

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; hint: string }> = {
  low: { label: "Low", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", hint: "Routine / when convenient" },
  medium: { label: "Medium", color: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300", hint: "Expected this cycle" },
  high: { label: "High", color: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300", hint: "Important — prioritize" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300", hint: "Same-day or business-critical" },
};

const STATUS_CONFIG: Record<Status, { label: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", icon: <Circle className="w-3.5 h-3.5" /> },
  in_progress: { label: "Processing", icon: <Clock className="w-3.5 h-3.5 text-blue-500" /> },
  blocked: { label: "Blocked", icon: <Ban className="w-3.5 h-3.5 text-orange-600" /> },
  completed: { label: "Completed", icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> },
  cancelled: { label: "Cancelled", icon: <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" /> },
};

function rowUrgencyClass(task: any): string {
  const u = getDueUrgency(task.dueDate, task.status);
  if (u === "overdue") {
    return "border-red-400 bg-red-50/90 dark:bg-red-950/30 ring-2 ring-red-200/80 dark:ring-red-900/50 shadow-sm";
  }
  if (u === "due_today") {
    return "border-amber-400 bg-amber-50/70 dark:bg-amber-950/25 ring-1 ring-amber-200/80";
  }
  return "border-border bg-card hover:bg-muted/30";
}

export default function TaskManagerPage() {
  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const [, setLocation] = useLocation();
  const urlSearch = useSearch();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [detailTask, setDetailTask] = useState<any | null>(null);
  const appliedResolutionPrefillKey = useRef<string>("");

  const searchParams = useMemo(() => {
    const raw = urlSearch.startsWith("?") ? urlSearch.slice(1) : urlSearch;
    return new URLSearchParams(raw);
  }, [urlSearch]);
  const resolutionKind = searchParams.get("resolution");
  const contactIdStr = searchParams.get("contactId");
  const billingCycleIdStr = searchParams.get("billingCycleId");
  const prefillKey = `${resolutionKind ?? ""}-${contactIdStr ?? ""}-${billingCycleIdStr ?? ""}`;

  const crmPrefillEnabled =
    activeCompanyId != null &&
    resolutionKind === "crm" &&
    contactIdStr != null &&
    /^\d+$/.test(contactIdStr);

  const billingPrefillEnabled =
    activeCompanyId != null &&
    resolutionKind === "billing" &&
    billingCycleIdStr != null &&
    /^\d+$/.test(billingCycleIdStr);

  const { data: crmPrefill } = trpc.operations.getResolutionFollowUpPrefill.useQuery(
    { kind: "crm", contactId: Number(contactIdStr), companyId: activeCompanyId ?? undefined },
    { enabled: crmPrefillEnabled },
  );

  const { data: billingPrefill } = trpc.operations.getResolutionFollowUpPrefill.useQuery(
    { kind: "billing", billingCycleId: Number(billingCycleIdStr), companyId: activeCompanyId ?? undefined },
    { enabled: billingPrefillEnabled },
  );

  useEffect(() => {
    if (!resolutionKind) appliedResolutionPrefillKey.current = "";
  }, [resolutionKind]);

  useEffect(() => {
    const prefill = crmPrefill ?? billingPrefill;
    if (!prefill || !prefillKey || prefillKey === "--") return;
    if (appliedResolutionPrefillKey.current === prefillKey) return;
    appliedResolutionPrefillKey.current = prefillKey;
    setTaskDialog({
      open: true,
      item: {
        title: prefill.title,
        description: prefill.description,
        dueDate: prefill.dueDate,
        priority: prefill.priority,
        assignedToEmployeeId: prefill.suggestedAssigneeEmployeeId ?? undefined,
      },
    });
    setLocation("/hr/tasks");
  }, [crmPrefill, billingPrefill, prefillKey, setLocation]);

  const { data: tasks = [], isLoading } = trpc.tasks.listTasks.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: stats } = trpc.tasks.getTaskStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: employees = [] } = trpc.hr.listEmployees.useQuery({ status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const deleteTask = trpc.tasks.deleteTask.useMutation({
    onSuccess: () => {
      utils.tasks.listTasks.invalidate();
      utils.tasks.getTaskStats.invalidate();
      utils.employeePortal.getMyTasks.invalidate();
      toast.success("Task deleted");
      setDeleteConfirm(null);
    },
  });

  const quickComplete = trpc.tasks.updateTask.useMutation({
    onSuccess: () => {
      utils.tasks.listTasks.invalidate();
      utils.tasks.getTaskStats.invalidate();
      utils.employeePortal.getMyTasks.invalidate();
      toast.success("Task marked complete");
      setDetailTask(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const empList = (employees as any)?.employees ?? employees ?? [];

  const filtered = (tasks as any[]).filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.employeeName?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Task Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">Assign and track tasks for your team.</p>
        </div>
        <Button onClick={() => setTaskDialog({ open: true })}>
          <Plus className="w-4 h-4 mr-2" />Assign Task
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total, emphasize: false },
            { label: "Pending", value: stats.pending, emphasize: false },
            { label: "Processing", value: stats.inProgress, emphasize: false },
            { label: "Blocked", value: stats.blocked ?? 0, emphasize: (stats.blocked ?? 0) > 0 },
            { label: "Completed", value: stats.completed, emphasize: false },
            {
              label: "Overdue",
              value: stats.overdue,
              emphasize: stats.overdue > 0,
              danger: stats.overdue > 0,
            },
          ].map((s) => (
            <Card
              key={s.label}
              className={
                s.danger
                  ? "border-red-300 dark:border-red-900 shadow-[0_0_0_1px_rgba(220,38,38,0.25)] animate-pulse"
                : s.emphasize
                  ? "border-amber-200 dark:border-amber-900"
                  : undefined
              }
            >
              <CardContent className="pt-4 pb-3 text-center">
                <p
                  className={`text-2xl font-bold tabular-nums ${
                    s.danger ? "text-red-600" : s.label === "Completed" ? "text-green-600" : s.label === "Processing" ? "text-blue-600" : ""
                  }`}
                >
                  {s.value}
                </p>
                <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search tasks or employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tasks match your filters</p>
          <p className="text-sm max-w-md mx-auto mt-1">
            {search || filterStatus !== "all" || filterPriority !== "all"
              ? "Try clearing search or setting status and priority to “All”."
              : "Assign a task from the button above. Employees see tasks in My Portal → Tasks."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((task: any) => {
            const pc = PRIORITY_CONFIG[task.priority as Priority] ?? PRIORITY_CONFIG.medium;
            const sc = STATUS_CONFIG[task.status as Status] ?? STATUS_CONFIG.pending;
            const sla = slaLabel(task.dueDate, task.status);
            const urgency = getDueUrgency(task.dueDate, task.status);
            const actionOverdue = actionRequiredOverdueLabel(task.dueDate, task.status);
            return (
              <div
                key={task.id}
                role="button"
                tabIndex={0}
                onClick={() => setDetailTask(task)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDetailTask(task);
                  }
                }}
                className={`rounded-xl border p-4 transition-all duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer ${rowUrgencyClass(task)}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${pc.color}`}>
                        {pc.label}
                      </span>
                      <h3 className="font-semibold text-sm leading-snug">{task.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <User className="w-3 h-3 inline-block mr-1 align-middle shrink-0" />
                      <span className="font-medium text-foreground/90">{task.employeeName || "—"}</span>
                      {task.employeeDepartment && (
                        <>
                          <span className="mx-1.5 text-muted-foreground/60">·</span>
                          <span>{task.employeeDepartment}</span>
                        </>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {task.dueDate && (
                        <span
                          className={
                            urgency === "overdue"
                              ? "text-red-700 dark:text-red-400 font-semibold"
                              : urgency === "due_today"
                                ? "text-amber-700 dark:text-amber-400 font-medium"
                                : "text-muted-foreground"
                          }
                        >
                          <Clock className="w-3 h-3 inline mr-1 align-middle" />
                          Due {fmtDateLong(task.dueDate)}
                          {urgency === "overdue" && actionOverdue ? (
                            <span className="ml-1.5">· {actionOverdue}</span>
                          ) : sla ? (
                            <span className="ml-1.5">· {sla}</span>
                          ) : null}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full border bg-background/80 px-2 py-0.5 text-muted-foreground">
                        {sc.icon}
                        {sc.label}
                      </span>
                    </div>
                  </div>
                  <div
                    className="flex flex-wrap items-center justify-end gap-1 sm:flex-col sm:items-end"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    {task.status !== "completed" && task.status !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
                        disabled={quickComplete.isPending}
                        onClick={() =>
                          quickComplete.mutate({
                            id: task.id,
                            status: "completed",
                            companyId: activeCompanyId ?? undefined,
                          })
                        }
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Complete
                      </Button>
                    )}
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => setTaskDialog({ open: true, item: task })}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(task.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskAssignDialog
        open={taskDialog.open}
        onClose={() => setTaskDialog({ open: false })}
        initial={taskDialog.item}
        employees={empList}
        companyId={activeCompanyId}
      />

      {detailTask != null && (
        <TaskDetailSheet
          task={detailTask}
          open
          onOpenChange={(v) => {
            if (!v) setDetailTask(null);
          }}
          showInternalNotes
          footer={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const t = detailTask;
                  setDetailTask(null);
                  setTaskDialog({ open: true, item: t });
                }}
              >
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit / Reassign
              </Button>
              {detailTask.status !== "completed" && detailTask.status !== "cancelled" && (
                <Button
                  size="sm"
                  disabled={quickComplete.isPending}
                  onClick={() =>
                    quickComplete.mutate({
                      id: detailTask.id,
                      status: "completed",
                      companyId: activeCompanyId ?? undefined,
                    })
                  }
                >
                  <Check className="w-3.5 h-3.5 mr-1" />
                  Mark complete
                </Button>
              )}
            </div>
          }
        />
      )}

      <AlertDialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the task. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteConfirm !== null &&
                deleteTask.mutate({ id: deleteConfirm, companyId: activeCompanyId ?? undefined })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
