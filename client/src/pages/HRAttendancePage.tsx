import { lazy, Suspense, useState, useMemo, useCallback } from "react";
import { useLocation, Switch, Route, Redirect, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { AttendanceActionQueue } from "@/components/attendance/AttendanceActionQueue";
import { AttendanceSetupHealthBanner } from "@/components/attendance/AttendanceSetupHealthBanner";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";
import {
  Clock, Users, AlertCircle,
  CalendarDays, ScrollText, MapPin, ClipboardList,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DateInput } from "@/components/ui/date-input";
import {
  ATTENDANCE_AUDIT_SOURCE,
} from "@shared/attendanceAuditTaxonomy";
import { getAdminBoardRowStatusPresentation } from "@/lib/adminBoardRowStatus";
import {
  buildOperationalActionQueue,
  collectOperationalIssueKeysForQueue,
  filterOperationalQueueItems,
  ATTENDANCE_ACTION,
  type AttendanceActionId,
  type OperationalExceptionItem,
  type OperationalIssueLite,
  type OperationalQueueFilter,
} from "@shared/attendanceIntelligence";
import { muscatCalendarYmdFromUtcInstant, muscatCalendarYmdNow } from "@shared/attendanceMuscatTime";
import { isWeakAuditReason } from "@shared/attendanceManualValidation";
import { DUPLICATE_MANUAL_ATTENDANCE, INVALID_ATTENDANCE_TIME_RANGE, WEAK_AUDIT_REASON } from "@shared/attendanceTrpcReasons";
import { useAttendanceOperationalMutations } from "@/hooks/useAttendanceOperationalMutations";
import { useMyCapabilities } from "@/hooks/useMyCapabilities";
import { useAuth } from "@/_core/hooks/useAuth";
import { buildAttendanceActionItems, sortAttendanceActionItems } from "@shared/attendanceActionQueue";
import type {
  AttendanceActionQueueCtaTarget,
  AttendanceActionQueueItem,
} from "@shared/attendanceActionQueue";
import { DailyAttendanceCockpit } from "@/components/attendance/DailyAttendanceCockpit";

// Lazy-loaded sub-pages — each brings its own queries, so only the active tab loads data
const HRAttendanceTodayPage = lazy(() => import("./HRAttendanceTodayPage"));
const HRAttendanceCorrectionsPage = lazy(() => import("./HRAttendanceCorrectionsPage"));
const HRAttendanceManualsPage = lazy(() => import("./HRAttendanceManualsPage"));
const HRAttendanceSitePunchesPage = lazy(() => import("./HRAttendanceSitePunchesPage"));
const HRAttendanceAuditPage = lazy(() => import("./HRAttendanceAuditPage"));
const HRAttendanceRecordsPage = lazy(() => import("./HRAttendanceRecordsPage"));

const CTA_TARGET_TO_TAB: Record<AttendanceActionQueueCtaTarget, string> = {
  live_today:     "today",
  hr_records:     "records",
  site_punches:   "site-punches",
  corrections:    "corrections",
  manual_checkins:"manual",
  audit_log:      "audit",
};

// ---------------------------------------------------------------------------
// ClockInDialog — HR-initiated attendance entry, shown in page header
// ---------------------------------------------------------------------------

type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "remote";

function ClockInDialog({ employees, onSuccess, companyId }: {
  employees: { id: number; firstName: string; lastName: string; department: string | null }[];
  onSuccess: () => void;
  companyId?: number | null;
}) {
  const { t } = useTranslation("hr");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    status: "present" as AttendanceStatus,
    notes: "",
    date: muscatCalendarYmdNow(),
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const reasonTrimmed = form.notes.trim();
  const reasonOk = reasonTrimmed.length >= 10;
  const reasonWeak = reasonOk && isWeakAuditReason(reasonTrimmed);
  const canSubmit = !!form.employeeId && reasonOk && !reasonWeak;

  const utils = trpc.useUtils();
  const createMutation = trpc.hr.createAttendance.useMutation({
    onSuccess: () => {
      toast.success(t("attendance.clockInDialog.recorded"));
      setOpen(false);
      setServerError(null);
      utils.hr.listAttendance.invalidate();
      utils.hr.attendanceStats.invalidate();
      void utils.attendance.listAttendanceAudit.invalidate();
      void utils.scheduling.getTodayBoard.invalidate();
      void utils.scheduling.getOverdueCheckouts.invalidate();
      onSuccess();
    },
    onError: (e) => {
      const reason = (e.data as { reason?: string } | undefined)?.reason;
      if (reason === DUPLICATE_MANUAL_ATTENDANCE) {
        setServerError(t("attendance.clockInDialog.duplicateError"));
        toast.error(t("attendance.clockInDialog.duplicateError"));
      } else if (reason === WEAK_AUDIT_REASON) {
        setServerError(t("attendance.clockInDialog.weakReasonHint"));
        toast.error(t("attendance.clockInDialog.weakReasonHint"));
      } else if (reason === INVALID_ATTENDANCE_TIME_RANGE) {
        setServerError(t("attendance.clockInDialog.invalidTimeRange"));
        toast.error(t("attendance.clockInDialog.invalidTimeRange"));
      } else {
        setServerError(e.message);
        toast.error(e.message);
      }
    },
  });

  const noEligibleEmployees = employees.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setServerError(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" disabled={noEligibleEmployees} title={noEligibleEmployees ? t("attendance.clockInDialog.noEmployeesTooltip") : undefined}>
          <Clock size={14} /> {t("attendance.clockInDialog.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("attendance.clockInDialog.title")}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t("attendance.clockInDialog.description")}</p>
        </DialogHeader>
        {noEligibleEmployees ? (
          <div className="py-6 text-center space-y-2">
            <Users className="mx-auto h-8 w-8 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">{t("attendance.clockInDialog.noEmployeesHint")}</p>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>{t("attendance.clockInDialog.employeeLabel")}</Label>
              <Select value={form.employeeId} onValueChange={(v) => { setForm({ ...form, employeeId: v }); setServerError(null); }}>
                <SelectTrigger><SelectValue placeholder={t("attendance.clockInDialog.selectEmployee")} /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.firstName} {e.lastName}{e.department ? ` · ${e.department}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.clockInDialog.dateLabel")}</Label>
              <DateInput value={form.date} onChange={(e) => { setForm({ ...form, date: e.target.value }); setServerError(null); }} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.clockInDialog.statusLabel")}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AttendanceStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">{t("attendance.clockInDialog.present")}</SelectItem>
                  <SelectItem value="absent">{t("attendance.clockInDialog.absent")}</SelectItem>
                  <SelectItem value="late">{t("attendance.clockInDialog.late")}</SelectItem>
                  <SelectItem value="half_day">{t("attendance.clockInDialog.halfDay")}</SelectItem>
                  <SelectItem value="remote">{t("attendance.clockInDialog.remote")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("attendance.clockInDialog.reasonNote")}</Label>
              <Textarea
                placeholder={t("attendance.clockInDialog.reasonPlaceholder")}
                value={form.notes}
                onChange={(e) => { setForm({ ...form, notes: e.target.value }); setServerError(null); }}
                className="text-sm min-h-[88px]"
              />
              {reasonWeak && <p className="text-[11px] text-destructive">{t("attendance.clockInDialog.weakReasonHint")}</p>}
              {!reasonWeak && <p className="text-[11px] text-muted-foreground">{t("attendance.clockInDialog.reasonHint")}</p>}
            </div>
            <p className="text-[11px] text-amber-600">{t("attendance.clockInDialog.payrollReviewNote")}</p>
            {serverError && <p className="text-[12px] text-destructive">{serverError}</p>}
            <Button className="w-full" disabled={!canSubmit || createMutation.isPending}
              onClick={() => createMutation.mutate({ employeeId: Number(form.employeeId), status: form.status, notes: reasonTrimmed, date: form.date, companyId: companyId ?? undefined })}>
              {createMutation.isPending ? t("attendance.clockInDialog.recording") : t("attendance.clockInDialog.save")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Exception / signals strip
// ---------------------------------------------------------------------------

function HrAttendanceExceptionStrip({
  companyId, pendingCorrCount, pendingManualCount, scheduledShiftsToday,
  overdueCheckoutCount, missedShiftsCount, criticalExceptions, needsAttention,
}: {
  companyId: number | null;
  pendingCorrCount: number;
  pendingManualCount: number;
  scheduledShiftsToday: number | null;
  overdueCheckoutCount: number;
  missedShiftsCount: number;
  criticalExceptions: number | null;
  needsAttention: number | null;
}) {
  const { t } = useTranslation("hr");
  if (companyId == null) return null;
  const items = [
    { label: t("attendance.signals.criticalExceptions"), value: criticalExceptions, warn: (criticalExceptions ?? 0) > 0 },
    { label: t("attendance.signals.needsAttention"), value: needsAttention, warn: (needsAttention ?? 0) > 0 },
    { label: t("attendance.signals.pendingCorrections"), value: pendingCorrCount, warn: pendingCorrCount > 0 },
    { label: t("attendance.signals.pendingManualCheckins"), value: pendingManualCount, warn: pendingManualCount > 0 },
    { label: t("attendance.signals.openCheckouts"), value: overdueCheckoutCount, warn: overdueCheckoutCount > 0 },
    { label: t("attendance.signals.missedShifts"), value: missedShiftsCount, warn: missedShiftsCount > 0 },
    { label: t("attendance.signals.scheduledToday"), value: scheduledShiftsToday, warn: false },
  ];
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-3 sm:px-4">
      <p className="text-xs font-semibold text-foreground mb-2">{t("attendance.signals.workforceSignals")}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-2 text-xs">
        {items.map((it) => (
          <div key={it.label} className={`rounded-md border px-2 py-2 ${it.warn ? "border-amber-300/80 bg-amber-50/80 dark:bg-amber-950/20" : "border-border/80 bg-background/60"}`}>
            <p className="text-[11px] text-muted-foreground leading-tight">{it.label}</p>
            <p className="text-lg font-semibold tabular-nums mt-0.5">{it.value}</p>
          </div>
        ))}
      </div>
      {(criticalExceptions ?? 0) > 0 || (needsAttention ?? 0) > 0 || overdueCheckoutCount > 0 ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-2 leading-snug font-medium">
          Action needed &mdash; review the queue below and the Today tab for details.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
          Counts update every 60 seconds. Open the Today tab for per-employee details.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

export default function HRAttendancePage() {
  const { t } = useTranslation("hr");
  const { caps, loading: capsLoading } = useMyCapabilities();
  const [location, navigate] = useLocation();
  const activeTab = location.match(/^\/hr\/attendance\/(.+)$/)?.[1] ?? "today";

  const utils = trpc.useUtils();
  const { activeCompanyId } = useActiveCompany();
  const { forceCheckout, setIssueStatus, isPending: operationalPending } =
    useAttendanceOperationalMutations(activeCompanyId);
  const { user: authUser } = useAuth();

  // Triage dialog state
  const [forceDialogRecordId, setForceDialogRecordId] = useState<number | null>(null);
  const [forceDialogReason, setForceDialogReason] = useState("");
  const [triageAckItem, setTriageAckItem] = useState<OperationalExceptionItem | null>(null);
  const [triageAckNote, setTriageAckNote] = useState("");
  const [triageResolveItem, setTriageResolveItem] = useState<OperationalExceptionItem | null>(null);
  const [triageResolveNote, setTriageResolveNote] = useState("");
  const [triageAssignItem, setTriageAssignItem] = useState<OperationalExceptionItem | null>(null);
  const [triageAssignUserId, setTriageAssignUserId] = useState<string>("");
  const [triageAssignNote, setTriageAssignNote] = useState("");
  const [queueFilter, setQueueFilter] = useState<OperationalQueueFilter>("unresolved");

  // Shared queries (needed for header ClockInDialog + exception strip + action queue)
  const { data: employees, refetch: refetchEmployees } = trpc.hr.listEmployees.useQuery(
    { status: "active", companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null },
  );
  const { data: setupHealth } = trpc.attendance.getSetupHealth.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, staleTime: 60_000 },
  );
  const hasSetupIssues =
    (setupHealth?.employeesWithoutScheduleToday?.length ?? 0) > 0 ||
    (setupHealth?.employeesWithScheduleConflicts?.length ?? 0) > 0 ||
    (setupHealth?.employeesWithMissingShift?.length ?? 0) > 0 ||
    (setupHealth?.employeesWithMissingSite?.length ?? 0) > 0;

  const { data: companyMembers } = trpc.companies.members.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null && triageAssignItem != null },
  );
  const assignableCompanyMembers = useMemo(() => {
    const eligible = new Set(["company_admin", "hr_admin", "finance_admin", "reviewer"]);
    return (companyMembers ?? []).filter((m) => m.isActive !== false && eligible.has(m.role));
  }, [companyMembers]);

  const { data: todayBoardData } = trpc.scheduling.getTodayBoard.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, refetchInterval: 60_000 },
  );
  const { data: overdueCheckoutData } = trpc.scheduling.getOverdueCheckouts.useQuery(
    { companyId: activeCompanyId ?? undefined },
    { enabled: activeCompanyId != null, refetchInterval: 60_000 },
  );
  const overdueCheckoutCount = todayBoardData?.summary?.overdueOpenCheckoutCount ?? 0;

  const { data: pendingCorrections } = trpc.attendance.listCorrections.useQuery(
    { companyId: activeCompanyId ?? undefined, status: "pending", limit: 200 },
    { enabled: activeCompanyId != null },
  );
  const { data: pendingManual } = trpc.attendance.listManualCheckIns.useQuery(
    { companyId: activeCompanyId ?? undefined, status: "pending", limit: 200 },
    { enabled: activeCompanyId != null },
  );
  const pendingCorrCount = (pendingCorrections ?? []).length;
  const pendingManualCount = (pendingManual ?? []).length;
  const pendingCorrDot = pendingCorrCount > 0;
  const pendingManualDot = pendingManualCount > 0;

  const businessYmd = muscatCalendarYmdNow();

  const issueKeys = useMemo(
    () =>
      collectOperationalIssueKeysForQueue({
        businessDateYmd: businessYmd,
        boardRows: (todayBoardData?.board ?? []).map((b) => ({ status: b.status, scheduleId: b.scheduleId })),
        overdueCheckouts: (overdueCheckoutData?.overdueEmployees ?? []).map((o) => ({
          attendanceRecordId: o.attendanceRecordId,
        })),
        pendingCorrections: (pendingCorrections ?? []).map((r) => ({ id: r.correction.id })),
        pendingManual: (pendingManual ?? []).map((r) => ({ id: r.req.id })),
      }),
    [businessYmd, todayBoardData?.board, overdueCheckoutData?.overdueEmployees, pendingCorrections, pendingManual],
  );

  const { data: issueRows } = trpc.attendance.listOperationalIssuesByIssueKeys.useQuery(
    { companyId: activeCompanyId ?? undefined, issueKeys },
    { enabled: activeCompanyId != null && issueKeys.length > 0 },
  );

  const issuesByKey = useMemo(() => {
    const m: Record<string, OperationalIssueLite> = {};
    for (const r of issueRows ?? []) {
      m[r.issueKey] = {
        status: r.status,
        assignedToUserId: r.assignedToUserId,
        acknowledgedByUserId: r.acknowledgedByUserId,
        reviewedByUserId: r.reviewedByUserId,
        reviewedAt: r.reviewedAt,
        resolutionNote: r.resolutionNote,
      };
    }
    return m;
  }, [issueRows]);

  const assigneeNameByUserId = useMemo(() => {
    const m: Record<number, string> = {};
    for (const e of employees ?? []) {
      if (e.userId != null) m[e.userId] = `${e.firstName} ${e.lastName}`.trim();
    }
    if (authUser?.id != null) {
      m[authUser.id] = authUser.name?.trim() || m[authUser.id] || `User #${authUser.id}`;
    }
    return m;
  }, [employees, authUser]);

  const actionQueueItemsRaw = useMemo(
    () =>
      buildOperationalActionQueue({
        businessDateYmd: businessYmd,
        boardRows: (todayBoardData?.board ?? []).map((b) => ({
          status: b.status,
          scheduleId: b.scheduleId,
          employeeDisplayName: b.employeeDisplayName,
          attendanceRecordId: b.attendanceRecordId,
          expectedStart: b.expectedStart,
          expectedEnd: b.expectedEnd,
          siteName: b.siteName,
        })),
        overdueCheckouts: overdueCheckoutData?.overdueEmployees ?? [],
        pendingCorrections: (pendingCorrections ?? []).map((r) => ({
          id: r.correction.id,
          employeeLabel: `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.trim() || `Employee #${r.correction.employeeId}`,
          businessDateYmd: r.correction.requestedDate,
        })),
        pendingManual: (pendingManual ?? []).map((r) => ({
          id: r.req.id,
          employeeLabel: `${r.employee?.firstName ?? ""} ${r.employee?.lastName ?? ""}`.trim() || `User #${r.req.employeeUserId}`,
          businessDateYmd: r.req.requestedBusinessDate ?? muscatCalendarYmdFromUtcInstant(r.req.requestedAt),
        })),
        issuesByKey,
        limit: 32,
      }),
    [businessYmd, todayBoardData?.board, overdueCheckoutData?.overdueEmployees, pendingCorrections, pendingManual, issuesByKey],
  );

  const actionQueueItems = useMemo(
    () => filterOperationalQueueItems(actionQueueItemsRaw, queueFilter, authUser?.id ?? null),
    [actionQueueItemsRaw, queueFilter, authUser?.id],
  );

  const canonicalActionItems = useMemo<AttendanceActionQueueItem[]>(() => {
    const allItems: AttendanceActionQueueItem[] = [];
    for (const row of (todayBoardData?.board ?? [])) {
      if (!row.canonicalStatus || !row.payrollReadiness || !row.canonicalRiskLevel) continue;
      const items = buildAttendanceActionItems({
        resolvedState: {
          status: row.canonicalStatus,
          payrollReadiness: row.payrollReadiness,
          riskLevel: row.canonicalRiskLevel,
          reasonCodes: row.reasonCodes ?? [],
        },
        attendanceDate: businessYmd,
        employeeId: row.employeeId ?? undefined,
        employeeName: row.employeeDisplayName ?? undefined,
        attendanceRecordId: row.attendanceRecordId ?? undefined,
        scheduleId: row.scheduleId ?? undefined,
      });
      allItems.push(...items);
    }
    return sortAttendanceActionItems(allItems);
  }, [todayBoardData?.board, businessYmd]);

  const handleQueueAction = useCallback((action: AttendanceActionId, item: OperationalExceptionItem) => {
    if (action === ATTENDANCE_ACTION.OPEN_CORRECTIONS) navigate("/hr/attendance/corrections");
    else if (action === ATTENDANCE_ACTION.OPEN_MANUAL_CHECKINS) navigate("/hr/attendance/manual");
    else if (action === ATTENDANCE_ACTION.VIEW_TODAY_BOARD) navigate("/hr/attendance/today");
    else if (action === ATTENDANCE_ACTION.SEND_OVERDUE_REMINDER) {
      document.getElementById("attendance-overdue-checkouts")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (action === ATTENDANCE_ACTION.FORCE_CHECKOUT_OPEN) {
      const id = item.attendanceRecordId;
      if (id != null) { setForceDialogRecordId(id); setForceDialogReason(""); }
    } else if (action === ATTENDANCE_ACTION.ACKNOWLEDGE_OPERATIONAL_ISSUE) {
      setTriageAckItem(item); setTriageAckNote("");
    } else if (action === ATTENDANCE_ACTION.RESOLVE_OPERATIONAL_ISSUE) {
      setTriageResolveItem(item); setTriageResolveNote("");
    } else if (action === ATTENDANCE_ACTION.ASSIGN_OPERATIONAL_ISSUE) {
      setTriageAssignItem(item);
      setTriageAssignUserId(authUser?.id != null ? String(authUser.id) : "");
      setTriageAssignNote("");
    }
  }, [navigate, authUser?.id]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock size={24} className="text-[var(--smartpro-orange)]" />
            {t("attendance.title")}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("attendance.operationalControlDesc")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!capsLoading && caps.canRecordManualAttendance && (
            <ClockInDialog
              employees={(employees ?? []).map(e => ({ ...e, department: e.department ?? null }))}
              onSuccess={refetchEmployees}
              companyId={activeCompanyId}
            />
          )}
        </div>
      </div>

      <AttendanceSetupHealthBanner companyId={activeCompanyId} caps={caps} />

      {hasSetupIssues && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span>{t("attendance.setupHealth.missingEmployeesCallout")}</span>
          <Link
            href="/hr/attendance/setup-health"
            className="shrink-0 text-xs font-medium underline underline-offset-2 hover:no-underline"
          >
            {t("attendance.setupHealth.viewSetupHealth")}
          </Link>
        </div>
      )}

      <HrAttendanceExceptionStrip
        companyId={activeCompanyId}
        pendingCorrCount={pendingCorrCount}
        pendingManualCount={pendingManualCount}
        scheduledShiftsToday={todayBoardData?.summary?.total ?? null}
        overdueCheckoutCount={overdueCheckoutCount}
        missedShiftsCount={todayBoardData?.summary?.absent ?? 0}
        criticalExceptions={todayBoardData?.summary?.criticalExceptions ?? null}
        needsAttention={todayBoardData?.summary?.needsAttention ?? null}
      />

      {!capsLoading && caps.canViewAttendanceBoard && (
        <DailyAttendanceCockpit
          companyId={activeCompanyId}
          caps={caps}
          onTabNavigate={(tab) => navigate(`/hr/attendance/${tab}`)}
        />
      )}

      {activeCompanyId != null ? (
        <AttendanceActionQueue
          items={actionQueueItems}
          filter={queueFilter}
          onFilterChange={setQueueFilter}
          assigneeNameByUserId={assigneeNameByUserId}
          onAction={(a, item) => handleQueueAction(a, item)}
          canonicalItems={canonicalActionItems}
          onCanonicalCta={(_category, item) => {
            const tab = item.ctaTarget ? (CTA_TARGET_TO_TAB[item.ctaTarget] ?? "today") : "today";
            navigate(`/hr/attendance/${tab}`);
          }}
        />
      ) : null}

      {/* Detailed records — tab nav + route-level content */}
      <div className="border-t border-border/60 pt-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {t("attendance.cockpit.detailedRecordsLabel")}
        </p>
        <Tabs value={activeTab} onValueChange={(v) => navigate(`/hr/attendance/${v}`)}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="today" className="gap-1.5"><Users className="h-3.5 w-3.5" /> {t("attendance.tabs.liveToday")}</TabsTrigger>
            <TabsTrigger value="records" className="gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {t("attendance.tabs.hrRecords")}</TabsTrigger>
            <TabsTrigger value="site-punches" className="gap-1.5"><MapPin className="h-3.5 w-3.5" /> {t("attendance.tabs.sitePunches")}</TabsTrigger>
            <TabsTrigger value="corrections" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> {t("attendance.tabs.corrections")}
              {pendingCorrDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> {t("attendance.tabs.manualCheckins")}
              {pendingManualDot && <span className="ml-1 h-2 w-2 rounded-full bg-red-500 inline-block" />}
            </TabsTrigger>
            {!capsLoading && caps.canViewAttendanceAudit && (
              <TabsTrigger value="audit" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" /> {t("attendance.tabs.auditLog")}</TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        <div className="mt-4">
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Switch>
              <Route path="/hr/attendance/today"><HRAttendanceTodayPage /></Route>
              <Route path="/hr/attendance/records"><HRAttendanceRecordsPage /></Route>
              <Route path="/hr/attendance/site-punches"><HRAttendanceSitePunchesPage /></Route>
              <Route path="/hr/attendance/corrections"><HRAttendanceCorrectionsPage /></Route>
              <Route path="/hr/attendance/manual"><HRAttendanceManualsPage /></Route>
              <Route path="/hr/attendance/audit">
                {() => (!capsLoading && caps.canViewAttendanceAudit ? <HRAttendanceAuditPage /> : null)}
              </Route>
              <Route path="/hr/attendance"><Redirect to="/hr/attendance/today" /></Route>
              <Route><Redirect to="/hr/attendance/today" /></Route>
            </Switch>
          </Suspense>
        </div>
      </div>

      {/* ── Triage dialogs ──────────────────────────────────────────────── */}

      <Dialog open={forceDialogRecordId != null} onOpenChange={(o) => !o && setForceDialogRecordId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.forceCheckoutDialog.title")}</DialogTitle>
            <DialogDescription>{t("attendance.forceCheckoutDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="force-reason">{t("attendance.forceCheckoutDialog.reason")}</Label>
            <Textarea
              id="force-reason"
              value={forceDialogReason}
              onChange={(e) => setForceDialogReason(e.target.value)}
              rows={4}
              placeholder={t("attendance.forceCheckoutDialog.reasonPlaceholder")}
              className="text-sm"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setForceDialogRecordId(null)}>
              {t("attendance.forceCheckoutDialog.cancel")}
            </Button>
            <Button
              type="button"
              disabled={forceDialogReason.trim().length < 10 || operationalPending || activeCompanyId == null}
              onClick={async () => {
                if (forceDialogRecordId == null || activeCompanyId == null) return;
                try {
                  await forceCheckout.mutateAsync({ companyId: activeCompanyId, attendanceRecordId: forceDialogRecordId, reason: forceDialogReason.trim() });
                  setForceDialogRecordId(null);
                } catch { /* toast via mutation */ }
              }}
            >
              {t("attendance.forceCheckoutDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageAckItem != null} onOpenChange={(o) => !o && setTriageAckItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.acknowledgeDialog.title")}</DialogTitle>
            <DialogDescription>{t("attendance.acknowledgeDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ack-note">{t("attendance.acknowledgeDialog.note")}</Label>
            <Textarea id="ack-note" value={triageAckNote} onChange={(e) => setTriageAckNote(e.target.value)} rows={3} className="text-sm" placeholder={t("attendance.acknowledgeDialog.placeholder")} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageAckItem(null)}>{t("attendance.acknowledgeDialog.cancel")}</Button>
            <Button
              type="button"
              disabled={operationalPending || triageAckItem?.triage == null || activeCompanyId == null}
              onClick={async () => {
                const item = triageAckItem;
                if (item?.triage == null || activeCompanyId == null) return;
                try {
                  await setIssueStatus.mutateAsync({ companyId: activeCompanyId, businessDateYmd: item.triage.businessDateYmd, kind: item.triage.kind, attendanceRecordId: item.triage.attendanceRecordId, scheduleId: item.triage.scheduleId, correctionId: item.triage.correctionId, manualCheckinRequestId: item.triage.manualCheckinRequestId, action: "acknowledge", note: triageAckNote.trim() || undefined });
                  setTriageAckItem(null);
                } catch { /* toast via mutation */ }
              }}
            >
              {t("attendance.acknowledgeDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageResolveItem != null} onOpenChange={(o) => !o && setTriageResolveItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.resolveDialog.title")}</DialogTitle>
            <DialogDescription>{t("attendance.resolveDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="resolve-note">{t("attendance.resolveDialog.note")}</Label>
            <Textarea id="resolve-note" value={triageResolveNote} onChange={(e) => setTriageResolveNote(e.target.value)} rows={4} className="text-sm" placeholder={t("attendance.resolveDialog.placeholder")} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageResolveItem(null)}>{t("attendance.resolveDialog.cancel")}</Button>
            <Button
              type="button"
              disabled={operationalPending || triageResolveItem?.triage == null || activeCompanyId == null || triageResolveNote.trim().length < 3}
              onClick={async () => {
                const item = triageResolveItem;
                if (item?.triage == null || activeCompanyId == null) return;
                try {
                  await setIssueStatus.mutateAsync({ companyId: activeCompanyId, businessDateYmd: item.triage.businessDateYmd, kind: item.triage.kind, attendanceRecordId: item.triage.attendanceRecordId, scheduleId: item.triage.scheduleId, correctionId: item.triage.correctionId, manualCheckinRequestId: item.triage.manualCheckinRequestId, action: "resolve", note: triageResolveNote.trim() });
                  setTriageResolveItem(null);
                } catch { /* toast via mutation */ }
              }}
            >
              {t("attendance.resolveDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={triageAssignItem != null} onOpenChange={(o) => !o && setTriageAssignItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("attendance.assignDialog.title")}</DialogTitle>
            <DialogDescription>{t("attendance.assignDialog.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("attendance.assignDialog.assignee")}</Label>
              <Select value={triageAssignUserId} onValueChange={setTriageAssignUserId}>
                <SelectTrigger><SelectValue placeholder={t("attendance.assignDialog.selectUser")} /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {authUser?.id != null ? (
                    <SelectItem value={String(authUser.id)}>{t("attendance.assignDialog.me", { name: authUser.name ?? `User #${authUser.id}` })}</SelectItem>
                  ) : null}
                  {assignableCompanyMembers.filter((m) => m.userId !== authUser?.id).map((m) => (
                    <SelectItem key={m.memberId} value={String(m.userId)}>
                      {(m.name ?? "").trim() || `User #${m.userId}`} ({String(m.role).replace(/_/g, " ")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-snug">{t("attendance.assignDialog.assigneeHint")}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="assign-note">{t("attendance.assignDialog.note")}</Label>
              <Textarea id="assign-note" value={triageAssignNote} onChange={(e) => setTriageAssignNote(e.target.value)} rows={2} className="text-sm" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTriageAssignItem(null)}>{t("attendance.assignDialog.cancel")}</Button>
            <Button
              type="button"
              disabled={operationalPending || triageAssignItem?.triage == null || activeCompanyId == null || !triageAssignUserId}
              onClick={async () => {
                const item = triageAssignItem;
                const uid = parseInt(triageAssignUserId, 10);
                if (item?.triage == null || activeCompanyId == null || !Number.isFinite(uid) || uid <= 0) return;
                try {
                  await setIssueStatus.mutateAsync({ companyId: activeCompanyId, businessDateYmd: item.triage.businessDateYmd, kind: item.triage.kind, attendanceRecordId: item.triage.attendanceRecordId, scheduleId: item.triage.scheduleId, correctionId: item.triage.correctionId, manualCheckinRequestId: item.triage.manualCheckinRequestId, action: "assign", assignedToUserId: uid, note: triageAssignNote.trim() || undefined });
                  setTriageAssignItem(null);
                } catch { /* toast via mutation */ }
              }}
            >
              {t("attendance.assignDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
