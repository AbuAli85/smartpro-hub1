import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { employeePortalConfig } from "@/config/employeePortalConfig";
import type { OverviewShiftCardPresentation, ServerEligibilityHints } from "@/lib/employeePortalOverviewPresentation";
import type { PortalNavTab } from "@/lib/employeePortalOverviewModel";
import { buildOverviewDashboardModel } from "@/lib/employeePortalOverviewModel";
import type { ProductivitySnapshot } from "@/lib/employeePortalUtils";
import { getDueUrgency } from "@/lib/taskSla";
import type { EmployeeWorkStatusSummary } from "@shared/employeePortalWorkStatusSummary";
import {
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Landmark,
  Megaphone,
  AlertTriangle,
  Timer,
  ArrowLeftRight,
  Activity,
  UserCheck,
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
  emp: { phone?: string | null; emergencyContact?: string | null; emergencyPhone?: string | null };

  pendingShiftRequests: number;
  pendingExpenses: number;
  portalClock?: number;

  /** Check-ins this month (self-service) — for bottom “At a glance”. */
  realAttCheckInsMonth: number;
  sickDaysUsedYtd: number;
  pendingTasksCount: number;
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
    operationalHintsReady,
    operationalHints,
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
  } = props;

  const model = useMemo(
    () =>
      buildOverviewDashboardModel({
        shiftOverview,
        myActiveSchedule,
        todayAttendanceRecord,
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
        now: new Date(),
      }),
    [
      shiftOverview,
      myActiveSchedule,
      todayAttendanceRecord,
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
      portalClock,
    ],
  );

  const go = (tab: PortalNavTab) => setActiveTab(tab);

  const focusItems = model.actionCenter.slice(0, 3);

  const openTasksList = (tasks as any[]).filter((t: any) => t.status !== "completed" && t.status !== "cancelled");

  const handleActionClick = (a: (typeof focusItems)[0]) => {
    go(a.tab);
    if (a.key === "tasks-overdue" && model.taskStats.topTask) {
      onOpenTaskById(model.taskStats.topTask.id);
    }
  };

  return (
    <div className="space-y-3 pb-2">
      {/* 1 — Hero: shift + attendance + primary CTAs */}
      <Card
        className={`overflow-hidden border-2 ${
          shiftOverview.warningTone === "red"
            ? "border-red-200/80 bg-red-50/30 dark:bg-red-950/15"
            : shiftOverview.warningTone === "amber"
              ? "border-amber-200/80 bg-amber-50/25 dark:bg-amber-950/10"
              : "border-primary/20 bg-gradient-to-b from-primary/[0.07] to-card"
        }`}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
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
            </div>
            {shiftOverview.operational && (
              <Badge variant="secondary" className="shrink-0 text-[10px] px-2 py-0.5 gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${shiftOverview.operational.statusDotClass}`} />
                {shiftOverview.operational.statusLabel}
              </Badge>
            )}
          </div>

          {!myActiveSchedule?.isHoliday && myActiveSchedule?.shift && (
            <p className="text-sm text-muted-foreground">
              {myActiveSchedule.shift.startTime}–{myActiveSchedule.shift.endTime}
              {myActiveSchedule.site?.name ? ` · ${myActiveSchedule.site.name}` : ""}
            </p>
          )}
          {myActiveSchedule?.isHoliday && (
            <p className="text-sm text-muted-foreground">{myActiveSchedule.holiday?.name ?? "No attendance today."}</p>
          )}

          {shiftOverview.operational?.detailLine && !myActiveSchedule?.isHoliday && (
            <p className="text-sm font-medium text-primary">{shiftOverview.operational.detailLine}</p>
          )}

          {!todayAttendanceLoading && !myActiveSchedule?.isHoliday && (
            <div className="text-sm space-y-1">
              {todayAttendanceRecord?.checkIn ? (
                <p className="text-green-700 dark:text-green-400 font-medium">
                  In {new Date(todayAttendanceRecord.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {todayAttendanceRecord.checkOut
                    ? ` · Out ${new Date(todayAttendanceRecord.checkOut).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : " · Still in"}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  {shiftOverview.phase === "upcoming" ? "Not checked in yet." : "No check-in recorded."}
                </p>
              )}
              {model.shiftTiming?.lateDetail && (
                <p className="text-amber-800 dark:text-amber-200 text-xs font-medium">{model.shiftTiming.lateDetail}</p>
              )}
              {shiftOverview.attendanceInconsistent && (
                <p className="text-xs text-red-700 dark:text-red-300">Record error — use Correction in Attendance.</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              className="min-h-11 w-full sm:w-auto sm:min-w-[140px] gap-2"
              onClick={() => go("attendance")}
            >
              <UserCheck className="h-4 w-4 shrink-0" />
              {shiftOverview.primaryCtaLabel}
            </Button>
            {shiftOverview.showSecondaryLogWork ? (
              <Button variant="outline" className="min-h-11 w-full sm:w-auto gap-2" onClick={() => go("worklog")}>
                <Timer className="h-4 w-4" /> Log work
              </Button>
            ) : (
              <Button variant="outline" className="min-h-11 w-full sm:w-auto gap-2" onClick={() => setShowLeaveDialog(true)}>
                <Calendar className="h-4 w-4" /> Request leave
              </Button>
            )}
          </div>

          {operationalHintsReady && operationalHints?.shiftStatusLabel && (
            <p className="text-[10px] text-muted-foreground leading-snug">
              {operationalHints.shiftStatusLabel}
              {operationalHints.shiftDetailLine ? ` · ${operationalHints.shiftDetailLine}` : ""}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2 — Quick actions (touch-first row) */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">Quick actions</p>
        <div className="grid grid-cols-5 gap-2">
          {(
            [
              { key: "att", tab: "attendance" as PortalNavTab, label: "Attendance", Icon: UserCheck },
              { key: "tsk", tab: "tasks" as PortalNavTab, label: "Tasks", Icon: CheckSquare, badge: pendingTasksCount },
              {
                key: "lev",
                tab: null,
                label: "Leave",
                Icon: Calendar,
                badge: model.leaveSignals.pendingCount,
                openLeaveDialog: true,
              },
              { key: "req", tab: "requests" as PortalNavTab, label: "Requests", Icon: ArrowLeftRight, badge: pendingShiftRequests },
              { key: "pay", tab: "payroll" as PortalNavTab, label: "Payslip", Icon: DollarSign },
            ] satisfies {
              key: string;
              tab: PortalNavTab | null;
              label: string;
              Icon: React.ComponentType<{ className?: string }>;
              badge?: number;
              openLeaveDialog?: boolean;
            }[]
          ).map(({ key, tab, label, Icon, badge, openLeaveDialog }) => (
            <button
              key={key}
              type="button"
              aria-label={openLeaveDialog ? "Request leave" : label}
              onClick={() => {
                if (openLeaveDialog) setShowLeaveDialog(true);
                else if (tab) go(tab);
              }}
              className="flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border/80 bg-card px-1 py-2 text-center shadow-sm transition-colors active:bg-muted/80 hover:bg-muted/40"
            >
              <span className="relative">
                <Icon className="h-5 w-5 text-primary" />
                {badge != null && badge > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold text-primary-foreground">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-tight text-foreground">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 3 — Today focus: max 3 */}
      {focusItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">Do this next</p>
          <div className="space-y-2">
            {focusItems.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => handleActionClick(a)}
                className={`flex w-full flex-col items-stretch rounded-xl border p-3 text-left transition-colors active:bg-muted/50 ${
                  a.severity === "critical"
                    ? "border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/20"
                    : a.severity === "warning"
                      ? "border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/15"
                      : "border-border/70 bg-card"
                }`}
              >
                <span className="text-sm font-semibold leading-snug">{a.headline}</span>
                {a.detail && <span className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.detail}</span>}
                <span className="mt-2 text-xs font-semibold text-primary">{a.ctaLabel} →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4 — Needs attention (scroll on narrow screens) */}
      {model.attentionItems.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">Flags</span>
          {model.attentionItems.map((x) => (
            <Badge
              key={x.key}
              variant="outline"
              className={`shrink-0 whitespace-nowrap ${
                x.tone === "destructive"
                  ? "border-red-300 bg-red-50/80 text-red-900 dark:bg-red-950/30"
                  : x.tone === "warning"
                    ? "border-amber-300 bg-amber-50/80 text-amber-900 dark:bg-amber-950/25"
                    : ""
              }`}
            >
              {x.label}
            </Badge>
          ))}
        </div>
      )}

      {/* 5 — My work today */}
      <Card className="border-border/70">
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">My work today</CardTitle>
            <Button variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => go("tasks")}>
              All <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          {tasksLoading ? (
            <Skeleton className="h-14" />
          ) : model.taskStats.openCount === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No open tasks.</p>
          ) : (
            <>
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
                  const pr = (t.priority ?? "medium") as Priority;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpenTaskById(t.id)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                    >
                      {TASK_STATUS_ICON[t.status as TaskStatus] ?? TASK_STATUS_ICON.pending}
                      <span className={`flex-1 truncate ${overdue ? "font-medium text-red-600" : ""}`}>{t.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${PRIORITY_COLOR[pr]}`}>{pr}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 6 — Requests & leave */}
      <Card className="border-border/70">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold">Requests &amp; leave</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
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
          <p className="text-xs text-muted-foreground">
            Balances ({leaveYear}):{" "}
            <span className="font-medium text-foreground">
              A {balance.annual}d · S {balance.sick}d · E {balance.emergency}d
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
              Request leave
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
        <Card className="border-border/70">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-2">
              {model.recentTimeline.map((row) => (
                <li key={row.id} className="flex gap-2 text-sm border-b border-border/30 last:border-0 pb-2 last:pb-0">
                  <span className="w-14 shrink-0 text-[10px] text-muted-foreground leading-tight">
                    {row.at.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{row.title}</p>
                    {row.subtitle && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{row.subtitle}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* 8 — HR month snapshot (compact) */}
      <Card className="border-border/60">
        <CardHeader className="pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">This month (HR)</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {attendanceRate !== null ? (
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold text-green-600 tabular-nums">{attendanceRate}%</p>
              <div className="flex-1 min-w-0">
                <Progress value={attendanceRate} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  {attSummary.present + attSummary.late}/{attSummary.total} days marked
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No HR rows yet — check-ins still count in Attendance.</p>
          )}
          <Button variant="link" className="h-auto min-h-10 px-0 text-xs" onClick={() => go("attendance")}>
            Open attendance
          </Button>
        </CardContent>
      </Card>

      {/* 9 — Secondary insights (collapsed by default) */}
      <details className="group rounded-xl border border-border/70 bg-card open:shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          More insights
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-border/50 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">{employeePortalConfig.productivity.uiCardTitle}</span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tabular-nums">{productivity.score}%</span>
              <Badge variant="outline" className="text-[10px]">
                {productivity.dataConfidence === "low" ? "Low data" : productivity.dataConfidence === "medium" ? "Partial" : "OK"}
              </Badge>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">{productivity.disclaimer}</p>
          <details className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-foreground [&::-webkit-details-marker]:hidden">
              How it’s calculated
            </summary>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{productivity.formulaSummary}</p>
          </details>
          <div className="space-y-1 text-muted-foreground">
            {model.performanceBlock.lines.slice(0, 3).map((line) => (
              <p key={line.label}>
                <span className="font-medium text-foreground">{line.label}:</span> {line.value}
              </p>
            ))}
          </div>

          {workStatusLoading ? (
            <Skeleton className="h-16" />
          ) : workStatusSummary ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">Work signals</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {workStatusSummary.overallStatus.replace("_", " ")}
                </Badge>
              </div>
              <p className="line-clamp-2">{workStatusSummary.permit.label}</p>
              <p className="line-clamp-2">{workStatusSummary.documents.label}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {workStatusSummary.primaryAction.type !== "none" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
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

      {/* 10 — At a glance (was top stats; secondary) */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">At a glance</p>
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            { label: "Annual", value: `${balance.annual}d`, sub: "left", onClick: () => go("leave") },
            { label: "Sick", value: `${balance.sick}d`, sub: sickDaysUsedYtd ? `${sickDaysUsedYtd} used YTD` : "left", onClick: () => go("leave") },
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
