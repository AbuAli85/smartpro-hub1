import { useMemo, useState } from "react";
import { trpc, type RouterOutputs } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { cn } from "@/lib/utils";
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
  DialogDescription,
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
import { Plus, Pencil, Trash2, CalendarDays, MapPin, Clock, ArrowLeftRight, Check, X, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";

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

type ScheduleRow = RouterOutputs["scheduling"]["listEmployeeSchedules"][number];

interface ScheduleFieldErrors {
  employeeUserId?: string;
  siteId?: string;
  shiftTemplateId?: string;
  workingDays?: string;
}

/** Working day chips: emerald reads as “scheduled”, not destructive red. */
function workingDayPillClass(on: boolean) {
  return on
    ? "bg-emerald-600 text-white border border-emerald-700 shadow-sm"
    : "bg-muted/70 text-muted-foreground border border-transparent";
}

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
  const [adminCalView, setAdminCalView] = useState<"calendar" | "list">("calendar");
  const [adminCalMonth, setAdminCalMonth] = useState(() => new Date().getMonth());
  const [adminCalYear, setAdminCalYear] = useState(() => new Date().getFullYear());
  const [adminCalSelectedDay, setAdminCalSelectedDay] = useState<string | null>(null);
  const [showCalPanel, setShowCalPanel] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<ScheduleFieldErrors>({});

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

  const scheduleGroups = useMemo(() => {
    const map = new Map<number, ScheduleRow[]>();
    for (const s of schedules) {
      const k = s.employeeUserId;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return Array.from(map.entries())
      .map(([employeeUserId, rows]) => {
        const sorted = [...rows].sort((a, b) => {
          const ta = a.shift?.startTime ?? "";
          const tb = b.shift?.startTime ?? "";
          if (ta !== tb) return ta.localeCompare(tb);
          return a.id - b.id;
        });
        const name = sorted[0]?.employee?.name?.trim() || "Unknown";
        return { employeeUserId, name, rows: sorted };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [schedules]);

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
    setFieldErrors({});
    setOpen(true);
  }

  function openEdit(s: ScheduleRow) {
    setEditId(s.id);
    setFieldErrors({});
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
    setFieldErrors((e) => ({ ...e, workingDays: undefined }));
    setForm((prev) => ({
      ...prev,
      workingDays: prev.workingDays.includes(d)
        ? prev.workingDays.filter((x) => x !== d)
        : [...prev.workingDays, d].sort(),
    }));
  }

  function handleSubmit() {
    const err: ScheduleFieldErrors = {};
    if (!form.employeeUserId) err.employeeUserId = "Select an employee.";
    if (!form.siteId) err.siteId = "Select an attendance site.";
    if (!form.shiftTemplateId) err.shiftTemplateId = "Select a shift template.";
    if (form.workingDays.length === 0) err.workingDays = "Select at least one working day.";
    if (Object.keys(err).length > 0) {
      setFieldErrors(err);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    if (!activeCompanyId) {
      toast.error("No active company");
      return;
    }
    setFieldErrors({});
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
        <div className="space-y-4">
          {scheduleGroups.map((g) => (
            <Card key={g.employeeUserId} className="overflow-hidden shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/40">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="text-xs font-semibold">
                    {getInitials(g.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">{g.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.rows.length} schedule{g.rows.length === 1 ? "" : "s"} (e.g. split shifts)
                  </p>
                </div>
              </div>
              <CardContent className="p-0 divide-y">
                {g.rows.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {s.shift && (
                          <Badge
                            style={{ backgroundColor: s.shift.color ?? "#6366f1", color: "white" }}
                            className="text-xs"
                          >
                            {s.shift.name}
                          </Badge>
                        )}
                        {!s.isActive && (
                          <Badge variant="secondary" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                          From <strong className="text-foreground">{s.startDate}</strong>
                          {s.endDate ? ` to ${s.endDate}` : " (ongoing)"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1" aria-label="Working days">
                        {DAYS.map((d) => (
                          <span
                            key={d.value}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium border",
                              workingDayPillClass(s.workingDays.split(",").map(Number).includes(d.value))
                            )}
                          >
                            {d.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1 sm:flex-col sm:items-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => openEdit(s)}
                      >
                        <Pencil size={14} /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => setDeleteId(s.id)}
                      >
                        <Trash2 size={14} /> Remove
                      </Button>
                    </div>
                  </div>
                ))}
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

      {/* ══ Admin Requests Calendar Overview ══ */}
      <Card>
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setShowCalPanel(p => !p)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Requests Calendar Overview</CardTitle>
              <span className="text-xs text-muted-foreground ml-1">— all employees</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                {(["calendar", "list"] as const).map(v => (
                  <button key={v} onClick={() => setAdminCalView(v)}
                    className={`text-xs px-2 py-1 rounded ${adminCalView === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {v === "calendar" ? "Calendar" : "List"}
                  </button>
                ))}
              </div>
              {showCalPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
          </div>
        </CardHeader>
        {showCalPanel && (
          <CardContent className="pt-0">
            {(() => {
              const allReqs = (shiftRequestsData ?? []) as any[];
              const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
              const daysInMonth = new Date(adminCalYear, adminCalMonth + 1, 0).getDate();
              const firstDow = new Date(adminCalYear, adminCalMonth, 1).getDay();
              const pad = (n: number) => String(n).padStart(2, "0");
              const dotColors: Record<string, string> = {
                pending: "bg-amber-400",
                approved: "bg-green-500",
                rejected: "bg-red-400",
                cancelled: "bg-gray-300",
              };
              const badgeColors: Record<string, string> = {
                pending: "bg-amber-100 text-amber-700",
                approved: "bg-green-100 text-green-700",
                rejected: "bg-red-100 text-red-700",
                cancelled: "bg-gray-100 text-gray-500",
              };
              const typeLabels: Record<string, string> = {
                shift_change: "Shift Change", time_off: "Time Off",
                early_leave: "Early Leave", late_arrival: "Late Arrival", day_swap: "Day Swap",
              };
              // Build date map: dateStr -> requests[]
              const dayMap: Record<string, any[]> = {};
              allReqs.forEach(r => {
                const start = r.requestedDate;
                const end = r.requestedEndDate || start;
                const cur = new Date(start);
                const endD = new Date(end);
                while (cur <= endD) {
                  const key = cur.toISOString().split("T")[0];
                  if (!dayMap[key]) dayMap[key] = [];
                  dayMap[key].push(r);
                  cur.setDate(cur.getDate() + 1);
                }
              });

              if (adminCalView === "list") {
                const sorted = [...allReqs].sort((a, b) => (b.requestedDate ?? "").localeCompare(a.requestedDate ?? ""));
                return (
                  <div className="space-y-2">
                    {sorted.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No requests yet</p>
                    ) : sorted.map((r: any) => (
                      <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg border">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${dotColors[r.status] ?? "bg-gray-300"}`} />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm">{r.employeeName ?? "Employee"}</span>
                          <span className="text-xs text-muted-foreground ml-2">{typeLabels[r.requestType] ?? r.requestType}</span>
                          <span className="text-xs text-muted-foreground ml-2">{r.requestedDate}{r.requestedEndDate && r.requestedEndDate !== r.requestedDate ? ` → ${r.requestedEndDate}` : ""}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColors[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div>
                  {/* Month nav */}
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => { if (adminCalMonth === 0) { setAdminCalMonth(11); setAdminCalYear(y => y - 1); } else setAdminCalMonth(m => m - 1); }}
                      className="p-1 rounded hover:bg-muted">
                      <ChevronLeft size={16} />
                    </button>
                    <span className="font-semibold text-sm">{MONTH_NAMES[adminCalMonth]} {adminCalYear}</span>
                    <button onClick={() => { if (adminCalMonth === 11) { setAdminCalMonth(0); setAdminCalYear(y => y + 1); } else setAdminCalMonth(m => m + 1); }}
                      className="p-1 rounded hover:bg-muted">
                      <ChevronRight size={16} />
                    </button>
                  </div>
                  {/* Legend */}
                  <div className="flex gap-4 mb-3 flex-wrap">
                    {(["approved","pending","rejected","cancelled"] as const).map(s => (
                      <div key={s} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${dotColors[s]}`} />
                        <span className="text-xs text-muted-foreground capitalize">{s}</span>
                      </div>
                    ))}
                  </div>
                  {/* Day headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {DAY_NAMES.map(d => (
                      <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  {/* Grid */}
                  <div className="grid grid-cols-7 gap-0.5">
                    {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const day = i + 1;
                      const dateStr = `${adminCalYear}-${pad(adminCalMonth + 1)}-${pad(day)}`;
                      const reqs = dayMap[dateStr] ?? [];
                      const isToday = dateStr === new Date().toISOString().split("T")[0];
                      const isSelected = adminCalSelectedDay === dateStr;
                      const statusSet = Array.from(new Set<string>(reqs.map((r: any) => r.status as string)));
                      return (
                        <div key={day}
                          onClick={() => setAdminCalSelectedDay(isSelected ? null : dateStr)}
                          className={`min-h-[52px] p-1 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? "border-primary bg-primary/5" :
                            isToday ? "border-primary/40 bg-primary/5" :
                            reqs.length > 0 ? "border-border hover:border-primary/30 bg-muted/30" :
                            "border-transparent hover:bg-muted/20"
                          }`}>
                          <div className={`text-xs font-medium mb-1 ${isToday ? "text-primary" : "text-foreground/70"}`}>{day}</div>
                          <div className="flex flex-wrap gap-0.5">
                            {statusSet.map(s => (
                              <div key={s} className={`w-2 h-2 rounded-full ${dotColors[s] ?? "bg-gray-300"}`} title={s} />
                            ))}
                          </div>
                          {reqs.length > 1 && <div className="text-[10px] text-muted-foreground mt-0.5">{reqs.length}</div>}
                        </div>
                      );
                    })}
                  </div>
                  {/* Day detail */}
                  {adminCalSelectedDay && dayMap[adminCalSelectedDay] && (
                    <div className="mt-4 p-3 border rounded-lg bg-muted/30">
                      <p className="text-sm font-semibold mb-2">{adminCalSelectedDay}</p>
                      <div className="space-y-2">
                        {dayMap[adminCalSelectedDay].map((r: any) => (
                          <div key={r.id} className="flex items-start gap-2 p-2 bg-background rounded border">
                            <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotColors[r.status] ?? "bg-gray-300"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{r.employeeName ?? "Employee"}</span>
                                <span className="text-xs text-muted-foreground">{typeLabels[r.requestType] ?? r.requestType}</span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>
                              {r.adminNotes && <p className="text-xs text-primary mt-0.5 italic">Note: {r.adminNotes}</p>}
                              {r.attachmentUrl && (
                                <a href={r.attachmentUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-blue-600 underline mt-0.5 block">View attachment</a>
                              )}
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${badgeColors[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                              {r.status?.charAt(0).toUpperCase() + r.status?.slice(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        )}
      </Card>

      {/* Assign / Edit Dialog */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFieldErrors({});
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Schedule" : "Assign Schedule"}</DialogTitle>
            <DialogDescription>
              Each row is one site + shift + working-day pattern. Add another assignment for the same person for a
              second daily shift (e.g. morning and evening).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="sched-employee">Employee *</Label>
              <Select
                value={form.employeeUserId}
                onValueChange={(v) => {
                  setFieldErrors((e) => ({ ...e, employeeUserId: undefined }));
                  setForm({ ...form, employeeUserId: v });
                }}
                disabled={employees.length === 0}
              >
                <SelectTrigger
                  id="sched-employee"
                  aria-invalid={!!fieldErrors.employeeUserId}
                  className={cn("w-full min-w-0 justify-between", fieldErrors.employeeUserId && "border-destructive")}
                >
                  <SelectValue placeholder={employees.length === 0 ? "No employees in company" : "Select employee..."} />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.userId ?? e.id} value={String(e.userId ?? e.id)}>
                      {e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.employeeUserId ? (
                <p className="text-xs text-destructive">{fieldErrors.employeeUserId}</p>
              ) : employees.length === 0 ? (
                <p className="text-xs text-muted-foreground">Add employees under HR → Employees first.</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-site">Attendance Site *</Label>
              <Select
                value={form.siteId}
                onValueChange={(v) => {
                  setFieldErrors((e) => ({ ...e, siteId: undefined }));
                  setForm({ ...form, siteId: v });
                }}
                disabled={sites.length === 0}
              >
                <SelectTrigger
                  id="sched-site"
                  aria-invalid={!!fieldErrors.siteId}
                  className={cn("w-full min-w-0 justify-between", fieldErrors.siteId && "border-destructive")}
                >
                  <SelectValue placeholder={sites.length === 0 ? "No sites — create under Attendance Sites" : "Select site..."} />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s: { id: number; name: string }) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.siteId ? <p className="text-xs text-destructive">{fieldErrors.siteId}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-shift">Shift Template *</Label>
              <Select
                value={form.shiftTemplateId}
                onValueChange={(v) => {
                  setFieldErrors((e) => ({ ...e, shiftTemplateId: undefined }));
                  setForm({ ...form, shiftTemplateId: v });
                }}
                disabled={shifts.length === 0}
              >
                <SelectTrigger
                  id="sched-shift"
                  aria-invalid={!!fieldErrors.shiftTemplateId}
                  className={cn("w-full min-w-0 justify-between", fieldErrors.shiftTemplateId && "border-destructive")}
                >
                  <SelectValue
                    placeholder={shifts.length === 0 ? "No shifts — create under Shift Templates" : "Select shift..."}
                  />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({s.startTime} – {s.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.shiftTemplateId ? <p className="text-xs text-destructive">{fieldErrors.shiftTemplateId}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label>Working Days *</Label>
              <div className="flex gap-2 flex-wrap" role="group" aria-label="Working days of week">
                {DAYS.map((d) => {
                  const on = form.workingDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                        on
                          ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                          : "bg-background text-foreground border-border hover:bg-muted"
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {fieldErrors.workingDays ? <p className="text-xs text-destructive">{fieldErrors.workingDays}</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <DateInput
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Shown as DD/MM/YYYY; stored as YYYY-MM-DD.</p>
              </div>
              <div className="space-y-1.5">
                <Label>End Date (optional)</Label>
                <DateInput
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Leave blank for an open-ended roster.</p>
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
