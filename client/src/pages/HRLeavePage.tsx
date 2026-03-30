import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

// ─── Leave type config ────────────────────────────────────────────────────────

const LEAVE_TYPES: Record<string, { label: string; color: string; icon: React.ReactNode; days: number }> = {
  annual:    { label: "Annual",    color: "bg-blue-100 text-blue-700 border-blue-200",     icon: <Umbrella size={12} />,   days: 30 },
  sick:      { label: "Sick",      color: "bg-red-100 text-red-700 border-red-200",        icon: <HeartPulse size={12} />, days: 10 },
  maternity: { label: "Maternity", color: "bg-pink-100 text-pink-700 border-pink-200",     icon: <Baby size={12} />,       days: 98 },
  paternity: { label: "Paternity", color: "bg-purple-100 text-purple-700 border-purple-200", icon: <Baby size={12} />,     days: 7 },
  emergency: { label: "Emergency", color: "bg-orange-100 text-orange-700 border-orange-200", icon: <AlertTriangle size={12} />, days: 6 },
  unpaid:    { label: "Unpaid",    color: "bg-gray-100 text-gray-600 border-gray-200",     icon: <Clock size={12} />,      days: 0 },
  other:     { label: "Other",     color: "bg-gray-100 text-gray-600 border-gray-200",     icon: <Calendar size={12} />,   days: 0 },
};

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "Pending",  color: "bg-amber-100 text-amber-700 border-amber-200",   icon: <Clock size={12} /> },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <CheckCircle2 size={12} /> },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200",         icon: <XCircle size={12} /> },
};

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const d = Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1;
  return Math.max(0, d);
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-OM", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Leave balance bar ────────────────────────────────────────────────────────

function LeaveBalanceBar({
  type, used, total,
}: { type: string; used: number; total: number }) {
  const meta = LEAVE_TYPES[type];
  if (!meta || total === 0) return null;
  const remaining = Math.max(0, total - used);
  const pct = Math.min(100, (used / total) * 100);
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-medium text-foreground">{meta.icon} {meta.label}</span>
        <span className="text-muted-foreground">{remaining} / {total} days left</span>
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
}: {
  req: {
    id: number; employeeId: number; leaveType: string | null; status: string | null;
    startDate: Date | string | null; endDate: Date | string | null;
    days: number | null; reason: string | null;
  };
  employeeName: string;
  isAdmin: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
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
                    {typeMeta.icon} {typeMeta.label}
                  </Badge>
                  <Badge className={`text-[10px] border ${statusMeta.color}`} variant="outline">
                    {statusMeta.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {fmtDate(req.startDate)} → {fmtDate(req.endDate)}
                  </span>
                  {req.days && (
                    <span className="font-medium text-foreground">{req.days} day{req.days !== 1 ? "s" : ""}</span>
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
                    <CheckCircle2 size={11} /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1"
                    onClick={() => onReject(req.id)}
                  >
                    <XCircle size={11} /> Reject
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HRLeavePage() {
  const { user } = useAuth();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [leaveFilter, setLeaveFilter] = useState<string>("all");
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    leaveType: "annual",
    startDate: "",
    endDate: "",
    reason: "",
  });
  const [payrollForm, setPayrollForm] = useState({
    employeeId: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    basicSalary: "",
    allowances: "",
    deductions: "",
  });

  const { data: leaveRequests, isLoading: leaveLoading, refetch: refetchLeave } = trpc.hr.listLeave.useQuery({});
  const { data: payrollRecords, isLoading: payrollLoading, refetch: refetchPayroll } = trpc.hr.listPayroll.useQuery({});
  const { data: employees } = trpc.hr.listEmployees.useQuery({});

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
      toast.success("Leave request submitted successfully");
      setLeaveOpen(false);
      setLeaveForm({ employeeId: "", leaveType: "annual", startDate: "", endDate: "", reason: "" });
      void refetchLeave();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateLeave = trpc.hr.updateLeave.useMutation({
    onSuccess: () => { toast.success("Leave status updated"); void refetchLeave(); },
    onError: (e) => toast.error(e.message),
  });

  const createPayroll = trpc.hr.createPayroll.useMutation({
    onSuccess: () => {
      toast.success("Payroll record created");
      setPayrollOpen(false);
      void refetchPayroll();
    },
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
    if (!leaveForm.startDate || !leaveForm.endDate) { toast.error("Please select start and end dates"); return; }
    if (dateError) { toast.error(dateError); return; }
    if (!leaveForm.employeeId) { toast.error("Please select an employee"); return; }
    createLeave.mutate({
      employeeId: Number(leaveForm.employeeId),
      leaveType: leaveForm.leaveType as "annual" | "sick" | "emergency" | "maternity" | "paternity" | "unpaid" | "other",
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      days: leaveDays,
      reason: leaveForm.reason || undefined,
    });
  };

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
              <h1 className="text-2xl font-black text-foreground tracking-tight">Leave Management</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Annual leave, sick leave, Oman public holidays, and payroll records per MHRSD guidelines
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800">MHRSD Compliant</span>
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800">Annual Leave</span>
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-0.5 text-[10px] font-semibold dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">Sick Leave</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Request Leave */}
          <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-background">
                <Plus size={14} /> Request Leave
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New Leave Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <Label>Employee *</Label>
                  <Select value={leaveForm.employeeId} onValueChange={(v) => setLeaveForm({ ...leaveForm, employeeId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {(employees ?? []).map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Leave Type</Label>
                  <Select value={leaveForm.leaveType} onValueChange={(v) => setLeaveForm({ ...leaveForm, leaveType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LEAVE_TYPES).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          <span className="flex items-center gap-2">{v.icon} {v.label} {v.days > 0 ? `(${v.days} days/yr)` : ""}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Start Date *</Label>
                    <Input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date *</Label>
                    <Input
                      type="date"
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
                    Duration: <span className="text-[var(--smartpro-orange)]">{leaveDays} day{leaveDays !== 1 ? "s" : ""}</span>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Reason (optional)</Label>
                  <Textarea
                    placeholder="Brief reason for leave..."
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
                  {createLeave.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Payroll (admin only) */}
          {isAdmin && (
            <Dialog open={payrollOpen} onOpenChange={setPayrollOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <DollarSign size={14} /> Add Payroll
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Create Payroll Record</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-1.5">
                    <Label>Employee *</Label>
                    <Select value={payrollForm.employeeId} onValueChange={(v) => setPayrollForm({ ...payrollForm, employeeId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {(employees ?? []).map((e) => (
                          <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Month</Label>
                      <Select value={String(payrollForm.month)} onValueChange={(v) => setPayrollForm({ ...payrollForm, month: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 12 }, (_, i) => (
                            <SelectItem key={i + 1} value={String(i + 1)}>
                              {new Date(2024, i).toLocaleString("default", { month: "long" })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Year</Label>
                      <Input type="number" value={payrollForm.year} onChange={(e) => setPayrollForm({ ...payrollForm, year: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label>Basic (OMR) *</Label>
                      <Input type="number" placeholder="0.000" step="0.001" value={payrollForm.basicSalary} onChange={(e) => setPayrollForm({ ...payrollForm, basicSalary: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Allowances</Label>
                      <Input type="number" placeholder="0.000" step="0.001" value={payrollForm.allowances} onChange={(e) => setPayrollForm({ ...payrollForm, allowances: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Deductions</Label>
                      <Input type="number" placeholder="0.000" step="0.001" value={payrollForm.deductions} onChange={(e) => setPayrollForm({ ...payrollForm, deductions: e.target.value })} />
                    </div>
                  </div>
                  {payrollForm.basicSalary && (
                    <div className="bg-muted rounded-xl p-3 text-sm space-y-1.5">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Basic Salary</span>
                        <span>OMR {Number(payrollForm.basicSalary).toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600">
                        <span>+ Allowances</span>
                        <span>OMR {Number(payrollForm.allowances || 0).toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>− Deductions</span>
                        <span>OMR {Number(payrollForm.deductions || 0).toFixed(3)}</span>
                      </div>
                      <div className="flex justify-between font-bold border-t border-border pt-1.5 text-foreground">
                        <span>Net Salary</span>
                        <span className="text-emerald-600">
                          OMR {(Number(payrollForm.basicSalary) + Number(payrollForm.allowances || 0) - Number(payrollForm.deductions || 0)).toFixed(3)}
                        </span>
                      </div>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (!payrollForm.employeeId || !payrollForm.basicSalary) { toast.error("Please fill required fields"); return; }
                      createPayroll.mutate({
                        employeeId: Number(payrollForm.employeeId),
                        periodMonth: payrollForm.month,
                        periodYear: payrollForm.year,
                        basicSalary: Number(payrollForm.basicSalary),
                        allowances: Number(payrollForm.allowances || 0),
                        deductions: Number(payrollForm.deductions || 0),
                        taxAmount: 0,
                      });
                    }}
                    disabled={createPayroll.isPending}
                  >
                    {createPayroll.isPending ? "Creating..." : "Create Payroll Record"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Clock size={16} className="text-amber-600" />, bg: "bg-amber-50 dark:bg-amber-950/40", value: pendingLeave, label: "Pending Leave" },
          { icon: <CheckCircle2 size={16} className="text-emerald-600" />, bg: "bg-emerald-50 dark:bg-emerald-950/40", value: approvedLeave, label: "Approved Leave" },
          { icon: <FileText size={16} className="text-blue-600" />, bg: "bg-blue-50 dark:bg-blue-950/40", value: payrollRecords?.length ?? 0, label: "Payroll Records" },
          { icon: <Banknote size={16} className="text-orange-600" />, bg: "bg-orange-50 dark:bg-orange-950/40", value: `OMR ${totalPayroll.toFixed(0)}`, label: "Total Payroll" },
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
            Leave Balance Summary
            <span className="text-xs font-normal text-muted-foreground ml-1">(based on approved requests this year)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {["annual", "sick", "emergency"].map((t) => (
              <LeaveBalanceBar key={t} type={t} used={usedByType[t] ?? 0} total={LEAVE_TYPES[t].days} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="leave">
        <TabsList>
          <TabsTrigger value="leave" className="gap-1.5">
            Leave Requests
            {pendingLeave > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {pendingLeave}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="payroll">Payroll Records</TabsTrigger>
        </TabsList>

        <TabsContent value="leave" className="mt-4 space-y-4">
          {/* Quick filter chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: `All (${leaveRequests?.length ?? 0})` },
              { key: "pending", label: `Pending (${pendingLeave})` },
              { key: "approved", label: `Approved (${approvedLeave})` },
              { key: "rejected", label: `Rejected (${rejectedLeave})` },
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
                <p className="text-sm font-medium text-muted-foreground">No leave requests found</p>
                <p className="text-xs text-muted-foreground mt-1">Use the "Request Leave" button to submit a new request.</p>
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
                <p className="text-sm font-medium text-muted-foreground">No payroll records yet</p>
                {isAdmin && (
                  <Button size="sm" className="mt-3 gap-1" onClick={() => setPayrollOpen(true)}>
                    <Plus size={13} /> Create First Payroll Record
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Allowances</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deductions</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Net Salary</th>
                    <th scope="col" className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollRecords.map((rec) => (
                    <tr key={rec.id} className="border-b border-border/60 hover:bg-muted/30 transition-colors last:border-0">
                      <td className="py-3 px-4 font-medium text-foreground">
                        {empNames[rec.employeeId] ?? `Employee #${rec.employeeId}`}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(2024, (rec.periodMonth ?? 1) - 1).toLocaleString("default", { month: "short" })} {rec.periodYear}
                      </td>
                      <td className="py-3 px-4 text-right text-foreground">OMR {Number(rec.basicSalary ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right text-emerald-600">+{Number(rec.allowances ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right text-red-600">−{Number(rec.deductions ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-right font-bold text-foreground">OMR {Number(rec.netSalary ?? 0).toFixed(3)}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={`text-[10px] capitalize ${
                          rec.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" :
                          rec.status === "approved" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" :
                          "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        }`} variant="outline">
                          {rec.status}
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
