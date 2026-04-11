/**
 * EmployeeProfileTab — Employee account center profile tab.
 *
 * Extracted from EmployeePortalPage to keep that file manageable.
 * Receives pre-fetched data as props; manages its own contact edit state.
 */
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Shield,
  Briefcase,
  Building2,
  CreditCard,
  Edit2,
  Save,
  Check,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  DollarSign,
  Wallet,
  Info,
  SendHorizonal,
  UserCheck,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDateLong, daysUntilExpiry } from "@/lib/dateUtils";
import { EmployeePortalMoreHub } from "@/components/employee-portal/EmployeePortalMoreHub";
import {
  type ProfileEmpData,
  type ProfileCompleteness,
  computeProfileCompleteness,
  computeProfileAlerts,
  formatEmploymentType,
  getProfileDocFields,
  hasAnyExpiringDocField,
} from "@/lib/employeeProfileUtils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EmployeeProfileTabProps {
  emp: ProfileEmpData;
  companyInfo: { name: string; role?: string | null } | null | undefined;
  /** Pre-loaded payroll array — first item is the latest payslip (if any) */
  payroll: any[];
  /** Pre-computed expiring docs from the documents tab query */
  expiringDocs: any[];
  /** Full documents list for completeness check */
  docs: any[];
  setActiveTab: (tab: string) => void;
  activeCompanyId: number | null | undefined;
  // Derived booleans (computed once in parent for consistency)
  payrollReady: boolean;
  hasPhone: boolean;
  hasEmergencyContact: boolean;
  fullName: string;
  arabicFullName: string | null;
  // MoreHub counts
  pendingLeave: number;
  trainingAttentionCount: number;
  pendingExpensesCount: number;
  pendingShiftRequestsCount: number;
}

// ─── Field Row helper ─────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  Icon,
  className,
  children,
}: {
  label: string;
  value?: string | null;
  Icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      {children ?? (
        <p className="text-sm font-medium flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="break-words">{value ?? "—"}</span>
        </p>
      )}
    </div>
  );
}

// ─── Sub-section: Profile Header ─────────────────────────────────────────────

function ProfileHeader({
  emp,
  companyInfo,
  fullName,
  arabicFullName,
  payrollReady,
  expiringDocs,
  setActiveTab,
}: Pick<EmployeeProfileTabProps, "emp" | "companyInfo" | "fullName" | "arabicFullName" | "payrollReady" | "expiringDocs" | "setActiveTab">) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className="w-[4.5rem] h-[4.5rem] rounded-full bg-primary/10 ring-2 ring-primary/20 flex items-center justify-center overflow-hidden">
              {emp.avatarUrl
                ? <img src={emp.avatarUrl} alt={fullName} className="w-full h-full object-cover" />
                : <User className="w-9 h-9 text-primary" />}
            </div>
            {emp.status === "active" && (
              <span
                className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card bg-green-500"
                aria-label="Active"
              />
            )}
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold leading-tight break-words">{fullName}</h2>
              {arabicFullName && (
                <p className="text-sm text-muted-foreground leading-snug" dir="rtl" lang="ar">
                  {arabicFullName}
                </p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {[emp.position ?? "Employee", emp.department, companyInfo?.name]
                .filter(Boolean)
                .join(" \u00b7 ")}
            </p>

            {/* Status chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {emp.employeeNumber && (
                <Badge variant="outline" className="text-xs font-mono">
                  #{emp.employeeNumber}
                </Badge>
              )}
              <Badge
                variant={emp.status === "active" ? "default" : "secondary"}
                className={cn("capitalize text-xs", emp.status === "active" && "bg-green-600 hover:bg-green-700")}
              >
                {emp.status ?? "Unknown"}
              </Badge>
              {emp.employmentType && (
                <Badge variant="outline" className="text-xs capitalize">
                  {emp.employmentType.replace(/_/g, " ")}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "text-xs gap-1",
                  payrollReady
                    ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400"
                    : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                )}
              >
                {payrollReady
                  ? <><Check className="h-3 w-3" /> Payroll Ready</>
                  : <><AlertTriangle className="h-3 w-3" /> Bank Not Set</>}
              </Badge>
              {expiringDocs.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 cursor-pointer border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                  onClick={() => setActiveTab("documents")}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {expiringDocs.length} Doc{expiringDocs.length > 1 ? "s" : ""} Expiring
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-section: Profile Completeness ───────────────────────────────────────

function ProfileCompletenessCard({
  completeness,
  onFixEmployee,
}: {
  completeness: ProfileCompleteness;
  onFixEmployee: () => void;
}) {
  const { score, total, percent, status, items } = completeness;

  if (status === "complete") return null; // nothing to show if fully complete

  const statusConfig = {
    complete: { color: "text-green-700 dark:text-green-400", bg: "bg-green-50 dark:bg-green-950/20", border: "border-green-200 dark:border-green-800", barClass: "bg-green-500" },
    good:     { color: "text-blue-700 dark:text-blue-400",   bg: "bg-blue-50 dark:bg-blue-950/20",   border: "border-blue-200 dark:border-blue-800",   barClass: "bg-blue-500" },
    incomplete: { color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-800", barClass: "bg-amber-500" },
  } as const;

  const cfg = statusConfig[status];

  return (
    <Card className={cn("border", cfg.border, cfg.bg)}>
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold">Profile completeness</p>
          </div>
          <span className={cn("text-sm font-bold tabular-nums", cfg.color)}>
            {score}/{total}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={percent} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">{percent}% complete</p>
        </div>

        {/* Item checklist */}
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-xs">
              {item.done ? (
                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/40 shrink-0" />
              )}
              <span className={cn("flex-1", item.done ? "text-muted-foreground line-through" : "text-foreground")}>
                {item.label}
              </span>
              {!item.done && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] py-0 h-4 leading-none gap-0.5",
                    item.managedBy === "employee"
                      ? "text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950/20"
                      : "text-muted-foreground"
                  )}
                >
                  {item.managedBy === "employee" ? (
                    <><Edit2 className="h-2.5 w-2.5" /> You</>
                  ) : (
                    <><Shield className="h-2.5 w-2.5" /> HR</>
                  )}
                </Badge>
              )}
            </div>
          ))}
        </div>

        {/* CTA for employee-fixable items */}
        {items.some((i) => !i.done && i.managedBy === "employee") && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs w-full gap-1"
            onClick={onFixEmployee}
          >
            <Edit2 className="h-3 w-3" /> Complete my profile
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sub-section: Alerts ─────────────────────────────────────────────────────

function ProfileAlertsSection({
  payrollReady,
  hasPhone,
  hasEmergencyContact,
  expiringDocs,
  onEditContact,
  setActiveTab,
}: {
  payrollReady: boolean;
  hasPhone: boolean;
  hasEmergencyContact: boolean;
  expiringDocs: any[];
  onEditContact: () => void;
  setActiveTab: (tab: string) => void;
}) {
  const alerts = computeProfileAlerts(
    {} as ProfileEmpData, // shape not needed here; we pass computed booleans
    {
      payrollReady,
      hasPhone,
      hasEmergencyContact,
      expiringDocsCount: expiringDocs.length,
    }
  );

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Action Required
      </p>
      <div className="space-y-2">
        {alerts.map((a) => {
          const Icon = a.severity === "warn" ? AlertTriangle : AlertCircle;
          const actionLabel = a.actionOpenContactEdit
            ? a.key === "phone"
              ? "Add phone"
              : "Add contact"
            : a.actionTab === "documents"
            ? "View docs"
            : undefined;

          return (
            <div
              key={a.key}
              className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-3 dark:border-amber-800 dark:bg-amber-950/20"
            >
              <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{a.title}</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">{a.desc}</p>
              </div>
              {actionLabel && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0 border-amber-300 hover:bg-amber-100 dark:border-amber-700"
                  onClick={() => {
                    if (a.actionOpenContactEdit) onEditContact();
                    else if (a.actionTab) setActiveTab(a.actionTab);
                  }}
                >
                  {actionLabel}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-section: Contact card ────────────────────────────────────────────────

interface ContactEditState {
  phone: string;
  emergencyName: string;
  emergencyPhone: string;
}

function ContactCard({
  emp,
  activeCompanyId,
  hasEmergencyContact,
  onContactUpdated,
  forceEdit,
  onForceEditCleared,
}: {
  emp: ProfileEmpData;
  activeCompanyId: number | null | undefined;
  hasEmergencyContact: boolean;
  onContactUpdated: () => void;
  forceEdit: boolean;
  onForceEditCleared: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<ContactEditState>({
    phone: "",
    emergencyName: "",
    emergencyPhone: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  // Open edit when alert CTA triggers it
  React.useEffect(() => {
    if (forceEdit) {
      openEdit();
      onForceEditCleared();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceEdit]);

  const utils = trpc.useUtils();
  const updateContact = trpc.employeePortal.updateMyContactInfo.useMutation({
    onSuccess: () => {
      toast.success("Contact information updated");
      setEditing(false);
      setValidationError(null);
      onContactUpdated();
      // Invalidate profile so the parent page reflects the update
      void utils.employeePortal.getMyProfile.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function openEdit() {
    setEditValues({
      phone: emp.phone ?? "",
      emergencyName: emp.emergencyContactName ?? "",
      emergencyPhone: emp.emergencyContactPhone ?? "",
    });
    setValidationError(null);
    setEditing(true);
  }

  function validateAndSave() {
    const trimmedPhone = editValues.phone.trim();
    const trimmedEmergPhone = editValues.emergencyPhone.trim();

    // Basic phone format guard (digits, spaces, +, -)
    const phoneRegex = /^[+\d\s\-().]{0,32}$/;
    if (trimmedPhone && !phoneRegex.test(trimmedPhone)) {
      setValidationError("Phone number contains invalid characters.");
      return;
    }
    if (trimmedEmergPhone && !phoneRegex.test(trimmedEmergPhone)) {
      setValidationError("Emergency phone contains invalid characters.");
      return;
    }
    if (editValues.emergencyName.trim().length > 100) {
      setValidationError("Emergency contact name is too long (max 100 characters).");
      return;
    }

    setValidationError(null);

    if (activeCompanyId == null) return;
    updateContact.mutate({
      companyId: activeCompanyId,
      // Normalize empty strings to undefined (no update) vs null (clear)
      phone: trimmedPhone || undefined,
      emergencyContactName: editValues.emergencyName.trim() || undefined,
      emergencyContactPhone: trimmedEmergPhone || undefined,
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="w-4 h-4 text-muted-foreground" /> Contact Information
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-[10px] font-normal text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950/30 gap-1 py-0"
            >
              <Edit2 className="h-2.5 w-2.5" /> You can edit
            </Badge>
            {!editing ? (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openEdit}>
                <Edit2 className="w-3 h-3" /> Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { setEditing(false); setValidationError(null); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  disabled={updateContact.isPending}
                  onClick={validateAndSave}
                >
                  <Save className="w-3 h-3" /> {updateContact.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Phone Number <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                value={editValues.phone}
                onChange={(e) => setEditValues((v) => ({ ...v, phone: e.target.value }))}
                placeholder="+968 XXXX XXXX"
                type="tel"
                autoComplete="tel"
                maxLength={32}
              />
            </div>

            <Separator />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Emergency Contact
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Name <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                value={editValues.emergencyName}
                onChange={(e) => setEditValues((v) => ({ ...v, emergencyName: e.target.value }))}
                placeholder="Full name"
                maxLength={100}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Phone <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                value={editValues.emergencyPhone}
                onChange={(e) => setEditValues((v) => ({ ...v, emergencyPhone: e.target.value }))}
                placeholder="+968 XXXX XXXX"
                type="tel"
                autoComplete="tel"
                maxLength={32}
              />
            </div>

            {validationError && (
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {validationError}
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              Name, email, and nationality are managed by HR and cannot be changed here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* HR-managed identity */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Identity
                </p>
                <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground gap-1 py-0 h-4 leading-none">
                  <Shield className="h-2.5 w-2.5" /> HR-managed
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Email", value: emp.email, Icon: Mail },
                  { label: "Nationality", value: emp.nationality, Icon: MapPin },
                  {
                    label: "Date of Birth",
                    value: emp.dateOfBirth ? fmtDateLong(emp.dateOfBirth) : null,
                    Icon: Calendar,
                  },
                ]
                  .filter((f) => f.value)
                  .map(({ label, value, Icon }) => (
                    <FieldRow key={label} label={label} value={value ?? undefined} Icon={Icon} />
                  ))}
                {!emp.email && !emp.nationality && !emp.dateOfBirth && (
                  <p className="text-xs text-muted-foreground col-span-2 italic">No identity fields on file.</p>
                )}
              </div>
            </div>

            {/* Employee-editable: phone */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Your Details
                </p>
                <Badge variant="outline" className="text-[10px] font-normal text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950/20 gap-1 py-0 h-4 leading-none">
                  <Edit2 className="h-2.5 w-2.5" /> Editable
                </Badge>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Phone</p>
                {emp.phone ? (
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <a href={`tel:${emp.phone}`} className="hover:underline">
                      {emp.phone}
                    </a>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Not provided — tap Edit to add
                  </p>
                )}
              </div>
            </div>

            {/* Emergency contact */}
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Emergency Contact
                </p>
                <Badge variant="outline" className="text-[10px] font-normal text-green-700 border-green-300 bg-green-50 dark:text-green-400 dark:border-green-700 dark:bg-green-950/20 gap-1 py-0 h-4 leading-none">
                  <Edit2 className="h-2.5 w-2.5" /> Editable
                </Badge>
              </div>
              {hasEmergencyContact ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {emp.emergencyContactName && (
                    <FieldRow label="Name" value={emp.emergencyContactName} />
                  )}
                  {emp.emergencyContactPhone && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-medium">
                        <a
                          href={`tel:${emp.emergencyContactPhone}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {emp.emergencyContactPhone}
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">No emergency contact on file.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs shrink-0"
                    onClick={openEdit}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Sub-section: Employment card ────────────────────────────────────────────

function EmploymentCard({
  emp,
  companyInfo,
  onRequestChange,
}: {
  emp: ProfileEmpData;
  companyInfo: { name: string } | null | undefined;
  onRequestChange: (fieldHint: string) => void;
}) {
  const rows = [
    { label: "Company", value: companyInfo?.name, Icon: Building2 },
    { label: "Department", value: emp.department, Icon: Briefcase },
    { label: "Position / Title", value: emp.position, Icon: null },
    { label: "Employment Type", value: formatEmploymentType(emp.employmentType), Icon: null },
    { label: "Hire Date", value: emp.hireDate ? fmtDateLong(emp.hireDate) : null, Icon: Calendar },
    {
      label: "Status",
      value: emp.status ? emp.status.replace(/\b\w/g, (c) => c.toUpperCase()) : null,
      Icon: null,
    },
    {
      label: "Manager",
      value: emp.managerName ?? null,
      Icon: UserCheck,
    },
  ].filter((r) => r.value);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-muted-foreground" /> Employment
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground gap-1 py-0">
            <Shield className="h-3 w-3" /> HR-managed
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {rows.map(({ label, value, Icon }) => (
              <FieldRow
                key={label}
                label={label}
                value={value ?? undefined}
                Icon={Icon ?? undefined}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            Employment details not yet available.
          </p>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3">
          <p className="text-[11px] text-muted-foreground">
            Managed by HR — contact HR to update these details.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-primary shrink-0"
            onClick={() => onRequestChange("employment details")}
          >
            <SendHorizonal className="h-3 w-3" /> Request correction
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-section: Payroll card ────────────────────────────────────────────────

function PayrollCard({
  emp,
  payrollReady,
  latestPayslip,
  setActiveTab,
  onRequestChange,
}: {
  emp: ProfileEmpData;
  payrollReady: boolean;
  latestPayslip: any | null;
  setActiveTab: (tab: string) => void;
  onRequestChange: (fieldHint: string) => void;
}) {
  return (
    <Card
      className={cn(
        payrollReady
          ? "border-green-200/70 dark:border-green-800/40"
          : "border-amber-200/70 dark:border-amber-800/40"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" /> Payroll Setup
          </CardTitle>
          <Badge
            variant="outline"
            className={cn(
              "text-xs gap-1",
              payrollReady
                ? "border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-400"
                : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
            )}
          >
            {payrollReady
              ? <><Check className="h-3 w-3" /> Ready</>
              : <><AlertTriangle className="h-3 w-3" /> Setup Needed</>}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {payrollReady ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {emp.bankName && (
              <FieldRow label="Bank" value={emp.bankName} />
            )}
            {emp.bankAccountNumber && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Account Number</p>
                <p className="text-sm font-medium font-mono">{emp.bankAccountNumber}</p>
              </div>
            )}
            {emp.bankIban && (
              <div className="space-y-0.5 sm:col-span-2">
                <p className="text-xs text-muted-foreground">IBAN</p>
                <p className="text-sm font-medium font-mono break-all">{emp.bankIban}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-amber-50/60 p-3 dark:bg-amber-950/20">
            <Wallet className="h-4 w-4 text-amber-600 shrink-0 mt-0.5 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Bank details not on file
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 leading-snug">
                Your salary cannot be processed until HR adds your bank information.
                Contact HR or your payroll coordinator to register your account.
              </p>
            </div>
          </div>
        )}

        {/* Latest payslip shortcut */}
        {latestPayslip && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">
                  Latest Payslip
                </p>
                <p className="text-sm font-medium">
                  {new Date(
                    latestPayslip.periodYear,
                    latestPayslip.periodMonth - 1,
                    1
                  ).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="text-right space-y-0.5">
                <p className="text-xs text-muted-foreground">Net Pay</p>
                <p className="text-base font-bold text-primary">
                  {latestPayslip.currency ?? "OMR"}{" "}
                  {Number(latestPayslip.netSalary).toFixed(2)}
                </p>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-border/50 gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-primary"
            onClick={() => setActiveTab("payroll")}
          >
            <DollarSign className="h-3 w-3" />
            {latestPayslip ? "All payslips" : "View payroll"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
            onClick={() => onRequestChange("bank details for payroll")}
          >
            <SendHorizonal className="h-3 w-3" /> Request update
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Sub-section: Documents & Visa card ──────────────────────────────────────

function DocumentsCard({
  emp,
  setActiveTab,
}: {
  emp: ProfileEmpData;
  setActiveTab: (tab: string) => void;
}) {
  const docFields = getProfileDocFields(emp);
  const hasExpiring = hasAnyExpiringDocField(docFields);

  if (docFields.length === 0) return null;

  return (
    <details
      className="group rounded-xl border border-border/80 bg-card shadow-sm open:shadow-md"
      open={hasExpiring}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" /> Documents &amp; Visa
          {hasExpiring && (
            <Badge className="text-[10px] bg-amber-500 hover:bg-amber-600">Attention</Badge>
          )}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
      </summary>

      <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {docFields.map(({ key, label, value, expiryDate }) => {
            const days = daysUntilExpiry(expiryDate);
            const isExpired = days !== null && days < 0;
            const isExpiring = days !== null && days >= 0 && days <= 90;

            return (
              <div key={key} className="space-y-0.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-sm font-medium",
                    isExpired
                      ? "text-red-600 dark:text-red-400"
                      : isExpiring
                      ? "text-amber-600 dark:text-amber-400"
                      : ""
                  )}
                >
                  <span className="break-all">{value}</span>
                  {isExpired && (
                    <Badge variant="destructive" className="ml-1 text-[10px]">
                      Expired
                    </Badge>
                  )}
                  {isExpiring && !isExpired && (
                    <Badge
                      className={cn(
                        "ml-1 text-[10px]",
                        days! <= 30
                          ? "bg-red-500 hover:bg-red-600"
                          : "bg-amber-500 hover:bg-amber-600"
                      )}
                    >
                      {days}d left
                    </Badge>
                  )}
                  {!isExpired && !isExpiring && expiryDate && (
                    <Badge
                      variant="outline"
                      className="ml-1 text-[10px] border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/20 dark:text-green-400"
                    >
                      <Check className="h-2.5 w-2.5 mr-0.5" /> Valid
                    </Badge>
                  )}
                </p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground">
            Managed by HR — contact HR to update or report errors.
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-primary shrink-0"
            onClick={() => setActiveTab("documents")}
          >
            <ExternalLink className="h-3 w-3" /> All documents
          </Button>
        </div>
      </div>
    </details>
  );
}

// ─── Profile change request dialog ───────────────────────────────────────────

interface ProfileChangeRequestState {
  open: boolean;
  fieldHint: string;
}

function ProfileChangeRequestDialog({
  state,
  onClose,
  activeCompanyId,
}: {
  state: ProfileChangeRequestState;
  onClose: () => void;
  activeCompanyId: number | null | undefined;
}) {
  const [fieldLabel, setFieldLabel] = useState(state.fieldHint);
  const [requestedValue, setRequestedValue] = useState("");
  const [reason, setReason] = useState("");

  // Reset form when dialog opens with a new hint
  React.useEffect(() => {
    if (state.open) {
      setFieldLabel(state.fieldHint);
      setRequestedValue("");
      setReason("");
    }
  }, [state.open, state.fieldHint]);

  const submit = trpc.employeePortal.submitProfileChangeRequest.useMutation({
    onSuccess: () => {
      toast.success("Request sent to HR", {
        description: "Your HR team will review and update the information.",
      });
      onClose();
    },
    onError: (err) => {
      toast.error("Failed to send request", { description: err.message });
    },
  });

  function handleSubmit() {
    if (!fieldLabel.trim() || !requestedValue.trim()) return;
    if (activeCompanyId == null) return;
    submit.mutate({
      companyId: activeCompanyId,
      fieldLabel: fieldLabel.trim(),
      requestedValue: requestedValue.trim(),
      reason: reason.trim() || undefined,
    });
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SendHorizonal className="h-4 w-4 text-primary" />
            Request profile correction
          </DialogTitle>
          <DialogDescription>
            HR will be notified and will update your record directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">
              What needs to change? <span className="text-red-500">*</span>
            </Label>
            <Input
              value={fieldLabel}
              onChange={(e) => setFieldLabel(e.target.value)}
              placeholder="e.g. Legal name, Department, Bank IBAN…"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Correct / requested value <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={requestedValue}
              onChange={(e) => setRequestedValue(e.target.value)}
              placeholder="Enter the correct value or details"
              rows={3}
              maxLength={500}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Any supporting context for HR…"
              rows={2}
              maxLength={500}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="gap-1"
            disabled={!fieldLabel.trim() || !requestedValue.trim() || submit.isPending || activeCompanyId == null}
            onClick={handleSubmit}
          >
            <SendHorizonal className="h-3.5 w-3.5" />
            {submit.isPending ? "Sending…" : "Send to HR"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmployeeProfileTab({
  emp,
  companyInfo,
  payroll,
  expiringDocs,
  docs,
  setActiveTab,
  activeCompanyId,
  payrollReady,
  hasPhone,
  hasEmergencyContact,
  fullName,
  arabicFullName,
  pendingLeave,
  trainingAttentionCount,
  pendingExpensesCount,
  pendingShiftRequestsCount,
}: EmployeeProfileTabProps) {
  // Track whether an alert CTA has requested contact edit to open
  const [openContactEdit, setOpenContactEdit] = useState(false);
  // Track HR change-request dialog state
  const [changeRequest, setChangeRequest] = useState<ProfileChangeRequestState>({
    open: false,
    fieldHint: "",
  });

  function openRequestChange(fieldHint: string) {
    setChangeRequest({ open: true, fieldHint });
  }

  const latestPayslip = payroll.length > 0 ? payroll[0] : null;

  const completeness = computeProfileCompleteness(emp, {
    hasDocuments: docs.length > 0,
  });

  return (
    <div className="space-y-4">
      {/* 1. Identity header */}
      <ProfileHeader
        emp={emp}
        companyInfo={companyInfo}
        fullName={fullName}
        arabicFullName={arabicFullName}
        payrollReady={payrollReady}
        expiringDocs={expiringDocs}
        setActiveTab={setActiveTab}
      />

      {/* 2. Profile completeness (only when not complete) */}
      <ProfileCompletenessCard
        completeness={completeness}
        onFixEmployee={() => setOpenContactEdit(true)}
      />

      {/* 3. Alerts / required actions */}
      <ProfileAlertsSection
        payrollReady={payrollReady}
        hasPhone={hasPhone}
        hasEmergencyContact={hasEmergencyContact}
        expiringDocs={expiringDocs}
        onEditContact={() => setOpenContactEdit(true)}
        setActiveTab={setActiveTab}
      />

      {/* 4. Contact info (editable) */}
      <ContactCard
        emp={emp}
        activeCompanyId={activeCompanyId}
        hasEmergencyContact={hasEmergencyContact}
        onContactUpdated={() => {
          /* profile query is invalidated inside ContactCard via trpc.useUtils() */
        }}
        forceEdit={openContactEdit}
        onForceEditCleared={() => setOpenContactEdit(false)}
      />

      {/* 5. Employment */}
      <EmploymentCard
        emp={emp}
        companyInfo={companyInfo}
        onRequestChange={openRequestChange}
      />

      {/* 6. Payroll */}
      <PayrollCard
        emp={emp}
        payrollReady={payrollReady}
        latestPayslip={latestPayslip}
        setActiveTab={setActiveTab}
        onRequestChange={openRequestChange}
      />

      {/* 7. Documents & visa (collapsed unless expiring) */}
      <DocumentsCard emp={emp} setActiveTab={setActiveTab} />

      {/* 8. Self-service actions */}
      <EmployeePortalMoreHub
        setActiveTab={setActiveTab}
        pendingLeave={pendingLeave}
        expiringDocsCount={expiringDocs.length}
        trainingAttentionCount={trainingAttentionCount}
        pendingExpenses={pendingExpensesCount}
        pendingShiftRequests={pendingShiftRequestsCount}
      />

      {/* HR change-request dialog (portal-level, shown above all cards) */}
      <ProfileChangeRequestDialog
        state={changeRequest}
        onClose={() => setChangeRequest((s) => ({ ...s, open: false }))}
        activeCompanyId={activeCompanyId}
      />
    </div>
  );
}
