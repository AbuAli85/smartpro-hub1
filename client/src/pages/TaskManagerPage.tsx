import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
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
  CheckCircle2, Circle, Filter, User,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

type Priority = "low" | "medium" | "high" | "urgent";
type Status = "pending" | "in_progress" | "completed" | "cancelled";

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  low: { label: "Low", color: "bg-slate-100 text-slate-700" },
  medium: { label: "Medium", color: "bg-blue-100 text-blue-700" },
  high: { label: "High", color: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700" },
};

const STATUS_CONFIG: Record<Status, { label: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", icon: <Circle className="w-3.5 h-3.5" /> },
  in_progress: { label: "In Progress", icon: <Clock className="w-3.5 h-3.5 text-blue-500" /> },
  completed: { label: "Completed", icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> },
  cancelled: { label: "Cancelled", icon: <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" /> },
};

function TaskDialog({
  open, onClose, initial, employees, companyId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: any;
  employees: { id: number; firstName: string; lastName: string; department?: string | null }[];
  companyId?: number | null;
}) {
  const utils = trpc.useUtils();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "medium");
  const [status, setStatus] = useState<Status>(initial?.status ?? "pending");
  const [dueDate, setDueDate] = useState(initial?.dueDate ? new Date(initial.dueDate).toISOString().split("T")[0] : "");
  const [assignedTo, setAssignedTo] = useState<string>(initial?.assignedToEmployeeId?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const create = trpc.tasks.createTask.useMutation({
    onSuccess: () => { utils.tasks.listTasks.invalidate(); utils.tasks.getTaskStats.invalidate(); toast.success("Task created"); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.tasks.updateTask.useMutation({
    onSuccess: () => { utils.tasks.listTasks.invalidate(); utils.tasks.getTaskStats.invalidate(); toast.success("Task updated"); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!title.trim() || !assignedTo) return;
    if (initial) {
      update.mutate({ id: initial.id, title, description: description || undefined, priority, status, dueDate: dueDate || undefined, notes: notes || undefined, companyId: companyId ?? undefined });
    } else {
      create.mutate({ assignedToEmployeeId: Number(assignedTo), title, description: description || undefined, priority, dueDate: dueDate || undefined, notes: notes || undefined, companyId: companyId ?? undefined });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit Task" : "Assign New Task"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Task Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Submit monthly report" />
          </div>
          <div className="space-y-1">
            <Label>Assign To *</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={!!initial}>
              <SelectTrigger><SelectValue placeholder="Select employee..." /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id.toString()}>
                    {e.firstName} {e.lastName}{e.department ? ` — ${e.department}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {initial && (
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Task details..." />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!title.trim() || !assignedTo || create.isPending || update.isPending}>
            {initial ? "Save Changes" : "Assign Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TaskManagerPage() {
  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [taskDialog, setTaskDialog] = useState<{ open: boolean; item?: any }>({ open: false });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: tasks = [], isLoading } = trpc.tasks.listTasks.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: stats } = trpc.tasks.getTaskStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: employees = [] } = trpc.hr.listEmployees.useQuery({ status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const deleteTask = trpc.tasks.deleteTask.useMutation({
    onSuccess: () => { utils.tasks.listTasks.invalidate(); utils.tasks.getTaskStats.invalidate(); toast.success("Task deleted"); setDeleteConfirm(null); },
  });

  const empList = (employees as any)?.employees ?? employees ?? [];

  const filtered = (tasks as any[]).filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.employeeName?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isOverdue = (t: any) => t.status !== "completed" && t.status !== "cancelled" && t.dueDate && new Date(t.dueDate) < new Date();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Task Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">Assign and track tasks for your team.</p>
        </div>
        <Button onClick={() => setTaskDialog({ open: true })}>
          <Plus className="w-4 h-4 mr-2" />Assign Task
        </Button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Pending", value: stats.pending, color: "text-muted-foreground" },
            { label: "In Progress", value: stats.inProgress, color: "text-blue-600" },
            { label: "Completed", value: stats.completed, color: "text-green-600" },
            { label: "Overdue", value: stats.overdue, color: "text-red-600" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-4 pb-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search tasks or employees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tasks found</p>
          <p className="text-sm">Assign a task to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task: any) => {
            const overdue = isOverdue(task);
            const pc = PRIORITY_CONFIG[task.priority as Priority];
            const sc = STATUS_CONFIG[task.status as Status];
            return (
              <div
                key={task.id}
                className={`flex items-center gap-4 p-4 rounded-lg border bg-card group ${overdue ? "border-red-200 bg-red-50/50 dark:bg-red-950/10" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{task.title}</span>
                    {overdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="w-3 h-3" />{task.employeeName || "—"}
                    </span>
                    {task.dueDate && (
                      <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600" : "text-muted-foreground"}`}>
                        <Clock className="w-3 h-3" />Due {fmtDate(task.dueDate)}
                      </span>
                    )}
                    {task.employeeDepartment && (
                      <span className="text-xs text-muted-foreground">{task.employeeDepartment}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pc.color}`}>{pc.label}</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {sc.icon}{sc.label}
                  </span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setTaskDialog({ open: true, item: task })}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirm(task.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskDialog
        open={taskDialog.open}
        onClose={() => setTaskDialog({ open: false })}
        initial={taskDialog.item}
        employees={empList}
        companyId={activeCompanyId}
      />

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
              onClick={() => deleteConfirm !== null && deleteTask.mutate({ id: deleteConfirm })}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
