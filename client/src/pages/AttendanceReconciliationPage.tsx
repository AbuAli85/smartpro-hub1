/**
 * HR / admin: attendance reconciliation preflight (records vs sessions vs legacy HR attendance)
 * + Phase 5A payroll readiness summary.
 * Route: /hr/attendance-reconciliation
 */
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { isAttendanceSessionsTableRequiredClientError } from "@/lib/attendanceTrpcErrors";
import { AttendanceSessionsInfraErrorAlert } from "@/components/attendance/AttendanceSessionsInfraErrorAlert";
import type { ReconciliationReadinessStatus, ReconciliationSummaryTotals } from "@shared/attendanceReconciliationSummary";
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  RefreshCw,
  Scale,
  Wrench,
} from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const { t } = useTranslation("hr");
  const muscatToday = muscatCalendarYmdNow();
  const { year: initialYear, month: initialMonth } = parseMuscatYmd(muscatToday);

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [repairingRecordId, setRepairingRecordId] = useState<number | null>(null);
  const [includeDetailsInExport, setIncludeDetailsInExport] = useState(true);

  const { fromYmd, toYmd } = useMemo(() => labelMonthToInclusiveYmd(year, month), [year, month]);

  const reconciliationSummary = trpc.attendance.getReconciliationSummary.useQuery(
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
      toast.success("Session re-synced from clock record");
      setRepairingRecordId(null);
      void preflight.refetch();
    },
    onError: (e) => {
      if (isAttendanceSessionsTableRequiredClientError(e)) {
        toast.warning("Session repair blocked until the attendance_sessions migration is applied.");
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
      toast.error("Run preflight first");
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
    toast.success("Download started");
  }

  async function copySummary() {
    if (!preflight.data) {
      toast.error("Nothing to copy yet");
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
      toast.success("Summary copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="text-primary" size={26} />
            Attendance reconciliation
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Compare clock rows, payroll sessions, and legacy HR attendance for the selected Muscat calendar month.
            Use this before payroll or when investigating drift. Payroll execution uses the same preflight rules.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            <Link href="/payroll/process" className="text-primary hover:underline">
              Open payroll processing
            </Link>
            {" · "}
            <Link href="/hr/attendance-anomalies" className="text-primary hover:underline">
              Session anomaly report
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 border rounded-lg overflow-hidden bg-background">
            <Button variant="ghost" size="sm" className="h-9 px-2" onClick={prevMonth}>
              <ChevronLeft size={18} />
            </Button>
            <span className="px-3 text-sm font-semibold min-w-[150px] text-center">
              {MONTHS[month - 1]} {year}
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
            }}
            disabled={!activeCompanyId || preflight.isFetching || reconciliationSummary.isFetching}
          >
            <RefreshCw size={15} className={preflight.isFetching || reconciliationSummary.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {!activeCompanyId ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Select a company workspace to run reconciliation.
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

                {/* Lock / Export actions (capability-gated, disabled until Phase 5B) */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!reconciliationSummary.data.canLock}
                    title={
                      !reconciliationSummary.data.canLock
                        ? t("attendance.reconciliationSummary.actions.lockDisabledHint")
                        : undefined
                    }
                  >
                    {t("attendance.reconciliationSummary.actions.lock")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!reconciliationSummary.data.canExportToPayroll}
                    title={
                      !reconciliationSummary.data.canExportToPayroll
                        ? t("attendance.reconciliationSummary.actions.exportDisabledHint")
                        : undefined
                    }
                  >
                    {t("attendance.reconciliationSummary.actions.export")}
                  </Button>
                </div>
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
              Preflight ({fromYmd} → {toYmd})
            </CardTitle>
            <CardDescription>
              Muscat-inclusive range · half-open UTC on <code className="text-xs">check_in</code>
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
                    Payroll gate:{" "}
                    {(preflight.data as { payrollBlockedByIncompleteScan?: boolean }).payrollBlockedByIncompleteScan
                      ? "block (incomplete scan)"
                      : preflight.data.preflight.decision}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Blocking {preflight.data.blockingCount} · Warnings {preflight.data.warningCount}
                  </span>
                </div>
                {preflight.data.recordsScanMayBeIncomplete ? (
                  <p className="text-xs text-red-800 dark:text-red-200 bg-red-50/80 dark:bg-red-950/25 rounded-md px-3 py-2 border border-red-200 dark:border-red-800">
                    {`Execute Payroll is blocked: scan hit the cap (${preflight.data.recordsLoadCap} clock rows). The month is incomplete — this cannot be bypassed with warning acknowledgment.`}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Clock rows</p>
                    <p className="font-semibold">{preflight.data.totals.records}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Sessions</p>
                    <p className="font-semibold">{preflight.data.totals.sessions}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Legacy HR rows</p>
                    <p className="font-semibold">{preflight.data.totals.legacyRows}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Affected employees</p>
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
                    Export JSON
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void copySummary()}>
                    <ClipboardCopy size={15} />
                    Copy summary
                  </Button>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-1">
                    <Checkbox
                      checked={includeDetailsInExport}
                      onCheckedChange={(v) => setIncludeDetailsInExport(v === true)}
                    />
                    Include full mismatch rows in export
                  </label>
                </div>

                <div>
                  <Label className="text-sm font-medium">Mismatch detail</Label>
                  {preflight.data.mismatches.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">No mismatches for this window.</p>
                  ) : (
                    <ScrollArea className="h-[min(420px,50vh)] mt-2 rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[88px]">Severity</TableHead>
                            <TableHead className="w-[220px]">Type</TableHead>
                            <TableHead className="w-20">Employee</TableHead>
                            <TableHead className="w-28">Date</TableHead>
                            <TableHead>Summary</TableHead>
                            <TableHead className="w-20 text-right">Repair</TableHead>
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
  );
}
