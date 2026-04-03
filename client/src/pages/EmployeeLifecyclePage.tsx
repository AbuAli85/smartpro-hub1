import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, User, FileText, DollarSign, Calendar, Building2,
  Phone, Mail, Globe, CreditCard, Briefcase, AlertTriangle,
  CheckCircle2, Clock, Edit2, UserX, TrendingUp, Shield,
  Hash, MapPin,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtOMR(n: number | string | null | undefined) {
  return `OMR ${Number(n ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}
function statusBadge(status: string) {
  const s = status?.toLowerCase();
  if (s === "active") return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
  if (s === "on_leave") return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
  if (s === "terminated") return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
  if (s === "resigned") return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700";
  return "bg-muted text-muted-foreground border-border";
}
function leaveStatusBadge(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (status === "pending") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  if (status === "rejected") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return "bg-muted text-muted-foreground";
}
function payrollStatusBadge(status: string) {
  if (status === "paid") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (status === "approved") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
}
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function InfoRow({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: React.ElementType }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-muted/50 last:border-0 gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
        {Icon && <Icon size={13} />}
        {label}
      </div>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

// ─── Status Timeline ──────────────────────────────────────────────────────────
function StatusTimeline({ status, hireDate, terminationDate }: {
  status: string; hireDate?: Date | string | null; terminationDate?: Date | string | null;
}) {
  const steps = [
    { key: "hired", label: "Hired", date: hireDate, icon: CheckCircle2, color: "text-emerald-500" },
    { key: "active", label: "Active", date: null, icon: Briefcase, color: "text-blue-500" },
    { key: "on_leave", label: "On Leave", date: null, icon: Clock, color: "text-amber-500" },
    { key: "exit", label: "Exited", date: terminationDate, icon: UserX, color: "text-red-500" },
  ];
  const currentIdx =
    status === "active" ? 1 :
    status === "on_leave" ? 2 :
    (status === "terminated" || status === "resigned") ? 3 : 1;

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        const isFuture = i > currentIdx;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className={`flex flex-col items-center gap-1 ${isFuture ? "opacity-30" : ""}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                isActive ? "border-primary bg-primary/10" :
                isPast ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" :
                "border-muted bg-muted/50"
              }`}>
                <Icon size={14} className={isActive ? "text-primary" : isPast ? "text-emerald-500" : "text-muted-foreground"} />
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-primary" : isPast ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {step.label}
              </span>
              {step.date && <span className="text-xs text-muted-foreground">{fmtDate(step.date)}</span>}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${i < currentIdx ? "bg-emerald-400" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Edit Dialog ──────────────────────────────────────────────────────────────
function EditDialog({ employee, onClose }: { employee: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    position: employee.position ?? "",
    department: employee.department ?? "",
    status: employee.status ?? "active",
    salary: employee.salary ? String(employee.salary) : "",
    nationality: employee.nationality ?? "",
    passportNumber: employee.passportNumber ?? "",
    nationalId: employee.nationalId ?? "",
    hireDate: employee.hireDate ? new Date(employee.hireDate).toISOString().split("T")[0] : "",
    employeeNumber: employee.employeeNumber ?? "",
    workPermitNumber: employee.permit?.workPermitNumber ?? "",
    visaNumber: employee.permit?.labourAuthorisationNumber ?? "",
    occupationName: employee.permit?.occupationTitleEn ?? "",
    workPermitExpiry: employee.permit?.expiryDate ? new Date(employee.permit.expiryDate).toISOString().split("T")[0] : "",
  });
  const update = trpc.team.updateMember.useMutation({
    onSuccess: () => {
      utils.hr.getEmployeeWithPermit.invalidate({ id: employee.id });
      utils.team.listMembers.invalidate();
      toast.success("Employee record updated");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee Record</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          {[
            { key: "firstName", label: "First Name" },
            { key: "lastName", label: "Last Name" },
            { key: "email", label: "Email", colSpan: 2 },
            { key: "phone", label: "Phone" },
            { key: "position", label: "Position" },
            { key: "department", label: "Department" },
            { key: "nationality", label: "Nationality" },
            { key: "passportNumber", label: "Passport No." },
            { key: "nationalId", label: "Civil ID" },
            { key: "salary", label: "Salary (OMR)" },
            { key: "hireDate", label: "Hire Date", type: "date" },
            { key: "employeeNumber", label: "Employee No." },
            { key: "workPermitNumber", label: "Work Permit No.", colSpan: 2 },
            { key: "visaNumber", label: "Visa / Labour Auth. No.", colSpan: 2 },
            { key: "occupationName", label: "Occupation" },
            { key: "workPermitExpiry", label: "Work Permit Expiry", type: "date" },
          ].map(({ key, label, colSpan, type }) => (
            <div key={key} className={colSpan === 2 ? "col-span-2" : ""}>
              <Label className="text-xs">{label}</Label>
              <Input
                type={(type as string) || "text"}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="h-8 text-sm mt-1"
              />
            </div>
          ))}
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="terminated">Terminated</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => update.mutate({
              id: employee.id,
              ...form,
              salary: form.salary ? Number(form.salary) : undefined,
              status: form.status as any,
            })}
            disabled={update.isPending}
          >
            {update.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmployeeLifecyclePage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const employeeId = parseInt(params.id || "0");
  const [editOpen, setEditOpen] = useState(false);

  const { data: employee, isLoading } = trpc.hr.getEmployeeWithPermit.useQuery(
    { id: employeeId },
    { enabled: employeeId > 0 }
  );
  const [attendanceYear] = useState(() => new Date().getFullYear());
  const [attendanceMonth] = useState(() => new Date().getMonth() + 1);
  const attendanceMonthStr = `${attendanceYear}-${String(attendanceMonth).padStart(2, "0")}`;

  const { data: leaveData } = trpc.hr.listLeave.useQuery(
    { employeeId },
    { enabled: employeeId > 0 }
  );
  const { data: payrollData } = trpc.hr.listPayroll.useQuery(
    { year: new Date().getFullYear() },
    { enabled: employeeId > 0 }
  );
  const { data: attendanceData } = trpc.hr.listAttendance.useQuery(
    { month: attendanceMonthStr },
    { enabled: employeeId > 0 }
  );

  // Filter payroll records for this employee
  const empPayroll = payrollData?.filter((p: any) => p.employeeId === employeeId) ?? [];
  const empAttendance = (attendanceData ?? []).filter((a: any) => a.employeeId === employeeId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card px-6 py-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Employee not found or access denied.</p>
          <Button variant="outline" onClick={() => navigate("/my-team")}>
            Back to My Team
          </Button>
        </div>
      </div>
    );
  }

  const fullName = `${employee.firstName} ${employee.lastName}`;
  const initials = `${employee.firstName[0]}${employee.lastName[0]}`.toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {editOpen && <EditDialog employee={employee} onClose={() => setEditOpen(false)} />}

      {/* ── Header ── */}
      <div className="border-b bg-card px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate("/my-team")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft size={14} /> Back to My Team
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-primary">{initials}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">{fullName}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-sm text-muted-foreground">{employee.position ?? "—"}</span>
                  {employee.department && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-sm text-muted-foreground">{employee.department}</span>
                    </>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-xs px-2 py-0 h-5 ${statusBadge(employee.status)}`}
                  >
                    {employee.status.replace("_", " ")}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {employee.email && (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={`mailto:${employee.email}`}><Mail size={13} /> Email</a>
                </Button>
              )}
              {employee.phone && (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={`tel:${employee.phone}`}><Phone size={13} /> Call</a>
                </Button>
              )}
              <Button size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Edit2 size={13} /> Edit
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* ── Status Timeline ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp size={15} className="text-primary" />
              Employment Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StatusTimeline
              status={employee.status}
              hireDate={employee.hireDate}
              terminationDate={employee.terminationDate}
            />
          </CardContent>
        </Card>

        {/* ── KPI Summary ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-border bg-card text-center">
            <div className="text-lg font-bold text-foreground">{fmtOMR(employee.salary)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Monthly Salary</div>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card text-center">
            <div className="text-lg font-bold text-foreground">{leaveData?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Leave Requests</div>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card text-center">
            <div className="text-lg font-bold text-foreground">{empPayroll.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Payroll Records</div>
          </div>
          <div className="p-3 rounded-xl border border-border bg-card text-center">
            <div className="text-lg font-bold text-foreground">
              {employee.hireDate
                ? Math.floor((Date.now() - new Date(employee.hireDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
                : "—"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Months Employed</div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <Tabs defaultValue="profile">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="profile" className="gap-1.5"><User size={13} /> Profile</TabsTrigger>
            <TabsTrigger value="leave" className="gap-1.5"><Calendar size={13} /> Leave</TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5"><DollarSign size={13} /> Payroll</TabsTrigger>
            <TabsTrigger value="attendance" className="gap-1.5"><Clock size={13} /> Attendance</TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5"><FileText size={13} /> Documents</TabsTrigger>
          </TabsList>

          {/* ── Profile Tab ── */}
          <TabsContent value="profile" className="mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <User size={14} className="text-muted-foreground" /> Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <InfoRow label="Full Name" value={fullName} />
                  {(employee as any).firstNameAr && (
                    <InfoRow label="الاسم (AR)" value={`${(employee as any).firstNameAr} ${(employee as any).lastNameAr ?? ""}`} />
                  )}
                  <InfoRow label="Email" value={employee.email} icon={Mail} />
                  <InfoRow label="Phone" value={employee.phone} icon={Phone} />
                  <InfoRow label="Nationality" value={employee.nationality} icon={Globe} />
                  <InfoRow label="Gender" value={(employee as any).gender} />
                  <InfoRow label="Date of Birth" value={(employee as any).dateOfBirth ? fmtDate((employee as any).dateOfBirth) : null} icon={Calendar} />
                  <InfoRow label="Marital Status" value={(employee as any).maritalStatus} />
                  <InfoRow label="Passport No." value={employee.passportNumber} icon={CreditCard} />
                  <InfoRow label="Civil ID" value={employee.nationalId} icon={Hash} />
                  {!employee.email && !employee.phone && !employee.nationality && (
                    <p className="text-xs text-muted-foreground py-2">No personal details added yet.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Briefcase size={14} className="text-muted-foreground" /> Employment Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <InfoRow label="Employee No." value={employee.employeeNumber} icon={Hash} />
                  <InfoRow label="Position" value={employee.position} icon={Briefcase} />
                  <InfoRow label="Department" value={employee.department} icon={Building2} />
                  <InfoRow label="Employment Type" value={employee.employmentType?.replace("_", " ")} />
                  <InfoRow label="Hire Date" value={fmtDate(employee.hireDate)} icon={Calendar} />
                  <InfoRow label="Status" value={employee.status.replace("_", " ")} />
                  {employee.terminationDate && (
                    <InfoRow label="Exit Date" value={fmtDate(employee.terminationDate)} />
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign size={14} className="text-muted-foreground" /> Compensation
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <InfoRow label="Basic Salary" value={fmtOMR(employee.salary)} />
                  <InfoRow label="Currency" value={employee.currency ?? "OMR"} />
                  {!employee.salary && (
                    <p className="text-xs text-muted-foreground py-2">No salary information recorded.</p>
                  )}
                </CardContent>
              </Card>
              {employee.permit && (
                <Card className="sm:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Shield size={14} className="text-muted-foreground" /> Work Permit &amp; Visa Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6">
                      <InfoRow label="Work Permit No." value={employee.permit.workPermitNumber} icon={Hash} />
                      <InfoRow label="Labour Auth. No." value={employee.permit.labourAuthorisationNumber} icon={FileText} />
                      <InfoRow label="Occupation Code" value={employee.permit.occupationCode} icon={Briefcase} />
                      <InfoRow label="Occupation" value={employee.permit.occupationTitleEn} icon={Briefcase} />
                      <InfoRow label="Issue Date" value={fmtDate(employee.permit.issueDate)} icon={Calendar} />
                      <InfoRow label="Expiry Date" value={fmtDate(employee.permit.expiryDate)} icon={Calendar} />
                      <InfoRow label="Status" value={employee.permit.permitStatus} />
                    </div>
                  </CardContent>
                </Card>
              )}
              {/* PASI / Bank / Emergency */}
              {((employee as any).pasiNumber || (employee as any).bankName || (employee as any).emergencyContactName) && (
                <Card className="sm:col-span-2">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Hash size={14} className="text-muted-foreground" /> PASI, Bank &amp; Emergency Contact
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6">
                      <InfoRow label="PASI Number" value={(employee as any).pasiNumber} icon={Hash} />
                      <InfoRow label="Bank Name" value={(employee as any).bankName} icon={Building2} />
                      <InfoRow label="Bank Account" value={(employee as any).bankAccountNumber} icon={Hash} />
                      <InfoRow label="Emergency Contact" value={(employee as any).emergencyContactName} icon={User} />
                      <InfoRow label="Emergency Phone" value={(employee as any).emergencyContactPhone} icon={Phone} />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Leave Tab ── */}
          <TabsContent value="leave" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Leave History</CardTitle>
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                    onClick={() => navigate("/hr/leave")}>
                    Manage Leave
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {(leaveData?.length ?? 0) === 0 ? (
                  <div className="text-center py-8">
                    <Calendar size={24} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No leave requests on record</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {leaveData?.map((leave: any) => (
                      <div key={leave.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${
                            leave.status === "approved" ? "bg-emerald-500" :
                            leave.status === "pending" ? "bg-amber-500" : "bg-red-500"
                          }`} />
                          <div>
                            <p className="text-sm font-medium text-foreground capitalize">
                              {leave.leaveType.replace("_", " ")} Leave
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {fmtDate(leave.startDate)} → {fmtDate(leave.endDate)}
                              {leave.days && ` · ${leave.days} days`}
                            </p>
                          </div>
                        </div>
                        <Badge className={`text-xs px-2 py-0 h-5 ${leaveStatusBadge(leave.status)}`}>
                          {leave.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payroll Tab ── */}
          <TabsContent value="payroll" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Payroll Records</CardTitle>
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                    onClick={() => navigate("/payroll")}>
                    Payroll Engine
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {empPayroll.length === 0 ? (
                  <div className="text-center py-8">
                    <DollarSign size={24} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No payroll records for this year</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 text-xs font-medium text-muted-foreground">Period</th>
                          <th className="text-right py-2 text-xs font-medium text-muted-foreground">Basic</th>
                          <th className="text-right py-2 text-xs font-medium text-muted-foreground">Deductions</th>
                          <th className="text-right py-2 text-xs font-medium text-muted-foreground">Net Pay</th>
                          <th className="text-right py-2 text-xs font-medium text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {empPayroll.map((p: any) => (
                          <tr key={p.id} className="border-b border-muted/50 last:border-0">
                            <td className="py-2.5 text-foreground font-medium">
                              {MONTH_NAMES[(p.periodMonth ?? 1) - 1]} {p.periodYear}
                            </td>
                            <td className="py-2.5 text-right text-foreground">{fmtOMR(p.basicSalary)}</td>
                            <td className="py-2.5 text-right text-red-600 dark:text-red-400">-{fmtOMR(p.deductions)}</td>
                            <td className="py-2.5 text-right font-semibold text-foreground">{fmtOMR(p.netSalary)}</td>
                            <td className="py-2.5 text-right">
                              <Badge className={`text-xs px-2 py-0 h-5 ${payrollStatusBadge(p.status)}`}>
                                {p.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Attendance Tab ── */}
          <TabsContent value="attendance" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Attendance — {MONTH_NAMES[attendanceMonth - 1]} {attendanceYear}</CardTitle>
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                    onClick={() => navigate("/hr/attendance")}>
                    Full Attendance
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {empAttendance.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock size={24} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No attendance records this month</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => navigate("/hr/attendance")}>
                      Record Attendance
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Summary row */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {[
                        { label: "Present", count: empAttendance.filter((a: any) => a.status === "present").length, color: "text-emerald-600" },
                        { label: "Absent", count: empAttendance.filter((a: any) => a.status === "absent").length, color: "text-red-600" },
                        { label: "Late", count: empAttendance.filter((a: any) => a.status === "late").length, color: "text-amber-600" },
                        { label: "Remote", count: empAttendance.filter((a: any) => a.status === "remote").length, color: "text-blue-600" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="text-center p-3 rounded-lg border border-border bg-muted/30">
                          <div className={`text-xl font-bold ${color}`}>{count}</div>
                          <div className="text-xs text-muted-foreground">{label}</div>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 text-xs font-medium text-muted-foreground">Date</th>
                            <th className="text-left py-2 text-xs font-medium text-muted-foreground">Status</th>
                            <th className="text-left py-2 text-xs font-medium text-muted-foreground">Clock In</th>
                            <th className="text-left py-2 text-xs font-medium text-muted-foreground">Clock Out</th>
                            <th className="text-left py-2 text-xs font-medium text-muted-foreground">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {empAttendance.map((a: any) => (
                            <tr key={a.id} className="border-b border-muted/50 last:border-0">
                              <td className="py-2.5 text-foreground">{fmtDate(a.date)}</td>
                              <td className="py-2.5">
                                <Badge className={`text-xs px-2 py-0 h-5 ${
                                  a.status === "present" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                  a.status === "absent" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                  a.status === "late" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                }`}>{a.status}</Badge>
                              </td>
                              <td className="py-2.5 text-muted-foreground">{a.clockIn ?? "—"}</td>
                              <td className="py-2.5 text-muted-foreground">{a.clockOut ?? "—"}</td>
                              <td className="py-2.5 text-muted-foreground">{a.hoursWorked ? `${Number(a.hoursWorked).toFixed(1)}h` : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Documents Tab ── */}
          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Employee Documents</CardTitle>
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1"
                    onClick={() => navigate(`/employee/${employeeId}/documents`)}>
                    Document Vault
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Document summary from employee fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {[
                    { label: "Passport", value: employee.passportNumber, icon: CreditCard, note: "Passport number on file" },
                    { label: "Civil ID", value: employee.nationalId, icon: Shield, note: "National ID on file" },
                  ].map(({ label, value, icon: Icon, note }) => (
                    <div key={label} className={`flex items-center gap-3 p-3 rounded-lg border ${
                      value ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20" : "border-border bg-muted/30"
                    }`}>
                      <div className={`p-2 rounded-md ${value ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
                        <Icon size={14} className={value ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{value ? note : "Not recorded"}</p>
                      </div>
                      {value && <CheckCircle2 size={14} className="text-emerald-500 ml-auto" />}
                    </div>
                  ))}
                </div>
                <div className="text-center py-4 border border-dashed border-border rounded-lg">
                  <FileText size={20} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Upload work permit, passport, visa, ID card and more</p>
                  <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => navigate(`/employee/${employeeId}/documents`)}>
                    <FileText size={12} /> Open Document Vault
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
