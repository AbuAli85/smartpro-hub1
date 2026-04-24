import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Download, Search, FileText, AlertCircle, Calendar } from "lucide-react";
import * as ExcelJS from "exceljs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";
import { fmtTime } from "@/lib/dateUtils";
import type { DailyAttendanceState } from "@shared/attendanceDailyState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter =
  | "all"
  | "checkedIn"
  | "checkedOut"
  | "late"
  | "absent"
  | "needsReview"
  | "payrollBlocked";

type QuickFilter = "today" | "thisWeek" | "thisMonth" | "custom";

type ClientApprovalStatus =
  | "not_submitted"
  | "pending"
  | "approved"
  | "rejected"
  | "disputed";

type EnrichedRow = DailyAttendanceState & {
  clientApprovalStatus: ClientApprovalStatus;
  clientApprovalComment: string | null;
  clientApprovalBatchId: number | null;
};

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

/** Inclusive diff in calendar days (end - start). */
function daysBetween(start: string, end: string): number {
  return Math.round(
    (new Date(end + "T12:00:00Z").getTime() -
      new Date(start + "T12:00:00Z").getTime()) /
      86_400_000
  );
}

function getMuscatWeekRange(today: string): { start: string; end: string } {
  const d = new Date(today + "T08:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun…6=Sat
  const daysFromMon = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - daysFromMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end: sun.toISOString().slice(0, 10),
  };
}

function getMuscatMonthRange(today: string): { start: string; end: string } {
  const [y, m] = today.split("-").map(Number);
  const year = y!;
  const month = m!;
  const mm = String(month).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcWorkedHours(
  checkInAt: string | undefined,
  checkOutAt: string | undefined,
  t: (k: string) => string
): string {
  if (!checkInAt) return t("attendance.clientSheet.workedHours.none");
  if (!checkOutAt) return t("attendance.clientSheet.workedHours.open");
  const diffMs =
    new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  if (diffMs < 0) return t("attendance.clientSheet.workedHours.none");
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function calcWorkedHoursDecimal(
  checkInAt: string | undefined,
  checkOutAt: string | undefined
): string {
  if (!checkInAt || !checkOutAt) return "";
  const diffMs =
    new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  if (diffMs < 0) return "";
  return (diffMs / 3_600_000).toFixed(2);
}

function getDayShort(dateYmd: string): string {
  const d = new Date(dateYmd + "T08:00:00Z");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "Asia/Muscat",
  });
}

function matchesStatusFilter(
  row: DailyAttendanceState,
  filter: StatusFilter
): boolean {
  const s = row.canonicalStatus;
  const p = row.payrollReadiness;
  switch (filter) {
    case "all":
      return true;
    case "checkedIn":
      return s === "checked_in_on_time" || s === "checked_in_late";
    case "checkedOut":
      return s === "checked_out";
    case "late":
      return s === "checked_in_late" || s === "late_no_arrival";
    case "absent":
      return (
        s === "absent_confirmed" ||
        s === "absent_pending" ||
        s === "late_no_arrival"
      );
    case "needsReview":
      return s === "needs_review" || p === "needs_review";
    case "payrollBlocked":
      return p.startsWith("blocked_");
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: string): string {
  switch (status) {
    case "checked_in_on_time":
      return "bg-green-100 text-green-800";
    case "checked_in_late":
      return "bg-amber-100 text-amber-800";
    case "checked_out":
      return "bg-blue-100 text-blue-700";
    case "late_no_arrival":
    case "absent_pending":
    case "absent_confirmed":
      return "bg-red-100 text-red-700";
    case "needs_review":
    case "unscheduled_attendance":
      return "bg-purple-100 text-purple-800";
    case "holiday":
    case "leave":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function payrollBadgeClass(readiness: string): string {
  if (readiness === "ready") return "bg-green-100 text-green-800";
  if (readiness === "excluded") return "bg-slate-100 text-slate-600";
  if (readiness === "needs_review") return "bg-amber-100 text-amber-700";
  if (readiness.startsWith("blocked_")) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

function approvalBadgeClass(status: ClientApprovalStatus): string {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "pending":
      return "bg-blue-100 text-blue-700";
    case "disputed":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3 text-center min-w-[80px]">
      <div
        className={`text-2xl font-bold tabular-nums ${accent ?? "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const MAX_RANGE_DAYS = 30;

export function ClientAttendanceSheet({
  companyId,
}: {
  companyId: number | null | undefined;
}) {
  const { t } = useTranslation("hr");
  const today = muscatCalendarYmdNow();

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("today");
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [exporting, setExporting] = useState(false);

  // ── Quick filter handlers ────────────────────────────────────────────────

  const applyQuickFilter = useCallback(
    (filter: QuickFilter) => {
      setQuickFilter(filter);
      if (filter === "today") {
        setStartDate(today);
        setEndDate(today);
      } else if (filter === "thisWeek") {
        const { start, end } = getMuscatWeekRange(today);
        setStartDate(start);
        setEndDate(end);
      } else if (filter === "thisMonth") {
        const { start, end } = getMuscatMonthRange(today);
        setStartDate(start);
        setEndDate(end);
      }
      // "custom" — leave start/end as-is
    },
    [today]
  );

  // If user edits dates manually, switch to custom
  const handleStartDateChange = useCallback((v: string) => {
    setStartDate(v);
    setQuickFilter("custom");
  }, []);

  const handleEndDateChange = useCallback((v: string) => {
    setEndDate(v);
    setQuickFilter("custom");
  }, []);

  // ── Validation ─────────────────────────────────────────────────────────────

  const rangeDays = useMemo(
    () => (startDate && endDate ? daysBetween(startDate, endDate) : 0),
    [startDate, endDate]
  );
  const rangeInvalid = rangeDays < 0 || rangeDays > MAX_RANGE_DAYS;

  // ── Data fetching ──────────────────────────────────────────────────────────

  const siteIdParam =
    siteFilter !== "all" ? parseInt(siteFilter, 10) : undefined;

  const { data: sitesData } = trpc.attendance.listSites.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: companyId != null, staleTime: 60_000 }
  );

  const activeSites = useMemo(
    () => (sitesData ?? []).filter((s) => s.isActive),
    [sitesData]
  );

  const siteById = useMemo(
    () => new Map((sitesData ?? []).map((s) => [s.id, s])),
    [sitesData]
  );

  const { data, isLoading } = trpc.attendance.getDailyStatesForRange.useQuery(
    { startDate, endDate, siteId: siteIdParam },
    {
      enabled: companyId != null && !rangeInvalid,
      staleTime: 30_000,
    }
  );

  const allRows = (data?.rows ?? []) as EnrichedRow[];

  // ── Client-side filtering ─────────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    return allRows.filter((row) => {
      if (
        employeeSearch.trim() &&
        !(row.employeeName ?? "")
          .toLowerCase()
          .includes(employeeSearch.trim().toLowerCase())
      ) {
        return false;
      }
      return matchesStatusFilter(row, statusFilter);
    });
  }, [allRows, employeeSearch, statusFilter]);

  // ── Summary counts (from filtered rows) ────────────────────────────────────

  const summary = useMemo(() => {
    let present = 0,
      late = 0,
      absent = 0,
      missingCheckout = 0,
      payrollBlocked = 0,
      needsReview = 0,
      ready = 0,
      approved = 0,
      rejected = 0,
      pendingApproval = 0,
      notSubmitted = 0;

    for (const row of filteredRows) {
      const s = row.canonicalStatus;
      const p = row.payrollReadiness;

      if (
        s === "checked_in_on_time" ||
        s === "checked_in_late" ||
        s === "checked_out"
      )
        present++;
      if (s === "checked_in_late" || s === "late_no_arrival") late++;
      if (
        s === "absent_confirmed" ||
        s === "absent_pending" ||
        s === "late_no_arrival"
      )
        absent++;
      if (p === "blocked_missing_checkout") missingCheckout++;
      if (p.startsWith("blocked_")) payrollBlocked++;
      if (s === "needs_review" || p === "needs_review") needsReview++;
      if (p === "ready" || p === "excluded") ready++;

      const as_ = row.clientApprovalStatus;
      if (as_ === "approved") approved++;
      else if (as_ === "rejected") rejected++;
      else if (as_ === "pending" || as_ === "disputed") pendingApproval++;
      else notSubmitted++;
    }

    return {
      present,
      late,
      absent,
      missingCheckout,
      payrollBlocked,
      needsReview,
      ready,
      approved,
      rejected,
      pendingApproval,
      notSubmitted,
    };
  }, [filteredRows]);

  // ── Selected site name ────────────────────────────────────────────────────

  const selectedSiteName = useMemo(() => {
    if (siteIdParam == null) return null;
    return siteById.get(siteIdParam)?.name ?? null;
  }, [siteIdParam, siteById]);

  // ── Excel export ───────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Attendance Sheet");

      const generatedAt = new Date().toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Muscat",
      });

      const dateRangeLabel =
        startDate === endDate
          ? startDate
          : `${startDate} – ${endDate}`;

      ws.addRow([t("attendance.clientSheet.excelHeader.title")]);
      ws.addRow([
        `${t("attendance.clientSheet.excelHeader.dateRange")}: ${dateRangeLabel}`,
      ]);
      ws.addRow([
        `${t("attendance.clientSheet.excelHeader.site")}: ${selectedSiteName ?? t("attendance.clientSheet.filters.allSites")}`,
      ]);
      ws.addRow([
        `${t("attendance.clientSheet.excelHeader.generatedAt")}: ${generatedAt}`,
      ]);
      ws.addRow([]);

      ws.columns = [
        { key: "employee", width: 28 },
        { key: "site", width: 22 },
        { key: "date", width: 14 },
        { key: "day", width: 8 },
        { key: "shiftStart", width: 12 },
        { key: "shiftEnd", width: 12 },
        { key: "checkIn", width: 12 },
        { key: "checkOut", width: 12 },
        { key: "workedHours", width: 14 },
        { key: "status", width: 22 },
        { key: "payroll", width: 22 },
        { key: "approvalStatus", width: 20 },
        { key: "comment", width: 30 },
      ];

      const headerRow = ws.addRow([
        t("attendance.clientSheet.table.employee"),
        t("attendance.clientSheet.table.site"),
        t("attendance.clientSheet.table.date"),
        t("attendance.clientSheet.table.day"),
        t("attendance.clientSheet.table.shiftStart"),
        t("attendance.clientSheet.table.shiftEnd"),
        t("attendance.clientSheet.table.checkIn"),
        t("attendance.clientSheet.table.checkOut"),
        t("attendance.clientSheet.table.workedHours"),
        t("attendance.clientSheet.table.status"),
        t("attendance.clientSheet.table.payroll"),
        t("attendance.clientSheet.table.approvalStatus"),
        t("attendance.clientSheet.table.comment"),
      ]);
      headerRow.font = { bold: true };

      for (const row of filteredRows) {
        const siteName =
          row.siteId != null
            ? (siteById.get(row.siteId)?.name ?? String(row.siteId))
            : "—";
        ws.addRow({
          employee: row.employeeName ?? "—",
          site: siteName,
          date: row.attendanceDate,
          day: getDayShort(row.attendanceDate),
          shiftStart: row.shiftStartAt ?? "—",
          shiftEnd: row.shiftEndAt ?? "—",
          checkIn: row.checkInAt ? fmtTime(row.checkInAt) : "—",
          checkOut: row.checkOutAt ? fmtTime(row.checkOutAt) : "—",
          workedHours: row.checkInAt
            ? row.checkOutAt
              ? calcWorkedHoursDecimal(row.checkInAt, row.checkOutAt)
              : t("attendance.clientSheet.workedHours.open")
            : "—",
          status: t(`attendance.clientSheet.statusLabel.${row.canonicalStatus}`),
          payroll: t(
            `attendance.clientSheet.payrollLabel.${row.payrollReadiness}`
          ),
          approvalStatus: t(
            `attendance.clientSheet.approvalStatus.${row.clientApprovalStatus}`
          ),
          comment: row.clientApprovalComment ?? "—",
        });
      }

      const safeSite = selectedSiteName
        ? `-${selectedSiteName.replace(/\s+/g, "-")}`
        : "";
      const filename =
        startDate === endDate
          ? `client-attendance-sheet${safeSite}-${startDate}.xlsx`
          : `client-attendance-sheet${safeSite}-${startDate}-to-${endDate}.xlsx`;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t("attendance.clientSheet.exportSuccess"));
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : t("attendance.clientSheet.exportFailed")
      );
    } finally {
      setExporting(false);
    }
  }, [startDate, endDate, filteredRows, siteById, selectedSiteName, t]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Quick filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Calendar size={14} className="text-muted-foreground" />
        {(["today", "thisWeek", "thisMonth", "custom"] as QuickFilter[]).map(
          (qf) => (
            <Button
              key={qf}
              variant={quickFilter === qf ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => applyQuickFilter(qf)}
            >
              {t(`attendance.clientSheet.quickFilters.${qf}`)}
            </Button>
          )
        )}
      </div>

      {/* Date range + other filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">
            {t("attendance.clientSheet.filters.startDate")}
          </label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="w-40 h-9 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">
            {t("attendance.clientSheet.filters.endDate")}
          </label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="w-40 h-9 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">
            {t("attendance.clientSheet.filters.site")}
          </label>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("attendance.clientSheet.filters.allSites")}
              </SelectItem>
              {activeSites.map((site) => (
                <SelectItem key={site.id} value={String(site.id)}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">
            {t("attendance.clientSheet.filters.employee")}
          </label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={t(
                "attendance.clientSheet.filters.employeePlaceholder"
              )}
              className="pl-8 w-48 h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">
            {t("attendance.clientSheet.filters.status")}
          </label>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                [
                  "all",
                  "checkedIn",
                  "checkedOut",
                  "late",
                  "absent",
                  "needsReview",
                  "payrollBlocked",
                ] as StatusFilter[]
              ).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {t(`attendance.clientSheet.statusFilter.${opt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporting || filteredRows.length === 0}
            className="h-9 gap-2"
          >
            <Download size={14} />
            {exporting
              ? t("attendance.clientSheet.exporting")
              : t("attendance.clientSheet.exportExcel")}
          </Button>
        </div>
      </div>

      {/* Range validation error */}
      {rangeInvalid && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-3 px-4 text-sm text-red-700">
            {rangeDays < 0
              ? t("attendance.clientSheet.rangeEndBeforeStart")
              : t("attendance.clientSheet.rangeTooLarge", {
                  max: MAX_RANGE_DAYS + 1,
                })}
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      {!isLoading && !rangeInvalid && filteredRows.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.total")}
            value={filteredRows.length}
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.present")}
            value={summary.present}
            accent="text-green-700"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.late")}
            value={summary.late}
            accent="text-amber-600"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.absent")}
            value={summary.absent}
            accent="text-red-600"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.missingCheckout")}
            value={summary.missingCheckout}
            accent="text-red-500"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.payrollBlocked")}
            value={summary.payrollBlocked}
            accent="text-red-700"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.needsReview")}
            value={summary.needsReview}
            accent="text-purple-700"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.ready")}
            value={summary.ready}
            accent="text-green-600"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.approved")}
            value={summary.approved}
            accent="text-green-700"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.rejected")}
            value={summary.rejected}
            accent="text-red-700"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.pendingApproval")}
            value={summary.pendingApproval}
            accent="text-blue-600"
          />
          <SummaryCard
            label={t("attendance.clientSheet.summaryCards.notSubmitted")}
            value={summary.notSubmitted}
            accent="text-gray-500"
          />
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("attendance.clientSheet.loadingRange")}
          </CardContent>
        </Card>
      ) : rangeInvalid ? null : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <AlertCircle
              size={36}
              className="mx-auto text-muted-foreground opacity-40"
            />
            <p className="text-sm font-medium text-muted-foreground">
              {t("attendance.clientSheet.emptyState")}
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {t("attendance.clientSheet.emptyStateHint")}
            </p>
            <Link
              href="/hr/attendance/setup-health"
              className="inline-flex items-center gap-1.5 text-xs text-[var(--smartpro-orange)] hover:underline font-medium"
            >
              <FileText size={13} />
              {t("attendance.clientSheet.emptyStateLink")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                {[
                  "employee",
                  "site",
                  "date",
                  "day",
                  "shiftStart",
                  "shiftEnd",
                  "checkIn",
                  "checkOut",
                  "workedHours",
                  "status",
                  "payroll",
                  "approvalStatus",
                  "comment",
                ].map((col) => (
                  <th
                    key={col}
                    className="text-left py-2.5 px-3 font-medium whitespace-nowrap first:px-4"
                  >
                    {t(`attendance.clientSheet.table.${col}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const siteName =
                  row.siteId != null
                    ? (siteById.get(row.siteId)?.name ?? String(row.siteId))
                    : "—";
                const worked = calcWorkedHours(row.checkInAt, row.checkOutAt, t);
                const isOpen = row.checkInAt != null && row.checkOutAt == null;

                return (
                  <tr
                    key={`${row.employeeId}-${row.attendanceDate}`}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium whitespace-nowrap">
                      {row.employeeName ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                      {siteName}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums whitespace-nowrap">
                      {row.attendanceDate}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {getDayShort(row.attendanceDate)}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {row.shiftStartAt ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {row.shiftEndAt ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {row.checkInAt ? fmtTime(row.checkInAt) : "—"}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      {row.checkOutAt ? fmtTime(row.checkOutAt) : "—"}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums">
                      <span
                        className={
                          isOpen ? "text-amber-600 font-medium" : undefined
                        }
                      >
                        {worked}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(row.canonicalStatus)}`}
                      >
                        {t(
                          `attendance.clientSheet.statusLabel.${row.canonicalStatus}`
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${payrollBadgeClass(row.payrollReadiness)}`}
                      >
                        {t(
                          `attendance.clientSheet.payrollLabel.${row.payrollReadiness}`
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${approvalBadgeClass(row.clientApprovalStatus)}`}
                      >
                        {t(
                          `attendance.clientSheet.approvalStatus.${row.clientApprovalStatus}`
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs max-w-[160px] truncate">
                      {row.clientApprovalComment ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
