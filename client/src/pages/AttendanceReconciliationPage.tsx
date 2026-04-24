/**
 * HR / admin: attendance reconciliation preflight (records vs sessions vs legacy HR attendance)
 * + Phase 5A payroll readiness summary + Phase 5B period lock/export.
 * Route: /hr/attendance-reconciliation
 */
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";
import { formatAttendanceMonthDisplay } from "@/lib/dateUtils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { isAttendanceSessionsTableRequiredClientError } from "@/lib/attendanceTrpcErrors";
import { AttendanceSessionsInfraErrorAlert } from "@/components/attendance/AttendanceSessionsInfraErrorAlert";
import type { ReconciliationReadinessStatus, ReconciliationSummaryTotals } from "@shared/attendanceReconciliationSummary";
import type { AttendancePeriodStatus } from "@shared/attendancePeriodLock";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  Lock,
  LockOpen,
  RefreshCw,
  Scale,
  Share2,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { AttendancePayrollGateStatus } from "@shared/attendancePayrollReadiness";

const REPAIRABLE_ATTENDANCE_MISMATCH_TYPES = new Set([
  "RECORD_CLOSED_MISSING_SESSION",
  "RECORD_OPEN_MISSING_SESSION",
  "SESSION_BUSINESS_DATE_DRIFT",
  "SESSION_TIME_DRIFT",
  "SESSION_OPEN_STATE_MISMATCH",
  "MULTIPLE_SESSIONS_FOR_RECORD",
]);

function labelMonthToInclusiveYmd(year: number, month1to12: number): { fromYmd: string; toYmd: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fromYmd = `${year}-${pad(month1to12)}-01`;
  const lastDay = new Date(year, month1to12, 0).getDate();
  const toYmd = `${year}-${pad(month1to12)}-${pad(lastDay)}`;
  return { fromYmd, toYmd };
}

function parseMuscatYmd(ymd: string): { year: number; month: number } {
  const [y, m] = ymd.split("-").map(Number);
  return { year: y, month: m };
}

// ---------------------------------------------------------------------------
// Readiness status badge helpers
// ---------------------------------------------------------------------------

const READINESS_CONFIG: Record<
  ReconciliationReadinessStatus,
  { icon: ComponentType<{ size?: number; className?: string }>; badgeClass: string }
> = {
  ready: { icon: CheckCircle2, badgeClass: "border-green-600 text-green-700 bg-green-50 dark:bg-green-950/40" },
  needs_review: { icon: AlertTriangle, badgeClass: "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30" },
  blocked: { icon: AlertCircle, badgeClass: "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30" },
};

function ReadinessBadge({ status }: { status: ReconciliationReadinessStatus }) {
  const { t } = useTranslation("hr");
  const cfg = READINESS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`flex items-center gap-1.5 ${cfg.badgeClass}`}>
      <Icon size={14} />
      {t(`attendance.reconciliationSummary.readinessStatus.${status}`)}
    </Badge>
  );
}

const PERIOD_STATUS_CONFIG: Record<
  AttendancePeriodStatus,
  { icon: ComponentType<{ size?: number; className?: string }>; badgeClass: string }
> = {
  open: { icon: LockOpen, badgeClass: "border-slate-400 text-slate-600 bg-slate-50 dark:bg-slate-900/40" },
  locked: { icon: Lock, badgeClass: "border-blue-600 text-blue-700 bg-blue-50 dark:bg-blue-950/40" },
  exported: { icon: Share2, badgeClass: "border-purple-600 text-purple-700 bg-purple-50 dark:bg-purple-950/40" },
  reopened: { icon: LockOpen, badgeClass: "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30" },
};

function PeriodStatusBadge({ status }: { status: AttendancePeriodStatus }) {
  const { t } = useTranslation("hr");
  const cfg = PERIOD_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`flex items-center gap-1.5 ${cfg.badgeClass}`}>
      <Icon size={14} />
      {t(`attendance.periodLock.status.${status}`)}
    </Badge>
  );
}

const GATE_STATUS_CONFIG: Record<
  AttendancePayrollGateStatus,
  { icon: ComponentType<{ size?: number; className?: string }>; badgeClass: string }
> = {
  ready: { icon: ShieldCheck, badgeClass: "border-green-600 text-green-700 bg-green-50 dark:bg-green-950/40" },
  needs_review: { icon: AlertTriangle, badgeClass: "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30" },
  blocked_period_not_locked: { icon: LockOpen, badgeClass: "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30" },
  blocked_reconciliation: { icon: AlertCircle, badgeClass: "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30" },
  blocked_client_approval_pending: { icon: AlertTriangle, badgeClass: "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30" },
  blocked_client_approval_rejected: { icon: AlertCircle, badgeClass: "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30" },
  not_required: { icon: ShieldCheck, badgeClass: "border-slate-400 text-slate-600 bg-slate-50 dark:bg-slate-900/40" },
};

function PayrollGateBadge({ status }: { status: AttendancePayrollGateStatus }) {
  const { t } = useTranslation("hr");
  const cfg = GATE_STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`flex items-center gap-1.5 ${cfg.badgeClass}`}>
      <Icon size={14} />
      {t(`attendance.payrollGate.status.${status}`)}
    </Badge>
  );
}

function TotalsGrid({ totals }: { totals: ReconciliationSummaryTotals }) {
  const { t } = useTranslation("hr");
  const base = "attendance.reconciliationSummary.totals";
  const cells: Array<{ key: keyof ReconciliationSummaryTotals; highlight?: "blocking" | "review" }> = [
    { key: "scheduledDays" },
    { key: "readyDays" },
    { key: "excludedDays" },
    { key: "employeesAffected" },
    { key: "payrollBlockingItems", highlight: "blocking" },
    { key: "reviewItems", highlight: "review" },
    { key: "missingCheckouts", highlight: "blocking" },
    { key: "pendingCorrections", highlight: "blocking" },
    { key: "pendingManualCheckins", highlight: "blocking" },
    { key: "scheduleConflicts", highlight: "blocking" },
    { key: "unscheduledAttendance", highlight: "blocking" },
    { key: "holidayAttendance", highlight: "review" },
    { key: "leaveAttendance", highlight: "review" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
      {cells.map(({ key, highlight }) => {
        const val = totals[key];
        const isNonZeroBlocking = highlight === "blocking" && val > 0;
        const isNonZeroReview = highlight === "review" && val > 0;
        return (
          <div
            key={key}
            className={`rounded-lg border px-3 py-2 ${
              isNonZeroBlocking
                ? "border-red-200 bg-red-50/60 dark:bg-red-950/20"
                : isNonZeroReview
                  ? "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20"
                  : "bg-muted/30"
            }`}
          >
            <p className="text-xs text-muted-foreground">{t(`${base}.${key}`)}</p>
            <p className={`font-semibold ${isNonZeroBlocking ? "text-red-700 dark:text-red-400" : isNonZeroReview ? "text-amber-700 dark:text-amber-400" : ""}`}>
              {val}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function AttendanceReconciliationPage() {
  const { activeCompanyId } = useActiveCompany();
  const { t, i18n } = useTranslation("hr");
  const muscatToday = muscatCalendarYmdNow();
  const { year: initialYear, month: initialMonth } = parseMuscatYmd(muscatToday);

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [repairingRecordId, setRepairingRecordId] = useState<number | null>(null);
  const [includeDetailsInExport, setIncludeDetailsInExport] = useState(true);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const { fromYmd, toYmd } = useMemo(() => labelMonthToInclusiveYmd(year, month), [year, month]);

  const reconciliationSummary = trpc.attendance.getReconciliationSummary.useQuery(
    { companyId: activeCompanyId ?? undefined, year, month },
    { enabled: activeCompanyId != null },
  );

  const periodState = trpc.attendance.getAttendancePeriodState.useQuery(
    { companyId: activeCompanyId ?? undefined, year, month },
    { enabled: activeCompanyId != null },
  );

  const lockPeriod = trpc.attendance.lockAttendancePeriod.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.periodLock.toast.lockSuccess"));
      void periodState.refetch();
      void reconciliationSummary.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const exportPeriod = trpc.attendance.markAttendancePeriodExported.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.periodLock.toast.exportSuccess"));
      void periodState.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const reopenPeriod = trpc.attendance.reopenAttendancePeriod.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.periodLock.toast.reopenSuccess"));
      setReopenDialogOpen(false);
      setReopenReason("");
      void periodState.refetch();
      void reconciliationSummary.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const payrollGate = trpc.attendance.getPayrollGateReadiness.useQuery(
    { companyId: activeCompanyId ?? undefined, year, month },
    { enabled: activeCompanyId != null },
  );

  const preflight = trpc.attendance.reconciliationPreflight.useQuery(
    {
      companyId: activeCompanyId ?? undefined,
      fromYmd,
      toYmd,
    },
    { enabled: activeCompanyId != null },
  );

  const repairSession = trpc.attendance.repairSessionFromAttendanceRecord.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.reconciliation.toast.repairSuccess"));
      setRepairingRecordId(null);
      void preflight.refetch();
    },
    onError: (e) => {
      if (isAttendanceSessionsTableRequiredClientError(e)) {
        toast.warning(t("attendance.reconciliation.toast.repairBlockedMigration"));
      } else {
        toast.error(e.message);
      }
      setRepairingRecordId(null);
    },
  });

  const isCurrentOrFutureMuscat =
    year > initialYear || (year === initialYear && month > initialMonth);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  }

  function exportJson() {
    if (!preflight.data) {
      toast.error(t("attendance.reconciliation.toast.preflightRequired"));
      return;
    }
    const payload = includeDetailsInExport
      ? preflight.data
      : {
          companyId: preflight.data.companyId,
          fromYmd: preflight.data.fromYmd,
          toYmd: preflight.data.toYmd,
          preflight: preflight.data.preflight,
          totals: preflight.data.totals,
          mismatchCountsByType: preflight.data.mismatchCountsByType,
          blockingCount: preflight.data.blockingCount,
          warningCount: preflight.data.warningCount,
          recordsLoadCap: preflight.data.recordsLoadCap,
          recordsScanMayBeIncomplete: preflight.data.recordsScanMayBeIncomplete,
          affectedEmployeeIds: preflight.data.affectedEmployeeIds,
        };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-reconciliation-${fromYmd}_${toYmd}-company-${activeCompanyId ?? "unknown"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(t("attendance.reconciliation.toast.exportStarted"));
  }

  async function copySummary() {
    if (!preflight.data) {
      toast.error(t("attendance.reconciliation.toast.preflightRequired"));
      return;
    }
    const text = JSON.stringify(
      {
        fromYmd: preflight.data.fromYmd,
        toYmd: preflight.data.toYmd,
        preflight: preflight.data.preflight,
        blockingCount: preflight.data.blockingCount,
        warningCount: preflight.data.warningCount,
        recordsScanMayBeIncomplete: preflight.data.recordsScanMayBeIncomplete,
        mismatchCountsByType: preflight.data.mismatchCountsByType,
      },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("attendance.reconciliation.toast.copiedToClipboard"));
    } catch {
      toast.error(t("attendance.reconciliation.toast.copyFailed"));
    }
  }

  const reopenReasonTrimmed = reopenReason.trim();
  const reopenReasonValid = reopenReasonTrimmed.length >= 10;

  return (
    <>
    {/* Reopen period dialog */}
    <Dialog open={reopenDialogOpen} onOpenChange={(open) => { setReopenDialogOpen(open); if (!open) setReopenReason(""); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.periodLock.reopenDialog.title")}</DialogTitle>
          <DialogDescription>{t("attendance.periodLock.reopenDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="reopen-reason">{t("attendance.periodLock.reopenDialog.reasonLabel")}</Label>
          <Textarea
            id="reopen-reason"
            placeholder={t("attendance.periodLock.reopenDialog.reasonPlaceholder")}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            rows={3}
          />
          {reopenReason.length > 0 && !reopenReasonValid ? (
            <p className="text-xs text-destructive">{t("attendance.periodLock.reopenDialog.reasonTooShort")}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setReopenDialogOpen(false); setReopenReason(""); }}>
            {t("attendance.periodLock.reopenDialog.cancel")}
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!reopenReasonValid || reopenPeriod.isPending}
            onClick={() => {
              if (!activeCompanyId || !reopenReasonValid) return;
              reopenPeriod.mutate({ companyId: activeCompanyId, year, month, reason: reopenReasonTrimmed });
            }}
          >
            {reopenPeriod.isPending
              ? t("attendance.periodLock.actions.reopening")
              : t("attendance.periodLock.reopenDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="text-primary" size={26} />
            {t("attendance.reconciliation.pageTitle")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            {t("attendance.reconciliation.pageSubtitle")}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <Link href="/payroll/process" className="text-primary hover:underline">
              {t("attendance.reconciliation.linkPayroll")}
            </Link>
            {" · "}
            <Link href="/hr/attendance-anomalies" className="text-primary hover:underline">
              {t("attendance.reconciliation.linkAnomalies")}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 border rounded-lg overflow-hidden bg-background">
            <Button variant="ghost" size="sm" className="h-9 px-2" onClick={prevMonth}>
              <ChevronLeft size={18} />
            </Button>
            <span className="px-3 text-sm font-semibold min-w-[150px] text-center">
              {formatAttendanceMonthDisplay(year, month, i18n.language)}
            </span>
            <Button variant="ghost" size="sm" className="h-9 px-2" onClick={nextMonth} disabled={isCurrentOrFutureMuscat}>
              <ChevronRight size={18} />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              void preflight.refetch();
              void reconciliationSummary.refetch();
              void periodState.refetch();
              void payrollGate.refetch();
            }}
            disabled={!activeCompanyId || preflight.isFetching || reconciliationSummary.isFetching || periodState.isFetching || payrollGate.isFetching}
          >
            <RefreshCw size={15} className={preflight.isFetching || reconciliationSummary.isFetching || periodState.isFetching || payrollGate.isFetching ? "animate-spin" : ""} />
            {t("attendance.reconciliation.refresh")}
          </Button>
        </div>
      </div>

      {!activeCompanyId ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {t("attendance.reconciliation.noCompany")}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Phase 5A: Payroll readiness summary ─────────────────────────────── */}
      {activeCompanyId ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 size={18} className="text-muted-foreground" />
              {t("attendance.reconciliationSummary.title")}
            </CardTitle>
            <CardDescription>
              {t("attendance.reconciliationSummary.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {reconciliationSummary.isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : reconciliationSummary.isError ? (
              <p className="text-sm text-destructive">{reconciliationSummary.error.message}</p>
            ) : reconciliationSummary.data ? (
              <>
                {/* Readiness status badge + hint */}
                <div className="flex flex-wrap items-center gap-3">
                  <ReadinessBadge status={reconciliationSummary.data.readinessStatus} />
                  <p className="text-sm text-muted-foreground">
                    {t(`attendance.reconciliationSummary.readinessHint.${reconciliationSummary.data.readinessStatus}`)}
                  </p>
                </div>

                {/* Period totals grid */}
                <TotalsGrid totals={reconciliationSummary.data.totals} />

                {/* Payroll blockers */}
                {reconciliationSummary.data.blockers.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">
                      {t("attendance.reconciliationSummary.sections.blockers")}
                    </p>
                    <div className="space-y-2">
                      {reconciliationSummary.data.blockers.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-3 py-2 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-red-800 dark:text-red-300">
                              {t(item.titleKey)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.attendanceDate}
                              {item.employeeId != null ? ` · ${t("employee")} #${item.employeeId}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("attendance.reconciliationSummary.sections.noBlockers")}
                  </p>
                )}

                {/* Review items */}
                {reconciliationSummary.data.reviewItems.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2">
                      {t("attendance.reconciliationSummary.sections.reviewItems")}
                    </p>
                    <div className="space-y-2">
                      {reconciliationSummary.data.reviewItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-amber-800 dark:text-amber-300">
                              {t(item.titleKey)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.attendanceDate}
                              {item.employeeId != null ? ` · ${t("employee")} #${item.employeeId}` : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Period lock state badge */}
                {periodState.data ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">{t("attendance.periodLock.periodStatus")}:</span>
                    <PeriodStatusBadge status={periodState.data.status as AttendancePeriodStatus} />
                  </div>
                ) : null}

                {/* Lock / Export / Reopen actions */}
                {(() => {
                  const ps = periodState.data?.status as AttendancePeriodStatus | undefined;
                  const canLockNow =
                    reconciliationSummary.data.canLock &&
                    (ps === "open" || ps === "reopened");
                  const canExportNow =
                    reconciliationSummary.data.canExportToPayroll && ps === "locked";
                  const canReopenNow =
                    reconciliationSummary.data.canLock && (ps === "locked" || ps === "exported");
                  return (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={!canLockNow || lockPeriod.isPending}
                        title={!canLockNow ? t("attendance.periodLock.actions.lockDisabledHint") : undefined}
                        onClick={() => {
                          if (!activeCompanyId) return;
                          lockPeriod.mutate({ companyId: activeCompanyId, year, month });
                        }}
                      >
                        <Lock size={14} />
                        {lockPeriod.isPending
                          ? t("attendance.periodLock.actions.locking")
                          : t("attendance.periodLock.actions.lock")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={!canExportNow || exportPeriod.isPending}
                        title={!canExportNow ? t("attendance.periodLock.actions.exportDisabledHint") : undefined}
                        onClick={() => {
                          if (!activeCompanyId) return;
                          exportPeriod.mutate({ companyId: activeCompanyId, year, month });
                        }}
                      >
                        <Share2 size={14} />
                        {exportPeriod.isPending
                          ? t("attendance.periodLock.actions.exporting")
                          : t("attendance.periodLock.actions.export")}
                      </Button>
                      {canReopenNow ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                          onClick={() => setReopenDialogOpen(true)}
                        >
                          <LockOpen size={14} />
                          {t("attendance.periodLock.actions.reopen")}
                        </Button>
                      ) : null}
                    </div>
                  );
                })()}
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ── Phase 11: Payroll/Billing readiness gate ─────────────────────────── */}
      {activeCompanyId ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck size={18} className="text-muted-foreground" />
              {t("attendance.payrollGate.cardTitle")}
            </CardTitle>
            <CardDescription>{t("attendance.payrollGate.cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {payrollGate.isLoading ? (
              <Skeleton className="h-10 w-full rounded-lg" />
            ) : payrollGate.isError ? (
              <p className="text-sm text-destructive">{payrollGate.error.message}</p>
            ) : payrollGate.data ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <PayrollGateBadge status={payrollGate.data.status} />
                  <span className="text-sm text-muted-foreground">
                    {t(`attendance.payrollGate.statusHint.${payrollGate.data.status}`)}
                  </span>
                </div>

                {payrollGate.data.blockers.length > 0 ? (
                  <div className="space-y-1.5">
                    {payrollGate.data.blockers.map((blocker) => (
                      <div
                        key={blocker.code}
                        className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-3 py-2 text-sm"
                      >
                        <span className="text-red-800 dark:text-red-300 font-medium">
                          {t(blocker.messageKey, { count: blocker.count })}
                        </span>
                        {blocker.code === "PERIOD_NOT_LOCKED" ? (
                          <Link href="/hr/attendance-reconciliation" className="text-xs text-primary hover:underline shrink-0">
                            {t("attendance.payrollGate.actions.lockPeriod")}
                          </Link>
                        ) : blocker.code === "RECONCILIATION_BLOCKED" ? (
                          <Link href="/hr/attendance-reconciliation" className="text-xs text-primary hover:underline shrink-0">
                            {t("attendance.payrollGate.actions.viewBlockers")}
                          </Link>
                        ) : blocker.code === "CLIENT_APPROVAL_PENDING" || blocker.code === "CLIENT_APPROVAL_REJECTED" ? (
                          <Link href="/hr/client-approvals" className="text-xs text-primary hover:underline shrink-0">
                            {t("attendance.payrollGate.actions.viewClientApprovals")}
                          </Link>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {payrollGate.data.clientApproval.required ? (
                  <div className="flex gap-4 text-xs text-muted-foreground pt-1">
                    <span>{t("attendance.payrollGate.clientApproval.approved")}: <strong>{payrollGate.data.clientApproval.approvedBatches}</strong></span>
                    <span>{t("attendance.payrollGate.clientApproval.pending")}: <strong>{payrollGate.data.clientApproval.pendingBatches}</strong></span>
                    <span>{t("attendance.payrollGate.clientApproval.rejected")}: <strong>{payrollGate.data.clientApproval.rejectedBatches}</strong></span>
                  </div>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {activeCompanyId ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays size={18} className="text-muted-foreground" />
              {t("attendance.reconciliation.preflightCardTitle", { from: fromYmd, to: toYmd })}
            </CardTitle>
            <CardDescription>
              {t("attendance.reconciliation.preflightCardDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preflight.isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : preflight.isError ? (
              isAttendanceSessionsTableRequiredClientError(preflight.error) ? (
                <AttendanceSessionsInfraErrorAlert />
              ) : (
                <p className="text-sm text-destructive">{preflight.error.message}</p>
              )
            ) : preflight.data ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      (preflight.data as { payrollBlockedByIncompleteScan?: boolean }).payrollBlockedByIncompleteScan ||
                      preflight.data.preflight.decision === "block"
                        ? "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30"
                        : preflight.data.preflight.decision === "safe"
                        ? "border-green-600 text-green-700 bg-green-50 dark:bg-green-950/40"
                        : preflight.data.preflight.decision === "warnings"
                          ? "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30"
                          : "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30"
                    }
                  >
                    {(preflight.data as { payrollBlockedByIncompleteScan?: boolean }).payrollBlockedByIncompleteScan
                      ? t("attendance.reconciliation.payrollGate", { decision: t("attendance.reconciliation.payrollGateBlockedScan") })
                      : t("attendance.reconciliation.payrollGate", { decision: preflight.data.preflight.decision })}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t("attendance.reconciliation.blockingWarnings", {
                      blocking: preflight.data.blockingCount,
                      warnings: preflight.data.warningCount,
                    })}
                  </span>
                </div>
                {preflight.data.recordsScanMayBeIncomplete ? (
                  <p className="text-xs text-red-800 dark:text-red-200 bg-red-50/80 dark:bg-red-950/25 rounded-md px-3 py-2 border border-red-200 dark:border-red-800">
                    {t("attendance.reconciliation.incompleteScanWarning", { cap: preflight.data.recordsLoadCap })}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{t("attendance.reconciliation.stats.clockRows")}</p>
                    <p className="font-semibold">{preflight.data.totals.records}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{t("attendance.reconciliation.stats.sessions")}</p>
                    <p className="font-semibold">{preflight.data.totals.sessions}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{t("attendance.reconciliation.stats.legacyRows")}</p>
                    <p className="font-semibold">{preflight.data.totals.legacyRows}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">{t("attendance.reconciliation.stats.affectedEmployees")}</p>
                    <p className="font-semibold">{preflight.data.affectedEmployeeIds.length}</p>
                  </div>
                </div>
                {preflight.data.preflight.reasons.length > 0 ? (
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                    {preflight.data.preflight.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex flex-wrap gap-2 items-center">
                  <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={exportJson}>
                    <Download size={15} />
                    {t("attendance.reconciliation.exportJsonBtn")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copySummary()}>
                    <ClipboardCopy size={15} />
                    {t("attendance.reconciliation.copySummaryBtn")}
                  </Button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-1">
                    <Checkbox
                      checked={includeDetailsInExport}
                      onCheckedChange={(v) => setIncludeDetailsInExport(v === true)}
                    />
                    {t("attendance.reconciliation.includeDetailsLabel")}
                  </label>
                </div>

                <div>
                  <Label className="text-sm font-medium">{t("attendance.reconciliation.mismatchDetail")}</Label>
                  {preflight.data.mismatches.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">{t("attendance.reconciliation.noMismatches")}</p>
                  ) : (
                    <ScrollArea className="h-[min(420px,50vh)] mt-2 rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[88px]">{t("attendance.reconciliation.tableHeaders.severity")}</TableHead>
                            <TableHead className="w-[220px]">{t("attendance.reconciliation.tableHeaders.type")}</TableHead>
                            <TableHead className="w-20">{t("attendance.reconciliation.tableHeaders.employee")}</TableHead>
                            <TableHead className="w-28">{t("attendance.reconciliation.tableHeaders.date")}</TableHead>
                            <TableHead>{t("attendance.reconciliation.tableHeaders.summary")}</TableHead>
                            <TableHead className="w-20 text-right">{t("attendance.reconciliation.tableHeaders.repair")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preflight.data.mismatches.map((row, idx) => {
                            const rid = row.attendanceRecordId ?? null;
                            const canRepair = rid != null && REPAIRABLE_ATTENDANCE_MISMATCH_TYPES.has(row.type);
                            return (
                              <TableRow key={`${row.type}-${idx}-${rid ?? row.attendanceSessionId ?? ""}`}>
                                <TableCell className="text-sm">
                                  <span className={row.severity === "blocking" ? "text-red-600 font-medium" : "text-amber-700"}>
                                    {row.severity}
                                  </span>
                                </TableCell>
                                <TableCell className="font-mono text-xs break-all">{row.type}</TableCell>
                                <TableCell className="text-sm">{row.employeeId ?? "—"}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{row.businessDate ?? "—"}</TableCell>
                                <TableCell className="text-sm max-w-md">{row.summary}</TableCell>
                                <TableCell className="text-right">
                                  {canRepair ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 px-2"
                                      title="Re-sync payroll session from clock row"
                                      disabled={repairSession.isPending}
                                      onClick={() => {
                                        setRepairingRecordId(rid);
                                        repairSession.mutate({
                                          attendanceRecordId: rid,
                                          companyId: activeCompanyId ?? undefined,
                                        });
                                      }}
                                    >
                                      {repairSession.isPending && repairingRecordId === rid ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                      ) : (
                                        <Wrench size={14} />
                                      )}
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
    </>
  );
}
