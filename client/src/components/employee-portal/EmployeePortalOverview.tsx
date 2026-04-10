import React, { useMemo } from "react";
import { actionCenterAfterHeroDedupe } from "@/lib/employeePortalPrimaryAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { employeePortalConfig } from "@/config/employeePortalConfig";
import type { OverviewShiftCardPresentation, ServerEligibilityHints } from "@/lib/employeePortalOverviewPresentation";
import type { ActionCenterCategory, AttentionState, PortalNavTab } from "@/lib/employeePortalOverviewModel";
import { buildOverviewDashboardModel, EMPLOYEE_PORTAL_TOP_ACTIONS_MAX } from "@/lib/employeePortalOverviewModel";
import { buildUnifiedEmployeeRequests, summarizeRequestsForHome } from "@/lib/employeeRequestsPresentation";
import { resolveEmployeePortalPriorityProfile } from "@/lib/employeePortalPriorityProfile";
import type { ProductivitySnapshot } from "@/lib/employeePortalUtils";
import { getDueUrgency, slaLabel } from "@/lib/taskSla";
import type { EmployeeWorkStatusSummary } from "@shared/employeePortalWorkStatusSummary";
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Landmark,
  Megaphone,
  AlertTriangle,
  Timer,
  ArrowLeftRight,
  Activity,
  UserCheck,
  ShieldAlert,
} from "lucide-react";

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "blocked";
type Priority = "low" | "medium" | "high" | "urgent";

const TASK_STATUS_ICON: Record<TaskStatus, React.ReactElement> = {
  pending: <Clock className="w-4 h-4 text-amber-500 shrink-0" />,
  in_progress: <Activity className="w-4 h-4 text-blue-500 shrink-0" />,
  blocked: <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />,
  completed: <CheckSquare className="w-4 h-4 text-green-500 shrink-0" />,
  cancelled: <span className="w-4 h-4 inline-block rounded bg-muted shrink-0" />,
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 font-semibold",
};

const ACTION_TYPE_LABEL: Record<ActionCenterCategory, string> = {
  attendance: "Attendance",
  task: "Task",
  hr: "HR",
};

function attentionStateClasses(s: AttentionState): string {
  if (s === "critical") return "border-red-300 bg-red-50/90 text-red-900 dark:bg-red-950/35 dark:text-red-100";
  if (s === "needs_action") return "border-amber-300 bg-amber-50/90 text-amber-900 dark:bg-amber-950/25 dark:text-amber-100";
  if (s === "due_today") return "border-sky-300 bg-sky-50/90 text-sky-900 dark:bg-sky-950/30 dark:text-sky-100";
  return "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100";
}

function taskNextActionLabel(status: string): string {
  if (status === "blocked") return "Unblock or escalate";
  if (status === "in_progress") return "Resume task";
  return "Open task";
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-muted animate-pulse rounded-lg ${className}`} />;
}

function formatShiftDisplayName(name: string | null | undefined): string {
  if (!name?.trim()) return "Shift";
  return name.replace(/\bshfit\b/gi, "shift").trim();
}

function daysUntilExpiry(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const DOC_LABELS: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  work_permit: "Work Permit",
  national_id: "National ID",
  contract: "Contract",
  certificate: "Certificate",
  other: "Other",
};

export interface EmployeePortalOverviewProps {
  setActiveTab: (tab: string) => void;
  setShowLeaveDialog: (open: boolean) => void;
  onOpenTaskById: (taskId: number) => void;
  leaveTypeLabel: (key: string) => string;

  myActiveSchedule: {
    isHoliday?: boolean;
    holiday?: { name?: string | null };
    schedule?: unknown;
    shift?: {
      name?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      color?: string | null;
      gracePeriodMinutes?: number | null;
    } | null;
    site?: { name?: string | null } | null;
    isWorkingDay?: boolean;
    hasSchedule?: boolean;
  } | null | undefined;

  shiftOverview: OverviewShiftCardPresentation;
  todayAttendanceRecord: { checkIn?: string | Date | null; checkOut?: string | Date | null; siteName?: string | null } | null | undefined;
  todayAttendanceLoading: boolean;
  operationalHintsReady: boolean;
  operationalHints: ServerEligibilityHints | null | undefined;

  workStatusLoading: boolean;
  workStatusSummary: EmployeeWorkStatusSummary | null | undefined;

  productivity: ProductivitySnapshot;
  attendanceRate: number | null;
  attSummary: { present: number; late: number; absent: number; total: number };
  leave: any[];
  leaveLoading: boolean;
  balance: { annual: number; sick: number; emergency: number };
  entitlements: { annual: number; sick: number; emergency: number };
  leaveYear: number;

  tasks: any[];
  tasksLoading: boolean;

  expiringDocs: any[];
  announcements: any[];
  notifications: any[];

  myTraining: any[] | undefined;
  mySelfReviews: any[] | undefined;
  emp: { phone?: string | null; emergencyContact?: string | null; emergencyPhone?: string | null; department?: string | null };

  pendingShiftRequests: number;
  pendingExpenses: number;
  portalClock?: number;

  /** Check-ins this month (self-service) — for bottom “At a glance”. */
  realAttCheckInsMonth: number;
  sickDaysUsedYtd: number;
  pendingTasksCount: number;

  pendingCorrectionCount?: number;
  membershipRole?: string | null;
  employeePosition?: string | null;
  unifiedShiftRequests?: any[];
  unifiedCorrections?: any[];
  unifiedExpenses?: any[];
}

export function EmployeePortalOverview(props: EmployeePortalOverviewProps) {
  const {
    setActiveTab,
    setShowLeaveDialog,
    onOpenTaskById,
    leaveTypeLabel,
    myActiveSchedule,
    shiftOverview,
    todayAttendanceRecord,
    todayAttendanceLoading,
    workStatusLoading,
    workStatusSummary,
    productivity,
    attendanceRate,
    attSummary,
    leave,
    leaveLoading,
    balance,
    entitlements,
    leaveYear,
    tasks,
    tasksLoading,
    expiringDocs,
    announcements,
    notifications,
    myTraining,
    mySelfReviews,
    emp,
    pendingShiftRequests,
    pendingExpenses,
    portalClock = 0,
    realAttCheckInsMonth,
    sickDaysUsedYtd,
    pendingTasksCount,
    pendingCorrectionCount = 0,
    membershipRole,
    employeePosition,
    unifiedShiftRequests = [],
    unifiedCorrections = [],
    unifiedExpenses = [],
  } = props;

  const priorityProfile = useMemo(
    () =>
      resolveEmployeePortalPriorityProfile({
        membershipRole: membershipRole ?? null,
        position: employeePosition ?? null,
        department: (emp as { department?: string | null })?.department ?? null,
      }),
    [membershipRole, employeePosition, emp],
  );

  const unifiedRequestRows = useMemo(
    () =>
      buildUnifiedEmployeeRequests({
        leave: leave as any[],
        shiftRequests: unifiedShiftRequests as any[],
        corrections: unifiedCorrections as any[],
        expenses: unifiedExpenses as any[],
      }),
    [leave, unifiedShiftRequests, unifiedCorrections, unifiedExpenses],
  );
  const requestHomeSummary = useMemo(() => summarizeRequestsForHome(unifiedRequestRows), [unifiedRequestRows]);

  /** Phase 2: lightweight role-based emphasis (full section order in `getCommandCenterSectionOrder`). */
  const requestsAboveWork =
    priorityProfile === "approver" || priorityProfile === "hr_operational";

  const model = useMemo(
    () =>
      buildOverviewDashboardModel({
        shiftOverview,
        myActiveSchedule,
        todayAttendanceRecord,
        todayAttendanceLoading,
        workStatusSummary: workStatusSummary ?? undefined,
        expiringDocs,
        tasks,
        leave,
        balance,
        entitlements,
        productivity,
        attSummary,
        notifications,
        myTraining,
        mySelfReviews,
        emp,
        pendingShiftRequests,
        pendingExpenses,
        pendingCorrectionCount,
        now: new Date(),
      }),
    [
      shiftOverview,
      myActiveSchedule,
      todayAttendanceRecord,
      todayAttendanceLoading,
      workStatusSummary,
      expiringDocs,
      tasks,
      leave,
      balance,
      entitlements,
      productivity,
      attSummary,
      notifications,
      myTraining,
      mySelfReviews,
      emp,
      pendingShiftRequests,
      pendingExpenses,
      pendingCorrectionCount,
      portalClock,
    ],
  );

  const go = (tab: PortalNavTab) => setActiveTab(tab);

  const openTasksList = (tasks as any[]).filter((t: any) => t.status !== "completed" && t.status !== "cancelled");

  const handleActionClick = (a: (typeof focusItems)[0]) => {
    go(a.tab);
    if (a.key === "tasks-overdue" && model.taskStats.topTask) {
      onOpenTaskById(model.taskStats.topTask.id);
    }
  };

  const heroCardTone =
    model.hero?.severity === "critical"
      ? "border-red-400/90 bg-red-50/50 dark:bg-red-950/25 dark:border-red-800/70"
      : model.hero?.severity === "warning"
        ? "border-amber-400/90 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800/60"
        : shiftOverview.warningTone === "red"
          ? "border-red-200/80 bg-red-50/30 dark:bg-red-950/15"
          : shiftOverview.warningTone === "amber"
            ? "border-amber-200/80 bg-amber-50/25 dark:bg-amber-950/10"
            : "border-primary/25 bg-gradient-to-b from-primary/[0.08] to-card";

  const heroStateBadgeClass =
    model.hero?.severity === "critical"
      ? "bg-red-600 text-white border-0 shadow-sm"
      : model.hero?.severity === "warning"
        ? "bg-amber-600 text-white border-0 shadow-sm"
        : "bg-primary/12 text-primary border border-primary/25";

  const primaryCtaDominant =
    model.hero?.severity === "critical" || model.hero?.severity === "warning";

  const focusItems = useMemo(
    () => actionCenterAfterHeroDedupe(model.actionCenter, primaryCtaDominant, EMPLOYEE_PORTAL_TOP_ACTIONS_MAX),
    [model.actionCenter, primaryCtaDominant],
  );

  return (
    <div className="space-y-3 pb-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Command center</p>
        <p className="text-[10px] text-muted-foreground">Today status and next steps</p>
      </div>

      {/* 1 — Hero: shift + attendance + primary CTAs */}
      <Card className={`overflow-hidden border-2 shadow-sm ${heroCardTone}`}>
        <CardContent className="space-y-2 p-3 sm:p-4 sm:space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span className="text-foreground/80">Today</span> ·{" "}
                {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              {todayAttendanceLoading ? (
                <Skeleton className="mt-2 h-6 w-40" />
              ) : myActiveSchedule?.isHoliday ? (
                <p className="text-lg font-semibold leading-tight mt-0.5">Public holiday</p>
              ) : myActiveSchedule?.schedule && myActiveSchedule?.shift ? (
                <p className="text-lg font-semibold leading-tight mt-0.5">{formatShiftDisplayName(myActiveSchedule.shift.name)}</p>
              ) : myActiveSchedule != null && myActiveSchedule.hasSchedule === false ? (
                <p className="text-lg font-semibold leading-tight mt-0.5">No schedule</p>
              ) : (
                <p className="text-lg font-semibold leading-tight mt-0.5">Shift</p>
              )}
              {!todayAttendanceLoading && model.hero && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
                  <Badge className={`text-[11px] font-semibold px-2.5 py-0.5 ${heroStateBadgeClass}`}>
                    <span className="sr-only">Today&apos;s status: </span>
                    {model.hero.stateLabel}
                  </Badge>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {shiftOverview.operational && (
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 gap-1">
                  <span className="sr-only">Shift timing: </span>
                  <span className={`h-1.5 w-1.5 rounded-full ${shiftOverview.operational.statusDotClass}`} aria-hidden />
                  <span>{shiftOverview.operational.statusLabel}</span>
                </Badge>
              )}
            </div>
          </div>

          {!todayAttendanceLoading && model.hero?.proactiveHint && (
            <p className="text-sm font-medium leading-snug text-foreground/95">{model.hero.proactiveHint}</p>
          )}

          {!myActiveSchedule?.isHoliday && myActiveSchedule?.shift && (
            <p className="text-xs text-muted-foreground sm:text-sm">
              <span className="sr-only">Scheduled time: </span>
              {myActiveSchedule.shift.startTime}–{myActiveSchedule.shift.endTime}
              {myActiveSchedule.site?.name ? ` · ${myActiveSchedule.site.name}` : ""}
            </p>
          )}
          {myActiveSchedule?.isHoliday && (
            <p className="text-xs text-muted-foreground sm:text-sm">
              {myActiveSchedule.holiday?.name ?? "No attendance today."}
            </p>
          )}

          {shiftOverview.operational?.detailLine && !myActiveSchedule?.isHoliday && (
            <p className="text-xs font-medium text-primary sm:text-sm">{shiftOverview.operational.detailLine}</p>
          )}

          {!todayAttendanceLoading && !myActiveSchedule?.isHoliday && (
            <div className="text-sm space-y-1">
              {todayAttendanceRecord?.checkIn ? (
                <p className="font-medium text-green-800 dark:text-green-300">
                  <span className="sr-only">Attendance: </span>
                  In {new Date(todayAttendanceRecord.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {todayAttendanceRecord.checkOut
                    ? ` · Out ${new Date(todayAttendanceRecord.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : " · Still in"}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {shiftOverview.phase === "upcoming" ? "Not checked in." : "No check-in yet."}
                </p>
              )}
              {model.shiftTiming?.lateDetail && model.hero?.stateLabel !== "Late" && (
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  <span className="sr-only">Late notice: </span>
                  {model.shiftTiming.lateDetail}
                </p>
              )}
              {shiftOverview.attendanceInconsistent && (
                <p className="text-xs text-red-700 dark:text-red-300">Time error — fix in Attendance.</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              className={`w-full gap-2 sm:w-auto sm:min-w-[160px] ${
                primaryCtaDominant ? "min-h-[3.25rem] text-base font-semibold shadow-md sm:min-h-12" : "min-h-11"
              }`}
              onClick={() =>
                go((model.attendancePresentation?.primaryActionTab ?? "attendance") as PortalNavTab)
              }
              aria-label={`${model.attendancePresentation?.primaryActionLabel ?? shiftOverview.primaryCtaLabel}, primary action`}
            >
              <UserCheck className="h-5 w-5 shrink-0" aria-hidden />
              {model.attendancePresentation?.primaryActionLabel ?? shiftOverview.primaryCtaLabel}
            </Button>
            {shiftOverview.showSecondaryLogWork ? (
              <Button variant="outline" className="min-h-11 w-full sm:w-auto gap-2 text-muted-foreground" onClick={() => go("worklog")}>
                <Timer className="h-4 w-4" /> Log work
              </Button>
            ) : (
              <Button variant="outline" className="min-h-11 w-full sm:w-auto gap-2 text-muted-foreground" onClick={() => setShowLeaveDialog(true)}>
                <Calendar className="h-4 w-4" /> Leave
              </Button>
            )}
          </div>

          {model.proactiveHints.length > 0 && (
            <details className="rounded-lg border border-border/60 bg-muted/20 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none px-3 py-2 font-medium text-foreground/90">
                Reminders ({model.proactiveHints.length})
              </summary>
              <ul className="space-y-1 border-t border-border/50 px-3 py-2 leading-snug">
                {model.proactiveHints.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-primary font-bold shrink-0" aria-hidden>
                      ·
                    </span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>

      {/* 2 — Blockers (Phase 2: above Top Actions) */}
      {model.blockers.length > 0 && (
        <div className="space-y-2" role="region" aria-label="Blockers">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-800 dark:text-red-200 px-0.5 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Blockers
          </p>
          <div className="space-y-2">
            {model.blockers.map((b) => (
              <Card
                key={b.id}
                className={`border-2 shadow-sm ${
                  b.severity === "critical"
                    ? "border-red-400 bg-red-50/80 dark:bg-red-950/30 dark:border-red-800"
                    : "border-amber-400 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800"
                }`}
              >
                <CardContent className="p-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{b.type.replace("_", " ")}</p>
                  <p className="text-sm font-semibold leading-snug">{b.title}</p>
                  {b.description && <p className="text-[11px] text-muted-foreground leading-snug">{b.description}</p>}
                  <Button className="w-full min-h-11" variant="default" onClick={() => go(b.actionTab as PortalNavTab)}>
                    {b.actionLabel}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 3 — Follow-ups (non-duplicative of hero when urgent) */}
      {focusItems.length > 0 && (
        <div className="space-y-2">
          <div className="px-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {primaryCtaDominant ? "More priorities" : "Top actions"}
            </p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
              {primaryCtaDominant
                ? "After the urgent banner above — up to five next best steps."
                : "Priority queue — what to do next (up to five)."}
            </p>
          </div>
          <div className="space-y-2">
            {focusItems.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => handleActionClick(a)}
                className={`flex w-full flex-col items-stretch rounded-xl border p-3 text-left transition-colors active:bg-muted/50 min-h-[4rem] touch-manipulation ${
                  a.severity === "critical"
                    ? "border-red-300 bg-red-50/70 dark:border-red-900/55 dark:bg-red-950/25"
                    : a.severity === "warning"
                      ? "border-amber-300 bg-amber-50/55 dark:border-amber-900/45 dark:bg-amber-950/18"
                      : "border-border/70 bg-card"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0">
                    {ACTION_TYPE_LABEL[a.actionType]}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={`text-[9px] px-1.5 py-0 font-medium ${
                      a.severity === "critical"
                        ? "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200"
                        : a.severity === "warning"
                          ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                          : ""
                    }`}
                  >
                    {a.severity === "critical" ? "Critical" : a.severity === "warning" ? "Warning" : "Info"}
                  </Badge>
                </div>
                <span className="mt-1 text-sm font-semibold leading-snug">{a.headline}</span>
                <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                  <span className="font-medium text-foreground/85">{a.nextStep}</span>
                  {a.detail ? ` · ${a.detail}` : ""}
                </p>
                <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-primary">{a.ctaLabel} →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4 — Needs attention (scroll on narrow screens) */}
      {model.attentionItems.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">Heads-up</span>
          {model.attentionItems.map((x) => (
            <Badge key={x.key} variant="outline" className={`shrink-0 whitespace-nowrap ${attentionStateClasses(x.state)}`}>
              {x.label}
            </Badge>
          ))}
        </div>
      )}

      {/* 5 — Work summary + Requests (order varies by role profile) */}
      <div className="flex flex-col gap-3">
      <Card
        className="border-border/60 bg-card/80"
        style={{ order: requestsAboveWork ? 2 : 1 }}
      >
        <CardHeader className="px-4 pb-1.5 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">Work summary</CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">Tasks due or overdue · execution layer</p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => go("tasks")}>
              Tasks <ChevronRight className="ml-0.5 h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-3">
          {tasksLoading ? (
            <Skeleton className="h-14" />
          ) : model.taskStats.openCount === 0 ? (
            <div className="space-y-2 py-0.5">
              <p className="text-sm text-muted-foreground">Nothing open.</p>
              <Button variant="outline" size="sm" className="min-h-10 w-full sm:w-auto" onClick={() => go("tasks")}>
                Open Tasks
              </Button>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                Requests pipeline:{" "}
                <span className="font-medium text-foreground">{requestHomeSummary.pendingCount} pending</span>
                {pendingShiftRequests > 0 && (
                  <span className="text-muted-foreground"> · {pendingShiftRequests} shift HR request(s)</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2 text-center text-[11px]">
                <div className="min-w-[4.5rem] flex-1 rounded-lg border bg-muted/30 py-2">
                  <p className="text-base font-bold">{model.taskStats.overdueCount}</p>
                  <p className="text-muted-foreground">Overdue</p>
                </div>
                <div className="min-w-[4.5rem] flex-1 rounded-lg border py-2">
                  <p className="text-base font-bold">{model.taskStats.dueTodayCount}</p>
                  <p className="text-muted-foreground">Due today</p>
                </div>
                <div className="min-w-[4.5rem] flex-1 rounded-lg border border-orange-200/60 bg-orange-50/40 py-2 dark:bg-orange-950/15">
                  <p className="text-base font-bold text-orange-800 dark:text-orange-300">{model.taskStats.blockedCount}</p>
                  <p className="text-muted-foreground">Blocked</p>
                </div>
              </div>
              {model.taskStats.topTask && (
                <Button
                  variant="secondary"
                  className="min-h-11 w-full justify-start gap-2 text-left font-normal"
                  onClick={() => onOpenTaskById(model.taskStats.topTask!.id)}
                >
                  <span className="font-semibold text-foreground truncate">Next: {model.taskStats.topTask.title}</span>
                  <Badge className={`shrink-0 text-[10px] ${PRIORITY_COLOR[model.taskStats.topTask.priority as Priority] ?? ""}`}>
                    {model.taskStats.topTask.priority}
                  </Badge>
                </Button>
              )}
              <div className="space-y-1">
                {openTasksList.slice(0, 4).map((t: any) => {
                  const overdue = getDueUrgency(t.dueDate, t.status) === "overdue";
                  const dueToday = getDueUrgency(t.dueDate, t.status) === "due_today";
                  const pr = (t.priority ?? "medium") as Priority;
                  const dueLine = slaLabel(t.dueDate, t.status);
                  const nextAct = taskNextActionLabel(t.status);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenTaskById(t.id)}
                      className="flex min-h-[3.25rem] w-full flex-col gap-1 rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-left text-sm hover:bg-muted/60 active:bg-muted/80 touch-manipulation"
                    >
                      <div className="flex w-full items-start gap-2">
                        {TASK_STATUS_ICON[t.status as TaskStatus] ?? TASK_STATUS_ICON.pending}
                        <span className={`min-w-0 flex-1 font-medium leading-snug ${overdue ? "text-red-600 dark:text-red-400" : dueToday ? "text-sky-800 dark:text-sky-300" : ""}`}>
                          {t.title}
                        </span>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_COLOR[pr]}`}>{pr}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[10px] text-muted-foreground">
                        {dueLine && (
                          <span className={overdue ? "font-semibold text-red-600 dark:text-red-400" : dueToday ? "font-medium text-sky-700 dark:text-sky-400" : ""}>
                            {dueLine}
                          </span>
                        )}
                        <span className="text-foreground/80">
                          {nextAct} <span className="text-primary font-medium">→</span>
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card
        className="border-border/60 bg-card/80"
        style={{ order: requestsAboveWork ? 1 : 2 }}
      >
        <CardHeader className="px-4 pb-1.5 pt-3">
          <CardTitle className="text-sm font-semibold">Requests and approvals</CardTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5">Leave, shift, expenses, corrections — one status language</p>
        </CardHeader>
        <CardContent className="space-y-2 px-4 pb-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="secondary" className="font-mono tabular-nums">
              Pending {requestHomeSummary.pendingCount}
            </Badge>
            {requestHomeSummary.latestLine && (
              <span className="text-muted-foreground line-clamp-2">Latest: {requestHomeSummary.latestLine}</span>
            )}
          </div>
          {requestHomeSummary.topPendingTitle && (
            <p className="text-xs font-medium text-amber-900 dark:text-amber-200">Next: {requestHomeSummary.topPendingTitle}</p>
          )}
          {unifiedRequestRows.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing submitted yet — requests you send will appear here with Pending or Approved status.</p>
          )}
          <Button variant="secondary" className="w-full min-h-11" onClick={() => go("requests")}>
            Open requests
          </Button>
        </CardContent>
      </Card>
      </div>

      {/* 6 — Requests & leave */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="px-4 pb-1.5 pt-3">
          <CardTitle className="text-sm font-semibold">Leave and balances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 px-4 pb-3">
          {pendingShiftRequests > 0 && (
            <button
              type="button"
              onClick={() => go("requests")}
              className="flex w-full min-h-11 items-center justify-between rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-left text-sm dark:bg-amber-950/20"
            >
              <span className="font-medium">{pendingShiftRequests} pending request{pendingShiftRequests === 1 ? "" : "s"}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {model.leaveSignals.pendingCount > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {model.leaveSignals.pendingCount} leave approval{model.leaveSignals.pendingCount === 1 ? "" : "s"} pending
            </p>
          )}
          {model.leaveSignals.lastRequest && (
            <p className="text-xs text-muted-foreground">
              Last: <span className="font-medium text-foreground capitalize">{model.leaveSignals.lastRequest.status}</span> ·{" "}
              {leaveTypeLabel(model.leaveSignals.lastRequest.type)} · {formatDate(model.leaveSignals.lastRequest.startDate)}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            {leaveYear} balances:{" "}
            <span className="font-medium text-foreground">
              Annual {balance.annual}d · Sick {balance.sick}d · Emergency {balance.emergency}d
            </span>
          </p>
          {model.leaveSignals.warnings.length > 0 && (
            <ul className="text-[11px] text-amber-800 dark:text-amber-200 space-y-0.5">
              {model.leaveSignals.warnings.slice(0, 2).map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="min-h-11 flex-1" variant="secondary" onClick={() => setShowLeaveDialog(true)}>
              Leave
            </Button>
            <Button variant="outline" className="min-h-11 flex-1" onClick={() => go("leave")}>
              Leave history
            </Button>
          </div>
          {leaveLoading ? (
            <Skeleton className="h-8" />
          ) : (
            leave.length > 0 && (
              <div className="border-t border-border/50 pt-2 space-y-1.5">
                {leave.slice(0, 2).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-xs gap-2">
                    <span className="truncate">{leaveTypeLabel(l.leaveType)} · {formatDate(l.startDate)}</span>
                    <Badge variant="outline" className="shrink-0 capitalize text-[10px]">
                      {l.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* 7 — Recent activity */}
      {model.recentTimeline.length > 0 && (
        <Card className="border-border/50 bg-muted/5">
          <CardHeader className="px-4 pb-1 pt-3">
            <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1.5">
              {model.recentTimeline.map((row) => (
                <li key={row.id} className="flex gap-2 border-b border-border/25 pb-1.5 text-sm last:border-0 last:pb-0">
                  <span className="w-14 shrink-0 text-[10px] leading-tight text-muted-foreground">
                    {row.at.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="min-w-0">
                    <p className="leading-tight font-medium">{row.title}</p>
                    {row.subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{row.subtitle}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 8 — HR month snapshot (compact) */}
      <Card className="border-border/50 bg-muted/5">
        <CardHeader className="px-4 pb-1 pt-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">HR attendance (month)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {attendanceRate !== null ? (
            <div className="flex items-center gap-3">
              <p className="text-xl font-bold tabular-nums text-green-600 sm:text-2xl">{attendanceRate}%</p>
              <div className="min-w-0 flex-1">
                <Progress value={attendanceRate} className="h-1.5" />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {attSummary.present + attSummary.late}/{attSummary.total} days HR-marked
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 text-xs text-muted-foreground leading-snug">
              <p>
                No <span className="font-medium text-foreground">official HR daily marks</span> for this month yet. Many
                companies record those separately from your self check-in.
              </p>
              {realAttCheckInsMonth > 0 ? (
                <p className="text-[11px]">
                  You have <span className="font-medium text-foreground">{realAttCheckInsMonth}</span> self check-in
                  {realAttCheckInsMonth === 1 ? "" : "s"} this month — open{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => go("attendance")}
                  >
                    Attendance
                  </button>{" "}
                  for times and history.
                </p>
              ) : (
                <p className="text-[11px]">
                  When you check in from the portal, counts appear under{" "}
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => go("attendance")}
                  >
                    Attendance
                  </button>
                  .
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 9 — Secondary insights (collapsed by default) */}
      <details className="group rounded-xl border border-border/70 bg-card open:shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
          More (score & compliance)
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-border/50 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold tabular-nums">{productivity.score}%</span>
            <span className="text-muted-foreground">{employeePortalConfig.productivity.uiCardTitle}</span>
            <Badge variant="outline" className="text-[10px]">
              {productivity.dataConfidence === "low" ? "Low data" : productivity.dataConfidence === "medium" ? "Partial" : "OK"}
            </Badge>
          </div>

          <details className="rounded-md border border-border/40 bg-muted/15 px-2 py-1">
            <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
              How score is calculated
            </summary>
            <p className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground">{productivity.formulaSummary}</p>
          </details>

          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {model.performanceBlock.lines.slice(0, 2).map((line) => (
              <li key={line.label}>
                <span className="font-medium text-foreground">{line.label}</span> — {line.value}
              </li>
            ))}
          </ul>

          {workStatusLoading ? (
            <Skeleton className="h-12" />
          ) : workStatusSummary ? (
            <div className="rounded-lg border border-border/50 bg-muted/15 p-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground text-[11px]">Compliance</span>
                <Badge variant="outline" className="text-[9px] capitalize">
                  {workStatusSummary.overallStatus.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-[10px] line-clamp-2 text-muted-foreground">{workStatusSummary.permit.label}</p>
              <p className="text-[10px] line-clamp-2 text-muted-foreground">{workStatusSummary.documents.label}</p>
              {workStatusSummary.primaryAction.type !== "none" && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 text-[11px] w-full sm:w-auto"
                  onClick={() => {
                    const tab = workStatusSummary.primaryAction.tab;
                    if (tab) {
                      go(tab);
                      requestAnimationFrame(() => {
                        document.getElementById(`portal-${tab}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    } else if (workStatusSummary.primaryAction.type === "contact_hr") go("profile");
                  }}
                >
                  {workStatusSummary.primaryAction.label}
                </Button>
              )}
            </div>
          ) : null}

          {model.profileReminder && (
            <Button variant="outline" size="sm" className="h-9 w-full text-xs" onClick={() => go("profile")}>
              {model.profileReminder}
            </Button>
          )}

          {!employeePortalConfig.compliance.governmentFeaturesEnabled && (
            <p className="flex gap-2 text-[10px] text-muted-foreground leading-snug">
              <Landmark className="h-3.5 w-3.5 shrink-0 opacity-60" />
              MoL / government links — planned, not connected.
            </p>
          )}
        </div>
      </details>

      {/* Announcements — compact */}
      {(announcements as any[])?.length > 0 && (
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" /> News
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pb-3">
            {(announcements as any[]).slice(0, 2).map((a: any) => (
              <div key={a.id} className={`rounded-lg border p-2 text-sm ${!a.isRead ? "border-primary/25 bg-primary/5" : "bg-muted/20"}`}>
                <p className="font-medium leading-tight">{a.title}</p>
                {a.content && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.content}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {expiringDocs.length > 0 && (
        <Card className="border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4" /> Documents
            </p>
            {expiringDocs.slice(0, 3).map((d: any) => {
              const days = daysUntilExpiry(d.expiresAt);
              return (
                <div key={d.id} className="flex justify-between text-xs gap-2">
                  <span>{DOC_LABELS[d.documentType] ?? d.documentType}</span>
                  <span className={days != null && days < 0 ? "text-red-600 font-medium" : "text-amber-800"}>
                    {days != null && days < 0 ? "Expired" : days === 0 ? "Today" : `${days}d`}
                  </span>
                </div>
              );
            })}
            <Button size="sm" variant="outline" className="w-full min-h-10" onClick={() => go("documents")}>
              Open documents
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pay and files — secondary tools (Phase 2 hierarchy) */}
      <div className="rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Pay and files</p>
        <p className="text-[10px] text-muted-foreground/90 mb-2">Payslips and documents. Submit leave or HR changes from Requests.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" className="min-h-10 flex-1 sm:flex-none sm:min-w-[6rem]" onClick={() => go("payroll")}>
            <DollarSign className="mr-1.5 h-4 w-4 shrink-0" />
            Payslip
          </Button>
          <Button type="button" variant="secondary" size="sm" className="min-h-10 flex-1 sm:flex-none sm:min-w-[6rem]" onClick={() => go("documents")}>
            <FileText className="mr-1.5 h-4 w-4 shrink-0" />
            Docs
          </Button>
        </div>
      </div>

      {/* 10 — At a glance (was top stats; secondary) */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">At a glance</p>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { label: "Annual", value: `${balance.annual}d`, sub: "left", onClick: () => go("leave") },
            {
              label: "Sick",
              value: `${balance.sick}d`,
              sub: sickDaysUsedYtd > 0 ? `left · ${sickDaysUsedYtd} sick used` : "left",
              onClick: () => go("leave"),
            },
            { label: "Emergency", value: `${balance.emergency}d`, sub: "left", onClick: () => go("leave") },
            { label: "Tasks", value: String(pendingTasksCount), sub: "open", onClick: () => go("tasks") },
            { label: "Check-ins", value: String(realAttCheckInsMonth), sub: "this month", onClick: () => go("attendance") },
          ].map((x) => (
            <button
              key={x.label}
              type="button"
              onClick={x.onClick}
              className="min-w-[5.5rem] shrink-0 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-left active:bg-muted/50"
            >
              <p className="text-lg font-bold leading-none">{x.value}</p>
              <p className="text-[10px] font-medium text-foreground mt-1">{x.label}</p>
              <p className="text-[9px] text-muted-foreground line-clamp-1">{x.sub}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
