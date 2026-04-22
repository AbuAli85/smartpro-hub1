/**
 * HR / admin: attendance reconciliation preflight (records vs sessions vs legacy HR attendance).
 * Route: /hr/attendance-reconciliation
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
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
import {
  CalendarDays,
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

export default function AttendanceReconciliationPage() {
  const { activeCompanyId } = useActiveCompany();
  const muscatToday = muscatCalendarYmdNow();
  const { year: initialYear, month: initialMonth } = parseMuscatYmd(muscatToday);

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [repairingRecordId, setRepairingRecordId] = useState<number | null>(null);
  const [includeDetailsInExport, setIncludeDetailsInExport] = useState(true);

  const { fromYmd, toYmd } = useMemo(() => labelMonthToInclusiveYmd(year, month), [year, month]);

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
      toast.error(e.message);
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
            onClick={() => void preflight.refetch()}
            disabled={!activeCompanyId || preflight.isFetching}
          >
            <RefreshCw size={15} className={preflight.isFetching ? "animate-spin" : ""} />
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
              <p className="text-sm text-destructive">{preflight.error.message}</p>
            ) : preflight.data ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      preflight.data.preflight.decision === "safe"
                        ? "border-green-600 text-green-700 bg-green-50 dark:bg-green-950/40"
                        : preflight.data.preflight.decision === "warnings"
                          ? "border-amber-600 text-amber-800 bg-amber-50 dark:bg-amber-950/30"
                          : "border-red-600 text-red-800 bg-red-50 dark:bg-red-950/30"
                    }
                  >
                    Payroll gate: {preflight.data.preflight.decision}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Blocking {preflight.data.blockingCount} · Warnings {preflight.data.warningCount}
                  </span>
                </div>
                {preflight.data.recordsScanMayBeIncomplete ? (
                  <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50/80 dark:bg-amber-950/25 rounded-md px-3 py-2 border border-amber-200 dark:border-amber-800">
                    {`Clock-row scan may be incomplete (cap ${preflight.data.recordsLoadCap}). Treat a "safe" result cautiously for very large months.`}
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
