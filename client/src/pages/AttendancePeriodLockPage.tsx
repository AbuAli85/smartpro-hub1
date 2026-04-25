/**
 * Period lock management page.
 * Route: /hr/attendance-period-lock
 *
 * Shows current period status, readiness, and lock/export/reopen actions.
 * Uses existing tRPC procedures: getAttendancePeriodState, lockAttendancePeriod,
 * reopenAttendancePeriod, markAttendancePeriodExported, listAttendanceAudit.
 */
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Lock,
  LockOpen,
  Download,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { AttendancePeriodStatus } from "@shared/attendancePeriodLock";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function padMonth(m: number) {
  return String(m).padStart(2, "0");
}

function formatPeriod(year: number, month: number) {
  return `${year}-${padMonth(month)}`;
}

function statusBadge(status: AttendancePeriodStatus) {
  switch (status) {
    case "open":
      return <Badge variant="secondary">Open</Badge>;
    case "locked":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Locked</Badge>;
    case "exported":
      return <Badge className="bg-green-100 text-green-800 border-green-300">Exported</Badge>;
    case "reopened":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-300">Reopened</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function StatusIcon({ status }: { status: AttendancePeriodStatus }) {
  switch (status) {
    case "locked":
      return <Lock className="h-5 w-5 text-yellow-600" />;
    case "exported":
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    case "reopened":
      return <LockOpen className="h-5 w-5 text-blue-600" />;
    default:
      return <Clock className="h-5 w-5 text-gray-400" />;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AttendancePeriodLockPage() {
  const { t } = useTranslation();
  const { activeCompanyId } = useActiveCompany();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const prevMonth = useCallback(() => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }, [month]);

  // ── State & queries ──────────────────────────────────────────────────────

  const periodStateQ = trpc.attendance.getAttendancePeriodState.useQuery(
    { companyId: activeCompanyId ?? undefined, year, month },
    { enabled: !!activeCompanyId },
  );

  const reconciliationQ = trpc.attendance.getReconciliationSummary.useQuery(
    { companyId: activeCompanyId ?? undefined, year, month },
    { enabled: !!activeCompanyId },
  );

  const auditQ = trpc.attendance.listAttendanceAudit.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      actionType: "attendance_period_lock,attendance_period_reopen,attendance_period_export",
      limit: 10,
    },
    { enabled: !!activeCompanyId },
  );

  const utils = trpc.useUtils();

  const lockMutation = trpc.attendance.lockAttendancePeriod.useMutation({
    onSuccess: () => {
      toast.success(`Period ${formatPeriod(year, month)} locked for payroll.`);
      void utils.attendance.getAttendancePeriodState.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const reopenMutation = trpc.attendance.reopenAttendancePeriod.useMutation({
    onSuccess: () => {
      toast.success(`Period ${formatPeriod(year, month)} reopened.`);
      setReopenDialogOpen(false);
      setReopenReason("");
      void utils.attendance.getAttendancePeriodState.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const exportMutation = trpc.attendance.markAttendancePeriodExported.useMutation({
    onSuccess: () => {
      toast.success(`Period ${formatPeriod(year, month)} marked as exported.`);
      void utils.attendance.getAttendancePeriodState.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Reopen dialog ────────────────────────────────────────────────────────
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const reasonTooShort = reopenReason.trim().length < 10;

  const periodState = periodStateQ.data;
  const readiness = reconciliationQ.data?.readinessStatus ?? null;
  const status: AttendancePeriodStatus = periodState?.status ?? "open";

  const canLock =
    status === "open" || status === "reopened";
  const readinessIsReady = readiness === "ready";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Period Lock</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Lock a calendar month for payroll, mark it exported, or reopen it for corrections.
          </p>
        </div>
      </div>

      {/* Month selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold min-w-[7rem] text-center">
              {formatPeriod(year, month)}
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current period status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Current Status</CardTitle>
          <CardDescription>
            Period {formatPeriod(year, month)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {periodStateQ.isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <div className="flex items-center gap-3">
              <StatusIcon status={status} />
              {statusBadge(status)}
              {readiness && (
                <span className="text-sm text-muted-foreground">
                  Reconciliation: <strong>{readiness}</strong>
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Lock */}
          {canLock && (
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">Lock period</p>
                <p className="text-xs text-muted-foreground">
                  Prevents further attendance changes for {formatPeriod(year, month)}.
                  Requires reconciliation to be <strong>ready</strong>.
                </p>
                {!readinessIsReady && readiness && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Reconciliation must be &quot;ready&quot; before locking (currently: {readiness}).
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="default"
                disabled={!readinessIsReady || lockMutation.isPending}
                onClick={() =>
                  lockMutation.mutate({ companyId: activeCompanyId ?? undefined, year, month })
                }
              >
                <Lock className="h-4 w-4 mr-2" />
                Lock
              </Button>
            </div>
          )}

          {/* Export */}
          {status === "locked" && (
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">Mark as exported</p>
                <p className="text-xs text-muted-foreground">
                  Signals that payroll data has been sent to the payroll system.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={exportMutation.isPending}
                onClick={() =>
                  exportMutation.mutate({ companyId: activeCompanyId ?? undefined, year, month })
                }
              >
                <Download className="h-4 w-4 mr-2" />
                Mark Exported
              </Button>
            </div>
          )}

          {/* Reopen */}
          {(status === "locked" || status === "exported") && (
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-medium text-sm">Reopen period</p>
                <p className="text-xs text-muted-foreground">
                  Allows attendance corrections after lock. Requires a detailed reason.
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setReopenDialogOpen(true)}
              >
                <LockOpen className="h-4 w-4 mr-2" />
                Reopen
              </Button>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Lock Events</CardTitle>
          <CardDescription>Last 10 lock / reopen / export audit events.</CardDescription>
        </CardHeader>
        <CardContent>
          {auditQ.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : auditQ.data && auditQ.data.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditQ.data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.actionType}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{row.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No lock events yet for this company.</p>
          )}
        </CardContent>
      </Card>

      {/* Reopen dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen period {formatPeriod(year, month)}</DialogTitle>
            <DialogDescription>
              Provide a detailed reason explaining who requested this and why the period needs
              correction. Generic reasons like &quot;fix&quot; or &quot;test&quot; are not accepted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Reason (minimum 10 characters)</Label>
            <Textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="e.g. Finance requested correction of 3 records incorrectly marked absent on April 12."
              rows={4}
            />
            {reasonTooShort && reopenReason.length > 0 && (
              <p className="text-xs text-destructive">Reason must be at least 10 characters.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reasonTooShort || reopenMutation.isPending}
              onClick={() =>
                reopenMutation.mutate({
                  companyId: activeCompanyId ?? undefined,
                  year,
                  month,
                  reason: reopenReason,
                })
              }
            >
              Reopen Period
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
