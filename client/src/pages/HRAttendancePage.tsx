import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Clock, Users, CheckCircle2, XCircle, AlertCircle, Calendar,
  TrendingUp, Download, Pencil, Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const statusColors: Record<string, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  half_day: "bg-blue-100 text-blue-700",
  remote: "bg-purple-100 text-purple-700",
};

type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "remote";

function ClockInDialog({ employees, onSuccess }: { employees: { id: number; firstName: string; lastName: string; department: string | null }[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", status: "present" as AttendanceStatus, notes: "", date: new Date().toISOString().split("T")[0] });

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
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="text-sm" />
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
            <Label>Notes</Label>
            <Input placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="text-sm" />
          </div>
          <Button className="w-full" disabled={!form.employeeId || createMutation.isPending}
            onClick={() => createMutation.mutate({ employeeId: Number(form.employeeId), status: form.status, notes: form.notes || undefined, date: form.date })}>
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

export default function HRAttendancePage() {
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [deptFilter, setDeptFilter] = useState("all");

  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const { data: employees } = trpc.hr.listEmployees.useQuery({ department: deptFilter !== "all" ? deptFilter : undefined, companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock size={24} className="text-[var(--smartpro-orange)]" />
            Attendance Tracking
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor employee attendance, punctuality, and presence</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => toast.info("Export feature coming soon")}>
            <Download size={14} /> Export
          </Button>
          <ClockInDialog employees={(employees ?? []).map(e => ({ ...e, department: e.department ?? null }))} onSuccess={refetch} />
        </div>
      </div>

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
                          {r.date ? new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
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
    </div>
  );
}
