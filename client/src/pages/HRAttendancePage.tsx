import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Clock, Users, CheckCircle2, XCircle, AlertCircle, Calendar,
  TrendingUp, Download, Pencil, Trash2, CheckCircle, RefreshCw,
  ClipboardList, CalendarDays
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { DateInput } from "@/components/ui/date-input";

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  half_day: "bg-blue-100 text-blue-700",
  remote: "bg-purple-100 text-purple-700",
};

type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "remote";

function ClockInDialog({ employees, onSuccess, companyId }: { employees: { id: number; firstName: string; lastName: string; department: string | null }[]; onSuccess: () => void; companyId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", status: "present" as AttendanceStatus, notes: "", date: new Date().toISOString().split("T")[0] });
  const reasonOk = form.notes.trim().length >= 10;

  const utils = trpc.useUtils();
  const createMutation = trpc.hr.createAttendance.useMutation({
    onSuccess: () => {
      toast.success("Attendance recorded");
      setOpen(false);
      utils.hr.listAttendance.invalidate();
      utils.hr.attendanceStats.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Clock size={14} /> Record Attendance</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Attendance</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Employee *</Label>
            <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName} — {e.department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <DateInput value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Status *</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AttendanceStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason / audit note *</Label>
            <Textarea
              placeholder="Required for compliance — who asked for this entry, why, or evidence (min. 10 characters)…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="text-sm min-h-[88px]"
            />
            <p className="text-[11px] text-muted-foreground">Stored on the record for audit. Use clear, factual wording.</p>
          </div>
          <Button className="w-full" disabled={!form.employeeId || !reasonOk || createMutation.isPending}
            onClick={() => createMutation.mutate({ employeeId: Number(form.employeeId), status: form.status, notes: form.notes.trim(), date: form.date, companyId: companyId ?? undefined })}>
            {createMutation.isPending ? "Recording..." : "Record Attendance"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditAttendanceDialog({ record, onSuccess }: { record: { id: number; status: string; notes: string | null }; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(record.status as AttendanceStatus);
  const [notes, setNotes] = useState(record.notes ?? "");

  const utils = trpc.useUtils();
  const updateMutation = trpc.hr.updateAttendance.useMutation({
    onSuccess: () => {
      toast.success("Record updated");
      setOpen(false);
      utils.hr.listAttendance.invalidate();
      utils.hr.attendanceStats.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Pencil size={12} /></Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Attendance Record</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="text-sm" />
          </div>
          <Button className="w-full" disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate({ id: record.id, status, notes: notes || undefined })}>
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function boardStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    holiday: { label: "Holiday", className: "border-blue-300 text-blue-700 bg-blue-50" },
    upcoming: { label: "Upcoming", className: "border-slate-300 text-slate-700 bg-slate-50" },
    not_checked_in: { label: "Not checked in", className: "border-amber-300 text-amber-800 bg-amber-50" },
    late_no_checkin: { label: "Late · no arrival", className: "border-orange-300 text-orange-800 bg-orange-50" },
    absent: { label: "Absent", className: "border-red-300 text-red-700 bg-red-50" },
    checked_in_on_time: { label: "Checked in", className: "border-emerald-300 text-emerald-800 bg-emerald-50" },
    checked_in_late: { label: "Checked in · late", className: "border-yellow-300 text-yellow-800 bg-yellow-50" },
    checked_out: { label: "Completed", className: "border-gray-300 text-gray-700 bg-gray-50" },
  };
  const m = map[status] ?? { label: status, className: "text-muted-foreground" };
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

// ─── Today's Live Board ──────────────────────────────────────────────────────
function TodayBoard() {
  const { data, isLoading, refetch } = trpc.scheduling.getTodayBoard.useQuery({});
  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Loading today's board…</div>;
  if (!data) return <div className="py-12 text-center text-muted-foreground">No data available</div>;
  const s = data.summary;
  const stats = [
    { label: "Scheduled", count: s.total, color: "text-slate-700", bg: "bg-slate-50" },
    { label: "Upcoming", count: s.upcoming, color: "text-slate-600", bg: "bg-slate-50/80" },
    { label: "Awaiting check-in", count: s.notCheckedIn, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "Checked in (active)", count: s.checkedInActive, color: "text-emerald-700", bg: "bg-emerald-50" },
    { label: "Late / no arrival", count: s.lateNoCheckin, color: "text-orange-700", bg: "bg-orange-50" },
    { label: "Completed", count: s.checkedOut, color: "text-gray-700", bg: "bg-gray-50" },
    { label: "Absent (confirmed)", count: s.absent, color: "text-red-600", bg: "bg-red-50" },
    { label: "Holiday", count: s.holiday, color: "text-blue-600", bg: "bg-blue-50" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Date(data.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
            Absent applies only after the shift ends with no check-in. Before that, you’ll see upcoming, awaiting check-in, or late / no arrival.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map((st) => (
          <div key={st.label} className={`rounded-lg p-3 ${st.bg}`}>
            <div className={`text-xl font-bold ${st.color}`}>{st.count}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{st.label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">Employee</th>
              <th className="text-left px-3 py-2.5 font-medium">Site</th>
              <th className="text-left px-3 py-2.5 font-medium">Shift</th>
              <th className="text-left px-3 py-2.5 font-medium">Check in</th>
              <th className="text-left px-3 py-2.5 font-medium">Check out</th>
              <th className="text-left px-3 py-2.5 font-medium">Delay</th>
              <th className="text-left px-3 py-2.5 font-medium">Duration</th>
              <th className="text-left px-3 py-2.5 font-medium">Source</th>
              <th className="text-left px-3 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.board.map((row: any) => (
              <tr key={row.scheduleId} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2.5">
                  <div className="font-medium">{row.employeeDisplayName ?? row.employee?.name ?? `Schedule #${row.scheduleId}`}</div>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[140px] truncate" title={row.siteName ?? ""}>
                  {row.siteName ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">
                  {row.shift ? (row.shift as { name?: string | null }).name ?? "—" : "—"}
                  {row.expectedStart && row.expectedEnd ? (
                    <div className="text-[11px]">{row.expectedStart}–{row.expectedEnd}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{row.checkInAt ? new Date(row.checkInAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{row.checkOutAt ? new Date(row.checkOutAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.delayMinutes != null && row.delayMinutes > 0 ? `${row.delayMinutes}m` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                  {row.durationMinutes != null && row.checkInAt ? `${row.durationMinutes}m` : "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{row.methodLabel ?? "—"}</td>
                <td className="px-3 py-2.5">{boardStatusBadge(row.status)}</td>
              </tr>
            ))}
            {data.board.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No employees scheduled today</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Correction Requests ──────────────────────────────────────────────────────
function CorrectionRequests() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const { data, isLoading, refetch } = trpc.attendance.listCorrections.useQuery({ status: statusFilter });
  const approveMut = trpc.attendance.approveCorrection.useMutation({
    onSuccess: () => { toast.success("Correction approved"); setReviewTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.attendance.rejectCorrection.useMutation({
    onSuccess: () => { toast.success("Correction rejected"); setReviewTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const handleSubmit = () => {
    if (!reviewTarget) return;
    if (reviewTarget.action === "approve") approveMut.mutate({ correctionId: reviewTarget.id, adminNote: adminNote || undefined });
    else {
      if (!adminNote.trim() || adminNote.trim().length < 5) { toast.error("Please provide a reason for rejection"); return; }
      rejectMut.mutate({ correctionId: reviewTarget.id, adminNote });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
      </div>
      {isLoading ? <div className="py-12 text-center text-muted-foreground">Loading…</div> : (
        <div className="space-y-3">
          {(data ?? []).map(({ correction, employee }) => (
            <Card key={correction.id}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{employee ? `${employee.firstName} ${employee.lastName}` : "Unknown"}</span>
                    {employee?.position && <span className="text-xs text-muted-foreground">{employee.position}</span>}
                    {correction.status === "pending" ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">Pending</Badge>
                      : correction.status === "approved" ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">Approved</Badge>
                      : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Rejected</Badge>}
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground space-y-0.5">
                    <div><span className="font-medium text-foreground">Date:</span> {correction.requestedDate}{correction.requestedCheckIn && <span className="ml-3"><span className="font-medium text-foreground">In:</span> {correction.requestedCheckIn.slice(0, 5)}</span>}{correction.requestedCheckOut && <span className="ml-3"><span className="font-medium text-foreground">Out:</span> {correction.requestedCheckOut.slice(0, 5)}</span>}</div>
                    <div><span className="font-medium text-foreground">Reason:</span> {correction.reason}</div>
                    {correction.adminNote && <div><span className="font-medium text-foreground">Note:</span> {correction.adminNote}</div>}
                  </div>
                </div>
                {correction.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setReviewTarget({ id: correction.id, action: "approve" }); setAdminNote(""); }}><CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setReviewTarget({ id: correction.id, action: "reject" }); setAdminNote(""); }}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                  </div>
                )}
              </div>
            </CardContent></Card>
          ))}
          {(data ?? []).length === 0 && <div className="py-12 text-center text-muted-foreground">No {statusFilter === "all" ? "" : statusFilter} correction requests</div>}
        </div>
      )}
      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.action === "approve" ? "Approve Correction" : "Reject Correction"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="adminNoteCorr">{reviewTarget?.action === "approve" ? "Admin Note (optional)" : "Reason for rejection (required)"}</Label>
            <Textarea id="adminNoteCorr" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={reviewTarget?.action === "approve" ? "Optional note…" : "Explain why…"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={approveMut.isPending || rejectMut.isPending} className={reviewTarget?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{reviewTarget?.action === "approve" ? "Approve" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Manual Check-in Requests ─────────────────────────────────────────────────
function ManualCheckInRequests() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewTarget, setReviewTarget] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const { data, isLoading, refetch } = trpc.attendance.listManualCheckIns.useQuery({ status: statusFilter });
  const approveMut = trpc.attendance.approveManualCheckIn.useMutation({
    onSuccess: () => { toast.success("Check-in approved"); setReviewTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const rejectMut = trpc.attendance.rejectManualCheckIn.useMutation({
    onSuccess: () => { toast.success("Check-in rejected"); setReviewTarget(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const handleSubmit = () => {
    if (!reviewTarget) return;
    if (reviewTarget.action === "approve") approveMut.mutate({ requestId: reviewTarget.id, adminNote: adminNote || undefined });
    else {
      if (!adminNote.trim() || adminNote.trim().length < 5) { toast.error("Please provide a reason"); return; }
      rejectMut.mutate({ requestId: reviewTarget.id, adminNote });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh</Button>
      </div>
      {isLoading ? <div className="py-12 text-center text-muted-foreground">Loading…</div> : (
        <div className="space-y-3">
          {(data ?? []).map(({ req, site }) => (
            <Card key={req.id}><CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">User #{req.employeeUserId}</span>
                    {site?.name && <span className="text-xs text-muted-foreground">@ {site.name}</span>}
                    {req.status === "pending" ? <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">Pending</Badge>
                      : req.status === "approved" ? <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">Approved</Badge>
                      : <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50">Rejected</Badge>}
                  </div>
                  <div className="mt-1.5 text-sm text-muted-foreground space-y-0.5">
                    <div><span className="font-medium text-foreground">Justification:</span> {req.justification}</div>
                    {req.adminNote && <div><span className="font-medium text-foreground">Admin Note:</span> {req.adminNote}</div>}
                    <div className="text-xs">{req.requestedAt ? new Date(req.requestedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : ""}</div>
                  </div>
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => { setReviewTarget({ id: req.id, action: "approve" }); setAdminNote(""); }}><CheckCircle className="h-3.5 w-3.5 mr-1" /> Approve</Button>
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => { setReviewTarget({ id: req.id, action: "reject" }); setAdminNote(""); }}><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
                  </div>
                )}
              </div>
            </CardContent></Card>
          ))}
          {(data ?? []).length === 0 && <div className="py-12 text-center text-muted-foreground">No {statusFilter === "all" ? "" : statusFilter} manual check-in requests</div>}
        </div>
      )}
      <Dialog open={!!reviewTarget} onOpenChange={() => setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.action === "approve" ? "Approve Manual Check-in" : "Reject Manual Check-in"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="adminNoteManual">{reviewTarget?.action === "approve" ? "Admin Note (optional)" : "Reason for rejection (required)"}</Label>
            <Textarea id="adminNoteManual" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder={reviewTarget?.action === "approve" ? "Optional note…" : "Explain why…"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={approveMut.isPending || rejectMut.isPending} className={reviewTarget?.action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>{reviewTarget?.action === "approve" ? "Approve" : "Reject"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function HRAttendancePage() {
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [deptFilter, setDeptFilter] = useState("all");

  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const { data: employees } = trpc.hr.listEmployees.useQuery({ department: deptFilter !== "all" ? deptFilter : undefined, status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: attendance, refetch } = trpc.hr.listAttendance.useQuery({ month: monthFilter, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: stats } = trpc.hr.attendanceStats.useQuery({ month: monthFilter, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const deleteMutation = trpc.hr.deleteAttendance.useMutation({
    onSuccess: () => {
      toast.success("Record deleted");
      utils.hr.listAttendance.invalidate();
      utils.hr.attendanceStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const departments = useMemo(() => {
    const depts = new Set((employees ?? []).map((e) => e.department).filter(Boolean));
    return Array.from(depts) as string[];
  }, [employees]);

  const total = (stats?.present ?? 0) + (stats?.absent ?? 0) + (stats?.late ?? 0) + (stats?.half_day ?? 0) + (stats?.remote ?? 0);
  const rate = total > 0 ? Math.round(((stats?.present ?? 0) / total) * 100) : 0;

  const today = new Date().toISOString().split("T")[0];
  const todayRecords = (attendance ?? []).filter((r) => {
    const d = r.date ? new Date(r.date).toISOString().split("T")[0] : "";
    return d === today;
  });

  const { data: pendingCorrections } = trpc.attendance.listCorrections.useQuery({ status: "pending", limit: 1 });
  const { data: pendingManual } = trpc.attendance.listManualCheckIns.useQuery({ status: "pending", limit: 1 });
  const pendingCorrDot = (pendingCorrections ?? []).length > 0;
  const pendingManualDot = (pendingManual ?? []).length > 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock size={24} className="text-[var(--smartpro-orange)]" />
            Attendance Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor daily attendance, review records, and manage correction requests</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => toast.info("Export feature coming soon")}>
            <Download size={14} /> Export
          </Button>
          <ClockInDialog employees={(employees ?? []).map(e => ({ ...e, department: e.department ?? null }))} onSuccess={refetch} companyId={activeCompanyId} />
        </div>
      </div>

      {/* Tabs: Today Board | HR Records | Corrections | Manual Check-ins */}
      <Tabs defaultValue="today">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="today" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Today's Board</TabsTrigger>
          <TabsTrigger value="records" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> HR Records</TabsTrigger>
          <TabsTrigger value="corrections" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Corrections{pendingCorrDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}</TabsTrigger>
          <TabsTrigger value="manual" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Manual Check-ins{pendingManualDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="mt-4"><TodayBoard /></TabsContent>
        <TabsContent value="corrections" className="mt-4"><CorrectionRequests /></TabsContent>
        <TabsContent value="manual" className="mt-4"><ManualCheckInRequests /></TabsContent>
        <TabsContent value="records" className="mt-4">

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Present", value: stats?.present ?? 0, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: "Absent", value: stats?.absent ?? 0, icon: <XCircle size={18} />, color: "text-red-600 bg-red-50" },
          { label: "Late", value: stats?.late ?? 0, icon: <AlertCircle size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Remote", value: stats?.remote ?? 0, icon: <Calendar size={18} />, color: "text-purple-600 bg-purple-50" },
          { label: "Attendance Rate", value: `${rate}%`, icon: <TrendingUp size={18} />, color: "text-blue-600 bg-blue-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Month</Label>
          <Input type="month" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="h-8 text-sm w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Department</Label>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Chart — real DB data */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Weekly Attendance — {monthFilter}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.byDay && stats.byDay.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.byDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="present" fill="#22c55e" name="Present" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="late" fill="#f59e0b" name="Late" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="absent" fill="#ef4444" name="Absent" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Calendar size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No attendance data for this period</p>
                  <p className="text-xs mt-1">Record attendance to see the chart</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock size={14} /> Today's Attendance
              <Badge variant="outline" className="text-xs ml-auto">{todayRecords.length} records</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {todayRecords.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No records for today</p>
                <p className="text-xs mt-1">Use "Record Attendance" to add entries</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {todayRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {String(r.employeeId ?? "?").slice(0, 1)}
                      </div>
                      <span className="text-sm font-medium">Emp #{r.employeeId}</span>
                    </div>
                    <Badge className={`text-xs ${statusColors[r.status ?? "present"] ?? ""}`}>
                      {r.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full Attendance Table with Edit/Delete */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} /> Attendance Records — {monthFilter}
            <span className="ml-auto text-xs text-muted-foreground font-normal">{(attendance ?? []).length} records</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!attendance || attendance.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock size={40} className="mx-auto mb-3 opacity-20" />
              <p className="font-medium">No attendance records found</p>
              <p className="text-sm mt-1">Start recording attendance using the button above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="text-left py-2 px-3 font-medium">Employee</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Date</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Check In</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Check Out</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Hours</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Status</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Notes</th>
                    <th scope="col" className="text-left py-2 px-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((r) => {
                    const checkIn = r.checkIn ? new Date(r.checkIn) : null;
                    const checkOut = r.checkOut ? new Date(r.checkOut) : null;
                    const hours = checkIn && checkOut
                      ? ((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(1)
                      : "—";
                    return (
                      <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 font-medium">Emp #{r.employeeId}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {r.date ? fmtDateLong(r.date) : "—"}
                        </td>
                        <td className="py-2 px-3">{checkIn ? checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="py-2 px-3">{checkOut ? checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="py-2 px-3">{hours !== "—" ? `${hours}h` : "—"}</td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs ${statusColors[r.status ?? "present"] ?? ""}`}>
                            {r.status ?? "present"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs max-w-[120px] truncate">{r.notes ?? "—"}</td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            <EditAttendanceDialog
                              record={{ id: r.id, status: r.status ?? "present", notes: r.notes ?? null }}
                              onSuccess={refetch}
                            />
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (confirm("Delete this attendance record?")) {
                                  deleteMutation.mutate({ id: r.id });
                                }
                              }}>
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}
