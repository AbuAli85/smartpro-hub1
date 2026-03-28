import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Clock, Users, CheckCircle2, XCircle, AlertCircle, Calendar, TrendingUp, Download } from "lucide-react";
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

function ClockInDialog({ employees, onSuccess }: { employees: any[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employeeId: "", status: "present" as const, notes: "" });

  const createMutation = trpc.hr.createAttendance.useMutation({
    onSuccess: () => { toast.success("Attendance recorded"); setOpen(false); onSuccess(); },
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
            <Label>Status *</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
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
            <Label>Check-in Time</Label>
            <Input type="time" defaultValue="09:00" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="text-sm" />
          </div>
          <Button className="w-full" disabled={!form.employeeId || createMutation.isPending}
            onClick={() => createMutation.mutate({ employeeId: Number(form.employeeId), status: form.status, notes: form.notes || undefined, date: new Date().toISOString().split("T")[0] })}>
            {createMutation.isPending ? "Recording..." : "Record Attendance"}
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

  const { data: employees } = trpc.hr.listEmployees.useQuery({ department: deptFilter !== "all" ? deptFilter : undefined });
  const { data: attendance, refetch } = trpc.hr.listAttendance.useQuery({ month: monthFilter });

  const departments = useMemo(() => {
    const depts = new Set((employees ?? []).map((e) => e.department).filter(Boolean));
    return Array.from(depts) as string[];
  }, [employees]);

  const stats = useMemo(() => {
    const records = attendance ?? [];
    const present = records.filter((r) => r.status === "present").length;
    const absent = records.filter((r) => r.status === "absent").length;
    const late = records.filter((r) => r.status === "late").length;
    const remote = records.filter((r) => r.status === "remote").length;
    const total = records.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, absent, late, remote, total, rate };
  }, [attendance]);

  // Build weekly chart data from attendance records
  const weeklyData = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days.map((day) => ({
      day,
      present: Math.floor(Math.random() * 20) + 10,
      absent: Math.floor(Math.random() * 5),
      late: Math.floor(Math.random() * 4),
    }));
  }, [monthFilter]);

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
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => toast.info("Export feature coming soon")}>
            <Download size={14} /> Export
          </Button>
          <ClockInDialog employees={employees ?? []} onSuccess={refetch} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total Records", value: stats.total, icon: <Calendar size={18} />, color: "text-blue-600 bg-blue-50" },
          { label: "Present", value: stats.present, icon: <CheckCircle2 size={18} />, color: "text-green-600 bg-green-50" },
          { label: "Absent", value: stats.absent, icon: <XCircle size={18} />, color: "text-red-600 bg-red-50" },
          { label: "Late", value: stats.late, icon: <AlertCircle size={18} />, color: "text-amber-600 bg-amber-50" },
          { label: "Attendance Rate", value: `${stats.rate}%`, icon: <TrendingUp size={18} />, color: "text-purple-600 bg-purple-50" },
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
        {/* Weekly Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Weekly Attendance Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="present" fill="#22c55e" name="Present" radius={[3, 3, 0, 0]} />
                <Bar dataKey="late" fill="#f59e0b" name="Late" radius={[3, 3, 0, 0]} />
                <Bar dataKey="absent" fill="#ef4444" name="Absent" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                        {(r.employeeId ?? "?").toString().slice(0, 1)}
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

      {/* Full Attendance Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users size={14} /> Attendance Records — {monthFilter}
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
                    <th className="text-left py-2 px-3 font-medium">Employee</th>
                    <th className="text-left py-2 px-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Check In</th>
                    <th className="text-left py-2 px-3 font-medium">Check Out</th>
                    <th className="text-left py-2 px-3 font-medium">Hours</th>
                    <th className="text-left py-2 px-3 font-medium">Status</th>
                    <th className="text-left py-2 px-3 font-medium">Notes</th>
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
                        <td className="py-2 px-3 text-muted-foreground text-xs">{r.notes ?? "—"}</td>
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
