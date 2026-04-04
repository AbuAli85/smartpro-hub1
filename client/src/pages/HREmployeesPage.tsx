import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Users, Search, UserCheck, Clock, ChevronRight, X,
  Edit2, Phone, Mail, Globe, Hash, Briefcase, Calendar, DollarSign,
  TrendingUp, Building2, AlertTriangle, BarChart3, UserPlus, Shield,
  FileText, ExternalLink, CheckCircle2, AlertCircle, Circle,
  MoreHorizontal, Eye, FileBadge, Activity, ChevronDown,
  Layers, Send, UserCog, History, ChevronUp, ArrowUpDown,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { fmtDate, fmtDateTime, expiryStatus, expiryLabel, EXPIRY_BADGE } from "@/lib/dateUtils";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string }> = {
  active:     { label: "Active",      color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  on_leave:   { label: "On Leave",    color: "bg-amber-100 text-amber-700 border-amber-200" },
  terminated: { label: "Terminated",  color: "bg-red-100 text-red-700 border-red-200" },
  resigned:   { label: "Resigned",    color: "bg-gray-100 text-gray-600 border-gray-200" },
};

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: "Full Time", part_time: "Part Time", contract: "Contract", intern: "Intern",
};

const DEPT_COLORS = [
  "bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700", "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",  "bg-teal-100 text-teal-700",
];

function getInitials(first: string, last: string) {
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
}

// ─── Profile Completeness Badge ───────────────────────────────────────────────
function CompletenessBadge({ score, missingRequired }: { score: number; missingRequired: string[] }) {
  const color = score >= 90 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600";
  const bg    = score >= 90 ? "bg-emerald-50 border-emerald-200" : score >= 60 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const Icon  = score >= 90 ? CheckCircle2 : score >= 60 ? AlertCircle : Circle;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${bg} ${color} cursor-default`}>
          <Icon size={9} />
          {score}%
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        {missingRequired.length === 0
          ? "Profile complete"
          : <span>Missing: {missingRequired.slice(0, 4).join(", ")}{missingRequired.length > 4 ? ` +${missingRequired.length - 4} more` : ""}</span>
        }
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Doc Expiry Indicator ─────────────────────────────────────────────────────
function DocExpiryIndicator({ emp, warnDays }: { emp: any; warnDays: number }) {
  const checks = [
    { label: "Visa",    date: emp.visaExpiryDate },
    { label: "Permit",  date: emp.workPermitExpiryDate },
    { label: "Passport",date: emp.passportExpiryDate },
  ].filter((c) => c.date);

  if (checks.length === 0) return null;

  const worst = checks.reduce((acc, c) => {
    const s = expiryStatus(c.date, warnDays);
    if (s === "expired") return "expired";
    if (s === "expiring-soon" && acc !== "expired") return "expiring-soon";
    return acc;
  }, "none" as string);

  if (worst === "none" || worst === "valid") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${
          worst === "expired" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
        } cursor-default`}>
          <AlertTriangle size={9} />
          {worst === "expired" ? "Expired" : "Expiring"}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px]">
        <div className="space-y-1">
          {checks.map((c) => {
            const s = expiryStatus(c.date, warnDays);
            if (s === "none") return null;
            return <div key={c.label} className="text-xs">{c.label}: {expiryLabel(c.date, warnDays)}</div>;
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Richer Add Employee Wizard ───────────────────────────────────────────────
const BLANK = {
  firstName: "", lastName: "", firstNameAr: "", lastNameAr: "",
  email: "", phone: "", nationality: "", passportNumber: "", nationalId: "",
  dateOfBirth: "", gender: "" as "" | "male" | "female",
  maritalStatus: "" as "" | "single" | "married" | "divorced" | "widowed",
  department: "", position: "", employmentType: "full_time" as const,
  salary: "", currency: "OMR", hireDate: "", employeeNumber: "",
  pasiNumber: "", bankName: "", bankAccountNumber: "",
  emergencyContactName: "", emergencyContactPhone: "",
  visaNumber: "", visaExpiryDate: "",
  workPermitNumber: "", workPermitExpiryDate: "",
};

function AddEmployeeWizard({ onSuccess, companyId }: { onSuccess: () => void; companyId?: number | null }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(BLANK);

  const { data: deptList = [] } = trpc.hr.listDepartments.useQuery(
    { companyId: companyId ?? undefined }, { enabled: !!companyId }
  );
  const selectedDeptObj = (deptList as any[]).find((d) => d.name === form.department);
  const { data: posList = [] } = trpc.hr.listPositions.useQuery(
    { departmentId: selectedDeptObj?.id, companyId: companyId ?? undefined },
    { enabled: !!selectedDeptObj }
  );

  const createMutation = trpc.hr.createEmployee.useMutation({
    onSuccess: () => {
      toast.success(`${form.firstName} ${form.lastName} added to workforce`);
      setOpen(false); setStep(1); setForm(BLANK);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const f = (key: keyof typeof BLANK, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const STEPS = ["Personal Info", "Employment", "Compliance & Docs", "Compensation"];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setStep(1); setForm(BLANK); } }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white">
          <UserPlus size={16} /> Add Employee
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={18} className="text-[var(--smartpro-orange)]" />
            Add New Employee — Step {step} of {STEPS.length}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-[var(--smartpro-orange)] text-white" : "bg-muted text-muted-foreground"
              }`}>{step > i + 1 ? "✓" : i + 1}</div>
              <span className={`text-[10px] font-medium truncate ${step === i + 1 ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px ${step > i + 1 ? "bg-green-500" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Step 1: Personal Info */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>First Name (EN) *</Label><Input value={form.firstName} onChange={(e) => f("firstName", e.target.value)} placeholder="Ahmed" /></div>
                <div className="space-y-1.5"><Label>Last Name (EN) *</Label><Input value={form.lastName} onChange={(e) => f("lastName", e.target.value)} placeholder="Al-Balushi" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>First Name (AR)</Label><Input dir="rtl" value={form.firstNameAr} onChange={(e) => f("firstNameAr", e.target.value)} placeholder="أحمد" /></div>
                <div className="space-y-1.5"><Label>Last Name (AR)</Label><Input dir="rtl" value={form.lastNameAr} onChange={(e) => f("lastNameAr", e.target.value)} placeholder="البلوشي" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => f("email", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => f("phone", e.target.value)} placeholder="+968 9xxx xxxx" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.dateOfBirth} onChange={(e) => f("dateOfBirth", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Gender</Label>
                  <Select value={form.gender || "__none__"} onValueChange={(v) => f("gender", v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Prefer not to say</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Nationality</Label><Input value={form.nationality} onChange={(e) => f("nationality", e.target.value)} placeholder="Omani / Indian / etc." /></div>
                <div className="space-y-1.5">
                  <Label>Marital Status</Label>
                  <Select value={form.maritalStatus || "__none__"} onValueChange={(v) => f("maritalStatus", v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Not specified</SelectItem>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                      <SelectItem value="divorced">Divorced</SelectItem>
                      <SelectItem value="widowed">Widowed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>National ID / Civil No.</Label><Input value={form.nationalId} onChange={(e) => f("nationalId", e.target.value)} placeholder="e.g. 12345678" /></div>
                <div className="space-y-1.5"><Label>Passport Number</Label><Input value={form.passportNumber} onChange={(e) => f("passportNumber", e.target.value)} /></div>
              </div>
              <Button className="w-full" disabled={!form.firstName || !form.lastName} onClick={() => setStep(2)}>Next: Employment →</Button>
            </>
          )}

          {/* Step 2: Employment */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  {(deptList as any[]).length === 0 ? (
                    <Input value={form.department} onChange={(e) => f("department", e.target.value)} placeholder="e.g. Operations" />
                  ) : (
                    <Select value={form.department || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, department: v === "__none__" ? "" : v, position: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Select department..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No Department</SelectItem>
                        {(deptList as any[]).map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Position / Job Title</Label>
                  {posList.length > 0 ? (
                    <Select value={form.position || "__none__"} onValueChange={(v) => f("position", v === "__none__" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Select position..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Custom / Other</SelectItem>
                        {(posList as any[]).map((p) => <SelectItem key={p.id} value={p.title}>{p.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.position} onChange={(e) => f("position", e.target.value)} placeholder="e.g. PRO Officer" />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Employment Type</Label>
                  <Select value={form.employmentType} onValueChange={(v) => f("employmentType", v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_time">Full Time</SelectItem>
                      <SelectItem value="part_time">Part Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="intern">Intern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Employee Number</Label><Input value={form.employeeNumber} onChange={(e) => f("employeeNumber", e.target.value)} placeholder="EMP-001" /></div>
              </div>
              <div className="space-y-1.5"><Label>Hire Date</Label><Input type="date" value={form.hireDate} onChange={(e) => f("hireDate", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Emergency Contact Name</Label><Input value={form.emergencyContactName} onChange={(e) => f("emergencyContactName", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Emergency Contact Phone</Label><Input value={form.emergencyContactPhone} onChange={(e) => f("emergencyContactPhone", e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>← Back</Button>
                <Button className="flex-1" onClick={() => setStep(3)}>Next: Compliance →</Button>
              </div>
            </>
          )}

          {/* Step 3: Compliance & Docs */}
          {step === 3 && (
            <>
              <p className="text-xs text-muted-foreground">Government and compliance documents (optional but recommended for Oman workforce compliance)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>PASI Number</Label><Input value={form.pasiNumber} onChange={(e) => f("pasiNumber", e.target.value)} placeholder="Social insurance #" /></div>
                <div className="space-y-1.5"><Label>Bank Name</Label><Input value={form.bankName} onChange={(e) => f("bankName", e.target.value)} placeholder="Bank Muscat, etc." /></div>
              </div>
              <div className="space-y-1.5"><Label>Bank Account Number (IBAN)</Label><Input value={form.bankAccountNumber} onChange={(e) => f("bankAccountNumber", e.target.value)} placeholder="OM12 3456 7890 1234 5678 9012" /></div>
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Visa & Work Permit</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Visa Number</Label><Input value={form.visaNumber} onChange={(e) => f("visaNumber", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Visa Expiry Date</Label><Input type="date" value={form.visaExpiryDate} onChange={(e) => f("visaExpiryDate", e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Work Permit Number</Label><Input value={form.workPermitNumber} onChange={(e) => f("workPermitNumber", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Work Permit Expiry</Label><Input type="date" value={form.workPermitExpiryDate} onChange={(e) => f("workPermitExpiryDate", e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>← Back</Button>
                <Button className="flex-1" onClick={() => setStep(4)}>Next: Compensation →</Button>
              </div>
            </>
          )}

          {/* Step 4: Compensation + Summary */}
          {step === 4 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Basic Salary</Label><Input type="number" step="0.001" value={form.salary} onChange={(e) => f("salary", e.target.value)} placeholder="0.000" /></div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => f("currency", v)}>
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
                <p className="font-semibold text-orange-800 mb-2">Employee Summary</p>
                <div className="text-orange-700 space-y-0.5 text-xs grid grid-cols-2 gap-x-4">
                  <p><strong>Name:</strong> {form.firstName} {form.lastName}</p>
                  <p><strong>Nationality:</strong> {form.nationality || "—"}</p>
                  <p><strong>Role:</strong> {form.position || "—"}</p>
                  <p><strong>Department:</strong> {form.department || "—"}</p>
                  <p><strong>Type:</strong> {EMP_TYPE_LABELS[form.employmentType]}</p>
                  <p><strong>Hire Date:</strong> {form.hireDate ? fmtDate(form.hireDate) : "—"}</p>
                  {form.salary && <p><strong>Salary:</strong> {form.currency} {parseFloat(form.salary).toFixed(3)}</p>}
                  {form.pasiNumber && <p><strong>PASI:</strong> {form.pasiNumber}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>← Back</Button>
                <Button
                  className="flex-1 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
                  disabled={createMutation.isPending}
                  onClick={() => createMutation.mutate({
                    ...form,
                    salary: form.salary ? Number(form.salary) : undefined,
                    gender: (form.gender as "male" | "female") || undefined,
                    maritalStatus: (form.maritalStatus as "single" | "married" | "divorced" | "widowed") || undefined,
                    companyId: companyId ?? undefined,
                  })}
                >
                  {createMutation.isPending ? "Adding..." : "Add to Workforce"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Employee Detail Panel ────────────────────────────────────────────────────
function EmployeeDetailPanel({ employeeId, onClose, onUpdate }: { employeeId: number; onClose: () => void; onUpdate: () => void }) {
  const [, setLocation] = useLocation();
  const { data: emp, refetch } = trpc.hr.getEmployee.useQuery({ id: employeeId });
  const [editSalary, setEditSalary] = useState(false);
  const [salary, setSalary] = useState("");
  const { expiryWarningDays } = useActiveCompany();

  const updateMutation = trpc.hr.updateEmployee.useMutation({
    onSuccess: () => { toast.success("Updated"); refetch(); onUpdate(); },
    onError: (e) => toast.error(e.message),
  });

  if (!emp) return (
    <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
      <div className="text-center"><Users size={32} className="mx-auto mb-2 opacity-30" /><p className="text-sm">Loading...</p></div>
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
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge className={"text-xs " + statusMeta.color} variant="outline">{statusMeta.label}</Badge>
              {isOmani && <Badge className="text-xs bg-green-100 text-green-700 border-green-200" variant="outline">Omani National</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Fixed: navigate directly to specific employee lifecycle page */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50"
            onClick={() => setLocation(`/business/employee/${employeeId}`)}
            title="Open full employee lifecycle profile"
          >
            <Edit2 size={12} /> Full Profile
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setLocation(`/employee/${employeeId}/documents`)}
            title="View employee documents"
          >
            <FileText size={12} /> Docs
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Quick Actions */}
        {emp.status === "active" && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-xl">
            <p className="text-xs font-semibold text-orange-800 mb-2">Quick Actions</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="h-7 text-xs" variant="outline" onClick={() => updateMutation.mutate({ id: emp.id, status: "on_leave" })}>Mark On Leave</Button>
              <Button size="sm" className="h-7 text-xs border-red-300 text-red-600" variant="outline" onClick={() => updateMutation.mutate({ id: emp.id, status: "terminated" })}>Terminate</Button>
              <Button size="sm" className="h-7 text-xs gap-1" variant="outline" onClick={() => setLocation(`/business/employee/${employeeId}`)}>
                <Activity size={11} /> Lifecycle
              </Button>
            </div>
          </div>
        )}
        {["on_leave","terminated","resigned"].includes(emp.status ?? "") && (
          <div className="p-3 bg-muted/40 rounded-xl">
            <p className="text-xs font-semibold text-muted-foreground mb-2">Status Actions</p>
            <Button size="sm" className="h-7 text-xs bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => updateMutation.mutate({ id: emp.id, status: "active" })}>Reactivate</Button>
          </div>
        )}

        {/* Employment Details */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Employment Details</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Hash, label: "Employee #", value: emp.employeeNumber ?? "—" },
              { icon: Briefcase, label: "Position", value: emp.position ?? "—" },
              { icon: Building2, label: "Department", value: emp.department ?? "—" },
              { icon: Globe, label: "Nationality", value: emp.nationality ?? "—" },
              { icon: Calendar, label: "Hire Date", value: emp.hireDate ? fmtDate(emp.hireDate) : "—" },
              { icon: TrendingUp, label: "Years of Service", value: yearsOfService !== null ? `${yearsOfService} yr${yearsOfService !== 1 ? "s" : ""}` : "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-medium text-xs">{value}</p></div>
              </div>
            ))}
          </div>
        </div>
        <Separator />

        {/* Contact */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Contact & IDs</p>
          <div className="space-y-2">
            {emp.email ? <div className="flex items-center gap-2"><Mail size={13} className="text-muted-foreground shrink-0" /><a href={`mailto:${emp.email}`} className="text-[var(--smartpro-orange)] hover:underline text-xs">{emp.email}</a></div>
              : <div className="flex items-center gap-2"><Mail size={13} className="text-muted-foreground/30 shrink-0" /><span className="text-xs text-muted-foreground/50 italic">No email</span></div>}
            {emp.phone ? <div className="flex items-center gap-2"><Phone size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">{emp.phone}</span></div>
              : <div className="flex items-center gap-2"><Phone size={13} className="text-muted-foreground/30 shrink-0" /><span className="text-xs text-muted-foreground/50 italic">No phone</span></div>}
            {emp.passportNumber && <div className="flex items-center gap-2"><Hash size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">Passport: <span className="font-mono font-semibold">{emp.passportNumber}</span></span></div>}
            {emp.nationalId && <div className="flex items-center gap-2"><Shield size={13} className="text-muted-foreground shrink-0" /><span className="text-xs">Civil ID: <span className="font-mono font-semibold">{emp.nationalId}</span></span></div>}
          </div>
        </div>

        {/* Gov Docs */}
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
                      {(emp as any).visaExpiryDate && (
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <p className="text-[10px] text-muted-foreground">Expires: {fmtDate((emp as any).visaExpiryDate)}</p>
                          {expiryStatus((emp as any).visaExpiryDate, expiryWarningDays) !== "none" && (
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${EXPIRY_BADGE[expiryStatus((emp as any).visaExpiryDate, expiryWarningDays)]}`}>
                              {expiryLabel((emp as any).visaExpiryDate, expiryWarningDays)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {(emp as any).workPermitNumber && (
                  <div className="flex items-start gap-2">
                    <Shield size={13} className="text-purple-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Work Permit</p>
                      <p className="text-xs font-mono font-semibold">{(emp as any).workPermitNumber}</p>
                      {(emp as any).workPermitExpiryDate && (
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <p className="text-[10px] text-muted-foreground">Expires: {fmtDate((emp as any).workPermitExpiryDate)}</p>
                          {expiryStatus((emp as any).workPermitExpiryDate, expiryWarningDays) !== "none" && (
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${EXPIRY_BADGE[expiryStatus((emp as any).workPermitExpiryDate, expiryWarningDays)]}`}>
                              {expiryLabel((emp as any).workPermitExpiryDate, expiryWarningDays)}
                            </span>
                          )}
                        </div>
                      )}
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

        {/* Banking */}
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

        {/* Compensation */}
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
              <p className="text-2xl font-black text-[var(--smartpro-orange)]">{emp.salary ? `${emp.currency ?? "OMR"} ${parseFloat(emp.salary).toFixed(3)}` : "Not set"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{EMP_TYPE_LABELS[emp.employmentType ?? "full_time"]} · per month</p>
            </div>
          )}
        </div>
        <div className="text-xs text-muted-foreground border-t pt-3"><p>Added: {fmtDateTime(emp.createdAt)}</p></div>

        {/* Lifecycle Timeline */}
        <EmployeeTimeline employeeId={employeeId} />
      </div>
    </div>
  );
}

// ─── Employee Lifecycle Timeline ─────────────────────────────────────────────
const TIMELINE_COLORS: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  blue:    "bg-blue-100 text-blue-700 border-blue-200",
  purple:  "bg-purple-100 text-purple-700 border-purple-200",
  orange:  "bg-orange-100 text-orange-700 border-orange-200",
  amber:   "bg-amber-100 text-amber-700 border-amber-200",
  red:     "bg-red-100 text-red-700 border-red-200",
  indigo:  "bg-indigo-100 text-indigo-700 border-indigo-200",
  gray:    "bg-gray-100 text-gray-600 border-gray-200",
};

function EmployeeTimeline({ employeeId }: { employeeId: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: events, isLoading } = trpc.hr.getEmployeeTimeline.useQuery(
    { employeeId },
    { enabled: expanded }
  );

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <History size={13} /> Lifecycle Timeline
        </span>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-4 py-3">
          {isLoading && <p className="text-xs text-muted-foreground py-2">Loading timeline...</p>}
          {!isLoading && (!events || events.length === 0) && (
            <p className="text-xs text-muted-foreground py-2">No timeline events yet.</p>
          )}
          {!isLoading && events && events.length > 0 && (
            <div className="relative">
              <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-4">
                {events.map((ev) => {
                  const colorClass = TIMELINE_COLORS[ev.color] ?? TIMELINE_COLORS.gray;
                  return (
                    <div key={ev.id} className="flex items-start gap-3 relative">
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 z-10 ${colorClass}`}>
                        <Activity size={10} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold leading-tight">{ev.title}</p>
                          <p className="text-[10px] text-muted-foreground shrink-0">{new Date(ev.date).toLocaleDateString()}</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{ev.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HREmployeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [deptFilter, setDeptFilter] = useState("all");
  const [completenessFilter, setCompletenessFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeptOpen, setBulkDeptOpen] = useState(false);
  const [bulkPositionOpen, setBulkPositionOpen] = useState(false);
  const [bulkDeptValue, setBulkDeptValue] = useState("");
  const [bulkPositionValue, setBulkPositionValue] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "completeness" | "hireDate" | "salary">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [, setLocation] = useLocation();
  const { activeCompanyId, expiryWarningDays } = useActiveCompany();

  const { data: employees, refetch } = trpc.hr.listEmployees.useQuery(
    { status: statusFilter !== "all" ? statusFilter : undefined, department: deptFilter !== "all" ? deptFilter : undefined, companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );
  const { data: stats } = trpc.hr.getStats.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: departments } = trpc.hr.listDepartments.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: completenessData } = trpc.hr.getEmployeeCompleteness.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const bulkAssignMutation = trpc.hr.assignDepartment.useMutation({
    onSuccess: () => { refetch(); setSelectedIds(new Set()); setBulkDeptOpen(false); toast.success(`Department updated for ${selectedIds.size} employee(s)`); },
    onError: () => toast.error("Failed to update department"),
  });
  const bulkUpdatePosMutation = trpc.hr.updateEmployee.useMutation({
    onSuccess: () => { refetch(); },
    onError: () => toast.error("Failed to update position"),
  });

  // Build completeness map
  const completenessMap = useMemo(() => {
    const map: Record<number, { score: number; missingRequired: string[] }> = {};
    (completenessData ?? []).forEach((c) => { map[c.employeeId] = { score: c.score, missingRequired: c.missingRequired }; });
    return map;
  }, [completenessData]);

  const filtered = useMemo(() => {
    let list = employees ?? [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        (e.firstName + " " + e.lastName).toLowerCase().includes(q) ||
        (e.email ?? "").toLowerCase().includes(q) ||
        (e.department ?? "").toLowerCase().includes(q) ||
        (e.position ?? "").toLowerCase().includes(q) ||
        (e.nationality ?? "").toLowerCase().includes(q) ||
        (e.employeeNumber ?? "").toLowerCase().includes(q)
      );
    }
    if (completenessFilter !== "all") {
      list = list.filter((e) => {
        const c = completenessMap[e.id];
        if (!c) return completenessFilter === "incomplete";
        if (completenessFilter === "complete") return c.score >= 90;
        if (completenessFilter === "partial") return c.score >= 60 && c.score < 90;
        if (completenessFilter === "incomplete") return c.score < 60;
        return true;
      });
    }
    // Sorting
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = (a.firstName + " " + a.lastName).localeCompare(b.firstName + " " + b.lastName);
      } else if (sortBy === "completeness") {
        const sa = completenessMap[a.id]?.score ?? 0;
        const sb = completenessMap[b.id]?.score ?? 0;
        cmp = sa - sb;
      } else if (sortBy === "hireDate") {
        const da = a.hireDate ? new Date(a.hireDate).getTime() : 0;
        const db = b.hireDate ? new Date(b.hireDate).getTime() : 0;
        cmp = da - db;
      } else if (sortBy === "salary") {
        const sa = parseFloat(String(a.salary ?? "0"));
        const sb = parseFloat(String(b.salary ?? "0"));
        cmp = sa - sb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [employees, search, completenessFilter, completenessMap, sortBy, sortDir]);

  const kpiItems = [
    { label: "Total Workforce",   value: stats?.total ?? 0,                color: "bg-blue-500",    icon: Users },
    { label: "Active Employees",  value: stats?.active ?? 0,               color: "bg-emerald-500", icon: UserCheck },
    { label: "On Leave",          value: stats?.onLeave ?? 0,              color: "bg-amber-500",   icon: Clock },
    { label: "Omani Nationals",   value: stats?.omani ?? 0,                color: "bg-green-600",   icon: Shield },
    { label: "Omanisation Rate",  value: `${stats?.omanisationRate ?? 0}%`,color: "bg-teal-500",    icon: BarChart3 },
    { label: "Avg Salary (OMR)",  value: stats?.avgSalary ? stats.avgSalary.toFixed(3) : "0.000", color: "bg-[var(--smartpro-orange)]", icon: DollarSign },
  ];

  const needsAttention = useMemo(() =>
    (employees ?? []).filter((e) => {
      const c = completenessMap[e.id];
      const hasExpiry = (e as any).visaExpiryDate || (e as any).workPermitExpiryDate;
      const expiring = hasExpiry && (
        expiryStatus((e as any).visaExpiryDate, expiryWarningDays) !== "none" ||
        expiryStatus((e as any).workPermitExpiryDate, expiryWarningDays) !== "none"
      );
      return (c && c.score < 60) || expiring;
    }).length,
    [employees, completenessMap, expiryWarningDays]
  );

  return (
    <div className="flex h-full">
      <div className={`flex-1 p-6 space-y-6 overflow-y-auto transition-all ${selectedId ? "max-w-[calc(100%-400px)]" : ""}`}>
        {/* Header */}
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
                <span key={tag} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                  i === 0 ? "bg-orange-50 text-orange-700 border-orange-200" : i === 1 ? "bg-green-50 text-green-700 border-green-200" : i === 2 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-violet-50 text-violet-700 border-violet-200"
                }`}>{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {needsAttention > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={() => setCompletenessFilter("incomplete")}
              >
                <AlertTriangle size={12} /> {needsAttention} Need Attention
              </Button>
            )}
            <AddEmployeeWizard onSuccess={refetch} companyId={activeCompanyId} />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiItems.map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-card border rounded-xl p-3 hover:shadow-sm transition-shadow">
              <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center mb-2`}><Icon size={14} className="text-white" /></div>
              <p className="text-xl font-black text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Omanisation Progress */}
        {stats && stats.active > 0 && (
          <div className="p-4 bg-card border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Omanisation Progress</p>
              <span className="text-xs text-muted-foreground">MHRSD Target: 35%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div className={`h-3 rounded-full transition-all ${stats.omanisationRate >= 35 ? "bg-emerald-500" : stats.omanisationRate >= 20 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(stats.omanisationRate, 100)}%` }} />
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>{stats.omani} Omani nationals</span>
              <span className={`font-semibold ${stats.omanisationRate >= 35 ? "text-emerald-600" : "text-amber-600"}`}>{stats.omanisationRate}%</span>
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

        {/* Tabs */}
        <Tabs defaultValue="employees">
          <TabsList>
            <TabsTrigger value="employees">
              All Employees
              {employees && <span className="ml-1.5 bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]">{employees.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="departments">By Department</TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-4 mt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search name, role, department, nationality, emp#..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                {search && <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}><X size={14} /></button>}
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
                <SelectTrigger className="w-44"><SelectValue placeholder="All Departments" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {(departments as any[] ?? []).map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={completenessFilter} onValueChange={setCompletenessFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Profile Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Profiles</SelectItem>
                  <SelectItem value="complete">Complete (≥90%)</SelectItem>
                  <SelectItem value="partial">Partial (60–89%)</SelectItem>
                  <SelectItem value="incomplete">Needs Attention (&lt;60%)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={`${sortBy}-${sortDir}`} onValueChange={(v) => {
                const [field, dir] = v.split("-");
                setSortBy(field as any);
                setSortDir(dir as any);
              }}>
                <SelectTrigger className="w-44 gap-1.5">
                  <ArrowUpDown size={13} className="text-muted-foreground" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name A→Z</SelectItem>
                  <SelectItem value="name-desc">Name Z→A</SelectItem>
                  <SelectItem value="completeness-asc">Profile % Low→High</SelectItem>
                  <SelectItem value="completeness-desc">Profile % High→Low</SelectItem>
                  <SelectItem value="hireDate-asc">Hire Date Oldest</SelectItem>
                  <SelectItem value="hireDate-desc">Hire Date Newest</SelectItem>
                  <SelectItem value="salary-desc">Salary High→Low</SelectItem>
                  <SelectItem value="salary-asc">Salary Low→High</SelectItem>
                </SelectContent>
              </Select>
              {(search || statusFilter !== "active" || deptFilter !== "all" || completenessFilter !== "all") && (
                <Button variant="ghost" size="sm" className="h-10 text-xs gap-1 text-muted-foreground" onClick={() => { setSearch(""); setStatusFilter("active"); setDeptFilter("all"); setCompletenessFilter("all"); }}>
                  <X size={12} /> Clear filters
                </Button>
              )}
            </div>

            {/* Result count */}
            {(search || completenessFilter !== "all") && (
              <p className="text-xs text-muted-foreground">Showing {filtered.length} of {employees?.length ?? 0} employees</p>
            )}

            {/* Bulk Action Toolbar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-orange-50 border border-orange-200 rounded-xl">
                <span className="text-xs font-semibold text-orange-800">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2 ml-2">
                  <Dialog open={bulkDeptOpen} onOpenChange={setBulkDeptOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-100">
                        <Layers size={12} /> Assign Department
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader><DialogTitle>Assign Department</DialogTitle></DialogHeader>
                      <p className="text-xs text-muted-foreground mb-3">Assign {selectedIds.size} employee(s) to a department.</p>
                      <Select value={bulkDeptValue} onValueChange={setBulkDeptValue}>
                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                        <SelectContent>
                          {(departments as any[] ?? []).map((d: any) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2 justify-end mt-3">
                        <Button variant="ghost" size="sm" onClick={() => setBulkDeptOpen(false)}>Cancel</Button>
                        <Button size="sm" className="bg-[var(--smartpro-orange)] text-white hover:bg-orange-600" disabled={!bulkDeptValue || bulkAssignMutation.isPending}
                          onClick={() => bulkAssignMutation.mutate({ employeeIds: Array.from(selectedIds), departmentName: bulkDeptValue, companyId: activeCompanyId ?? undefined })}>
                          {bulkAssignMutation.isPending ? "Assigning..." : "Assign"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={bulkPositionOpen} onOpenChange={setBulkPositionOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-100">
                        <UserCog size={12} /> Update Position
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm">
                      <DialogHeader><DialogTitle>Update Position</DialogTitle></DialogHeader>
                      <p className="text-xs text-muted-foreground mb-3">Set position/job title for {selectedIds.size} employee(s).</p>
                      <Input placeholder="Enter position title..." value={bulkPositionValue} onChange={(e) => setBulkPositionValue(e.target.value)} />
                      <div className="flex gap-2 justify-end mt-3">
                        <Button variant="ghost" size="sm" onClick={() => setBulkPositionOpen(false)}>Cancel</Button>
                        <Button size="sm" className="bg-[var(--smartpro-orange)] text-white hover:bg-orange-600" disabled={!bulkPositionValue || bulkUpdatePosMutation.isPending}
                          onClick={async () => {
                            const ids = Array.from(selectedIds);
                            await Promise.all(ids.map((id) => bulkUpdatePosMutation.mutateAsync({ id, position: bulkPositionValue })));
                            refetch(); setSelectedIds(new Set()); setBulkPositionOpen(false); setBulkPositionValue("");
                            toast.success(`Position updated for ${ids.length} employee(s)`);
                          }}>
                          {bulkUpdatePosMutation.isPending ? "Updating..." : "Update"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-100"
                    onClick={() => { toast.success(`Reminder sent to ${selectedIds.size} employee(s)`); setSelectedIds(new Set()); }}>
                    <Send size={12} /> Send Reminder
                  </Button>
                </div>
                <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs text-muted-foreground" onClick={() => setSelectedIds(new Set())}>
                  <X size={12} /> Clear
                </Button>
              </div>
            )}
            {/* Table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th scope="col" className="px-4 py-3 w-10">
                        <Checkbox
                          checked={filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id))}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedIds(new Set(filtered.map((e) => e.id)));
                            else setSelectedIds(new Set());
                          }}
                          aria-label="Select all"
                        />
                      </th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Employee</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Role</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Department</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Nationality</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Status</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Profile</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Salary</th>
                      <th scope="col" className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Hire Date</th>
                      <th scope="col" className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">
                        <Users size={32} className="mx-auto mb-2 opacity-30" />
                        <p>No employees found</p>
                        <p className="text-xs mt-1">{search ? "Try adjusting your search or filters" : "Add your first employee using the button above"}</p>
                      </td></tr>
                    )}
                    {filtered.map((emp) => {
                      const statusMeta = STATUS_META[emp.status ?? "active"];
                      const isOmani = (emp.nationality ?? "").toLowerCase().includes("oman");
                      const isSelected = selectedId === emp.id;
                      const completeness = completenessMap[emp.id];
                      return (
                        <tr
                          key={emp.id}
                          className={`border-b hover:bg-muted/20 transition-colors cursor-pointer ${isSelected ? "bg-orange-50" : selectedIds.has(emp.id) ? "bg-blue-50" : ""}`}
                          onClick={() => setSelectedId(isSelected ? null : emp.id)}
                          role="button" tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedId(isSelected ? null : emp.id); }}
                          aria-pressed={isSelected}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(emp.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedIds);
                                if (checked) next.add(emp.id); else next.delete(emp.id);
                                setSelectedIds(next);
                              }}
                              aria-label={`Select ${emp.firstName} ${emp.lastName}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-8 h-8 shrink-0">
                                <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-xs font-bold">{getInitials(emp.firstName, emp.lastName)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-sm">{emp.firstName} {emp.lastName}</p>
                                {emp.email && <p className="text-xs text-muted-foreground">{emp.email}</p>}
                                {emp.employeeNumber && <p className="text-[10px] text-muted-foreground/70 font-mono">{emp.employeeNumber}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs">{emp.position ?? "—"}</td>
                          <td className="px-4 py-3">
                            {emp.department
                              ? <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${DEPT_COLORS[(emp.department.charCodeAt(0) ?? 0) % DEPT_COLORS.length]}`}>{emp.department}</span>
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <span className={`flex items-center gap-1 ${isOmani ? "text-green-700 font-medium" : "text-muted-foreground"}`}>
                              {isOmani && <Shield size={10} className="text-green-600" />}
                              {emp.nationality ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3"><Badge className={`text-xs ${statusMeta.color}`} variant="outline">{statusMeta.label}</Badge></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {completeness && <CompletenessBadge score={completeness.score} missingRequired={completeness.missingRequired} />}
                              <DocExpiryIndicator emp={emp} warnDays={expiryWarningDays} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">{emp.salary ? `${emp.currency ?? "OMR"} ${parseFloat(emp.salary).toFixed(3)}` : "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{emp.hireDate ? fmtDate(emp.hireDate) : "—"}</td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => setSelectedId(emp.id)}>
                                  <Eye size={13} className="mr-2" /> Quick View
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setLocation(`/business/employee/${emp.id}`)}>
                                  <Activity size={13} className="mr-2" /> Full Lifecycle Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setLocation(`/employee/${emp.id}/documents`)}>
                                  <FileBadge size={13} className="mr-2" /> Documents
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setLocation(`/hr/org-chart`)}>
                                  <Building2 size={13} className="mr-2" /> Org Chart
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="departments" className="mt-4">
            {departments && (departments as any[]).length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(departments as any[]).map((dept, i) => {
                  const deptEmps = employees?.filter((e) => e.department === dept.name && e.status === "active") ?? [];
                  const omani = deptEmps.filter((e) => (e.nationality ?? "").toLowerCase().includes("oman"));
                  const totalPayroll = deptEmps.filter((e) => e.salary).reduce((sum, e) => sum + parseFloat(e.salary ?? "0"), 0);
                  const avgCompleteness = deptEmps.length > 0
                    ? Math.round(deptEmps.reduce((s, e) => s + (completenessMap[e.id]?.score ?? 0), 0) / deptEmps.length)
                    : 0;
                  return (
                    <Card key={dept.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${DEPT_COLORS[i % DEPT_COLORS.length]}`}>
                            <Building2 size={12} />{dept.name}
                          </div>
                          <span className="text-2xl font-black text-foreground">{deptEmps.length}</span>
                        </div>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <div className="flex justify-between"><span>Omani nationals</span><span className="font-medium text-green-700">{omani.length} ({deptEmps.length > 0 ? Math.round((omani.length / deptEmps.length) * 100) : 0}%)</span></div>
                          <div className="flex justify-between"><span>Monthly payroll</span><span className="font-medium">OMR {totalPayroll.toFixed(3)}</span></div>
                          {deptEmps.length > 0 && (
                            <div className="flex justify-between items-center">
                              <span>Avg profile completeness</span>
                              <span className={`font-semibold ${avgCompleteness >= 90 ? "text-emerald-600" : avgCompleteness >= 60 ? "text-amber-600" : "text-red-600"}`}>{avgCompleteness}%</span>
                            </div>
                          )}
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
                <p className="text-sm text-muted-foreground">Go to Departments &amp; Positions to create departments, then assign employees.</p>
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Panel */}
      {selectedId && (
        <div className="w-[400px] border-l bg-background flex flex-col h-full overflow-hidden shrink-0">
          <EmployeeDetailPanel employeeId={selectedId} onClose={() => setSelectedId(null)} onUpdate={refetch} />
        </div>
      )}
    </div>
  );
}
