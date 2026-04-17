import React, { useEffect, useMemo, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  Trash2,
  Link2,
  LayoutTemplate,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateLong } from "@/lib/dateUtils";
import { normalizeAttachmentLinks } from "@/lib/taskAttachmentLinks";

export type TaskAssignEmployee = {
  id: number;
  firstName: string;
  lastName: string;
  department?: string | null;
  position?: string | null;
  avatarUrl?: string | null;
};

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "pending" | "in_progress" | "completed" | "cancelled" | "blocked";

const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low"];

const PRIORITY_CONFIG: Record<Priority, { label: string; chip: string; hint: string; dot: string }> = {
  urgent: {
    label: "Urgent",
    chip: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900",
    hint: "Same day or next business day — immediate attention.",
    dot: "bg-red-500",
  },
  high: {
    label: "High",
    chip: "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-900",
    hint: "Important — prioritize within 1–2 days.",
    dot: "bg-orange-500",
  },
  medium: {
    label: "Medium",
    chip: "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900",
    hint: "Normal workload — often 2–5 days.",
    dot: "bg-blue-500",
  },
  low: {
    label: "Low",
    chip: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
    hint: "Non-urgent — when capacity allows.",
    dot: "bg-slate-400",
  },
};

const STATUS_CONFIG: Record<Status, { label: string }> = {
  pending: { label: "Pending" },
  in_progress: { label: "In Progress" },
  blocked: { label: "Blocked" },
  completed: { label: "Completed" },
  cancelled: { label: "Cancelled" },
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localYmd(d);
}

function defaultDuePlus2(): string {
  return addDaysLocal(2);
}

function startOfTodayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dueSlaHint(priority: Priority): string {
  return PRIORITY_CONFIG[priority].hint;
}

/** Per-tab session cache — avoids persisting employee identifiers to disk (CodeQL js/clear-text-storage-of-sensitive-data). */
function assigneeRecencyScopeKey(companyId: number | null | undefined): string {
  return String(companyId ?? "none");
}

const recentAssigneeIdsByCompany = new Map<string, number[]>();
const lastAssigneeIdByCompany = new Map<string, number>();

function readRecentIds(companyId: number | null | undefined): number[] {
  return recentAssigneeIdsByCompany.get(assigneeRecencyScopeKey(companyId)) ?? [];
}

function pushRecentAssignee(companyId: number | null | undefined, employeeId: number) {
  const key = assigneeRecencyScopeKey(companyId);
  const prev = readRecentIds(companyId).filter((id) => id !== employeeId);
  const next = [employeeId, ...prev].slice(0, 8);
  recentAssigneeIdsByCompany.set(key, next);
  lastAssigneeIdByCompany.set(key, employeeId);
}

function initials(e: TaskAssignEmployee): string {
  const a = (e.firstName?.[0] ?? "").toUpperCase();
  const b = (e.lastName?.[0] ?? "").toUpperCase();
  return (a + b) || "?";
}

type ChecklistRow = { id: string; title: string; completed: boolean };
type LinkRow = { id: string; name: string; url: string };

const QUICK_TEMPLATES: {
  id: string;
  label: string;
  apply: () => {
    title: string;
    description: string;
    checklist: string[];
    estimatedDurationMinutes?: number;
    priority: Priority;
  };
}[] = [
  {
    id: "daily",
    label: "Daily report",
    apply: () => ({
      title: "Submit daily sales / activity report",
      description:
        "Summarize key numbers, customer follow-ups, and blockers. Submit before end of shift.",
      checklist: ["Pull numbers from POS / CRM", "Note top 3 wins and risks", "Send to manager"],
      estimatedDurationMinutes: 45,
      priority: "medium",
    }),
  },
  {
    id: "compliance",
    label: "Compliance",
    apply: () => ({
      title: "Monthly compliance checklist",
      description: "Complete required checks and retain evidence per company policy.",
      checklist: ["Review policy updates", "Complete checklist form", "File proof in shared drive"],
      estimatedDurationMinutes: 120,
      priority: "high",
    }),
  },
  {
    id: "onboarding",
    label: "Onboarding task",
    apply: () => ({
      title: "New hire — access & orientation",
      description: "Ensure systems access and first-week orientation items are done.",
      checklist: ["Verify accounts created", "Schedule orientation", "Confirm equipment issued"],
      estimatedDurationMinutes: 90,
      priority: "high",
    }),
  },
];

export function TaskAssignDialog({
  open,
  onClose,
  initial,
  employees,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: any;
  employees: TaskAssignEmployee[];
  companyId?: number | null;
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<Status>("pending");
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>("");
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; assignee?: string; dueDate?: string; links?: string }>({});

  const resetFormForOpen = useCallback(() => {
    if (initial) {
      setTitle(initial.title ?? "");
      setDescription(initial.description ?? "");
      setPriority((initial.priority as Priority) ?? "medium");
      setStatus((initial.status as Status) ?? "pending");
      setDueDate(initial.dueDate ? new Date(initial.dueDate).toISOString().split("T")[0] : "");
      setAssignedTo(initial.assignedToEmployeeId?.toString() ?? "");
      setNotes(initial.notes ?? "");
      setBlockedReason(initial.blockedReason ?? "");
      setEstimatedMinutes(
        initial.estimatedDurationMinutes != null ? String(initial.estimatedDurationMinutes) : "",
      );
      const raw = initial.checklist;
      const items: { title?: string; completed?: boolean }[] = Array.isArray(raw) ? raw : [];
      setChecklist(
        items.map((it, i) => ({
          id: `c-${i}-${String(it.title ?? "").slice(0, 8)}`,
          title: typeof it.title === "string" ? it.title : "",
          completed: !!it.completed,
        })),
      );
      const al = initial.attachmentLinks;
      const linkArr: { name: string; url: string }[] = Array.isArray(al) ? al : [];
      setLinks(
        linkArr.map((l, i) => ({
          id: `l-${i}`,
          name: l.name,
          url: l.url,
        })),
      );
    } else {
      setTitle("");
      setDescription("");
      setPriority("medium");
      setStatus("pending");
      setDueDate(defaultDuePlus2());
      setNotes("");
      setBlockedReason("");
      setEstimatedMinutes("");
      setChecklist([]);
      setLinks([]);
      const lastNum = lastAssigneeIdByCompany.get(assigneeRecencyScopeKey(companyId));
      const lastId =
        lastNum != null && employees.some((e) => e.id === lastNum) ? String(lastNum) : "";
      setAssignedTo(lastId);
    }
    setErrors({});
  }, [initial, employees, companyId]);

  useEffect(() => {
    if (!open) return;
    resetFormForOpen();
  }, [open, initial, resetFormForOpen]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === Number(assignedTo)),
    [employees, assignedTo],
  );

  const recentEmployees = useMemo(() => {
    const ids = readRecentIds(companyId);
    return ids
      .map((id) => employees.find((e) => e.id === id))
      .filter((e): e is TaskAssignEmployee => !!e);
  }, [employees, companyId, open]);

  const create = trpc.tasks.createTask.useMutation({
    onSuccess: (_, vars) => {
      pushRecentAssignee(companyId, vars.assignedToEmployeeId);
      utils.tasks.listTasks.invalidate();
      utils.tasks.getTaskStats.invalidate();
      utils.employeePortal.getMyTasks.invalidate();
      utils.operations.getOwnerBusinessPulse.invalidate();
      toast.success("Task assigned");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.tasks.updateTask.useMutation({
    onSuccess: () => {
      utils.tasks.listTasks.invalidate();
      utils.tasks.getTaskStats.invalidate();
      utils.employeePortal.getMyTasks.invalidate();
      toast.success("Task updated");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const validate = (): boolean => {
    const e: typeof errors = {};
    const t = title.trim();
    if (t.length < 3) {
      e.title = "Task title must be at least 3 characters — be specific about what to deliver.";
    }
    if (!assignedTo) {
      e.assignee = "Please select an employee to assign this task.";
    }
    if (!initial && dueDate) {
      const d = parseYmd(dueDate);
      if (d && d < startOfTodayLocal()) {
        e.dueDate = "Due date must be today or in the future.";
      }
    }
    const hasLinkRows = links.some((l) => l.name.trim() || l.url.trim());
    if (hasLinkRows) {
      const norm = normalizeAttachmentLinks(links.map((l) => ({ name: l.name, url: l.url })));
      if (!norm?.length) {
        e.links =
          "Add at least one valid http(s) link with a label (max 5 unique links, label ≤ 60 chars, URL ≤ 500 chars).";
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildChecklistPayload = (): { title: string; completed: boolean }[] | null => {
    const rows = checklist.filter((c) => c.title.trim());
    if (!rows.length) return null;
    return rows.map((c) => ({ title: c.title.trim(), completed: c.completed }));
  };

  const parsedEstimate = (): number | undefined => {
    const n = parseInt(estimatedMinutes, 10);
    if (!estimatedMinutes.trim() || Number.isNaN(n)) return undefined;
    return n;
  };

  const handleSave = () => {
    if (!validate()) return;
    const checklistPayload = buildChecklistPayload();
    const linksNorm = normalizeAttachmentLinks(links.map((l) => ({ name: l.name, url: l.url })));
    const est = parsedEstimate();

    if (initial) {
      const payload: Parameters<typeof update.mutate>[0] = {
        id: initial.id,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        status,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        companyId: companyId ?? undefined,
        estimatedDurationMinutes: estimatedMinutes.trim() === "" ? null : (est ?? null),
        checklist: checklistPayload,
        attachmentLinks: linksNorm,
      };
      if (Number(assignedTo) !== initial.assignedToEmployeeId) {
        payload.assignedToEmployeeId = Number(assignedTo);
      }
      if (status === "blocked") {
        payload.blockedReason = blockedReason.trim() || null;
      }
      update.mutate(payload);
    } else {
      create.mutate({
        assignedToEmployeeId: Number(assignedTo),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        companyId: companyId ?? undefined,
        estimatedDurationMinutes: est,
        checklist: checklistPayload ?? undefined,
        attachmentLinks: linksNorm ?? undefined,
      });
    }
  };

  const applyTemplate = (tpl: (typeof QUICK_TEMPLATES)[number]) => {
    const a = tpl.apply();
    setTitle(a.title);
    setDescription(a.description);
    setPriority(a.priority);
    if (a.estimatedDurationMinutes) setEstimatedMinutes(String(a.estimatedDurationMinutes));
    setChecklist(
      a.checklist.map((t, i) => ({
        id: `tpl-${tpl.id}-${i}`,
        title: t,
        completed: false,
      })),
    );
    toast.message(`Applied “${tpl.label}” template — review and adjust.`);
  };

  const submitting = create.isPending || update.isPending;
  const formValid =
    title.trim().length >= 3 &&
    !!assignedTo &&
    (!dueDate || initial || !parseYmd(dueDate) || parseYmd(dueDate)! >= startOfTodayLocal());

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton
        className="max-w-lg max-h-[min(92vh,800px)] flex flex-col gap-0 p-0 overflow-hidden sm:max-w-xl"
      >
        <DialogHeader className="px-6 pt-6 pb-2 space-y-1 shrink-0">
          <DialogTitle>{initial ? "Edit task" : "Assign new task"}</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {initial
              ? "Update assignment, timeline, and expectations. Changes sync to the employee portal."
              : "Orchestrate work with clear ownership, timing, and optional checklist — reduces rework and missed handoffs."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4">
          {!initial && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <LayoutTemplate className="w-3.5 h-3.5" />
                Quick templates
              </span>
              {QUICK_TEMPLATES.map((tpl) => (
                <Button
                  key={tpl.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => applyTemplate(tpl)}
                >
                  {tpl.label}
                </Button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="task-title">Task title *</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
              }}
              placeholder="Describe the task clearly (what needs to be done?)"
              className={cn(errors.title && "border-destructive focus-visible:ring-destructive")}
              maxLength={255}
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Be specific. Example: “Submit daily sales summary before 5 PM with top 3 deals.”
            </p>
            {errors.title && <p className="text-xs text-destructive font-medium">{errors.title}</p>}
          </div>

          <div className="space-y-2">
            <Label>Assign to *</Label>
            <Popover open={assignOpen} onOpenChange={setAssignOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={assignOpen}
                  className={cn(
                    "w-full justify-between h-auto min-h-10 py-2 font-normal",
                    errors.assignee && "border-destructive",
                  )}
                >
                  {selectedEmployee ? (
                    <span className="flex items-center gap-2 text-left min-w-0">
                      <Avatar className="h-8 w-8 shrink-0">
                        {selectedEmployee.avatarUrl ? (
                          <AvatarImage src={selectedEmployee.avatarUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="text-xs">{initials(selectedEmployee)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="font-medium block truncate">
                          {selectedEmployee.firstName} {selectedEmployee.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground block truncate">
                          {[selectedEmployee.position, selectedEmployee.department].filter(Boolean).join(" · ") ||
                            "Employee"}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search and select employee…</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search name, department, role…" />
                  <CommandList>
                    <CommandEmpty>No employee matches.</CommandEmpty>
                    {recentEmployees.length > 0 && (
                      <CommandGroup heading="Recently assigned">
                        {recentEmployees.map((e) => (
                          <CommandItem
                            key={`r-${e.id}`}
                            value={`${e.firstName} ${e.lastName} ${e.department ?? ""} ${e.position ?? ""}`}
                            onSelect={() => {
                              setAssignedTo(String(e.id));
                              setAssignOpen(false);
                              setErrors((x) => ({ ...x, assignee: undefined }));
                            }}
                          >
                            <Avatar className="h-7 w-7 mr-2">
                              {e.avatarUrl ? <AvatarImage src={e.avatarUrl} alt="" /> : null}
                              <AvatarFallback className="text-[10px]">{initials(e)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">
                                {e.firstName} {e.lastName}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {[e.position, e.department].filter(Boolean).join(" · ") || "—"}
                              </div>
                            </div>
                            {assignedTo === String(e.id) && <Check className="h-4 w-4 shrink-0" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    <CommandGroup heading="All active employees">
                      {employees.map((e) => (
                        <CommandItem
                          key={e.id}
                          value={`${e.firstName} ${e.lastName} ${e.department ?? ""} ${e.position ?? ""} ${e.id}`}
                          onSelect={() => {
                            setAssignedTo(String(e.id));
                            setAssignOpen(false);
                            setErrors((x) => ({ ...x, assignee: undefined }));
                          }}
                        >
                          <Avatar className="h-7 w-7 mr-2">
                            {e.avatarUrl ? <AvatarImage src={e.avatarUrl} alt="" /> : null}
                            <AvatarFallback className="text-[10px]">{initials(e)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {e.firstName} {e.lastName}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {[e.position, e.department].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                          {assignedTo === String(e.id) && <Check className="h-4 w-4 shrink-0" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {initial && (
              <p className="text-xs text-muted-foreground">
                Reassigning updates <strong>Assigned at</strong> and notifies the new employee.
              </p>
            )}
            {errors.assignee && (
              <p className="text-xs text-destructive font-medium">{errors.assignee}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <div className="grid grid-cols-2 gap-2">
                {PRIORITY_ORDER.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-left text-xs transition-all",
                      PRIORITY_CONFIG[p].chip,
                      priority === p
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "opacity-80 hover:opacity-100",
                    )}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", PRIORITY_CONFIG[p].dot)} />
                      {PRIORITY_CONFIG[p].label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{dueSlaHint(priority)}</p>
            </div>

            <div className="space-y-2">
              <Label>Due date</Label>
              <DateInput
                value={dueDate}
                onChange={(ev) => {
                  setDueDate(ev.target.value);
                  if (errors.dueDate) setErrors((x) => ({ ...x, dueDate: undefined }));
                }}
                className={cn(errors.dueDate && "border-destructive")}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setDueDate(localYmd(new Date()))}>
                  Today
                </Button>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setDueDate(addDaysLocal(1))}>
                  Tomorrow
                </Button>
                <Button type="button" variant="secondary" size="sm" className="h-7 text-xs" onClick={() => setDueDate(addDaysLocal(7))}>
                  Next week
                </Button>
              </div>
              {dueDate && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  {(() => {
                    const d = parseYmd(dueDate);
                    if (!d) return null;
                    return <>Calendar: {fmtDateLong(dueDate)} — align with priority guidance above.</>;
                  })()}
                </p>
              )}
              {errors.dueDate && <p className="text-xs text-destructive font-medium">{errors.dueDate}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="est-min">Estimated duration (minutes, optional)</Label>
            <Input
              id="est-min"
              inputMode="numeric"
              placeholder="e.g. 60"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value.replace(/\D/g, ""))}
            />
            <p className="text-[11px] text-muted-foreground">Helps assignees plan their day; not enforced as a timer.</p>
          </div>

          {initial && (
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                aria-label="Task status"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as Status)}
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {initial && status === "blocked" && (
            <div className="space-y-2">
              <Label>Blocked reason</Label>
              <Textarea
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value)}
                rows={2}
                placeholder="Visible to the assignee in their task details."
              />
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <div>
              <Label htmlFor="task-details">Task details</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                What to deliver, where to find inputs, and acceptance criteria — <strong>visible to the assignee</strong>.
              </p>
            </div>
            <Textarea
              id="task-details"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Context, steps, links to SOPs, expected output…"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Checklist (optional)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setChecklist((c) => [...c, { id: `n-${Date.now()}`, title: "", completed: false }])
                }
              >
                <Plus className="w-3 h-3 mr-1" />
                Add step
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ordered steps — assignees can check them off in their portal. Empty rows are ignored.
            </p>
            <div className="space-y-2">
              {checklist.map((row, idx) => (
                <div key={row.id} className="flex gap-2 items-center">
                  <Checkbox
                    checked={row.completed}
                    onCheckedChange={(v) =>
                      setChecklist((list) =>
                        list.map((x) => (x.id === row.id ? { ...x, completed: v === true } : x)),
                      )
                    }
                    className="shrink-0"
                    aria-label={`Step ${idx + 1} pre-marked done (optional)`}
                  />
                  <Badge variant="secondary" className="w-7 h-7 shrink-0 p-0 justify-center text-xs">
                    {idx + 1}
                  </Badge>
                  <Input
                    value={row.title}
                    onChange={(e) =>
                      setChecklist((list) =>
                        list.map((x) => (x.id === row.id ? { ...x, title: e.target.value } : x)),
                      )
                    }
                    placeholder={`Step ${idx + 1}…`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-9 w-9 text-muted-foreground"
                    onClick={() => setChecklist((list) => list.filter((x) => x.id !== row.id))}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Reference links (optional)</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Up to 5 unique http(s) links — SharePoint, Drive, or policy URLs. <strong>Visible to the assignee.</strong>
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0"
                disabled={links.length >= 5}
                onClick={() => setLinks((l) => [...l, { id: `ln-${Date.now()}`, name: "", url: "" }])}
              >
                <Link2 className="w-3 h-3 mr-1" />
                Add link
              </Button>
            </div>
            {errors.links && <p className="text-xs text-destructive font-medium">{errors.links}</p>}
            <div className="space-y-2">
              {links.map((row) => (
                <div key={row.id} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
                  <Input
                    value={row.name}
                    maxLength={60}
                    onChange={(e) =>
                      setLinks((list) =>
                        list.map((x) => (x.id === row.id ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    onFocus={() => errors.links && setErrors((x) => ({ ...x, links: undefined }))}
                    placeholder="Label (e.g. Policy PDF)"
                  />
                  <div className="flex gap-1">
                    <Input
                      value={row.url}
                      maxLength={500}
                      onChange={(e) =>
                        setLinks((list) =>
                          list.map((x) => (x.id === row.id ? { ...x, url: e.target.value } : x)),
                        )
                      }
                      onFocus={() => errors.links && setErrors((x) => ({ ...x, links: undefined }))}
                      placeholder="https://…"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-9 w-9"
                      onClick={() => setLinks((list) => list.filter((x) => x.id !== row.id))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="internal-notes">Internal notes (admin only)</Label>
            <p className="text-[11px] text-muted-foreground">
              HR / compliance context — <strong>not shown</strong> on the employee portal.
            </p>
            <Textarea
              id="internal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Escalation notes, audit refs, sensitive context…"
              className="bg-muted/30"
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20 shrink-0 flex-col sm:flex-row gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            className="min-w-[140px] font-semibold"
            disabled={!formValid || submitting}
            onClick={handleSave}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {initial ? "Saving…" : "Assigning…"}
              </>
            ) : initial ? (
              "Save changes"
            ) : (
              "Assign task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
