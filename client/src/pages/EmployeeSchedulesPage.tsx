import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CalendarDays, MapPin, Clock } from "lucide-react";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface SchedForm {
  employeeUserId: string;
  siteId: string;
  shiftTemplateId: string;
  workingDays: number[];
  startDate: string;
  endDate: string;
  notes: string;
}

const defaultForm: SchedForm = {
  employeeUserId: "",
  siteId: "",
  shiftTemplateId: "",
  workingDays: [0, 1, 2, 3, 4],
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  notes: "",
};

export default function EmployeeSchedulesPage() {
  const { activeCompanyId } = useActiveCompany();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<SchedForm>(defaultForm);

  const { data: schedules = [], isLoading } = trpc.scheduling.listEmployeeSchedules.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId }
  );

  const { data: shifts = [] } = trpc.scheduling.listShiftTemplates.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId }
  );

  const { data: sitesData } = trpc.attendance.listSites.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId }
  );
  const sites = sitesData ?? [];

  const { data: employeesData } = trpc.hr.listEmployees.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId }
  );
  const employees = employeesData ?? [];

  const assignMut = trpc.scheduling.assignSchedule.useMutation({
    onSuccess: () => {
      utils.scheduling.listEmployeeSchedules.invalidate();
      setOpen(false);
      toast.success("Schedule assigned");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.scheduling.updateSchedule.useMutation({
    onSuccess: () => {
      utils.scheduling.listEmployeeSchedules.invalidate();
      setOpen(false);
      toast.success("Schedule updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.scheduling.deleteSchedule.useMutation({
    onSuccess: () => {
      utils.scheduling.listEmployeeSchedules.invalidate();
      setDeleteId(null);
      toast.success("Schedule removed");
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditId(null);
    setForm(defaultForm);
    setOpen(true);
  }

  function openEdit(s: typeof schedules[0]) {
    setEditId(s.id);
    setForm({
      employeeUserId: String(s.employeeUserId),
      siteId: String(s.siteId),
      shiftTemplateId: String(s.shiftTemplateId),
      workingDays: s.workingDays.split(",").map(Number),
      startDate: s.startDate,
      endDate: s.endDate ?? "",
      notes: s.notes ?? "",
    });
    setOpen(true);
  }

  function toggleDay(d: number) {
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(d)
        ? prev.workingDays.filter((x) => x !== d)
        : [...prev.workingDays, d].sort(),
    }));
  }

  function handleSubmit() {
    if (!activeCompanyId || !form.employeeUserId || !form.siteId || !form.shiftTemplateId || form.workingDays.length === 0) {
      toast.error("Please fill all required fields");
      return;
    }
    const payload = {
      companyId: activeCompanyId,
      employeeUserId: Number(form.employeeUserId),
      siteId: Number(form.siteId),
      shiftTemplateId: Number(form.shiftTemplateId),
      workingDays: form.workingDays,
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      notes: form.notes || undefined,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload });
    } else {
      assignMut.mutate(payload);
    }
  }

  function getInitials(name: string) {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" size={24} />
            Employee Schedules
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Assign shift templates and working days to employees
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} /> Assign Schedule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <CalendarDays size={40} className="opacity-30" />
            <p className="font-medium">No schedules assigned yet</p>
            <Button onClick={openCreate} variant="outline" className="mt-2 gap-2">
              <Plus size={16} /> Assign First Schedule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <Card key={s.id} className="group hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs font-semibold">
                      {s.employee ? getInitials(s.employee.name ?? "?") : "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{s.employee?.name ?? "Unknown"}</span>
                      {s.shift && (
                        <Badge
                          style={{ backgroundColor: s.shift.color ?? "#6366f1", color: "white" }}
                          className="text-xs"
                        >
                          {s.shift.name}
                        </Badge>
                      )}
                      {!s.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {s.site && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} /> {s.site.name}
                        </span>
                      )}
                      {s.shift && (
                        <span className="flex items-center gap-1">
                          <Clock size={11} /> {s.shift.startTime} – {s.shift.endTime}
                        </span>
                      )}
                      <span>
                        From <strong>{s.startDate}</strong>
                        {s.endDate ? ` to ${s.endDate}` : " (ongoing)"}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {DAYS.map((d) => (
                        <span
                          key={d.value}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            s.workingDays.split(",").map(Number).includes(d.value)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {d.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(s)}>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Assign / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Schedule" : "Assign Schedule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select value={form.employeeUserId} onValueChange={(v) => setForm({ ...form, employeeUserId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.userId ?? e.id} value={String(e.userId ?? e.id)}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Attendance Site *</Label>
              <Select value={form.siteId} onValueChange={(v) => setForm({ ...form, siteId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select site..." />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s: { id: number; name: string }) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Shift Template *</Label>
              <Select value={form.shiftTemplateId} onValueChange={(v) => setForm({ ...form, shiftTemplateId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift..." />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({s.startTime} – {s.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Working Days *</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      form.workingDays.includes(d.value)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Date (optional)</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Any notes about this schedule..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={assignMut.isPending || updateMut.isPending}
            >
              {editId ? "Save Changes" : "Assign Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the schedule assignment. The employee will no longer be tracked against this schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMut.mutate({ id: deleteId, companyId: activeCompanyId ?? undefined })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
