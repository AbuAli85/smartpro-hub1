import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";
import { fmtTime } from "@/lib/dateUtils";
import type { Capabilities } from "@/hooks/useMyCapabilities";
import type { AttendanceActionQueueCtaTarget, AttendanceActionQueueCategory } from "@shared/attendanceActionQueue";
import { buildAttendanceDailyDigest, type AttendanceDailyDigest } from "@shared/attendanceDailyDigest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Users, CheckCircle2, LogOut, Clock, AlertCircle,
  XCircle, ShieldAlert, Eye, Search, RefreshCw,
  ArrowRight, Calendar, MapPin, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CTA_TARGET_TO_TAB: Record<AttendanceActionQueueCtaTarget, string> = {
  live_today: "today",
  hr_records: "records",
  site_punches: "site-punches",
  corrections: "corrections",
  manual_checkins: "manual",
  audit_log: "audit",
};

const RISK_BADGE: Record<string, string> = {
  none: "border-border bg-muted/50 text-muted-foreground",
  low: "border-slate-300 bg-slate-50 text-slate-700",
  medium: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200",
  high: "border-orange-300 bg-orange-50 text-orange-800 dark:bg-orange-950/25 dark:text-orange-200",
  critical: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200",
};

const PAYROLL_BADGE: Record<string, string> = {
  ready: "border-emerald-300 bg-emerald-50 text-emerald-800",
  needs_review: "border-amber-300 bg-amber-50 text-amber-900",
  excluded: "border-slate-300 bg-slate-50 text-slate-600",
  blocked_missing_checkout: "border-red-300 bg-red-50 text-red-800",
  blocked_pending_correction: "border-red-300 bg-red-50 text-red-800",
  blocked_pending_manual_checkin: "border-red-300 bg-red-50 text-red-800",
  blocked_schedule_conflict: "border-red-300 bg-red-50 text-red-800",
};

// ---------------------------------------------------------------------------
// Severity styles for digest panel
// ---------------------------------------------------------------------------

const DIGEST_SEVERITY_CARD: Record<string, string> = {
  normal: "border-border bg-muted/30",
  attention: "border-amber-300 bg-amber-50 dark:bg-amber-950/20",
  critical: "border-red-400 bg-red-50 dark:bg-red-950/20",
};

const DIGEST_SEVERITY_BADGE: Record<string, string> = {
  normal: "border-border text-muted-foreground",
  attention: "border-amber-400 bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  critical: "border-red-400 bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
};

const DIGEST_ISSUE_BADGE: Record<string, string> = {
  critical: "border-red-300 bg-red-50 text-red-800",
  high: "border-orange-300 bg-orange-50 text-orange-800",
  medium: "border-amber-300 bg-amber-50 text-amber-900",
  low: "border-slate-300 bg-slate-50 text-slate-600",
};

// ---------------------------------------------------------------------------
// DigestPanel — compact daily digest card
// ---------------------------------------------------------------------------

function DigestPanel({ digest }: { digest: AttendanceDailyDigest }) {
  const { t } = useTranslation("hr");
  const { severity, totals, topIssues } = digest;
  const isCritical = severity === "critical";

  return (
    <Card
      className={cn("border", DIGEST_SEVERITY_CARD[severity])}
      data-testid="digest-panel"
    >
      <CardContent className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {/* Left: icon + headline + summary */}
          <div className="flex items-start gap-2 min-w-0">
            <Activity
              className={cn(
                "h-4 w-4 mt-0.5 shrink-0",
                isCritical ? "text-red-600" : severity === "attention" ? "text-amber-600" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold leading-tight">
                  {t("attendance.dailyDigest.title")}
                </span>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] h-4 px-1", DIGEST_SEVERITY_BADGE[severity])}
                  data-testid="digest-severity-badge"
                >
                  {t(`attendance.dailyDigest.severity.${severity}`)}
                </Badge>
              </div>
              <p className="text-xs font-medium leading-tight" data-testid="digest-headline">
                {t(digest.headlineKey)}
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight" data-testid="digest-summary-line">
                {t(digest.summaryLineKey)}
              </p>
            </div>
          </div>

          {/* Right: key metrics */}
          <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
            {totals.payrollBlocked > 0 && (
              <div className="flex items-center gap-1 text-red-700 dark:text-red-400" data-testid="digest-payroll-blocked">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span className="font-semibold">{totals.payrollBlocked}</span>
                <span className="text-muted-foreground">{t("attendance.dailyDigest.payrollBlocked")}</span>
              </div>
            )}
            {totals.employeesAffected > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground" data-testid="digest-employees-affected">
                <Users className="h-3.5 w-3.5" />
                <span className="font-semibold text-foreground">{totals.employeesAffected}</span>
                <span>{t("attendance.dailyDigest.employeesAffected")}</span>
              </div>
            )}
          </div>
        </div>

        {/* Top issues (up to 3) */}
        {topIssues.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              {t("attendance.dailyDigest.topIssues")}
            </p>
            <div className="flex flex-wrap gap-1.5" data-testid="digest-top-issues">
              {topIssues.slice(0, 3).map((issue) => (
                <div
                  key={issue.category}
                  className={cn(
                    "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
                    DIGEST_ISSUE_BADGE[issue.severity] ?? DIGEST_ISSUE_BADGE.low,
                  )}
                  data-testid="digest-issue-chip"
                >
                  <span className="font-medium">
                    {t(`attendance.actionQueue.categories.${issue.category}`)}
                  </span>
                  <span className="opacity-70">×{issue.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No issues */}
        {topIssues.length === 0 && severity === "normal" && (
          <p className="mt-1 text-[11px] text-muted-foreground" data-testid="digest-no-issues">
            {t("attendance.dailyDigest.noIssues")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Capability helper
// ---------------------------------------------------------------------------

function canActOnCategory(category: AttendanceActionQueueCategory, caps: Partial<Capabilities>): boolean {
  switch (category) {
    case "pending_manual_checkin": return caps.canApproveManualCheckIns === true;
    case "pending_correction":     return caps.canApproveAttendanceCorrections === true;
    case "missing_checkout":       return caps.canForceCheckout === true;
    default:                       return caps.canViewAttendanceBoard === true;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyAttendanceCockpit({
  companyId,
  caps,
  onTabNavigate,
}: {
  companyId: number | null | undefined;
  caps: Partial<Capabilities>;
  onTabNavigate?: (tab: string) => void;
}) {
  const { t } = useTranslation("hr");

  const [date, setDate] = useState(() => muscatCalendarYmdNow());
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [needsActionOnly, setNeedsActionOnly] = useState(false);

  // ── Site list for the filter drop-down ──────────────────────────────────────
  const { data: sitesData } = trpc.attendance.listSites.useQuery(
    { companyId: companyId ?? undefined },
    { enabled: companyId != null, staleTime: 60_000 },
  );
  const activeSites = useMemo(
    () => (sitesData ?? []).filter((s) => s.isActive),
    [sitesData],
  );
  const siteById = useMemo(
    () => new Map((sitesData ?? []).map((s) => [s.id, s])),
    [sitesData],
  );

  // ── Daily state query ────────────────────────────────────────────────────────
  const siteIdParam = siteFilter !== "all" ? parseInt(siteFilter, 10) : undefined;

  const { data, isLoading, isFetching, refetch } = trpc.attendance.getDailyStates.useQuery(
    { date, siteId: siteIdParam },
    { enabled: companyId != null, refetchInterval: 60_000, staleTime: 30_000 },
  );

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  // ── Daily digest (pure, derived from existing rows — no extra server call) ────
  const digest = useMemo(() => {
    if (!data?.rows || data.rows.length === 0) return null;
    return buildAttendanceDailyDigest(data.rows, {
      date,
      siteId: siteIdParam != null ? String(siteIdParam) : null,
      siteNameMap: siteById.size > 0
        ? new Map([...siteById.entries()].map(([id, s]) => [id, s.name]))
        : undefined,
    });
  }, [data?.rows, date, siteIdParam, siteById]);

  // ── Client-side derived counts ───────────────────────────────────────────────
  const counts = useMemo(() => {
    let checkedIn = 0, checkedOut = 0, late = 0, missingCheckout = 0, absent = 0;
    for (const row of rows) {
      const s = row.canonicalStatus;
      if (s === "checked_in_on_time" || s === "checked_in_late") checkedIn++;
      if (s === "checked_out") checkedOut++;
      if (s === "checked_in_late" || s === "late_no_arrival") late++;
      if (row.payrollReadiness === "blocked_missing_checkout") missingCheckout++;
      if (s === "absent_confirmed" || s === "absent_pending" || s === "late_no_arrival") absent++;
    }
    return { checkedIn, checkedOut, late, missingCheckout, absent };
  }, [rows]);

  // ── All action items (flat across employees) ─────────────────────────────────
  const allActionItems = useMemo(
    () => rows.flatMap((row) => row.actionItems.map((item) => ({ item, row }))),
    [rows],
  );

  // ── Filtered rows (employee search + needs-action toggle) ────────────────────
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (needsActionOnly && row.actionItems.length === 0) return false;
      if (employeeSearch) {
        const q = employeeSearch.toLowerCase();
        if (!(row.employeeName ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, needsActionOnly, employeeSearch]);

  // ── Site breakdown ───────────────────────────────────────────────────────────
  const siteBreakdown = useMemo(() => {
    const byId = new Map<number | null, {
      siteName: string;
      scheduled: number;
      checkedIn: number;
      absent: number;
      blocked: number;
      needsReview: number;
    }>();

    for (const row of rows) {
      const sid = row.siteId ?? null;
      if (!byId.has(sid)) {
        byId.set(sid, {
          siteName: sid
            ? (siteById.get(sid)?.name ?? `Site #${sid}`)
            : t("attendance.cockpit.siteBreakdown.noSite"),
          scheduled: 0, checkedIn: 0, absent: 0, blocked: 0, needsReview: 0,
        });
      }
      const entry = byId.get(sid)!;
      if (row.scheduleState !== "not_scheduled" && row.scheduleState !== "inactive_employee") entry.scheduled++;
      const s = row.canonicalStatus;
      if (s === "checked_in_on_time" || s === "checked_in_late" || s === "checked_out") entry.checkedIn++;
      if (s === "absent_confirmed" || s === "absent_pending" || s === "late_no_arrival") entry.absent++;
      if (row.payrollReadiness.startsWith("blocked_")) entry.blocked++;
      if (row.payrollReadiness === "needs_review") entry.needsReview++;
    }
    return Array.from(byId.values()).sort((a, b) => b.scheduled - a.scheduled);
  }, [rows, siteById, t]);

  const showEmpty = !isLoading && rows.length === 0;

  // ── Summary card config ──────────────────────────────────────────────────────
  const summaryCards = [
    {
      key: "scheduled",
      value: summary?.scheduled ?? 0,
      icon: <Calendar className="h-3.5 w-3.5" />,
      color: "text-slate-600 bg-slate-50",
    },
    {
      key: "checkedIn",
      value: counts.checkedIn,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      key: "checkedOut",
      value: counts.checkedOut,
      icon: <LogOut className="h-3.5 w-3.5" />,
      color: "text-blue-600 bg-blue-50",
    },
    {
      key: "late",
      value: counts.late,
      icon: <Clock className="h-3.5 w-3.5" />,
      color: counts.late > 0 ? "text-amber-600 bg-amber-50" : "text-muted-foreground bg-muted/40",
    },
    {
      key: "missingCheckout",
      value: counts.missingCheckout,
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      color: counts.missingCheckout > 0 ? "text-orange-600 bg-orange-50" : "text-muted-foreground bg-muted/40",
    },
    {
      key: "absentNoArrival",
      value: counts.absent,
      icon: <XCircle className="h-3.5 w-3.5" />,
      color: counts.absent > 0 ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted/40",
    },
    {
      key: "payrollBlocked",
      value: summary?.blocked ?? 0,
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      color: (summary?.blocked ?? 0) > 0 ? "text-red-600 bg-red-50" : "text-muted-foreground bg-muted/40",
    },
    {
      key: "needsReview",
      value: summary?.needsReview ?? 0,
      icon: <Eye className="h-3.5 w-3.5" />,
      color: (summary?.needsReview ?? 0) > 0 ? "text-amber-600 bg-amber-50" : "text-muted-foreground bg-muted/40",
    },
    {
      key: "ready",
      value: summary?.ready ?? 0,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      color: "text-emerald-600 bg-emerald-50",
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" data-testid="daily-attendance-cockpit">
      {/* Controls bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.cockpit.controls.dateLabel")}</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 text-sm w-[150px]"
          />
        </div>
        {activeSites.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("attendance.cockpit.controls.siteLabel")}</Label>
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="h-8 text-sm w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("attendance.cockpit.controls.allSites")}</SelectItem>
                {activeSites.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("attendance.cockpit.controls.searchLabel")}</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={t("attendance.cockpit.controls.searchPlaceholder")}
              className="h-8 text-sm pl-7 w-[200px]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pb-0.5">
          <Switch
            id="cockpit-needs-action"
            checked={needsActionOnly}
            onCheckedChange={setNeedsActionOnly}
          />
          <Label htmlFor="cockpit-needs-action" className="text-xs cursor-pointer select-none">
            {t("attendance.cockpit.controls.needsActionOnly")}
          </Label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 mb-0.5"
          disabled={isFetching || companyId == null}
          onClick={() => void refetch()}
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Daily Digest panel */}
      {!isLoading && !showEmpty && digest && (
        <DigestPanel digest={digest} />
      )}

      {/* Summary cards */}
      {!showEmpty && (
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2" data-testid="cockpit-summary">
          {summaryCards.map((card) => (
            <Card key={card.key} className="min-w-0">
              <CardContent className="p-2.5 flex flex-col gap-1">
                <div className={cn("w-6 h-6 rounded flex items-center justify-center shrink-0", card.color)}>
                  {card.icon}
                </div>
                <p className="text-lg font-bold leading-none" data-testid={`cockpit-count-${card.key}`}>
                  {isLoading ? "—" : card.value}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {t(`attendance.cockpit.summary.${card.key}`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">{t("attendance.cockpit.emptyState.loading")}</span>
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="text-center py-10 text-muted-foreground" data-testid="cockpit-empty">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="font-medium">
            {t("attendance.cockpit.emptyState.noData", { date })}
          </p>
          <p className="text-sm mt-1">{t("attendance.cockpit.emptyState.noSchedulesHint")}</p>
        </div>
      )}

      {/* Needs Action list */}
      {!isLoading && allActionItems.length > 0 && (
        <Card data-testid="cockpit-action-list">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              {t("attendance.cockpit.actionList.title")}
              <Badge variant="outline" className="ml-auto text-xs">
                {allActionItems.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="divide-y">
              {allActionItems.map(({ item, row }, idx) => {
                const site = row.siteId != null ? siteById.get(row.siteId) : undefined;
                const canAct = canActOnCategory(item.category, caps);
                const tab = item.ctaTarget ? CTA_TARGET_TO_TAB[item.ctaTarget] : null;
                return (
                  <div
                    key={`${item.employeeId ?? 0}-${item.category}-${idx}`}
                    className="py-2.5 flex items-start justify-between gap-3"
                    data-testid="cockpit-action-item"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] h-5 px-1.5", RISK_BADGE[item.riskLevel])}
                        >
                          {t(`attendance.riskLevel.${item.riskLevel}`)}
                        </Badge>
                        {item.isPayrollBlocking && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 border-red-300 bg-red-50 text-red-700"
                          >
                            {t("attendance.cockpit.actionList.payrollBlocking")}
                          </Badge>
                        )}
                        <span className="text-sm font-medium">
                          {item.employeeName ?? `Employee #${item.employeeId}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {t(`attendance.actionQueue.categories.${item.category}`)}
                        </span>
                        {site && (
                          <span className="flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />{site.name}
                          </span>
                        )}
                        {row.shiftStartAt && row.shiftEndAt && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />{row.shiftStartAt}–{row.shiftEndAt}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(`attendance.actionQueue.descriptions.${item.category}`)}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">
                      {canAct && tab ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => onTabNavigate?.(tab)}
                          data-testid="cockpit-action-cta"
                        >
                          {t("attendance.cockpit.actionList.cta")}
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      ) : (
                        <span
                          className="text-[10px] text-muted-foreground max-w-[110px] text-right leading-tight block"
                          data-testid="cockpit-no-permission"
                        >
                          {t("attendance.cockpit.actionList.noPermission")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee table */}
      {!isLoading && filteredRows.length > 0 && (
        <Card data-testid="cockpit-table">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t("attendance.cockpit.table.title")}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                {filteredRows.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 px-4 font-medium">{t("attendance.cockpit.table.employee")}</th>
                    <th className="text-left py-2 px-3 font-medium">{t("attendance.cockpit.table.site")}</th>
                    <th className="text-left py-2 px-3 font-medium">{t("attendance.cockpit.table.shift")}</th>
                    <th className="text-left py-2 px-3 font-medium">{t("attendance.cockpit.table.status")}</th>
                    <th className="text-left py-2 px-3 font-medium">{t("attendance.cockpit.table.checkIn")}</th>
                    <th className="text-left py-2 px-3 font-medium">{t("attendance.cockpit.table.checkOut")}</th>
                    <th className="text-left py-2 px-3 font-medium">{t("attendance.cockpit.table.risk")}</th>
                    <th className="text-left py-2 px-3 font-medium">{t("attendance.cockpit.table.payroll")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const site = row.siteId != null ? siteById.get(row.siteId) : undefined;
                    return (
                      <tr
                        key={row.employeeId}
                        className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        data-testid="cockpit-table-row"
                      >
                        <td className="py-2 px-4 font-medium">
                          {row.employeeName ?? `Employee #${row.employeeId}`}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {site?.name ?? (row.siteId != null ? `Site #${row.siteId}` : "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {row.shiftStartAt && row.shiftEndAt
                            ? `${row.shiftStartAt}–${row.shiftEndAt}`
                            : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                            {t(`attendance.canonicalStatus.${row.canonicalStatus}`)}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {row.checkInAt ? fmtTime(row.checkInAt) : "—"}
                        </td>
                        <td className="py-2 px-3 text-xs text-muted-foreground">
                          {row.checkOutAt ? fmtTime(row.checkOutAt) : "—"}
                        </td>
                        <td className="py-2 px-3">
                          {row.riskLevel !== "none" ? (
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] h-5 px-1.5", RISK_BADGE[row.riskLevel])}
                            >
                              {t(`attendance.riskLevel.${row.riskLevel}`)}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] h-5 px-1.5",
                              PAYROLL_BADGE[row.payrollReadiness] ?? "",
                            )}
                          >
                            {t(`attendance.payrollReadiness.${row.payrollReadiness}`)}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Site breakdown — only shown when more than one site is present */}
      {!isLoading && siteBreakdown.length > 1 && (
        <Card data-testid="cockpit-site-breakdown">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {t("attendance.cockpit.siteBreakdown.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 px-4 font-medium">{t("attendance.cockpit.siteBreakdown.siteName")}</th>
                    <th className="text-center py-2 px-3 font-medium">{t("attendance.cockpit.siteBreakdown.scheduled")}</th>
                    <th className="text-center py-2 px-3 font-medium">{t("attendance.cockpit.siteBreakdown.checkedIn")}</th>
                    <th className="text-center py-2 px-3 font-medium">{t("attendance.cockpit.siteBreakdown.absent")}</th>
                    <th className="text-center py-2 px-3 font-medium">{t("attendance.cockpit.siteBreakdown.blocked")}</th>
                    <th className="text-center py-2 px-3 font-medium">{t("attendance.cockpit.siteBreakdown.needsReview")}</th>
                  </tr>
                </thead>
                <tbody>
                  {siteBreakdown.map((entry, idx) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-4 font-medium">{entry.siteName}</td>
                      <td className="py-2 px-3 text-center">{entry.scheduled}</td>
                      <td className="py-2 px-3 text-center text-emerald-600 font-medium">{entry.checkedIn}</td>
                      <td className="py-2 px-3 text-center">
                        {entry.absent > 0
                          ? <span className="text-red-600 font-medium">{entry.absent}</span>
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {entry.blocked > 0
                          ? <span className="text-red-600 font-medium">{entry.blocked}</span>
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {entry.needsReview > 0
                          ? <span className="text-amber-600 font-medium">{entry.needsReview}</span>
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
