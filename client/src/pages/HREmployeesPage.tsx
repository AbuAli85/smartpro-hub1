import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Users, Search, UserCheck, Clock, ChevronRight, X,
  Edit2, Phone, Mail, Globe, Hash, Briefcase, Calendar, DollarSign,
  TrendingUp, Building2, AlertTriangle, BarChart3, UserPlus, Shield,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; color: string }> = {
  active:     { label: "Active",      color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  on_leave:   { label: "On Leave",    color: "bg-amber-100 text-amber-700 border-amber-200" },
  terminated: { label: "Terminated",  color: "bg-red-100 text-red-700 border-red-200" },
  resigned:   { label: "Resigned",    color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract:  "Contract",
  intern:    "Intern",
};

const DEPT_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-teal-100 text-teal-700",
];

function getInitials(first: string, last: string) {
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
}

function AddEmployeeWizard({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: "", lastName: "", firstNameAr: "", lastNameAr: "",
    email: "", phone: "", nationality: "", passportNumber: "", nationalId: "",
    department: "", position: "", employmentType: "full_time" as const,
    salary: "", currency: "OMR", hireDate: "", employeeNumber: "",
  });

  const createMutation = trpc.hr.createEmployee.useMutation({
    onSuccess: () => {
      toast.success(form.firstName + " " + form.lastName + " added to workforce");
      setOpen(false); setStep(1);
      setForm({ firstName: "", lastName: "", firstNameAr: "", lastNameAr: "", email: "", phone: "", nationality: "", passportNumber: "", nationalId: "", department: "", position: "", employmentType: "full_time", salary: "", currency: "OMR", hireDate: "", employeeNumber: "" });
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const stepLabels = ["Personal Info", "Employment", "Compensation"];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setStep(1); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white">
          <UserPlus size={16} /> Add Employee
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={18} className="text-[var(--smartpro-orange)]" />
            Add New Employee
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1 mb-4">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={"w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold " + (step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-[var(--smartpro-orange)] text-white" : "bg-muted text-muted-foreground")}>
                {step > i + 1 ? "✓" : i + 1}
              </div>
              <span className={"text-xs font-medium " + (step === i + 1 ? "text-foreground" : "text-muted-foreground")}>{label}</span>
              {i < stepLabels.length - 1 && <div className={"flex-1 h-px " + (step > i + 1 ? "bg-green-500" : "bg-border")} />}
            </div>
          ))}
        </div>
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>First Name (EN) *</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Ahmed" /></div>
              <div className="space-y-1.5"><Label>Last Name (EN) *</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Al-Balushi" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>First Name (AR)</Label><Input dir="rtl" value={form.firstNameAr} onChange={(e) => setForm({ ...form, firstNameAr: e.target.value })} placeholder="أحمد" /></div>
              <div className="space-y-1.5"><Label>Last Name (AR)</Label><Input dir="rtl" value={form.lastNameAr} onChange={(e) => setForm({ ...form, lastNameAr: e.target.value })} placeholder="البلوشي" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+968 9xxx xxxx" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Nationality</Label><Input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} placeholder="Omani / Indian / etc." /></div>
              <div className="space-y-1.5"><Label>National ID / Civil No.</Label><Input value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Passport Number</Label><Input value={form.passportNumber} onChange={(e) => setForm({ ...form, passportNumber: e.target.value })} /></div>
            <Button className="w-full" disabled={!form.firstName || !form.lastName} onClick={() => setStep(2)}>
              Next: Employment →
            </Button>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Operations" /></div>
              <div className="space-y-1.5"><Label>Position / Job Title</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="e.g. PRO Officer" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-1.5"><Label>Employee Number</Label><Input value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} placeholder="EMP-001" /></div>
            </div>
            <div className="space-y-1.5"><Label>Hire Date</Label><Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} /></div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
              <Button className="flex-1" onClick={() => setStep(3)}>Next: Compensation →</Button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Basic Salary</Label><Input type="number" step="0.001" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} placeholder="0.000" /></div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OMR">OMR (Omani Rial)</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm">
              <p className="font-semibold text-orange-800 mb-1">Employee Summary</p>
              <div className="text-orange-700 space-y-0.5 text-xs">
                <p><strong>Name:</strong> {form.firstName} {form.lastName}</p>
                <p><strong>Nationality:</strong> {form.nationality || "—"}</p>
                <p><strong>Role:</strong> {form.position || "—"} @ {form.department || "—"}</p>
                <p><strong>Type:</strong> {EMP_TYPE_LABELS[form.employmentType]}</p>
                {form.salary && <p><strong>Salary:</strong> {form.currency} {parseFloat(form.salary).toFixed(3)}</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>Back</Button>
              <Button className="flex-1 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white" disabled={createMutation.isPending}
                onClick={() => createMutation.mutate({ ...form, salary: form.salary ? Number(form.salary) : undefined })}>
                {createMutation.isPending ? "Adding..." : "Add to Workforce"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDetailPanel({ employeeId, onClose, onUpdate }: { employeeId: number; onClose: () => void; onUpdate: () => void }) {
  const { data: emp, refetch } = trpc.hr.getEmployee.useQuery({ id: employeeId });
  const [editSalary, setEditSalary] = useState(false);
  const [salary, setSalary] = useState("");

  const updateMutation = trpc.hr.updateEmployee.useMutation({
    onSuccess: () => { toast.success("Updated"); refetch(); onUpdate(); },
    onError: (e) => toast.error(e.message),
  });

  if (!emp) return (
    <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
      <div className="text-center"><Users size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Loading employee profile...</p></div>
    </div>
  );

  const statusMeta = STATUS_META[emp.status ?? "active"];
  const isOmani = (emp.nationality ?? "").toLowerCase().includes("oman");
  const yearsOfService = emp.hireDate ? Math.floor((Date.now() - new Date(emp.hireDate).getTime()) / (365.25 * 86400000)) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12">
            <AvatarFallback className="bg-[var(--smartpro-orange)] text-white font-bold text-sm">
              {getInitials(emp.firstName, emp.lastName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-bold text-lg leading-tight">{emp.firstName} {emp.lastName}</h2>
            {(emp.firstNameAr || emp.lastNameAr) && <p className="text-sm text-muted-foreground" dir="rtl">{emp.firstNameAr} {emp.lastNameAr}</p>}
            <div className="flex items-center gap-2 mt-1">
              <Badge className={"text-xs " + statusMeta.color} variant="outline">{statusMeta.label}</Badge>
              {isOmani && <Badge className="text-xs bg-green-100 text-green-700 border-green-200" variant="outline">Omani National</Badge>}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close employee panel"><X size={16} aria-hidden="true" /></Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {emp.status === "active" && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-xs font-semibold text-orange-800 mb-2">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-7 text-xs" variant="outline" onClick={() => updateMutation.mutate({ id: emp.id, status: "on_leave" })}>Mark On Leave</Button>
              <Button size="sm" className="h-7 text-xs border-red-300 text-red-600" variant="outline" onClick={() => updateMutation.mutate({ id: emp.id, status: "terminated" })}>Terminate</Button>
            </div>
          </div>
        )}
        {["on_leave","terminated","resigned"].includes(emp.status ?? "") && (
          <div className="p-3 bg-muted/40 rounded-xl">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Status Actions</p>
            <Button size="sm" className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => updateMutation.mutate({ id: emp.id, status: "active" })}>Reactivate</Button>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Employment Details</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Hash, label: "Employee #", value: emp.employeeNumber ?? "—" },
              { icon: Briefcase, label: "Position", value: emp.position ?? "—" },
              { icon: Building2, label: "Department", value: emp.department ?? "—" },
              { icon: Globe, label: "Nationality", value: emp.nationality ?? "—" },
              { icon: Calendar, label: "Hire Date", value: emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : "—" },
              { icon: TrendingUp, label: "Years of Service", value: yearsOfService !== null ? yearsOfService + (yearsOfService === 1 ? " year" : " years") : "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-medium text-xs">{value}</p></div>
              </div>
            ))}
          </div>
        </div>
        <Separator />
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact & Documents</p>
          <div className="space-y-2">
            {emp.email
              ? <div className="flex items-center gap-2"><Mail size={13} className="text-muted-foreground shrink-0" /><a href={"mailto:" + emp.email} className="text-[var(--smartpro-orange)] hover:underline text-xs">{emp.email}</a></div>
              : <div className="flex items-center gap-2"><Mail size={13} className="text-muted-foreground/30 shrink-0" /><span className="text-xs text-muted-foreground/50 italic">No email on file</span></div>}
            {emp.phone
              ? <div className="flex items-center gap-2"><Phone size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">{emp.phone}</span></div>
              : <div className="flex items-center gap-2"><Phone size={13} className="text-muted-foreground/30 shrink-0" /><span className="text-xs text-muted-foreground/50 italic">No phone on file</span></div>}
            {emp.passportNumber && <div className="flex items-center gap-2"><Hash size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">Passport: <span className="font-mono font-semibold">{emp.passportNumber}</span></span></div>}
            {emp.nationalId && <div className="flex items-center gap-2"><Shield size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">Civil ID: <span className="font-mono font-semibold">{emp.nationalId}</span></span></div>}
          </div>
        </div>
        {((emp as any).visaNumber || (emp as any).workPermitNumber || (emp as any).pasiNumber) && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Government Documents</p>
              <div className="space-y-2">
                {(emp as any).visaNumber && (
                  <div className="flex items-start gap-2">
                    <Hash size={13} className="text-blue-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Visa Number</p>
                      <p className="text-xs font-mono font-semibold">{(emp as any).visaNumber}</p>
                      {(emp as any).visaExpiryDate && <p className="text-[10px] text-muted-foreground">Expires: {new Date((emp as any).visaExpiryDate).toLocaleDateString()}</p>}
                    </div>
                  </div>
                )}
                {(emp as any).workPermitNumber && (
                  <div className="flex items-start gap-2">
                    <Shield size={13} className="text-purple-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Work Permit</p>
                      <p className="text-xs font-mono font-semibold">{(emp as any).workPermitNumber}</p>
                      {(emp as any).workPermitExpiryDate && <p className="text-[10px] text-muted-foreground">Expires: {new Date((emp as any).workPermitExpiryDate).toLocaleDateString()}</p>}
                    </div>
                  </div>
                )}
                {(emp as any).pasiNumber && (
                  <div className="flex items-start gap-2">
                    <Shield size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">PASI Number</p>
                      <p className="text-xs font-mono font-semibold">{(emp as any).pasiNumber}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {((emp as any).bankName || (emp as any).bankAccountNumber) && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Banking Details</p>
              <div className="space-y-2">
                {(emp as any).bankName && <div className="flex items-center gap-2"><DollarSign size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">Bank: <span className="font-medium">{(emp as any).bankName}</span></span></div>}
                {(emp as any).bankAccountNumber && <div className="flex items-center gap-2"><Hash size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">Account: <span className="font-mono font-semibold">{(emp as any).bankAccountNumber}</span></span></div>}
              </div>
            </div>
          </>
        )}
        {((emp as any).emergencyContactName || (emp as any).emergencyContactPhone) && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Emergency Contact</p>
              <div className="space-y-1">
                {(emp as any).emergencyContactName && <div className="flex items-center gap-2"><Users size={13} className="text-muted-foreground shrink-0" /><span className="text-xs font-medium">{(emp as any).emergencyContactName}</span></div>}
                {(emp as any).emergencyContactPhone && <div className="flex items-center gap-2"><Phone size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">{(emp as any).emergencyContactPhone}</span></div>}
              </div>
            </div>
          </>
        )}
        <Separator />
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Compensation</p>
            <button onClick={() => { setEditSalary(true); setSalary(emp.salary ?? ""); }} className="text-xs text-[var(--smartpro-orange)] hover:underline flex items-center gap-1"><Edit2 size={11} /> Edit</button>
          </div>
          {editSalary ? (
            <div className="flex gap-2">
              <Input className="h-8 text-sm" type="number" step="0.001" value={salary} onChange={(e) => setSalary(e.target.value)} />
              <Button size="sm" className="h-8 text-xs" onClick={() => { updateMutation.mutate({ id: emp.id, salary: Number(salary) }); setEditSalary(false); }}>Save</Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setEditSalary(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="p-3 bg-muted/40 rounded-xl">
              <p className="text-2xl font-black text-[var(--smartpro-orange)]">{emp.salary ? (emp.currency ?? "OMR") + " " + parseFloat(emp.salary).toFixed(3) : "Not set"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{EMP_TYPE_LABELS[emp.employmentType ?? "full_time"]} · per month</p>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground border-t pt-3"><p>Added: {new Date(emp.createdAt).toLocaleString()}</p></div>
      </div>
    </div>
  );
}

export default function HREmployeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [deptFilter, setDeptFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { activeCompanyId } = useActiveCompany();

  const { data: employees, refetch } = trpc.hr.listEmployees.useQuery(
    {
      status: statusFilter !== "all" ? statusFilter : undefined,
      department: deptFilter !== "all" ? deptFilter : undefined,
      companyId: activeCompanyId ?? undefined,
    },
    { enabled: activeCompanyId != null }
  );
  const { data: stats } = trpc.hr.getStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: departments } = trpc.hr.departments.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  const filtered = employees?.filter((e) =>
    !search ||
    (e.firstName + " " + e.lastName).toLowerCase().includes(search.toLowerCase()) ||
    (e.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.position ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (e.nationality ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const kpiItems = [
    { label: "Total Workforce",   value: stats?.total ?? 0,                color: "bg-blue-500",    icon: Users },
    { label: "Active Employees",  value: stats?.active ?? 0,               color: "bg-emerald-500", icon: UserCheck },
    { label: "On Leave",          value: stats?.onLeave ?? 0,              color: "bg-amber-500",   icon: Clock },
    { label: "Omani Nationals",   value: stats?.omani ?? 0,                color: "bg-green-600",   icon: Shield },
    { label: "Omanisation Rate",  value: (stats?.omanisationRate ?? 0) + "%", color: "bg-teal-500", icon: BarChart3 },
    { label: "Avg Salary (OMR)",  value: stats?.avgSalary ? stats.avgSalary.toFixed(3) : "0.000", color: "bg-[var(--smartpro-orange)]", icon: DollarSign },
  ];

  return (
    <div className="flex h-full">
      <div className={"flex-1 p-6 space-y-6 overflow-y-auto transition-all " + (selectedId ? "max-w-[calc(100%-380px)]" : "")}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-[var(--smartpro-orange)] flex items-center justify-center shadow-sm"><Users size={20} className="text-white" /></div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">HR & Workforce</h1>
                <p className="text-xs text-muted-foreground mt-0.5">Employee lifecycle · Omanisation tracking · Payroll intelligence</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {["MHRSD Compliant", "Omanisation Quota", "WPS Ready", "PASI Integrated"].map((tag, i) => (
                <span key={tag} className={"inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border " + (i === 0 ? "bg-orange-50 text-orange-700 border-orange-200" : i === 1 ? "bg-green-50 text-green-700 border-green-200" : i === 2 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-violet-50 text-violet-700 border-violet-200")}>{tag}</span>
              ))}
            </div>
          </div>
          <AddEmployeeWizard onSuccess={refetch} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiItems.map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-card border rounded-xl p-3 hover:shadow-sm transition-shadow">
              <div className={"w-7 h-7 rounded-lg " + color + " flex items-center justify-center mb-2"}><Icon size={14} className="text-white" /></div>
              <p className="text-xl font-black text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {stats && stats.active > 0 && (
          <div className="p-4 bg-card border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Omanisation Progress</p>
              <span className="text-xs text-muted-foreground">MHRSD Target: 35%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div className={"h-3 rounded-full transition-all " + (stats.omanisationRate >= 35 ? "bg-emerald-500" : stats.omanisationRate >= 20 ? "bg-amber-500" : "bg-red-500")} style={{ width: Math.min(stats.omanisationRate, 100) + "%" }} />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{stats.omani} Omani nationals</span>
              <span className={"font-semibold " + (stats.omanisationRate >= 35 ? "text-emerald-600" : "text-amber-600")}>{stats.omanisationRate}%</span>
              <span>{stats.expat} expatriates</span>
            </div>
            {stats.omanisationRate < 35 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                <AlertTriangle size={12} />
                <span>Below MHRSD target. Consider hiring {Math.ceil(stats.active * 0.35) - stats.omani} more Omani nationals.</span>
              </div>
            )}
          </div>
        )}

        <Tabs defaultValue="employees">
          <TabsList>
            <TabsTrigger value="employees">
              All Employees
              {employees && <span className="ml-1.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">{employees.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="departments">By Department</TabsTrigger>
          </TabsList>
          <TabsContent value="employees" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search by name, role, department, nationality..." className="pl-9" aria-label="Search employees" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                  <SelectItem value="resigned">Resigned</SelectItem>
                </SelectContent>
              </Select>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments?.map((d) => d && <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Employee</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Role</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Department</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Nationality</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Salary</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Hire Date</th>
                      <th scope="col" className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered?.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                        <Users size={32} className="mx-auto mb-2 opacity-30" />
                        <p>No employees found</p>
                        <p className="text-xs mt-1">Add your first employee using the button above</p>
                      </td></tr>
                    )}
                    {filtered?.map((emp) => {
                      const statusMeta = STATUS_META[emp.status ?? "active"];
                      const isOmani = (emp.nationality ?? "").toLowerCase().includes("oman");
                      const isSelected = selectedId === emp.id;
                      return (
                        <tr key={emp.id} className={"border-b hover:bg-muted/20 transition-colors cursor-pointer " + (isSelected ? "bg-orange-50" : "")} onClick={() => setSelectedId(isSelected ? null : emp.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(isSelected ? null : emp.id); }} aria-pressed={isSelected}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8 shrink-0">
                                <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-xs font-bold">{getInitials(emp.firstName, emp.lastName)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
                                {emp.email && <p className="text-xs text-muted-foreground">{emp.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">{emp.position ?? "—"}</td>
                          <td className="px-4 py-3">{emp.department ? <span className={"text-xs rounded-full px-2 py-0.5 font-medium " + DEPT_COLORS[(emp.department.charCodeAt(0) ?? 0) % DEPT_COLORS.length]}>{emp.department}</span> : "—"}</td>
                          <td className="px-4 py-3 text-xs"><span className={"flex items-center gap-1 " + (isOmani ? "text-green-700 font-medium" : "text-muted-foreground")}>{isOmani && <Shield size={10} className="text-green-600" />}{emp.nationality ?? "—"}</span></td>
                          <td className="px-4 py-3"><Badge className={"text-xs " + statusMeta.color} variant="outline">{statusMeta.label}</Badge></td>
                          <td className="px-4 py-3 text-xs font-medium">{emp.salary ? (emp.currency ?? "OMR") + " " + parseFloat(emp.salary).toFixed(3) : "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3"><ChevronRight size={14} className={"text-muted-foreground transition-transform " + (isSelected ? "rotate-90 text-[var(--smartpro-orange)]" : "")} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
          <TabsContent value="departments" className="mt-4">
            {departments && departments.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {departments.filter(Boolean).map((dept, i) => {
                  const deptEmps = employees?.filter((e) => e.department === dept && e.status === "active") ?? [];
                  const omani = deptEmps.filter((e) => (e.nationality ?? "").toLowerCase().includes("oman"));
                  const totalPayroll = deptEmps.filter((e) => e.salary).reduce((sum, e) => sum + parseFloat(e.salary ?? "0"), 0);
                  return (
                    <Card key={dept} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className={"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold " + DEPT_COLORS[i % DEPT_COLORS.length]}><Building2 size={12} />{dept}</div>
                          <span className="text-2xl font-black text-foreground">{deptEmps.length}</span>
                        </div>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <div className="flex justify-between"><span>Omani nationals</span><span className="font-medium text-green-700">{omani.length} ({deptEmps.length > 0 ? Math.round((omani.length / deptEmps.length) * 100) : 0}%)</span></div>
                          <div className="flex justify-between"><span>Monthly payroll</span><span className="font-medium">OMR {totalPayroll.toFixed(3)}</span></div>
                        </div>
                        <div className="mt-3 flex -space-x-2">
                          {deptEmps.slice(0, 5).map((e) => (
                            <Avatar key={e.id} className="w-6 h-6 border-2 border-background">
                              <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-[9px] font-bold">{getInitials(e.firstName, e.lastName)}</AvatarFallback>
                            </Avatar>
                          ))}
                          {deptEmps.length > 5 && <div className="w-6 h-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[9px] font-bold text-muted-foreground">+{deptEmps.length - 5}</div>}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="border-dashed"><CardContent className="p-12 text-center">
                <Building2 size={40} className="mx-auto text-muted-foreground mb-3 opacity-30" />
                <h3 className="font-semibold">No departments yet</h3>
                <p className="text-sm text-muted-foreground">Add employees with departments to see the breakdown here.</p>
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
      {selectedId && (
        <div className="w-[380px] border-l bg-background flex flex-col h-full overflow-hidden shrink-0">
          <EmployeeDetailPanel employeeId={selectedId} onClose={() => setSelectedId(null)} onUpdate={refetch} />
        </div>
      )}
    </div>
  );
}
