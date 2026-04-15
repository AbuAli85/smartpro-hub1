import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { NATIONALITIES, PROFESSIONS } from "@/lib/nationalities";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { toast } from "sonner";
import {
  Users, UserPlus, Search, Briefcase, Mail, Phone, Building2,
  ChevronRight, X, Edit2, MoreHorizontal, UserCheck, UserX,
  Calendar, DollarSign, Hash, Globe, Shield, TrendingUp,
  LayoutGrid, List, AlertTriangle, CheckCircle2, Clock, Star, Upload, Trash2,
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
import { fmtDate, fmtDateLong, fmtDateTimeShort, fmtTime, expiryStatus, expiryLabel, EXPIRY_BADGE, EXPIRY_BORDER, daysUntilExpiry } from "@/lib/dateUtils";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";

// ─── constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:     "bg-emerald-100 text-emerald-700 border-emerald-200",
  on_leave:   "bg-amber-100 text-amber-700 border-amber-200",
  terminated: "bg-red-100 text-red-700 border-red-200",
  resigned:   "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  active:     <CheckCircle2 size={12} />,
  on_leave:   <Clock size={12} />,
  terminated: <UserX size={12} />,
  resigned:   <AlertTriangle size={12} />,
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
  initial, editId, companyId,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initial?: Partial<StaffFormState>;
  editId?: number;
  companyId?: number | null;
}) {
  const { t } = useTranslation("hr");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<StaffFormState>({ ...BLANK_FORM, ...initial });
  const isEdit = editId != null;

  const utils = trpc.useUtils();

  const addMutation = trpc.team.addMember.useMutation({
    onSuccess: () => {
      toast.success(t("myTeam.toast.addedToTeam", { name: `${form.firstName} ${form.lastName}` }));
      void utils.team.listMembers.invalidate();
      void utils.team.getTeamStats.invalidate();
      onSuccess(); onClose(); setStep(1); setForm(BLANK_FORM);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.team.updateMember.useMutation({
    onSuccess: () => {
      toast.success(t("myTeam.toast.staffUpdated"));
      void utils.team.listMembers.invalidate();
      void utils.team.getMember.invalidate({ id: editId! });
      onSuccess(); onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const isPending = addMutation.isPending || updateMutation.isPending;

  function toDateStr(v: unknown): string | undefined {
    if (!v) return undefined;
    if (v instanceof Date) return v.toISOString().split("T")[0];
    const s = String(v).trim();
    return s || undefined;
  }

  function handleSubmit() {
    const payload = {
      ...form,
      salary: form.salary ? Number(form.salary) : undefined,
      email: form.email || undefined,
      workPermitNumber: form.workPermitNumber || undefined,
      visaNumber: form.visaNumber || undefined,
      occupationCode: form.occupationCode || undefined,
      occupationName: form.occupationName || undefined,
      workPermitExpiry: toDateStr(form.workPermitExpiry),
      dateOfBirth: toDateStr(form.dateOfBirth),
      gender: (form.gender as any) || undefined,
      maritalStatus: (form.maritalStatus as any) || undefined,
      profession: form.profession || undefined,
      visaExpiryDate: toDateStr(form.visaExpiryDate),
      workPermitExpiryDate: toDateStr(form.workPermitExpiryDate),
      pasiNumber: form.pasiNumber || undefined,
      bankName: form.bankName || undefined,
      bankAccountNumber: form.bankAccountNumber || undefined,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone || undefined,
    };
    if (isEdit) {
      updateMutation.mutate({ id: editId!, companyId: companyId ?? undefined, ...payload });
    } else {
      addMutation.mutate({ companyId: companyId ?? undefined, ...payload });
    }
  }

  const f = (k: keyof StaffFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const STEPS = [
    t("myTeam.form.steps.personalInfo"),
    t("myTeam.form.steps.rolePay"),
    t("myTeam.form.steps.additional"),
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setStep(1); } }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-7 h-7 rounded-lg bg-[var(--smartpro-orange)] flex items-center justify-center">
              <UserPlus size={14} className="text-white" />
            </div>
            {isEdit ? t("myTeam.form.editTitle") : t("myTeam.form.addTitle")}
          </DialogTitle>
        </DialogHeader>

        {!isEdit && (
          <div className="flex items-center gap-2 px-1">
            {STEPS.map((label, i) => (
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

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pe-1">
          {(step === 1 || isEdit) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.firstNameEn")} <span className="text-red-500">*</span></Label>
                  <Input placeholder={t("myTeam.form.placeholders.firstNameEg")} value={form.firstName} onChange={f("firstName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.lastNameEn")} <span className="text-red-500">*</span></Label>
                  <Input placeholder={t("myTeam.form.placeholders.lastNameEg")} value={form.lastName} onChange={f("lastName")} />
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
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.email")}</Label>
                  <Input type="email" placeholder={t("myTeam.form.placeholders.emailEg")} value={form.email} onChange={f("email")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.phone")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.phoneEg")} value={form.phone} onChange={f("phone")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.nationality")}</Label>
                  <select
                    value={form.nationality}
                    onChange={e => setForm(p => ({ ...p, nationality: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t("myTeam.form.placeholders.selectNationality")}</option>
                    {NATIONALITIES.map(n => <option key={n.code} value={n.label}>{n.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.gender")}</Label>
                  <select
                    value={form.gender}
                    onChange={e => setForm(p => ({ ...p, gender: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t("myTeam.form.placeholders.selectGender")}</option>
                    <option value="male">{t("myTeam.form.gender.male")}</option>
                    <option value="female">{t("myTeam.form.gender.female")}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.dateOfBirth")}</Label>
                  <DateInput value={form.dateOfBirth} onChange={f("dateOfBirth")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.maritalStatus")}</Label>
                  <select
                    value={form.maritalStatus}
                    onChange={e => setForm(p => ({ ...p, maritalStatus: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t("myTeam.form.placeholders.selectMaritalStatus")}</option>
                    <option value="single">{t("myTeam.form.maritalStatus.single")}</option>
                    <option value="married">{t("myTeam.form.maritalStatus.married")}</option>
                    <option value="divorced">{t("myTeam.form.maritalStatus.divorced")}</option>
                    <option value="widowed">{t("myTeam.form.maritalStatus.widowed")}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.nationalId")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.nationalIdEg")} value={form.nationalId} onChange={f("nationalId")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.passportNumber")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.passportOptional")} value={form.passportNumber} onChange={f("passportNumber")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.employeeNumber")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.employeeNumEg")} value={form.employeeNumber} onChange={f("employeeNumber")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.profession")}</Label>
                  <select
                    value={form.profession}
                    onChange={e => setForm(p => ({ ...p, profession: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t("myTeam.form.placeholders.selectProfession")}</option>
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
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.department")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.departmentEg")} value={form.department} onChange={f("department")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.position")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.positionEg")} value={form.position} onChange={f("position")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.employmentType")}</Label>
                  <Select value={form.employmentType} onValueChange={(v) => setForm((p) => ({ ...p, employmentType: v as any }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["full_time", "part_time", "contract", "intern"] as const).map((v) => (
                        <SelectItem key={v} value={v}>{t(`myTeam.empType.${v}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.hireDate")}</Label>
                  <DateInput value={form.hireDate} onChange={f("hireDate")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.basicSalary")}</Label>
                  <Input type="number" placeholder="0.000" value={form.salary} onChange={f("salary")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.currency")}</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm((p) => ({ ...p, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OMR">{t("myTeam.form.currency.omr")}</SelectItem>
                      <SelectItem value="USD">{t("myTeam.form.currency.usd")}</SelectItem>
                      <SelectItem value="AED">{t("myTeam.form.currency.aed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="pt-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  {t("myTeam.form.labels.workPermitVisa")}
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-snug">
                  {t("myTeam.form.labels.workPermitVisaDesc")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("myTeam.form.labels.workPermitNumber")}</Label>
                    <Input placeholder={t("myTeam.form.placeholders.workPermitEg")} value={form.workPermitNumber} onChange={f("workPermitNumber")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("myTeam.form.labels.visaLabourAuth")}</Label>
                    <Input placeholder={t("myTeam.form.placeholders.visaEg")} value={form.visaNumber} onChange={f("visaNumber")} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("myTeam.form.labels.occupationName")}</Label>
                    <Input placeholder={t("myTeam.form.placeholders.occupationNameEg")} value={form.occupationName} onChange={f("occupationName")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("myTeam.form.labels.occupationCode")}</Label>
                    <Input placeholder={t("myTeam.form.placeholders.occupationCodeEg")} value={form.occupationCode} onChange={f("occupationCode")} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("myTeam.form.labels.workPermitExpiry")}</Label>
                    <DateInput
                      value={form.workPermitExpiry}
                      onChange={f("workPermitExpiry")}
                      className={form.workPermitExpiry ? EXPIRY_BORDER[expiryStatus(form.workPermitExpiry)] : ""}
                    />
                    {form.workPermitExpiry && expiryStatus(form.workPermitExpiry) !== "valid" && (
                      <p className={`text-[10px] font-medium mt-0.5 ${expiryStatus(form.workPermitExpiry) === "expired" ? "text-red-600" : "text-amber-600"}`}>
                        {expiryLabel(form.workPermitExpiry)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">{t("myTeam.form.labels.visaExpiryDate")}</Label>
                    <DateInput
                      value={form.visaExpiryDate}
                      onChange={f("visaExpiryDate")}
                      className={form.visaExpiryDate ? EXPIRY_BORDER[expiryStatus(form.visaExpiryDate)] : ""}
                    />
                    {form.visaExpiryDate && expiryStatus(form.visaExpiryDate) !== "valid" && (
                      <p className={`text-[10px] font-medium mt-0.5 ${expiryStatus(form.visaExpiryDate) === "expired" ? "text-red-600" : "text-amber-600"}`}>
                        {expiryLabel(form.visaExpiryDate)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {(step === 3 || isEdit) && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                {t("myTeam.form.labels.pasiBank")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.pasiNumber")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.pasiEg")} value={form.pasiNumber} onChange={f("pasiNumber")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.bankName")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.bankNameEg")} value={form.bankName} onChange={f("bankName")} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">{t("myTeam.form.labels.bankAccountNumber")}</Label>
                <Input placeholder={t("myTeam.form.placeholders.bankAccountEg")} value={form.bankAccountNumber} onChange={f("bankAccountNumber")} />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 mt-3">
                {t("myTeam.form.labels.emergencyContact")}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.contactName")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.contactNameEg")} value={form.emergencyContactName} onChange={f("emergencyContactName")} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{t("myTeam.form.labels.contactPhone")}</Label>
                  <Input placeholder={t("myTeam.form.placeholders.phoneEg")} value={form.emergencyContactPhone} onChange={f("emergencyContactPhone")} />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isEdit && step > 1 && (
            <Button variant="outline" onClick={() => setStep(s => s - 1)}>{t("myTeam.form.buttons.back")}</Button>
          )}
          <Button variant="outline" onClick={() => { onClose(); setStep(1); }}>{t("myTeam.form.buttons.cancel")}</Button>
          {!isEdit && step < 3 ? (
            <Button
              className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
              disabled={step === 1 && (!form.firstName.trim() || !form.lastName.trim())}
              onClick={() => setStep(s => s + 1)}
            >
              {step === 1 ? t("myTeam.form.buttons.nextRolePay") : t("myTeam.form.buttons.nextAdditional")}
            </Button>
          ) : (
            <Button
              className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white"
              disabled={isPending || !form.firstName.trim() || !form.lastName.trim()}
              onClick={handleSubmit}
            >
              {isPending ? t("myTeam.form.buttons.saving") : isEdit ? t("myTeam.form.buttons.saveChanges") : t("myTeam.form.buttons.addToTeam")}
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
  warnDays = 30,
}: {
  memberId: number;
  onClose: () => void;
  onEdit: (id: number) => void;
  onRemove: (id: number) => void;
  warnDays?: number;
}) {
  const { t } = useTranslation("hr");
  const { data: member, isLoading } = trpc.team.getMember.useQuery({ id: memberId });
  const utils = trpc.useUtils();

  const statusMutation = trpc.team.updateMember.useMutation({
    onSuccess: () => {
      toast.success(t("myTeam.toast.statusUpdated"));
      void utils.team.listMembers.invalidate();
      void utils.team.getMember.invalidate({ id: memberId });
      void utils.team.getTeamStats.invalidate();
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

  const statusColor = STATUS_COLORS[member.status] ?? STATUS_COLORS.active;
  const statusIcon = STATUS_ICONS[member.status] ?? STATUS_ICONS.active;
  const statusLabel = t(`myTeam.status.${member.status}` as any, { defaultValue: member.status });
  const initials = getInitials(member.firstName, member.lastName);

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">{t("myTeam.profile.title")}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
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
              <Badge className={`text-xs border ${statusColor} flex items-center gap-1`}>
                {statusIcon} {statusLabel}
              </Badge>
              {member.employmentType && (
                <Badge variant="outline" className="text-xs">
                  {t(`myTeam.empType.${member.employmentType}` as any, { defaultValue: member.employmentType })}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 border-b border-border">
          {member.email && (
            <a href={`mailto:${member.email}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                <Mail size={13} /> {t("myTeam.profile.email")}
              </Button>
            </a>
          )}
          {member.phone && (
            <a href={`tel:${member.phone}`} className="flex-1">
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                <Phone size={13} /> {t("myTeam.profile.call")}
              </Button>
            </a>
          )}
          <Button
            variant="outline" size="sm"
            className="flex-1 gap-1.5 text-xs"
            onClick={() => onEdit(member.id)}
          >
            <Edit2 size={13} /> {t("myTeam.profile.edit")}
          </Button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <ProfileSection title={t("myTeam.profile.contact")}>
            <ProfileInfoRow icon={<Mail size={13} />} label={t("myTeam.profile.email")} value={member.email || "—"} />
            <ProfileInfoRow icon={<Phone size={13} />} label={t("myTeam.profile.call")} value={member.phone || "—"} />
          </ProfileSection>

          <ProfileSection title={t("myTeam.profile.employment")}>
            <ProfileInfoRow icon={<Building2 size={13} />} label={t("myTeam.profile.department")} value={member.department || "—"} />
            <ProfileInfoRow icon={<Briefcase size={13} />} label={t("myTeam.profile.position")} value={member.position || "—"} />
            <ProfileInfoRow icon={<Hash size={13} />} label={t("myTeam.profile.employeeNum")} value={member.employeeNumber || "—"} />
            <ProfileInfoRow icon={<Calendar size={13} />} label={t("myTeam.profile.hireDate")}
              value={member.hireDate ? fmtDateLong(member.hireDate) : "—"} />
          </ProfileSection>

          <ProfileSection title={t("myTeam.profile.identity")}>
            <ProfileInfoRow icon={<Globe size={13} />} label={t("myTeam.profile.nationality")} value={member.nationality || "—"} />
            <ProfileInfoRow icon={<Shield size={13} />} label={t("myTeam.profile.civilId")} value={member.nationalId || "—"} />
            <ProfileInfoRow icon={<Shield size={13} />} label={t("myTeam.profile.passport")} value={member.passportNumber || "—"} />
            {(member as any).dateOfBirth && (
              <ProfileInfoRow icon={<Calendar size={13} />} label={t("myTeam.profile.dateOfBirth")} value={fmtDate((member as any).dateOfBirth)} />
            )}
          </ProfileSection>

          {((member as any).visaExpiryDate || (member as any).workPermitExpiryDate || (member as any).workPermitNumber || (member as any).visaNumber) && (
            <ProfileSection title={t("myTeam.profile.documentsExpiry")}>
              {(member as any).workPermitNumber && (
                <ProfileInfoRow
                  icon={<Shield size={13} />}
                  label={t("myTeam.profile.workPermit")}
                  value={(member as any).workPermitNumber}
                  expiryDate={(member as any).workPermitExpiryDate}
                  warnDays={warnDays}
                />
              )}
              {(member as any).workPermitExpiryDate && !(member as any).workPermitNumber && (
                <ProfileInfoRow
                  icon={<Calendar size={13} />}
                  label={t("myTeam.profile.wpExpiry")}
                  value={fmtDate((member as any).workPermitExpiryDate)}
                  expiryDate={(member as any).workPermitExpiryDate}
                  warnDays={warnDays}
                />
              )}
              {(member as any).visaNumber && (
                <ProfileInfoRow
                  icon={<Shield size={13} />}
                  label={t("myTeam.profile.visaNo")}
                  value={(member as any).visaNumber}
                  expiryDate={(member as any).visaExpiryDate}
                  warnDays={warnDays}
                />
              )}
              {(member as any).visaExpiryDate && !(member as any).visaNumber && (
                <ProfileInfoRow
                  icon={<Calendar size={13} />}
                  label={t("myTeam.profile.visaExpiry")}
                  value={fmtDate((member as any).visaExpiryDate)}
                  expiryDate={(member as any).visaExpiryDate}
                  warnDays={warnDays}
                />
              )}
              {(member as any).pasiNumber && (
                <ProfileInfoRow icon={<Hash size={13} />} label={t("myTeam.profile.pasiNo")} value={(member as any).pasiNumber} />
              )}
            </ProfileSection>
          )}

          <ProfileSection title={t("myTeam.profile.compensation")}>
            <ProfileInfoRow icon={<DollarSign size={13} />} label={t("myTeam.profile.basicSalary")}
              value={fmtSalary(member.salary, member.currency ?? "OMR")} />
          </ProfileSection>

          <ProfileSection title={t("myTeam.profile.changeStatus")}>
            <div className="grid grid-cols-2 gap-2">
              {(["active", "on_leave", "terminated", "resigned"] as const).map((status) => (
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
                  {STATUS_ICONS[status]} {t(`myTeam.status.${status}`)}
                </button>
              ))}
            </div>
          </ProfileSection>
        </div>
      </div>

      <div className="px-4 py-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 gap-1.5"
          onClick={() => onRemove(member.id)}
        >
          <UserX size={13} /> {t("myTeam.profile.offboard")}
        </Button>
      </div>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ProfileInfoRow({
  icon, label, value, expiryDate, warnDays = 30,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  expiryDate?: Date | string | null;
  warnDays?: number;
}) {
  const status = expiryDate ? expiryStatus(expiryDate, warnDays) : "none";
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-foreground font-medium break-all">{value}</span>
        {status !== "none" && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full w-fit ${EXPIRY_BADGE[status]}`}>
            {status === "expired" ? "⚠ " : status === "expiring-soon" ? "⏰ " : "✓ "}
            {expiryLabel(expiryDate, warnDays)}
          </span>
        )}
      </div>
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
          <div className="w-24 text-xs text-muted-foreground truncate text-end">{d.dept}</div>
          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full ${DEPT_COLORS[i % DEPT_COLORS.length]}`}
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <div className="w-6 text-xs font-semibold text-foreground text-end">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Staff Card ───────────────────────────────────────────────────────────────

function StaffCard({
  member, onClick, onEdit, onRemove, onViewProfile, onDocuments, warnDays = 30,
}: {
  member: any; onClick: () => void; onEdit: () => void; onRemove: () => void;
  onViewProfile: () => void; onDocuments: () => void; warnDays?: number;
}) {
  const { t } = useTranslation("hr");
  const statusColor = STATUS_COLORS[member.status] ?? STATUS_COLORS.active;
  const statusIcon = STATUS_ICONS[member.status] ?? STATUS_ICONS.active;
  const statusLabel = t(`myTeam.status.${member.status}` as any, { defaultValue: member.status });
  const initials = getInitials(member.firstName, member.lastName);

  const completenessFields = [
    member.firstName, member.lastName, member.email, member.phone,
    member.department, member.position, member.nationality, member.nationalId,
    member.passportNumber, member.hireDate, member.employeeNumber,
  ];
  const filledCount = completenessFields.filter(Boolean).length;
  const completenessScore = Math.round((filledCount / completenessFields.length) * 100);
  const completenessBarColor = completenessScore >= 80 ? "bg-emerald-500" : completenessScore >= 50 ? "bg-amber-500" : "bg-red-500";
  const completenessTextColor = completenessScore >= 80 ? "text-emerald-600" : completenessScore >= 50 ? "text-amber-600" : "text-red-500";

  const docDates = [member.visaExpiryDate, member.workPermitExpiryDate].filter(Boolean);
  const docStatuses = docDates.map((d: any) => expiryStatus(d, warnDays));
  const hasExpired = docStatuses.includes("expired");
  const hasExpiringSoon = docStatuses.includes("expiring-soon");
  const cardExpiry = hasExpired ? "expired" : hasExpiringSoon ? "expiring-soon" : "none";

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border rounded-xl p-4 cursor-pointer hover:shadow-md transition-all group relative",
        cardExpiry === "expired"
          ? "border-red-400 ring-1 ring-red-300"
          : cardExpiry === "expiring-soon"
          ? "border-amber-400 ring-1 ring-amber-200"
          : "border-border hover:border-[var(--smartpro-orange)]"
      )}
    >
      {/* Two-column header: avatar+info LEFT, status badge+action menu RIGHT */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
        {/* Left column: avatar + name / role / dept */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar className="w-9 h-9 shrink-0">
            <AvatarFallback className="bg-[var(--smartpro-orange)] text-white text-sm font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-semibold text-foreground text-sm truncate leading-tight">
              {member.firstName} {member.lastName}
            </div>
            <div className="text-xs text-muted-foreground truncate">{member.position || "—"}</div>
            <div className="text-[10px] text-muted-foreground/70 truncate">
              {member.department || t("myTeam.card.noDepartment")}
            </div>
          </div>
        </div>

        {/* Right column: status badge stacked above action menu */}
        <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Badge className={`text-[10px] border px-1.5 py-0.5 flex items-center gap-1 ${statusColor}`}>
            {statusIcon} {statusLabel}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm">
              <DropdownMenuItem onClick={onViewProfile}><ChevronRight size={13} className="me-2" /> {t("myTeam.card.viewFullProfile")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onDocuments}><Shield size={13} className="me-2" /> {t("myTeam.card.documents")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit}><Edit2 size={13} className="me-2" /> {t("myTeam.profile.edit")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRemove} className="text-red-600">
                <UserX size={13} className="me-2" /> {t("myTeam.card.offboard")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Secondary row: employment type + email */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="text-[10px] text-muted-foreground">
          {t(`myTeam.empType.${member.employmentType ?? "full_time"}` as any, { defaultValue: member.employmentType ?? "full_time" })}
        </span>
        {member.email && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 truncate min-w-0">
            <Mail size={10} className="shrink-0" /> <span className="truncate">{member.email}</span>
          </div>
        )}
      </div>

      {/* Profile completeness bar */}
      <div className="mt-2 flex items-center gap-1.5">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${completenessBarColor}`}
            style={{ width: `${completenessScore}%` }}
          />
        </div>
        <span className={`text-[9px] font-medium shrink-0 ${completenessTextColor}`}>{completenessScore}%</span>
      </div>

      {/* Document expiry warning */}
      {cardExpiry !== "none" && (
        <div className={`mt-2 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md ${EXPIRY_BADGE[cardExpiry]}`}>
          {cardExpiry === "expired" ? "⚠" : "⏰"}
          {hasExpired
            ? t("myTeam.card.docExpired")
            : t("myTeam.card.docExpiringSoon")}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyTeamPage() {
  const { t } = useTranslation("hr");
  const [, navigate] = useLocation();
  const { activeCompanyId, expiryWarningDays } = useActiveCompany();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [removeId, setRemoveId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data: members = [], isLoading } = trpc.team.listMembers.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      search: search || undefined,
      status: statusFilter !== "all" ? (statusFilter as any) : undefined,
      department: deptFilter !== "all" ? deptFilter : undefined,
    },
    { enabled: activeCompanyId != null }
  );
  const { data: stats } = trpc.team.getTeamStats.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null }
  );

  const removeMutation = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      toast.success(t("myTeam.toast.offboarded"));
      void utils.team.listMembers.invalidate();
      void utils.team.getTeamStats.invalidate();
      setRemoveId(null);
      if (selectedId === removeId) setSelectedId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const departments = useMemo(() => {
    const depts = new Set<string>();
    (stats?.byDepartment ?? []).forEach((d) => depts.add(d.dept));
    return Array.from(depts).filter((d) => d && d !== "Unassigned");
  }, [stats?.byDepartment]);

  const editMember = members.find((m) => m.id === editId);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");

  const clearAllMutation = trpc.team.clearAllEmployees.useMutation({
    onSuccess: (data) => {
      toast.success(t("myTeam.toast.cleared", { count: data.deleted }));
      void utils.team.listMembers.invalidate();
      void utils.team.getTeamStats.invalidate();
      setClearConfirmOpen(false);
      setClearConfirmText("");
    },
    onError: (e) => toast.error(e.message),
  });

  const kpiItems = stats ? [
    { label: t("myTeam.metrics.totalStaff"), value: stats.total, color: "text-foreground", bg: "bg-muted/60 border-border" },
    { label: t("myTeam.metrics.active"), value: stats.active, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
    { label: t("myTeam.metrics.onLeave"), value: stats.onLeave, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
    { label: t("myTeam.metrics.departments"), value: stats.byDepartment.length, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
    {
      label: t("myTeam.metrics.expiryWarnings"),
      value: (stats as any).expiryWarnings ?? 0,
      color: ((stats as any).expiryWarnings ?? 0) > 0 ? "text-red-700" : "text-muted-foreground",
      bg: ((stats as any).expiryWarnings ?? 0) > 0 ? "bg-red-50 border-red-200" : "bg-muted/60 border-border",
    },
  ] : [];

  const hasFilters = search || statusFilter !== "all" || deptFilter !== "all";

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Page header */}
        <div className="px-6 py-5 border-b border-border bg-card">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Users size={20} className="text-[var(--smartpro-orange)]" />
                {t("myTeam.title")}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("myTeam.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setClearConfirmOpen(true)}
                className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                title={t("myTeam.clearAllDialog.title")}
              >
                <Trash2 size={16} /> {t("myTeam.actions.clearAll")}
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/my-team/import")}
                className="gap-2"
              >
                <Upload size={16} /> {t("myTeam.actions.importExcel")}
              </Button>
              <Button
                onClick={() => setAddOpen(true)}
                className="bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white gap-2"
              >
                <UserPlus size={16} /> {t("myTeam.actions.addStaff")}
              </Button>
            </div>
          </div>

          {/* KPI bar */}
          {stats && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {kpiItems.map((k) => (
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
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("myTeam.filter.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-8 h-8 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue placeholder={t("myTeam.filter.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myTeam.filter.allStatuses")}</SelectItem>
              {(["active", "on_leave", "terminated", "resigned"] as const).map((v) => (
                <SelectItem key={v} value={v}>{t(`myTeam.status.${v}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 text-sm w-40">
              <SelectValue placeholder={t("myTeam.filter.allDepartments")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("myTeam.filter.allDepartments")}</SelectItem>
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
                {hasFilters ? t("myTeam.emptyState.noMatch") : t("myTeam.emptyState.noStaff")}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {hasFilters ? t("myTeam.emptyState.noMatchSub") : t("myTeam.emptyState.noStaffSub")}
              </p>
              {!hasFilters && (
                <Button
                  onClick={() => setAddOpen(true)}
                  className="mt-4 bg-[var(--smartpro-orange)] hover:bg-orange-600 text-white gap-2"
                >
                  <UserPlus size={15} /> {t("myTeam.actions.addFirstStaff")}
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
                  warnDays={expiryWarningDays}
                />
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("myTeam.table.name")}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("myTeam.table.department")}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("myTeam.table.position")}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("myTeam.table.type")}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("myTeam.table.status")}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("myTeam.table.contact")}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const sColor = STATUS_COLORS[m.status] ?? STATUS_COLORS.active;
                    const sIcon = STATUS_ICONS[m.status] ?? STATUS_ICONS.active;
                    const sLabel = t(`myTeam.status.${m.status}` as any, { defaultValue: m.status });
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
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {t(`myTeam.empType.${m.employmentType ?? "full_time"}` as any, { defaultValue: m.employmentType ?? "full_time" })}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] border flex items-center gap-1 w-fit ${sColor}`}>
                            {sIcon} {sLabel}
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
                              <DropdownMenuItem onClick={() => navigate(`/business/employee/${m.id}`)}><ChevronRight size={13} className="me-2" /> {t("myTeam.card.viewFullProfile")}</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/employee/${m.id}/documents`)}><Shield size={13} className="me-2" /> {t("myTeam.card.documents")}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setEditId(m.id)}><Edit2 size={13} className="me-2" /> {t("myTeam.profile.edit")}</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setRemoveId(m.id)} className="text-red-600">
                                <UserX size={13} className="me-2" /> {t("myTeam.card.offboard")}
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

          {stats && stats.byDepartment.length > 0 && (
            <div className="mt-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp size={15} className="text-[var(--smartpro-orange)]" />
                    {t("myTeam.headcountByDept")}
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

      {selectedId != null && (
        <StaffProfilePanel
          memberId={selectedId}
          onClose={() => setSelectedId(null)}
          onEdit={(id) => { setEditId(id); setSelectedId(null); }}
          onRemove={(id) => { setRemoveId(id); setSelectedId(null); }}
          warnDays={expiryWarningDays}
        />
      )}

      <StaffFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {}}
        companyId={activeCompanyId}
      />

      {editId != null && editMember && (
        <StaffFormDialog
          open={true}
          onClose={() => setEditId(null)}
          onSuccess={() => setEditId(null)}
          editId={editId}
          companyId={activeCompanyId}
          initial={{
            firstName: editMember.firstName,
            lastName: editMember.lastName,
            firstNameAr: editMember.firstNameAr ?? "",
            lastNameAr: editMember.lastNameAr ?? "",
            email: editMember.email ?? "",
            phone: editMember.phone ?? "",
            nationality: editMember.nationality ?? "",
            passportNumber: editMember.passportNumber ?? "",
            nationalId: editMember.nationalId ?? "",
            dateOfBirth: editMember.dateOfBirth
              ? new Date(editMember.dateOfBirth).toISOString().split("T")[0]
              : "",
            gender: editMember.gender ?? "",
            maritalStatus: editMember.maritalStatus ?? "",
            department: editMember.department ?? "",
            position: editMember.position ?? "",
            profession: editMember.profession ?? "",
            employmentType: (editMember.employmentType as any) ?? "full_time",
            salary: editMember.salary ?? "",
            currency: editMember.currency ?? "OMR",
            hireDate: editMember.hireDate
              ? new Date(editMember.hireDate).toISOString().split("T")[0]
              : "",
            employeeNumber: editMember.employeeNumber ?? "",
            workPermitNumber: editMember.workPermitNumber ?? "",
            visaNumber: editMember.visaNumber ?? "",
            visaExpiryDate: editMember.visaExpiryDate
              ? new Date(editMember.visaExpiryDate).toISOString().split("T")[0]
              : "",
            workPermitExpiryDate: editMember.workPermitExpiryDate
              ? new Date(editMember.workPermitExpiryDate).toISOString().split("T")[0]
              : "",
            pasiNumber: editMember.pasiNumber ?? "",
            bankName: editMember.bankName ?? "",
            bankAccountNumber: editMember.bankAccountNumber ?? "",
            emergencyContactName: editMember.emergencyContactName ?? "",
            emergencyContactPhone: editMember.emergencyContactPhone ?? "",
          }}
        />
      )}

      {/* Remove confirmation */}
      <Dialog open={removeId != null} onOpenChange={(v) => { if (!v) setRemoveId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle size={18} className="text-red-500" />
              {t("myTeam.offboardDialog.title")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {t("myTeam.offboardDialog.body")}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoveId(null)}>{t("myTeam.offboardDialog.cancel")}</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={removeMutation.isPending}
              onClick={() => removeId != null && removeMutation.mutate({ id: removeId, companyId: activeCompanyId ?? undefined })}
            >
              {removeMutation.isPending ? t("myTeam.offboardDialog.processing") : t("myTeam.offboardDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear All Confirmation Dialog */}
      <Dialog open={clearConfirmOpen} onOpenChange={(v) => { setClearConfirmOpen(v); if (!v) setClearConfirmText(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600">
              <Trash2 size={18} className="text-red-500" />
              {t("myTeam.clearAllDialog.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              <p className="font-semibold mb-1">{t("myTeam.clearAllDialog.warning")}</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>{t("myTeam.clearAllDialog.bullet1")}</li>
                <li>{t("myTeam.clearAllDialog.bullet2")}</li>
                <li>{t("myTeam.clearAllDialog.bullet3")}</li>
                <li>{t("myTeam.clearAllDialog.bullet4")}</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("myTeam.clearAllDialog.typeConfirm")}
              </Label>
              <Input
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder={t("myTeam.clearAllDialog.typePlaceholder")}
                className="border-red-300 focus-visible:ring-red-400"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => { setClearConfirmOpen(false); setClearConfirmText(""); }}>
              {t("myTeam.clearAllDialog.cancel")}
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={clearAllMutation.isPending || clearConfirmText !== "DELETE ALL"}
              onClick={() => clearAllMutation.mutate({ companyId: activeCompanyId ?? undefined })}
            >
              {clearAllMutation.isPending ? t("myTeam.clearAllDialog.deleting") : t("myTeam.clearAllDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
