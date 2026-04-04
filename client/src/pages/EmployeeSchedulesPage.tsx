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
import { Plus, Pencil, Trash2, CalendarDays, MapPin, Clock, ArrowLeftRight, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { CardHeader, CardTitle } from "@/components/ui/card";

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
  const [shiftReqFilter, setShiftReqFilter] = useState<string>("pending");
  const [adminNoteId, setAdminNoteId] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [showRequestsPanel, setShowRequestsPanel] = useState(true);

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

  // Shift requests
  const { data: shiftRequestsData } = trpc.shiftRequests.adminList.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: !!activeCompanyId }
  );
  const approveShiftReq = trpc.shiftRequests.approve.useMutation({
    onSuccess: () => { utils.shiftRequests.adminList.invalidate(); toast.success("Request approved"); setAdminNoteId(null); setAdminNote(""); },
    onError: (e) => toast.error(e.message),
  });
  const rejectShiftReq = trpc.shiftRequests.reject.useMutation({
    onSuccess: () => { utils.shiftRequests.adminList.invalidate(); toast.success("Request rejected"); setAdminNoteId(null); setAdminNote(""); },
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

      {/* ══ SHIFT CHANGE & TIME OFF REQUESTS REVIEW ═══════════════════ */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowRequestsPanel(p => !p)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-primary" />
              Shift Change & Time Off Requests
              {(() => {
                const pending = (shiftRequestsData ?? []).filter((r: any) => r.status === "pending").length;
                return pending > 0 ? (
                  <span className="ml-1 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">{pending}</span>
                ) : null;
              })()}
            </CardTitle>
            {showRequestsPanel ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </div>
          {/* Filter tabs */}
          {showRequestsPanel && (
            <div className="flex gap-1.5 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
              {(["pending", "all", "approved", "rejected"] as const).map(f => (
                <button key={f} onClick={() => setShiftReqFilter(f)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    shiftReqFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === "pending" && (shiftRequestsData ?? []).filter((r: any) => r.status === "pending").length > 0 && (
                    <span className="ml-1 bg-amber-500 text-white rounded-full px-1 text-[10px]">
                      {(shiftRequestsData ?? []).filter((r: any) => r.status === "pending").length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        {showRequestsPanel && (
          <CardContent className="pt-0">
            {(() => {
              const allReqs = (shiftRequestsData ?? []) as any[];
              const filtered = shiftReqFilter === "all" ? allReqs : allReqs.filter((r: any) => r.status === shiftReqFilter);
              const typeLabels: Record<string, string> = {
                shift_change: "Shift Change", time_off: "Time Off",
                early_leave: "Early Leave", late_arrival: "Late Arrival", day_swap: "Day Swap",
              };
              const statusColors: Record<string, string> = {
                pending: "bg-amber-100 text-amber-700 border-amber-200",
                approved: "bg-green-100 text-green-700 border-green-200",
                rejected: "bg-red-100 text-red-700 border-red-200",
                cancelled: "bg-gray-100 text-gray-500 border-gray-200",
              };
              if (filtered.length === 0) return (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowLeftRight className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">{shiftReqFilter === "pending" ? "No pending requests" : "No requests found"}</p>
                </div>
              );
              return (
                <div className="divide-y">
                  {filtered.map((req: any) => (
                    <div key={req.id} className="py-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{req.employeeName ?? "Employee"}</span>
                            <span className="text-xs text-muted-foreground">• {typeLabels[req.requestType] ?? req.requestType}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColors[req.status] ?? "bg-muted text-muted-foreground"}`}>
                              {req.status?.charAt(0).toUpperCase() + req.status?.slice(1)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {req.requestedDate}
                            {req.requestedEndDate && req.requestedEndDate !== req.requestedDate ? ` → ${req.requestedEndDate}` : ""}
                            {req.requestedTime ? ` at ${req.requestedTime}` : ""}
                          </p>
                          <p className="text-xs mt-0.5 text-foreground/80">{req.reason}</p>
                          {req.adminNotes && (
                            <p className="text-xs mt-1 text-primary italic">Your note: {req.adminNotes}</p>
                          )}
                          {/* Admin note input for this request */}
                          {adminNoteId === req.id && (
                            <div className="mt-2 space-y-1.5">
                              <Textarea rows={2} placeholder="Add a note (optional)..." value={adminNote} onChange={e => setAdminNote(e.target.value)} className="text-xs" />
                              <div className="flex gap-2">
                                <Button size="sm" className="gap-1 h-7 text-xs bg-green-600 hover:bg-green-700"
                                  onClick={() => approveShiftReq.mutate({ id: req.id, adminNotes: adminNote || undefined })}>
                                  <Check size={12} /> Approve
                                </Button>
                                <Button size="sm" variant="destructive" className="gap-1 h-7 text-xs"
                                  onClick={() => rejectShiftReq.mutate({ id: req.id, adminNotes: adminNote || "No reason provided" })}>
                                  <X size={12} /> Reject
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAdminNoteId(null); setAdminNote(""); }}>Cancel</Button>
                              </div>
                            </div>
                          )}
                        </div>
                        {req.status === "pending" && adminNoteId !== req.id && (
                          <div className="flex gap-1.5 shrink-0">
                            <Button size="sm" className="gap-1 h-7 text-xs bg-green-600 hover:bg-green-700"
                              onClick={() => { setAdminNoteId(req.id); setAdminNote(""); }}>
                              <Check size={12} /> Review
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        )}
      </Card>

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
