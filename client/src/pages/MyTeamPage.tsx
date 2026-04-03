import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { NATIONALITIES, PROFESSIONS } from "@/lib/nationalities";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { toast } from "sonner";
import {
  Users, UserPlus, Search, Briefcase, Mail, Phone, Building2,
  ChevronRight, X, Edit2, MoreHorizontal, UserCheck, UserX,
  Calendar, DollarSign, Hash, Globe, Shield, TrendingUp,
  LayoutGrid, List, AlertTriangle, CheckCircle2, Clock, Star, Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active:     { label: "Active",      color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={12} /> },
  on_leave:   { label: "On Leave",    color: "bg-amber-100 text-amber-700 border-amber-200",       icon: <Clock size={12} /> },
  terminated: { label: "Terminated",  color: "bg-red-100 text-red-700 border-red-200",             icon: <UserX size={12} /> },
  resigned:   { label: "Resigned",    color: "bg-gray-100 text-gray-600 border-gray-200",          icon: <AlertTriangle size={12} /> },
};

const EMP_TYPE_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract:  "Contract",
  intern:    "Intern",
};

const DEPT_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
];

function getInitials(first: string, last: string) {
  return ((first?.[0] ?? "") + (last?.[0] ?? "")).toUpperCase();
}

function fmtSalary(s: string | null | undefined, currency = "OMR") {
  if (!s) return "—";
  return `${currency} ${Number(s).toLocaleString("en-OM", { minimumFractionDigits: 3 })}`;
}

// ─── Add / Edit Staff Dialog ──────────────────────────────────────────────────

interface StaffFormState {
  firstName: string; lastName: string; firstNameAr: string; lastNameAr: string;
  email: string; phone: string;
  nationality: string; passportNumber: string; nationalId: string;
  dateOfBirth: string; gender: string; maritalStatus: string;
  department: string; position: string; profession: string;
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  salary: string; currency: string;
  hireDate: string; employeeNumber: string;
  pasiNumber: string; bankName: string; bankAccountNumber: string;
  emergencyContactName: string; emergencyContactPhone: string;
  // Work permit / visa fields
  workPermitNumber: string; visaNumber: string;
  occupationCode: string; occupationName: string;
  workPermitExpiry: string; visaExpiryDate: string; workPermitExpiryDate: string;
}

const BLANK_FORM: StaffFormState = {
  firstName: "", lastName: "", firstNameAr: "", lastNameAr: "",
  email: "", phone: "",
  nationality: "", passportNumber: "", nationalId: "",
  dateOfBirth: "", gender: "", maritalStatus: "",
  department: "", position: "", profession: "",
  employmentType: "full_time",
  salary: "", currency: "OMR", hireDate: "", employeeNumber: "",
  pasiNumber: "", bankName: "", bankAccountNumber: "",
  emergencyContactName: "", emergencyContactPhone: "",
  workPermitNumber: "", visaNumber: "", occupationCode: "", occupationName: "",
  workPermitExpiry: "", visaExpiryDate: "", workPermitExpiryDate: "",
};

function StaffFormDialog({
  open, onClose, onSuccess,
  initial, editId,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initial?: Partial<StaffFormState>;
  editId?: number;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<StaffFormState>({ ...BLANK_FORM, ...initial });
  const isEdit = editId != null;

  const utils = trpc.useUtils();

  const addMutation = trpc.team.addMember.useMutation({
    onSuccess: () => {
      toast.success(`${form.firstName} ${form.lastName} added to your team`);
      utils.team.listMembers.invalidate();
      utils.team.getTeamStats.invalidate();
      onSuccess(); onClose(); setStep(1); setForm(BLANK_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.team.updateMember.useMutation({
    onSuccess: () => {
      toast.success("Staff member updated");
      utils.team.listMembers.invalidate();
      utils.team.getMember.invalidate({ id: editId! });
      onSuccess(); onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending = addMutation.isPending || updateMutation.isPending;

  function handleSubmit() {
    const payload = {
      ...form,
      salary: form.salary ? Number(form.salary) : undefined,
      email: form.email || undefined,
      workPermitNumber: form.workPermitNumber || undefined,
      visaNumber: form.visaNumber || undefined,
      occupationCode: form.occupationCode || undefined,
      occupationName: form.occupationName || undefined,
      workPermitExpiry: form.workPermitExpiry || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      gender: (form.gender as any) || undefined,
      maritalStatus: (form.maritalStatus as any) || undefined,
      profession: form.profession || undefined,
      visaExpiryDate: form.visaExpiryDate || undefined,
      workPermitExpiryDate: form.workPermitExpiryDate || undefined,
      pasiNumber: form.pasiNumber || undefined,
      bankName: form.bankName || undefined,
      bankAccountNumber: form.bankAccountNumber || undefined,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone || undefined,
    };
    if (isEdit) {
      updateMutation.mutate({ id: editId!, ...payload });
    } else {
      addMutation.mutate(payload);
    }
  }

  const f = (k: keyof StaffFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setStep(1); } }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-7 h-7 rounded-lg bg-[var(--smartpro-orange)] flex items-center justify-center">
              <UserPlus size={14} className="text-white" />
            </div>
            {isEdit ? "Edit Staff Member" : "Add New Staff Member"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        {!isEdit && (
          <div className="flex items-center gap-2 px-1">
            {["Personal Info", "Role & Pay", "Additional"].map((label, i) => (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${step > i + 1 ? "bg-emerald-500 text-white" : step === i + 1 ? "bg-[var(--smartpro-orange)] text-white" : "bg-gray-200 text-gray-500"}`}>
                  {step > i + 1 ? "✓" : i + 1}
                </div>
                <span className={`text-xs ${step === i + 1 ? "font-semibold text-gray-900" : "text-gray-400"}`}>{label}</span>
                {i < 2 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-4 py-2">
          {(step === 1 || isEdit) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">First Name (EN) <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Ahmed" value={form.firstName} onChange={f("firstName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Last Name (EN) <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Al-Rashidi" value={form.lastName} onChange={f("lastName")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">الاسم الأول (AR)</Label>
                  <Input dir="rtl" placeholder="أحمد" value={form.firstNameAr} onChange={f("firstNameAr")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">اسم العائلة (AR)</Label>
                  <Input dir="rtl" placeholder="الراشدي" value={form.lastNameAr} onChange={f("lastNameAr")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Email</Label>
                  <Input type="email" placeholder="ahmed@company.om" value={form.email} onChange={f("email")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Phone</Label>
                  <Input placeholder="+968 9X XXX XXXX" value={form.phone} onChange={f("phone")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Nationality</Label>
                  <select
                    value={form.nationality}
                    onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Select Nationality —</option>
                    {NATIONALITIES.map(n => <option key={n.code} value={n.label}>{n.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Gender</Label>
                  <select
                    value={form.gender}
                    onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Select —</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Date of Birth</Label>
                  <Input type="date" value={form.dateOfBirth} onChange={f("dateOfBirth")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Marital Status</Label>
                  <select
                    value={form.maritalStatus}
                    onChange={e => setForm(p => ({ ...p, maritalStatus: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Select —</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">National ID / Civil ID</Label>
                  <Input placeholder="e.g. 12345678" value={form.nationalId} onChange={f("nationalId")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Passport Number</Label>
                  <Input placeholder="Optional" value={form.passportNumber} onChange={f("passportNumber")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Employee Number</Label>
                  <Input placeholder="e.g. EMP-001" value={form.employeeNumber} onChange={f("employeeNumber")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Profession</Label>
                  <select
                    value={form.profession}
                    onChange={e => setForm(p => ({ ...p, profession: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">— Select Profession —</option>
                    {PROFESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {(step === 2 || isEdit) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Department</Label>
                  <Input placeholder="e.g. Finance" value={form.department} onChange={f("department")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Position / Job Title</Label>
                  <Input placeholder="e.g. Accountant" value={form.position} onChange={f("position")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Employment Type</Label>
                  <Select value={form.employmentType} onValueChange={(v) => setForm((p) => ({ ...p, employmentType: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EMP_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Hire Date</Label>
                  <Input type="date" value={form.hireDate} onChange={f("hireDate")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Basic Salary</Label>
                  <Input type="number" placeholder="0.000" value={form.salary} onChange={f("salary")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OMR">OMR — Omani Rial</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="AED">AED — UAE Dirham</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Work Permit / Visa */}
              <div className="pt-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Work Permit &amp; Visa (Optional)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Work Permit Number</Label>
                    <Input placeholder="e.g. WP/2024/12345" value={form.workPermitNumber} onChange={f("workPermitNumber")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Visa / Labour Auth. No.</Label>
                    <Input placeholder="e.g. V/2024/98765" value={form.visaNumber} onChange={f("visaNumber")} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Occupation Name</Label>
                    <Input placeholder="e.g. Accountant" value={form.occupationName} onChange={f("occupationName")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Occupation Code</Label>
                    <Input placeholder="e.g. 2411" value={form.occupationCode} onChange={f("occupationCode")} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Work Permit Expiry</Label>
                    <Input type="date" value={form.workPermitExpiry} onChange={f("workPermitExpiry")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Visa Expiry Date</Label>
                    <Input type="date" value={form.visaExpiryDate} onChange={f("visaExpiryDate")} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 3: Additional Info */}
          {(step === 3 || isEdit) && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">PASI &amp; Bank Details</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">PASI Number</Label>
                  <Input placeholder="e.g. PASI-XXXXX" value={form.pasiNumber} onChange={f("pasiNumber")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Bank Name</Label>
                  <Input placeholder="e.g. Bank Muscat" value={form.bankName} onChange={f("bankName")} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Bank Account Number</Label>
                <Input placeholder="e.g. 0123456789" value={form.bankAccountNumber} onChange={f("bankAccountNumber")} />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 mt-3">Emergency Contact</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Contact Name</Label>
                  <Input placeholder="e.g. Mohammed Al-Rashidi" value={form.emergencyContactName} onChange={f("emergencyContactName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Contact Phone</Label>
                  <Input placeholder="+968 9X XXX XXXX" value={form.emergencyContactPhone} onChange={f("emergencyContactPhone")} />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isEdit && step > 1 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)}>Back</Button>
          )}
          <Button variant="outline" onClick={() => { onClose(); setStep(1); }}>Cancel</Button>
          {!isEdit && step < 3 ? (
            <Button
              className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
              disabled={step === 1 && (!form.firstName.trim() || !form.lastName.trim())}
              onClick={() => setStep(s => s + 1)}
            >
              {step === 1 ? "Next: Role & Pay" : "Next: Additional Info"}
            </Button>
          ) : (
            <Button
              className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
              disabled={isPending || !form.firstName.trim() || !form.lastName.trim()}
              onClick={handleSubmit}
            >
              {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add to Team"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Staff Profile Side Panel ─────────────────────────────────────────────────

function StaffProfilePanel({
  memberId,
  onClose,
  onEdit,
  onRemove,
}: {
  memberId: number;
  onClose: () => void;
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const { data: member, isLoading } = trpc.team.getMember.useQuery({ id: memberId });
  const utils = trpc.useUtils();

  const statusMutation = trpc.team.updateMember.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      utils.team.listMembers.invalidate();
      utils.team.getMember.invalidate({ id: memberId });
      utils.team.getTeamStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="w-80 border-l border-border bg-card flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--smartpro-orange)] border-t-transparent" />
      </div>
    );
  }
  if (!member) return null;

  const sm = STATUS_META[member.status] ?? STATUS_META.active;
  const initials = getInitials(member.firstName, member.lastName);

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">Staff Profile</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Avatar + name */}
        <div className="flex flex-col items-center py-6 px-4 bg-gradient-to-b from-muted/40 to-card border-b border-border">
          <Avatar className="w-16 h-16 mb-3">
            <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <div className="font-semibold text-foreground text-base">
              {member.firstName} {member.lastName}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">{member.position || "—"}</div>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <Badge className={`text-xs border ${sm.color} flex items-center gap-1`}>
                {sm.icon} {sm.label}
              </Badge>
              {member.employmentType && (
                <Badge variant="outline" className="text-xs">
                  {EMP_TYPE_LABELS[member.employmentType]}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-2 px-4 py-3 border-b border-border">
          {member.email && (
            <a href={`mailto:${member.email}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                <Mail size={13} /> Email
              </Button>
            </a>
          )}
          {member.phone && (
            <a href={`tel:${member.phone}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                <Phone size={13} /> Call
              </Button>
            </a>
          )}
          <Button
            variant="outline" size="sm"
            className="flex-1 gap-1.5 text-xs"
            onClick={() => onEdit(member.id)}
          >
            <Edit2 size={13} /> Edit
          </Button>
        </div>

        {/* Details */}
        <div className="px-4 py-4 space-y-4">
          <Section title="Contact">
            <InfoRow icon={<Mail size={13} />} label="Email" value={member.email || "—"} />
            <InfoRow icon={<Phone size={13} />} label="Phone" value={member.phone || "—"} />
          </Section>

          <Section title="Employment">
            <InfoRow icon={<Building2 size={13} />} label="Department" value={member.department || "—"} />
            <InfoRow icon={<Briefcase size={13} />} label="Position" value={member.position || "—"} />
            <InfoRow icon={<Hash size={13} />} label="Employee #" value={member.employeeNumber || "—"} />
            <InfoRow icon={<Calendar size={13} />} label="Hire Date"
              value={member.hireDate ? new Date(member.hireDate).toLocaleDateString("en-OM", { year: "numeric", month: "short", day: "numeric" }) : "—"} />
          </Section>

          <Section title="Identity">
            <InfoRow icon={<Globe size={13} />} label="Nationality" value={member.nationality || "—"} />
            <InfoRow icon={<Shield size={13} />} label="Civil ID" value={member.nationalId || "—"} />
            <InfoRow icon={<Shield size={13} />} label="Passport" value={member.passportNumber || "—"} />
          </Section>

          <Section title="Compensation">
            <InfoRow icon={<DollarSign size={13} />} label="Basic Salary"
              value={fmtSalary(member.salary, member.currency ?? "OMR")} />
          </Section>

          {/* Status change */}
          <Section title="Change Status">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STATUS_META).map(([status, meta]) => (
                <button
                  key={status}
                  disabled={member.status === status || statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ id: member.id, status: status as any })}
                  className={`text-xs px-2 py-1.5 rounded-md border transition-all flex items-center gap-1 justify-center
                    ${member.status === status
                      ? "border-[var(--smartpro-orange)] bg-orange-50 text-orange-700 font-semibold cursor-default"
                      : "border-border hover:border-muted-foreground text-muted-foreground hover:bg-muted/50"
                    }`}
                >
                  {meta.icon} {meta.label}
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 gap-1.5"
          onClick={() => onRemove(member.id)}
        >
          <UserX size={13} /> Offboard / Terminate
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="text-xs text-foreground font-medium break-all">{value}</span>
    </div>
  );
}

// ─── Department Bar Chart ─────────────────────────────────────────────────────

function DeptChart({ data }: { data: { dept: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((d, i) => (
        <div key={d.dept} className="flex items-center gap-2">
          <div className="w-24 text-xs text-muted-foreground truncate text-right">{d.dept}</div>
          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full ${DEPT_COLORS[i % DEPT_COLORS.length]}`}
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <div className="w-6 text-xs font-semibold text-foreground text-right">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────

function StaffCard({
  member, onClick, onEdit, onRemove, onViewProfile, onDocuments,
}: {
  member: any; onClick: () => void; onEdit: () => void; onRemove: () => void;
  onViewProfile: () => void; onDocuments: () => void;
}) {
  const sm = STATUS_META[member.status] ?? STATUS_META.active;
  const initials = getInitials(member.firstName, member.lastName);
  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-[var(--smartpro-orange)] hover:shadow-md transition-all group relative"
    >
      <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-sm">
            <DropdownMenuItem onClick={onViewProfile}><ChevronRight size={13} className="mr-2" /> View Full Profile</DropdownMenuItem>
            <DropdownMenuItem onClick={onDocuments}><Shield size={13} className="mr-2" /> Documents</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEdit}><Edit2 size={13} className="mr-2" /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRemove} className="text-red-600">
              <UserX size={13} className="mr-2" /> Offboard
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-start gap-3">
        <Avatar className="w-10 h-10 shrink-0">
          <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-sm font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground text-sm truncate">
            {member.firstName} {member.lastName}
          </div>
          <div className="text-xs text-muted-foreground truncate">{member.position || "—"}</div>
          <div className="text-xs text-muted-foreground/70 truncate">{member.department || "No department"}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <Badge className={`text-[10px] border px-1.5 py-0.5 flex items-center gap-1 ${sm.color}`}>
          {sm.icon} {sm.label}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{EMP_TYPE_LABELS[member.employmentType ?? "full_time"]}</span>
      </div>

      {member.email && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-400 truncate">
          <Mail size={10} /> {member.email}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyTeamPage() {
  const [, navigate] = useLocation();
  const { activeCompanyId } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: members = [], isLoading } = trpc.team.listMembers.useQuery({
    companyId: activeCompanyId ?? undefined,
    search: search || undefined,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    department: deptFilter !== "all" ? deptFilter : undefined,
  });

  const { data: stats } = trpc.team.getTeamStats.useQuery({ companyId: activeCompanyId ?? undefined });

  const removeMutation = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Staff member offboarded");
      utils.team.listMembers.invalidate();
      utils.team.getTeamStats.invalidate();
      setRemoveId(null);
      if (selectedId === removeId) setSelectedId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  // Unique departments for filter
  const departments = useMemo(() => {
    const depts = new Set<string>();
    (stats?.byDepartment ?? []).forEach((d) => depts.add(d.dept));
    return Array.from(depts).filter((d) => d !== "Unassigned");
  }, [stats?.byDepartment]);

  const editMember = members.find((m) => m.id === editId);

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Page header */}
        <div className="px-6 py-5 border-b border-border bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Users size={20} className="text-[var(--smartpro-orange)]" />
                My Team
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage your company's staff — add, edit, and track your entire workforce
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate("/my-team/import")}
                className="gap-2"
              >
                <Upload size={16} /> Import from Excel
              </Button>
              <Button
                onClick={() => setAddOpen(true)}
                className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white gap-2"
              >
                <UserPlus size={16} /> Add Staff Member
              </Button>
            </div>
          </div>

          {/* KPI bar */}
          {stats && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Staff", value: stats.total, color: "text-foreground", bg: "bg-muted/60 border-border" },
                { label: "Active", value: stats.active, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
                { label: "On Leave", value: stats.onLeave, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
                { label: "Departments", value: stats.byDepartment.length, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
              ].map((k) => (
                <div key={k.label} className={`rounded-lg border px-3 py-2 ${k.bg}`}>
                  <div className={`text-2xl font-black ${k.color}`}>{k.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters + view toggle */}
        <div className="px-6 py-3 border-b border-border bg-card flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, position, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(STATUS_META).map(([v, m]) => (
                <SelectItem key={v} value={v}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 text-sm w-40">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === "grid" ? "bg-[var(--smartpro-orange)] text-white" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === "list" ? "bg-[var(--smartpro-orange)] text-white" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-muted rounded-xl h-40 animate-pulse" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mb-4">
                <Users size={28} className="text-[var(--smartpro-orange)]" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                {search || statusFilter !== "all" || deptFilter !== "all"
                  ? "No staff match your filters"
                  : "No staff added yet"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {search || statusFilter !== "all" || deptFilter !== "all"
                  ? "Try adjusting your search or filters."
                  : "Start building your team by adding your first staff member. It only takes a minute."}
              </p>
              {!search && statusFilter === "all" && deptFilter === "all" && (
                <Button
                  onClick={() => setAddOpen(true)}
                  className="mt-4 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white gap-2"
                >
                  <UserPlus size={15} /> Add First Staff Member
                </Button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {members.map((m) => (
                <StaffCard
                  key={m.id}
                  member={m}
                  onClick={() => setSelectedId(m.id)}
                  onEdit={() => setEditId(m.id)}
                  onRemove={() => setRemoveId(m.id)}
                  onViewProfile={() => navigate(`/business/employee/${m.id}`)}
                  onDocuments={() => navigate(`/employee/${m.id}/documents`)}
                />
              ))}
            </div>
          ) : (
            /* Table view */
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Position</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const sm = STATUS_META[m.status] ?? STATUS_META.active;
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedId(m.id)}
                        className="border-b border-border/60 hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="w-8 h-8">
                              <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-xs font-bold">
                                {getInitials(m.firstName, m.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-foreground">{m.firstName} {m.lastName}</div>
                              {m.employeeNumber && <div className="text-xs text-muted-foreground">{m.employeeNumber}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{m.department || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{m.position || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{EMP_TYPE_LABELS[m.employmentType ?? "full_time"]}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] border flex items-center gap-1 w-fit ${sm.color}`}>
                            {sm.icon} {sm.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {m.email && <a href={`mailto:${m.email}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground"><Mail size={13} /></a>}
                            {m.phone && <a href={`tel:${m.phone}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-foreground"><Phone size={13} /></a>}
                          </div>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-sm">
                              <DropdownMenuItem onClick={() => navigate(`/business/employee/${m.id}`)}><ChevronRight size={13} className="mr-2" /> View Full Profile</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/employee/${m.id}/documents`)}><Shield size={13} className="mr-2" /> Documents</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setEditId(m.id)}><Edit2 size={13} className="mr-2" /> Edit</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setRemoveId(m.id)} className="text-red-600">
                                <UserX size={13} className="mr-2" /> Offboard
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
          )}

          {/* Department breakdown */}
          {stats && stats.byDepartment.length > 0 && (
            <div className="mt-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp size={15} className="text-[var(--smartpro-orange)]" />
                    Headcount by Department
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DeptChart data={stats.byDepartment} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Profile side panel */}
      {selectedId != null && (
        <StaffProfilePanel
          memberId={selectedId}
          onClose={() => setSelectedId(null)}
          onEdit={(id) => { setEditId(id); setSelectedId(null); }}
          onRemove={(id) => { setRemoveId(id); setSelectedId(null); }}
        />
      )}

      {/* Add dialog */}
      <StaffFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {}}
      />

      {/* Edit dialog */}
      {editId != null && editMember && (
        <StaffFormDialog
          open={true}
          onClose={() => setEditId(null)}
          onSuccess={() => setEditId(null)}
          editId={editId}
          initial={{
            firstName: editMember.firstName,
            lastName: editMember.lastName,
            email: editMember.email ?? "",
            phone: editMember.phone ?? "",
            nationality: editMember.nationality ?? "",
            passportNumber: editMember.passportNumber ?? "",
            nationalId: editMember.nationalId ?? "",
            department: editMember.department ?? "",
            position: editMember.position ?? "",
            employmentType: (editMember.employmentType as any) ?? "full_time",
            salary: editMember.salary ?? "",
            currency: editMember.currency ?? "OMR",
            hireDate: editMember.hireDate
              ? new Date(editMember.hireDate).toISOString().split("T")[0]
              : "",
            employeeNumber: editMember.employeeNumber ?? "",
          }}
        />
      )}

      {/* Remove confirmation */}
      <Dialog open={removeId != null} onOpenChange={(v) => { if (!v) setRemoveId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle size={18} className="text-red-500" />
              Confirm Offboarding
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will mark the staff member as <strong>Terminated</strong>. Their record will be
            preserved for payroll and compliance history. You can reactivate them at any time.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveId(null)}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={removeMutation.isPending}
              onClick={() => removeId != null && removeMutation.mutate({ id: removeId })}
            >
              {removeMutation.isPending ? "Processing…" : "Confirm Offboard"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
