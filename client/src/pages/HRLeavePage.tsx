import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Calendar, DollarSign, Plus, Clock, CheckCircle2,
  XCircle, AlertCircle, Users, FileText, ChevronRight,
  Umbrella, HeartPulse, Baby, AlertTriangle, Banknote,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";
import { DateInput } from "@/components/ui/date-input";

// ─── Leave type config ────────────────────────────────────────────────────────
// Labels are resolved with t() at render time — see LEAVE_TYPE_I18N in hrTerminology.ts

const LEAVE_TYPES: Record<string, { i18nKey: string; color: string; icon: React.ReactNode; days: number }> = {
  annual:    { i18nKey: "leave.annual",    color: "bg-blue-100 text-blue-700 border-blue-200",     icon: <Umbrella size={12} />,   days: 30 },
  sick:      { i18nKey: "leave.sick",      color: "bg-red-100 text-red-700 border-red-200",        icon: <HeartPulse size={12} />, days: 10 },
  maternity: { i18nKey: "leave.maternity", color: "bg-pink-100 text-pink-700 border-pink-200",     icon: <Baby size={12} />,       days: 98 },
  paternity: { i18nKey: "leave.paternity", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <Baby size={12} />,     days: 7 },
  emergency: { i18nKey: "leave.emergency", color: "bg-orange-100 text-orange-700 border-orange-200", icon: <AlertTriangle size={12} />, days: 6 },
  unpaid:    { i18nKey: "leave.unpaid",    color: "bg-gray-100 text-gray-600 border-gray-200",     icon: <Clock size={12} />,      days: 0 },
  other:     { i18nKey: "leave.other",     color: "bg-gray-100 text-gray-600 border-gray-200",     icon: <Calendar size={12} />,   days: 0 },
};

const STATUS_META: Record<string, { i18nKey: string; color: string; icon: React.ReactNode }> = {
  pending:  { i18nKey: "leave.pending",  color: "bg-amber-100 text-amber-700 border-amber-200",   icon: <Clock size={12} /> },
  approved: { i18nKey: "leave.approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={12} /> },
  rejected: { i18nKey: "leave.rejected", color: "bg-red-100 text-red-700 border-red-200",         icon: <XCircle size={12} /> },
};

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const d = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  return Math.max(0, d);
}


// ─── Leave balance bar ────────────────────────────────────────────────────────

function LeaveBalanceBar({
  type, used, total,
}: { type: string; used: number; total: number }) {
  const { t } = useTranslation("hr");
  const meta = LEAVE_TYPES[type];
  if (!meta || total === 0) return null;
  const remaining = Math.max(0, total - used);
  const pct = Math.min(100, (used / total) * 100);
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-medium text-foreground">{meta.icon} {t(meta.i18nKey)}</span>
        <span className="text-muted-foreground">{t("leave.daysLeft", { remaining, total })}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Leave request card ───────────────────────────────────────────────────────

function LeaveCard({
  req, employeeName, isAdmin, onApprove, onReject,
}: {  req: {
    id: number; employeeId: number; leaveType: string | null; status: string | null;
    startDate: Date | string | null; endDate: Date | string | null;
    days: number | null; reason: string | null;
  };
  employeeName: string;
  isAdmin: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  const { t } = useTranslation("hr");
  const status = req.status ?? "pending";
  const leaveType = req.leaveType ?? "annual";
  const typeMeta = LEAVE_TYPES[leaveType] ?? LEAVE_TYPES.other;
  const statusMeta = STATUS_META[status] ?? STATUS_META.pending;

  return (
    <Card className="hover:shadow-sm transition-all">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Status indicator */}
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
            status === "approved" ? "bg-emerald-100 text-emerald-600" :
            status === "rejected" ? "bg-red-100 text-red-600" :
            "bg-amber-100 text-amber-600"
          }`}>
            {statusMeta.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-foreground">{employeeName}</span>
                  <Badge className={`text-[10px] border flex items-center gap-1 ${typeMeta.color}`} variant="outline">
                    {typeMeta.icon} {t(typeMeta.i18nKey)}
                  </Badge>
                  <Badge className={`text-[10px] border ${statusMeta.color}`} variant="outline">
                    {t(statusMeta.i18nKey)}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {fmtDate(req.startDate)} → {fmtDate(req.endDate)}
                  </span>
                  {req.days && (
                    <span className="font-medium text-foreground">
                      {t("leave.form.daysCalculated", { count: req.days })}
                    </span>
                  )}
                </div>
                {req.reason && (
                  <p className="text-xs text-muted-foreground mt-1.5 italic bg-muted/50 px-2 py-1 rounded">
                    "{req.reason}"
                  </p>
                )}
              </div>

              {/* Admin actions */}
              {isAdmin && status === "pending" && (
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-1"
                    onClick={() => onApprove(req.id)}
                  >
                    <CheckCircle2 size={11} /> {t("leave.approveLeave")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                    onClick={() => onReject(req.id)}
                  >
                    <XCircle size={11} /> {t("leave.rejectLeave")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HRLeavePageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-3 p-4">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="flex gap-3 p-4">
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HRLeavePage() {
  const { t } = useTranslation("hr");
  const { user } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveFilter, setLeaveFilter] = useState<string>("all");
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    leaveType: "annual",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const { data: leaveRequests, isLoading: leaveLoading, refetch: refetchLeave } = trpc.hr.listLeave.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: payrollRecords, isLoading: payrollLoading } = trpc.hr.listPayroll.useQuery({ companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });
  const { data: employees, isLoading: employeesLoading } = trpc.hr.listEmployees.useQuery({ status: "active", companyId: activeCompanyId ?? undefined }, { enabled: activeCompanyId != null });

  // Build employee name lookup
  const empNames = useMemo(() => {
    const m: Record<number, string> = {};
    for (const e of employees ?? []) {
      m[e.id] = `${e.firstName} ${e.lastName}`.trim();
    }
    return m;
  }, [employees]);

  const createLeave = trpc.hr.createLeave.useMutation({
    onSuccess: () => {
      toast.success(t("leave.submitted"));
      setLeaveOpen(false);
      setLeaveForm({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
      void refetchLeave();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLeave = trpc.hr.updateLeave.useMutation({
    onSuccess: () => { toast.success(t("leave.statusUpdated")); void refetchLeave(); },
    onError: (e) => toast.error(e.message),
  });

  const isAdmin = user?.role === "admin";

  // Stats
  const totalPayroll = payrollRecords?.reduce((sum, r) => sum + Number(r.netSalary ?? 0), 0) ?? 0;
  const pendingLeave = leaveRequests?.filter((l) => l.status === "pending").length ?? 0;
  const approvedLeave = leaveRequests?.filter((l) => l.status === "approved").length ?? 0;
  const rejectedLeave = leaveRequests?.filter((l) => l.status === "rejected").length ?? 0;

  // Leave balance calculation (days used per type from approved requests)
  const usedByType = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of leaveRequests ?? []) {
      if (r.status === "approved") {
        const t = r.leaveType ?? "annual";
        m[t] = (m[t] ?? 0) + Number(r.days ?? 0);
      }
    }
    return m;
  }, [leaveRequests]);

  // Filtered leave list
  const filteredLeave = useMemo(() => {
    if (leaveFilter === "all") return leaveRequests ?? [];
    return (leaveRequests ?? []).filter((r) => r.status === leaveFilter);
  }, [leaveRequests, leaveFilter]);

  // Date validation
  const leaveDays = calcDays(leaveForm.startDate, leaveForm.endDate);
  const dateError = leaveForm.startDate && leaveForm.endDate && leaveForm.endDate < leaveForm.startDate
    ? "End date must be after start date"
    : null;

  const handleSubmitLeave = () => {
    if (!leaveForm.startDate || !leaveForm.endDate) { toast.error(t("leave.selectDates")); return; }
    if (dateError) { toast.error(dateError); return; }
    if (!leaveForm.employeeId) { toast.error(t("leave.selectEmployee")); return; }
    createLeave.mutate({
      employeeId: Number(leaveForm.employeeId),
      leaveType: leaveForm.leaveType as "annual" | "sick" | "emergency" | "maternity" | "paternity" | "unpaid" | "other",
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      days: leaveDays,
      reason: leaveForm.reason || undefined,
      companyId: activeCompanyId ?? undefined,
    });
  };

  const pageDataLoading =
    activeCompanyId != null && (employeesLoading || leaveLoading || payrollLoading);

  if (pageDataLoading) {
    return <HRLeavePageSkeleton />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shadow-sm">
              <Calendar size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight">{t("leave.title")}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("leave.pageSubline")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800">{t("leave.labourLawCompliant")}</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">{t("leave.annualLeave")}</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">{t("leave.sickLeave")}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Request Leave */}
          <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-background">
                <Plus size={14} /> {t("leave.requestLeave")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t("leave.form.title")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>{t("employee")} *</Label>
                  <Select value={leaveForm.employeeId} onValueChange={(v) => setLeaveForm({ ...leaveForm, employeeId: v })}>
                    <SelectTrigger><SelectValue placeholder={t("leave.form.selectEmployee")} /></SelectTrigger>
                    <SelectContent>
                      {(employees ?? []).map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("leave.form.leaveType")}</Label>
                  <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm({ ...leaveForm, leaveType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          <span className="flex items-center gap-2">{v.icon} {t(v.i18nKey)}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("leave.form.startDate")} *</Label>
                    <DateInput value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("leave.form.endDate")} *</Label>
                    <DateInput
                      value={leaveForm.endDate}
                      min={leaveForm.startDate || undefined}
                      onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                      className={dateError ? "border-red-400" : ""}
                    />
                  </div>
                </div>
                {dateError && <p className="text-xs text-red-500 -mt-2">{dateError}</p>}
                {leaveDays > 0 && !dateError && (
                  <div className="bg-[var(--smartpro-orange)]/8 border border-[var(--smartpro-orange)]/20 rounded-lg px-3 py-2 text-sm font-medium text-foreground">
                    {t("leave.form.duration")}: <span className="text-[var(--smartpro-orange)]">
                      {t("leave.form.daysCalculated", { count: leaveDays })}
                    </span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>{t("leave.form.reason")}</Label>
                  <Textarea
                    value={leaveForm.reason}
                    onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                    rows={2}
                    className="resize-none"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleSubmitLeave}
                  disabled={createLeave.isPending || Boolean(dateError)}
                >
                  {createLeave.isPending ? "…" : t("leave.form.submit")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {isAdmin && (
            <Button size="sm" className="gap-2" asChild>
              <Link href="/payroll">
                <DollarSign size={14} /> Payroll hub
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Clock size={16} className="text-amber-600" />, bg: "bg-amber-50 dark:bg-amber-950/40", value: pendingLeave, label: t("leave.kpis.pendingLabel") },
          { icon: <CheckCircle2 size={16} className="text-emerald-600" />, bg: "bg-emerald-50 dark:bg-emerald-950/40", value: approvedLeave, label: t("leave.kpis.approvedLabel") },
          { icon: <FileText size={16} className="text-blue-600" />, bg: "bg-blue-50 dark:bg-blue-950/40", value: payrollRecords?.length ?? 0, label: t("payroll.title") },
          { icon: <Banknote size={16} className="text-orange-600" />, bg: "bg-orange-50 dark:bg-orange-950/40", value: `OMR ${totalPayroll.toFixed(0)}`, label: t("leave.kpis.totalPayroll") },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                  {s.icon}
                </div>
                <div>
                  <p className="text-xl font-black text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Leave balance summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Umbrella size={14} className="text-blue-600" />
            {t("leave.balance")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["annual", "sick", "emergency"].map((lt) => (
              <LeaveBalanceBar key={lt} type={lt} used={usedByType[lt] ?? 0} total={LEAVE_TYPES[lt].days} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="leave">
        <TabsList>
          <TabsTrigger value="leave" className="gap-1.5">
            {t("leave.request")}
            {pendingLeave > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {pendingLeave}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="payroll">{t("payroll.title")}</TabsTrigger>
        </TabsList>

        <TabsContent value="leave" className="mt-4 space-y-4">
          {/* Quick filter chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: `${t("common:labels.all", { ns: "common" })} (${leaveRequests?.length ?? 0})` },
              { key: "pending", label: `${t("leave.pending")} (${pendingLeave})` },
              { key: "approved", label: `${t("leave.approved")} (${approvedLeave})` },
              { key: "rejected", label: `${t("leave.rejected")} (${rejectedLeave})` },
            ].map((f) => (
              <Button
                key={f.key}
                variant={leaveFilter === f.key ? "default" : "outline"}
                size="sm"
                className={`text-xs h-7 ${leaveFilter === f.key ? "" : "bg-background"}`}
                onClick={() => setLeaveFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {leaveLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex gap-3">
                    <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredLeave.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <Calendar size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">{t("common:states.noResults", { ns: "common" })}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredLeave.map((req) => (
                <LeaveCard
                  key={req.id}
                  req={{
                    id: req.id,
                    employeeId: req.employeeId,
                    leaveType: req.leaveType,
                    status: req.status,
                    startDate: req.startDate,
                    endDate: req.endDate,
                    days: req.days != null ? Number(req.days) : null,
                    reason: req.reason,
                  }}
                  employeeName={empNames[req.employeeId] ?? `Employee #${req.employeeId}`}
                  isAdmin={isAdmin}
                  onApprove={(id) => updateLeave.mutate({ id, status: "approved" })}
                  onReject={(id) => updateLeave.mutate({ id, status: "rejected" })}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payroll" className="mt-4">
          {payrollLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
            </div>
          ) : !payrollRecords || payrollRecords.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <DollarSign size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">{t("payroll.noRecords")}</p>
                <Button size="sm" className="mt-3 gap-1" asChild>
                  <Link href="/payroll">
                    <Plus size={13} /> Open payroll hub
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payroll.tableEmployee")}</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payroll.tablePeriod")}</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payroll.tableBasic")}</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payroll.tableAllowances")}</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payroll.tableDeductions")}</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payroll.tableNetSalary")}</th>
                    <th scope="col" className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("payroll.tableStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollRecords.map((rec) => (
                    <tr key={rec.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors last:border-0">
                      <td className="py-3 px-4 font-medium text-foreground">
                        {empNames[rec.employeeId] ?? t("payroll.employeeFallback", { id: rec.employeeId })}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(2024, (rec.periodMonth ?? 1) - 1).toLocaleString("default", { month: "short" })} {rec.periodYear}
                      </td>
                      <td className="py-3 px-4 text-right text-foreground">OMR {Number(rec.basicSalary ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right text-emerald-600">+{Number(rec.allowances ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right text-red-600">−{Number(rec.deductions ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right font-bold text-foreground">OMR {Number(rec.netSalary ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={`text-[10px] ${
                          rec.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" :
                          rec.status === "approved" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" :
                          "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        }`} variant="outline">
                          {rec.status === "paid" ? t("payroll.statusPaid") : rec.status === "approved" ? t("payroll.statusApproved") : t("payroll.statusPending")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
