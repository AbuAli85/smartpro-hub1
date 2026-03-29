import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Briefcase, Plus, Search, Users, UserCheck, UserX, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function NewEmployeeDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    nationality: "",
    passportNumber: "",
    department: "",
    position: "",
    employmentType: "full_time" as const,
    salary: "",
    currency: "OMR",
    hireDate: "",
    employeeNumber: "",
  });

  const createMutation = trpc.hr.createEmployee.useMutation({
    onSuccess: () => {
      toast.success("Employee added successfully");
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Plus size={16} /> Add Employee</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nationality</Label>
              <Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Passport Number</Label>
              <Input value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input placeholder="e.g. Operations" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Position</Label>
              <Input placeholder="e.g. PRO Officer" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <Select value={form.employmentType} onValueChange={(v) => setForm({ ...form, employmentType: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full Time</SelectItem>
                  <SelectItem value="part_time">Part Time</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hire Date</Label>
              <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Salary</Label>
              <Input type="number" placeholder="0.00" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OMR">OMR</SelectItem>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="SAR">SAR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Employee Number</Label>
            <Input placeholder="e.g. EMP-001" value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} />
          </div>
          <Button className="w-full" disabled={!form.firstName || !form.lastName || createMutation.isPending}
            onClick={() => createMutation.mutate({ ...form, salary: form.salary ? Number(form.salary) : undefined })}>
            {createMutation.isPending ? "Adding..." : "Add Employee"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function HREmployeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const { data: employees, refetch } = trpc.hr.listEmployees.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    department: deptFilter !== "all" ? deptFilter : undefined,
  });
  const { data: departments } = trpc.hr.departments.useQuery();

  const updateMutation = trpc.hr.updateEmployee.useMutation({
    onSuccess: () => { toast.success("Updated"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = employees?.filter((e) =>
    !search ||
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    e.email?.toLowerCase().includes(search.toLowerCase()) ||
    e.employeeNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const { data: omanisationStats } = trpc.compliance.getOmanisationStats.useQuery({ companyId: 0 });
  const stats = {
    total: employees?.length ?? 0,
    active: employees?.filter((e) => e.status === "active").length ?? 0,
    onLeave: employees?.filter((e) => e.status === "on_leave").length ?? 0,
    terminated: employees?.filter((e) => ["terminated", "resigned"].includes(e.status ?? "")).length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm">
              <Briefcase size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">HR & Workforce Hub</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Employee records, Omanisation tracking, PASI contributions, leave management, and WPS payroll
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">Omanisation Quota</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">PASI Registered</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">WPS Compliant</span>
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">MHRSD Filed</span>
          </div>
        </div>
        <NewEmployeeDialog onSuccess={refetch} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Employees", value: stats.total,      bg: "stat-gradient-1" },
          { label: "Active",          value: stats.active,     bg: "stat-gradient-4" },
          { label: "On Leave",        value: stats.onLeave,    bg: "stat-gradient-gold" },
          { label: "Terminated",      value: stats.terminated, bg: "stat-gradient-2" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-white shadow-sm`}>
            <p className="text-2xl font-black">{s.value}</p>
            <p className="text-xs text-white/70 mt-0.5 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Omanisation Gauge */}
      {omanisationStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-gradient-to-r from-violet-600 to-violet-800 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-white/70 uppercase tracking-wide font-semibold">Omanisation Ratio</p>
                <p className="text-3xl font-black mt-0.5">{omanisationStats.pct.toFixed(1)}%</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/70">MHRSD Target</p>
                <p className="text-xl font-black">{omanisationStats.targetPct}%</p>
              </div>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${omanisationStats.pct >= omanisationStats.targetPct ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ width: `${Math.min(100, omanisationStats.targetPct > 0 ? (omanisationStats.pct / omanisationStats.targetPct) * 100 : 0)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-white/70">
              <span>{omanisationStats.omani} Omani nationals</span>
              <span>{omanisationStats.total} total employees</span>
            </div>
          </div>
          <div className={`rounded-2xl p-5 flex flex-col justify-center ${
            omanisationStats.pct >= omanisationStats.targetPct
              ? "bg-emerald-50 border border-emerald-200"
              : "bg-amber-50 border border-amber-200"
          }`}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compliance Status</p>
            {omanisationStats.pct >= omanisationStats.targetPct ? (
              <>
                <p className="text-lg font-black text-emerald-700 mt-1">Compliant</p>
                <p className="text-xs text-emerald-600 mt-0.5">Above MHRSD target</p>
              </>
            ) : (
              <>
                <p className="text-lg font-black text-amber-700 mt-1">Gap: {omanisationStats.gap.toFixed(1)}%</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Need {Math.max(0, Math.ceil((omanisationStats.targetPct / 100) * omanisationStats.total - omanisationStats.omani))} more Omani hires
                </p>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search employees..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
            <SelectItem value="resigned">Resigned</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments?.map((d) => d && <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Employee Grid */}
      {filtered?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Users size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
            <h3 className="font-semibold mb-1">No employees found</h3>
            <p className="text-sm text-muted-foreground">Add your first employee to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered?.map((emp) => (
            <Card key={emp.id} className="hover:shadow-md transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <Avatar className="w-10 h-10">
                    <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm font-semibold">
                      {emp.firstName?.charAt(0)}{emp.lastName?.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{emp.firstName} {emp.lastName}</div>
                    <div className="text-xs text-muted-foreground truncate">{emp.position ?? "—"}</div>
                  </div>
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {emp.department && <div className="flex items-center gap-1.5"><Briefcase size={11} />{emp.department}</div>}
                  {emp.email && <div className="truncate">{emp.email}</div>}
                  {emp.nationality && <div>{emp.nationality}</div>}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <Badge
                    className={`text-xs ${emp.status === "active" ? "bg-green-100 text-green-700" : emp.status === "on_leave" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}
                    variant="outline"
                  >
                    {emp.status?.replace(/_/g, " ")}
                  </Badge>
                  <Select value={emp.status ?? "active"} onValueChange={(v) => updateMutation.mutate({ id: emp.id, status: v as any })}>
                    <SelectTrigger className="h-6 text-xs w-24 border-0 bg-transparent p-0 focus:ring-0">
                      <span className="text-muted-foreground text-xs">Change</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="on_leave">On Leave</SelectItem>
                      <SelectItem value="terminated">Terminated</SelectItem>
                      <SelectItem value="resigned">Resigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
