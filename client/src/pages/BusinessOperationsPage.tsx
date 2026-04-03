import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Calendar, DollarSign, Bell, Shield, CheckCircle2, XCircle,
  Clock, AlertTriangle, Play, ChevronRight, RefreshCw, Activity,
  Users, FileText, TrendingUp,
} from "lucide-react";
import { fmtDate, fmtDateLong, fmtDateTime, fmtDateTimeShort, fmtTime } from "@/lib/dateUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtOMR(n: number | string | null | undefined) {
  return `OMR ${Number(n ?? 0).toLocaleString("en-OM", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── Leave Approval Panel ─────────────────────────────────────────────────────
function LeaveApprovalPanel() {
  const utils = trpc.useUtils();
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data: leaveData, isLoading } = trpc.hr.listLeave.useQuery({});
  const { data: employees } = trpc.team.listMembers.useQuery({});

  const approve = trpc.hr.updateLeave.useMutation({
    onSuccess: () => { utils.hr.listLeave.invalidate(); utils.operations.getTodaysTasks.invalidate(); toast.success("Leave approved"); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.hr.updateLeave.useMutation({
    onSuccess: () => { utils.hr.listLeave.invalidate(); utils.operations.getTodaysTasks.invalidate(); setRejectId(null); setRejectNote(""); toast.success("Leave rejected"); },
    onError: (e) => toast.error(e.message),
  });

  const empMap = Object.fromEntries((employees ?? []).map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const pending = leaveData?.filter((l: any) => l.status === "pending") ?? [];

  return (
    <>
      {rejectId !== null && (
        <Dialog open onOpenChange={() => setRejectId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject Leave Request</DialogTitle></DialogHeader>
            <div className="py-2">
              <Label className="text-sm">Reason (optional)</Label>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Explain why this leave is being rejected…"
                className="mt-1.5 text-sm"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => reject.mutate({ id: rejectId, status: "rejected", notes: rejectNote })} disabled={reject.isPending}>
                {reject.isPending ? "Rejecting…" : "Reject Leave"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : pending.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No pending leave requests</p>
          <p className="text-xs text-muted-foreground mt-1">All leave requests have been reviewed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((leave: any) => {
            const empName = empMap[leave.employeeId] ?? `Employee #${leave.employeeId}`;
            const days = leave.days ?? Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
            return (
              <div key={leave.id} className="flex items-start justify-between p-4 rounded-xl border border-border bg-card gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{empName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{empName}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {leave.leaveType?.replace("_", " ")} Leave · {days} day{days !== 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmtDate(leave.startDate)} → {fmtDate(leave.endDate)}
                    </p>
                    {leave.reason && <p className="text-xs text-muted-foreground mt-1 italic">"{leave.reason}"</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm" variant="outline"
                    className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/40 dark:hover:bg-red-950/20 h-8"
                    onClick={() => setRejectId(leave.id)}
                  >
                    <XCircle size={13} /> Reject
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8"
                    onClick={() => approve.mutate({ id: leave.id, status: "approved" })}
                    disabled={approve.isPending}
                  >
                    <CheckCircle2 size={13} /> Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Payroll Panel ────────────────────────────────────────────────────────────
function PayrollPanel() {
  const [, navigate] = useLocation();
  const now = new Date();
  const { data: runs, isLoading } = trpc.payroll.listRuns.useQuery({ year: now.getFullYear() });
  const { data: teamStats } = trpc.team.getTeamStats.useQuery();
  const utils = trpc.useUtils();

  const createRun = trpc.payroll.createRun.useMutation({
    onSuccess: () => { utils.payroll.listRuns.invalidate(); toast.success("Payroll run created — review and approve in Payroll Engine"); navigate("/payroll"); },
    onError: (e) => toast.error(e.message),
  });

  const currentRun = runs?.find((r) => r.periodMonth === now.getMonth() + 1 && r.periodYear === now.getFullYear());

  return (
    <div className="space-y-4">
      {/* Current Month */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {MONTH_NAMES[now.getMonth()]} {now.getFullYear()} Payroll
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {teamStats?.active ?? 0} active employees
              </p>
            </div>
            {currentRun ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{fmtOMR(currentRun.totalNet)}</p>
                  <Badge
                    variant="outline"
                    className={`text-xs mt-0.5 ${
                      currentRun.status === "paid" ? "border-emerald-300 text-emerald-700 dark:text-emerald-400" :
                      currentRun.status === "approved" ? "border-blue-300 text-blue-700 dark:text-blue-400" :
                      "border-amber-300 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {currentRun.status}
                  </Badge>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => navigate("/payroll")}>
                  <ChevronRight size={13} /> Manage
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => createRun.mutate({ month: now.getMonth() + 1, year: now.getFullYear() })}
                disabled={createRun.isPending || (teamStats?.active ?? 0) === 0}
              >
                <Play size={13} />
                {createRun.isPending ? "Creating…" : "Run Payroll"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : (runs?.length ?? 0) === 0 ? (
        <div className="text-center py-8 border border-dashed border-border rounded-xl">
          <DollarSign size={24} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No payroll history yet</p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Payroll History</p>
          <div className="space-y-2">
            {runs?.map((run) => (
              <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => navigate("/payroll")}>
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    run.status === "paid" ? "bg-emerald-500" :
                    run.status === "approved" ? "bg-blue-500" : "bg-amber-500"
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{MONTH_NAMES[run.periodMonth - 1]} {run.periodYear}</p>
                    <p className="text-xs text-muted-foreground">{run.employeeCount} employees</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{fmtOMR(run.totalNet)}</span>
                  <Badge variant="outline" className={`text-xs px-1.5 py-0 h-4 ${
                    run.status === "paid" ? "border-emerald-300 text-emerald-700 dark:text-emerald-400" :
                    run.status === "approved" ? "border-blue-300 text-blue-700 dark:text-blue-400" :
                    "border-amber-300 text-amber-700 dark:text-amber-400"
                  }`}>
                    {run.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────
function AlertsPanel() {
  const [, navigate] = useLocation();
  const { data: alertsData, isLoading } = trpc.alerts.getExpiryAlerts.useQuery({ maxDays: 60 });
  const alerts = alertsData?.alerts ?? [];

  const SEVERITY_COLOR: Record<string, string> = {
    critical: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20",
    high: "border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20",
    medium: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20",
    low: "border-muted bg-muted/30",
  };
  const SEVERITY_TEXT: Record<string, string> = {
    critical: "text-red-700 dark:text-red-400",
    high: "text-orange-700 dark:text-orange-400",
    medium: "text-amber-700 dark:text-amber-400",
    low: "text-muted-foreground",
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <CheckCircle2 size={28} className="text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground">No expiry alerts in the next 60 days</p>
          <p className="text-xs text-muted-foreground mt-1">All documents are up to date</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">{alerts.length} alert{alerts.length !== 1 ? "s" : ""} in the next 60 days</p>
            <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => navigate("/alerts")}>
              View All <ChevronRight size={12} />
            </Button>
          </div>
          {alerts.map((alert: any) => (
            <div key={alert.id} className={`flex items-start justify-between p-3 rounded-xl border gap-3 ${SEVERITY_COLOR[alert.severity] ?? SEVERITY_COLOR.low}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={15} className={`mt-0.5 shrink-0 ${SEVERITY_TEXT[alert.severity] ?? SEVERITY_TEXT.low}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {alert.entityName && `${alert.entityName} · `}
                    Expires {fmtDate(alert.expiryDate)}
                    {alert.daysUntilExpiry != null && ` · ${alert.daysUntilExpiry} days left`}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className={`text-xs px-1.5 py-0 h-4 shrink-0 capitalize ${SEVERITY_TEXT[alert.severity]}`}>
                {alert.severity}
              </Badge>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── PRO Panel ────────────────────────────────────────────────────────────────
function ProPanel() {
  const [, navigate] = useLocation();
  const { data: proData, isLoading } = trpc.pro.list.useQuery({});
  const services = Array.isArray(proData) ? proData : [];

  const STATUS_COLOR: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Government & PRO service requests</p>
        <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => navigate("/pro")}>
          <Shield size={12} /> New Request
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
      ) : (Array.isArray(services) ? services : []).length === 0 ? (
        <div className="text-center py-10 border border-dashed border-border rounded-xl">
          <Shield size={24} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No PRO service requests yet</p>
          <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => navigate("/pro")}>
            <Shield size={12} /> Submit First Request
          </Button>
        </div>
      ) : (
        (Array.isArray(services) ? services : []).slice(0, 8).map((svc: any) => (
          <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => navigate("/pro")}>
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded-md bg-muted">
                <Shield size={13} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{svc.serviceType?.replace(/_/g, " ") ?? svc.name ?? "PRO Service"}</p>
                <p className="text-xs text-muted-foreground">{svc.employeeName ?? svc.description ?? "—"}</p>
              </div>
            </div>
            <Badge className={`text-xs px-2 py-0 h-5 ${STATUS_COLOR[svc.status] ?? STATUS_COLOR.pending}`}>
              {svc.status}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BusinessOperationsPage() {
  const { data: tasks } = trpc.operations.getTodaysTasks.useQuery();
  const { data: alertsData } = trpc.alerts.getExpiryAlerts.useQuery({ maxDays: 30 });
  const alerts = alertsData?.alerts ?? [];
  const utils = trpc.useUtils();

  const pendingLeaves = tasks?.pendingLeaveApprovals?.length ?? 0;
  const criticalAlerts = alerts.filter((a: any) => a.severity === "critical" || a.severity === "high").length;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b bg-card px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Activity size={20} className="text-primary" />
              Business Operations
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Approve leave, run payroll, track alerts, and manage PRO services — all in one place
            </p>
          </div>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => { utils.hr.listLeave.invalidate(); utils.payroll.listRuns.invalidate(); utils.alerts.getExpiryAlerts.invalidate(); utils.operations.getTodaysTasks.invalidate(); }}
          >
            <RefreshCw size={13} /> Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary Bar ── */}
      <div className="border-b bg-muted/30 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${pendingLeaves > 0 ? "bg-amber-500" : "bg-emerald-500"}`} />
            <span className="text-sm text-foreground">
              <span className="font-semibold">{pendingLeaves}</span> pending leave{pendingLeaves !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${criticalAlerts > 0 ? "bg-red-500" : "bg-emerald-500"}`} />
            <span className="text-sm text-foreground">
              <span className="font-semibold">{criticalAlerts}</span> critical alert{criticalAlerts !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm text-foreground">
              <span className="font-semibold">{tasks?.totalTasks ?? 0}</span> total action{(tasks?.totalTasks ?? 0) !== 1 ? "s" : ""} today
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <Tabs defaultValue="leave">
          <TabsList className="w-full sm:w-auto mb-6">
            <TabsTrigger value="leave" className="gap-1.5 relative">
              <Calendar size={13} /> Leave Approvals
              {pendingLeaves > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {pendingLeaves > 9 ? "9+" : pendingLeaves}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="payroll" className="gap-1.5">
              <DollarSign size={13} /> Payroll
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5 relative">
              <Bell size={13} /> Expiry Alerts
              {criticalAlerts > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {criticalAlerts > 9 ? "9+" : criticalAlerts}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="pro" className="gap-1.5">
              <Shield size={13} /> PRO Services
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leave"><LeaveApprovalPanel /></TabsContent>
          <TabsContent value="payroll"><PayrollPanel /></TabsContent>
          <TabsContent value="alerts"><AlertsPanel /></TabsContent>
          <TabsContent value="pro"><ProPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
