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
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Info,
  Landmark,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  BarChart2,
  Plus,
  AlertTriangle,
  Timer,
  Target,
  ArrowLeftRight,
  Wallet,
  Activity,
} from "lucide-react";

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled" | "blocked";
type Priority = "low" | "medium" | "high" | "urgent";

const TASK_STATUS_ICON: Record<TaskStatus, React.ReactElement> = {
  pending: <Clock className="w-4 h-4 text-amber-500" />,
  in_progress: <Activity className="w-4 h-4 text-blue-500" />,
  blocked: <AlertTriangle className="w-4 h-4 text-orange-600" />,
  completed: <CheckSquare className="w-4 h-4 text-green-500" />,
  cancelled: <span className="w-4 h-4 inline-block rounded bg-muted" />,
};

const PRIORITY_COLOR: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-border/60",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200/50",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200/50",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200/60 font-semibold",
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
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

/** Text color for "days left" */
function leaveRemainingTone(remaining: number, total: number): string {
  if (total <= 0) return "text-foreground";
  if (remaining <= 2) return "text-red-600";
  if (remaining / total <= 0.2) return "text-amber-600";
  return "text-foreground";
}

function formatDate(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const DOC_LABELS: Record<string, string> = {
  passport: "Passport",
  visa: "Visa",
  work_permit: "Work Permit",
  national_id: "National ID",
  contract: "Employment Contract",
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
  /** Bumps overview model when portal clock ticks (shift phases / countdowns). */
  portalClock?: number;
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

  const primaryAction = model.actionCenter[0];
  const secondaryActions = model.actionCenter.slice(1, 4);

  return (
    <div className="space-y-4">
      {/* Compact status strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-xs">
        <span className="font-medium text-foreground">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}
        </span>
        <span className="text-muted-foreground hidden sm:inline">·</span>
        {todayAttendanceLoading ? (
          <span className="text-muted-foreground">Loading attendance…</span>
        ) : todayAttendanceRecord?.checkIn ? (
          <Badge variant="secondary" className="font-normal">
            Checked in
          </Badge>
        ) : myActiveSchedule?.isHoliday ? (
          <Badge variant="outline" className="font-normal border-purple-300 text-purple-800">
            Holiday
          </Badge>
        ) : myActiveSchedule?.shift && myActiveSchedule.schedule ? (
          <Badge variant="outline" className="font-normal">
            {shiftOverview.phase === "active" ? "Shift active" : shiftOverview.phase === "upcoming" ? "Shift upcoming" : "Shift ended"}
          </Badge>
        ) : (
          <span className="text-muted-foreground">No shift today</span>
        )}
        <span className="text-muted-foreground hidden sm:inline">·</span>
        <button
          type="button"
          className="text-primary font-medium hover:underline"
          onClick={() => go("tasks")}
        >
          {model.taskStats.openCount} open tasks
        </button>
        {model.leaveSignals.pendingCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <button type="button" className="text-primary font-medium hover:underline" onClick={() => go("leave")}>
              {model.leaveSignals.pendingCount} leave pending
            </button>
          </>
        )}
      </div>

      {/* Action center */}
      <Card className="border-primary/25 bg-gradient-to-br from-primary/[0.06] to-background shadow-sm ring-1 ring-primary/10">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-base font-semibold tracking-tight">Today&apos;s focus</CardTitle>
          <p className="text-xs text-muted-foreground font-normal leading-snug">
            The most important next steps based on your schedule, attendance, tasks, and documents.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          {primaryAction && (
            <div
              className={`rounded-lg border p-4 ${
                primaryAction.severity === "critical"
                  ? "border-red-200/90 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
                  : primaryAction.severity === "warning"
                    ? "border-amber-200/90 bg-amber-50/40 dark:border-amber-900/45 dark:bg-amber-950/15"
                    : "border-border/80 bg-card/80"
              }`}
            >
              <p className="text-sm font-semibold text-foreground">{primaryAction.headline}</p>
              {primaryAction.detail && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{primaryAction.detail}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  variant={primaryAction.severity === "critical" ? "default" : "secondary"}
                  onClick={() => {
                    go(primaryAction.tab);
                    if (primaryAction.key === "tasks-overdue" && model.taskStats.topTask) {
                      onOpenTaskById(model.taskStats.topTask.id);
                    }
                  }}
                >
                  {primaryAction.ctaLabel}
                </Button>
                {primaryAction.tab === "attendance" && (
                  <Button size="sm" variant="outline" onClick={() => go("attendance")}>
                    Full attendance
                  </Button>
                )}
              </div>
            </div>
          )}

          {secondaryActions.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-3">
              {secondaryActions.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => {
                      go(a.tab);
                      if (a.key === "tasks-overdue" && model.taskStats.topTask) {
                        onOpenTaskById(model.taskStats.topTask.id);
                      }
                    }}
                    className="flex w-full flex-col items-start rounded-lg border border-border/60 bg-card/50 p-3 text-left text-xs transition-colors hover:bg-muted/60"
                  >
                    <span className="font-medium text-foreground line-clamp-2">{a.headline}</span>
                    <span className="mt-2 text-primary font-medium">{a.ctaLabel} →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Attention chips — max 5 */}
      {model.attentionItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">Needs attention</span>
          {model.attentionItems.map((a) => (
            <Badge
              key={a.key}
              variant="outline"
              className={
                a.tone === "destructive"
                  ? "border-red-300 text-red-800 bg-red-50/80 dark:bg-red-950/30"
                  : a.tone === "warning"
                    ? "border-amber-300 text-amber-900 bg-amber-50/70 dark:bg-amber-950/25"
                    : "text-muted-foreground"
              }
            >
              {a.label}
            </Badge>
          ))}
        </div>
      )}

      {/* Shift + work status */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {myActiveSchedule?.isHoliday ? (
            <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/10">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-purple-700">{myActiveSchedule.holiday?.name ?? "Holiday"}</p>
                  <p className="text-xs text-purple-600">No attendance required today.</p>
                </div>
              </CardContent>
            </Card>
          ) : myActiveSchedule?.schedule && myActiveSchedule?.shift ? (
            <Card
              className={
                shiftOverview.warningTone === "red"
                  ? "border-red-200/90 ring-1 ring-red-500/10"
                  : shiftOverview.warningTone === "amber"
                    ? "border-amber-200/90 ring-1 ring-amber-500/10"
                    : "border-primary/30 ring-1 ring-primary/10"
              }
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: (myActiveSchedule.shift as { color?: string }).color ? `${(myActiveSchedule.shift as { color?: string }).color}22` : "#6366f122" }}
                  >
                    <Clock className="w-5 h-5" style={{ color: (myActiveSchedule.shift as { color?: string }).color ?? "#6366f1" }} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {shiftOverview.operational && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/80 px-2 py-0.5 text-[11px] font-medium">
                          <span className={`h-2 w-2 rounded-full ${shiftOverview.operational.statusDotClass}`} />
                          {shiftOverview.operational.statusLabel}
                        </span>
                      )}
                      <p className="font-semibold text-sm">{formatShiftDisplayName(myActiveSchedule.shift.name)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {myActiveSchedule.shift.startTime} – {myActiveSchedule.shift.endTime}
                      {myActiveSchedule.site?.name ? ` · ${myActiveSchedule.site.name}` : ""}
                      {(myActiveSchedule.shift.gracePeriodMinutes ?? 0) > 0
                        ? ` · ${myActiveSchedule.shift.gracePeriodMinutes} min grace`
                        : ""}
                    </p>
                    {shiftOverview.operational?.detailLine && (
                      <p className="text-xs font-medium text-blue-700 dark:text-blue-300">{shiftOverview.operational.detailLine}</p>
                    )}
                    {model.shiftTiming?.checkInSummary && (
                      <p className="text-xs text-green-700 dark:text-green-400 font-medium">{model.shiftTiming.checkInSummary}</p>
                    )}
                    {model.shiftTiming?.checkOutSummary && (
                      <p className="text-xs text-muted-foreground">{model.shiftTiming.checkOutSummary}</p>
                    )}
                    {model.shiftTiming?.siteLine && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" />{model.shiftTiming.siteLine.replace(/^Site: /, "")}</p>}
                    {model.shiftTiming?.lateDetail && (
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{model.shiftTiming.lateDetail}</p>
                    )}
                    {shiftOverview.attendanceInconsistent && (
                      <p className="text-xs font-medium text-red-700 dark:text-red-300">
                        Check-out without check-in — open Attendance and use Correction.
                      </p>
                    )}
                    {shiftOverview.showMissedActiveWarning && !model.shiftTiming?.isLateNoCheckIn && (
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">No check-in recorded for this shift yet.</p>
                    )}
                    {shiftOverview.showMissedEndedWarning && (
                      <p className="text-xs font-medium text-red-700 dark:text-red-300">
                        No attendance recorded for this shift.
                      </p>
                    )}
                    {shiftOverview.correctionPendingNote && (
                      <p className="text-xs text-muted-foreground">{shiftOverview.correctionPendingNote}</p>
                    )}
                    <p className="text-xs font-medium text-foreground pt-0.5">{model.shiftTiming?.nextStepLine ?? `Next step: ${shiftOverview.primaryCtaLabel}`}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="gap-1.5" onClick={() => go("attendance")}>
                    <Clock className="w-3.5 h-3.5" />
                    {shiftOverview.primaryCtaLabel}
                  </Button>
                  {shiftOverview.showSecondaryLogWork && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go("worklog")}>
                      <Timer className="w-3.5 h-3.5" /> Log work
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : myActiveSchedule != null && (myActiveSchedule as { hasSchedule?: boolean }).hasSchedule === false ? (
            <Card className="border-muted">
              <CardContent className="p-4 flex gap-3">
                <Info className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">No shift assigned. Contact HR for your schedule.</p>
              </CardContent>
            </Card>
          ) : null}

          {operationalHintsReady && operationalHints?.shiftStatusLabel && (
            <p className="text-[11px] text-muted-foreground px-0.5">
              <span className="font-medium text-foreground">System: </span>
              {operationalHints.shiftStatusLabel}
              {operationalHints.shiftDetailLine ? ` — ${operationalHints.shiftDetailLine}` : ""}
            </p>
          )}
        </div>

        <div>
          {workStatusLoading ? (
            <Card className="border-border/60">
              <CardContent className="space-y-3 p-4 animate-pulse">
                <div className="h-4 w-44 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-8 w-32 rounded bg-muted" />
              </CardContent>
            </Card>
          ) : workStatusSummary ? (
            <Card
              className={
                workStatusSummary.overallStatus === "urgent"
                  ? "border-red-200/90 bg-red-50/40 ring-1 ring-red-500/15 dark:border-red-900/50 dark:bg-red-950/25"
                  : workStatusSummary.overallStatus === "needs_attention"
                    ? "border-amber-200/90 bg-amber-50/35 ring-1 ring-amber-500/15 dark:border-amber-900/45 dark:bg-amber-950/20"
                    : "border-emerald-200/70 bg-emerald-50/30 ring-1 ring-emerald-500/15 dark:border-emerald-900/40 dark:bg-emerald-950/15"
              }
            >
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/80 ring-1 ring-border/60">
                      <ClipboardList className="h-5 w-5 text-foreground/80" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Work &amp; compliance signals</p>
                      <p className="text-xs text-muted-foreground leading-snug max-w-xl">
                        Permit, your documents, and HR-assigned tasks — internal signals only.
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      workStatusSummary.overallStatus === "on_track"
                        ? "border-emerald-500/45 text-emerald-900 dark:text-emerald-100 shrink-0"
                        : workStatusSummary.overallStatus === "needs_attention"
                          ? "border-amber-500/45 text-amber-900 dark:text-amber-100 shrink-0"
                          : "border-red-500/50 text-red-900 dark:text-red-100 shrink-0"
                    }
                  >
                    {workStatusSummary.overallStatus === "on_track"
                      ? "On track"
                      : workStatusSummary.overallStatus === "needs_attention"
                        ? "Needs attention"
                        : "Urgent"}
                  </Badge>
                </div>
                <ul className="space-y-1.5 text-xs text-foreground/90">
                  <li className="flex gap-2">
                    <span className="shrink-0 font-medium text-muted-foreground w-20">Permit</span>
                    <span className="min-w-0">{workStatusSummary.permit.label}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 font-medium text-muted-foreground w-20">Documents</span>
                    <span className="min-w-0">{workStatusSummary.documents.label}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 font-medium text-muted-foreground w-20">Tasks</span>
                    <span className="min-w-0">{workStatusSummary.tasks.label}</span>
                  </li>
                </ul>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {workStatusSummary.primaryAction.type !== "none" && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      variant={workStatusSummary.overallStatus === "urgent" ? "default" : "secondary"}
                      onClick={() => {
                        const tab = workStatusSummary.primaryAction.tab;
                        if (tab) {
                          go(tab);
                          requestAnimationFrame(() => {
                            document.getElementById(`portal-${tab}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                          });
                        } else if (workStatusSummary.primaryAction.type === "contact_hr") {
                          go("profile");
                        }
                      }}
                    >
                      {workStatusSummary.primaryAction.type === "open_tasks" && <CheckSquare className="h-3.5 w-3.5" />}
                      {workStatusSummary.primaryAction.type === "open_documents" && <FileText className="h-3.5 w-3.5" />}
                      {workStatusSummary.primaryAction.type === "contact_hr" && <Mail className="h-3.5 w-3.5" />}
                      {workStatusSummary.primaryAction.label}
                    </Button>
                  )}
                  {workStatusSummary.secondaryAction && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go("profile")}>
                      <Phone className="h-3.5 w-3.5" />
                      {workStatusSummary.secondaryAction.label}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Productivity + performance (single card) */}
      <Card className="border-border/70 bg-card ring-1 ring-border/40">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/80">
                <Activity className="h-5 w-5 text-foreground/80" />
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {employeePortalConfig.productivity.uiCardTitle}
                  </p>
                  <Badge
                    variant="outline"
                    className={
                      productivity.dataConfidence === "low"
                        ? "border-amber-500/50 text-amber-900 dark:text-amber-100"
                        : productivity.dataConfidence === "medium"
                          ? "border-blue-500/45 text-blue-900 dark:text-blue-100"
                          : "border-emerald-500/45 text-emerald-900 dark:text-emerald-100"
                    }
                  >
                    Data: {productivity.dataConfidence === "low" ? "Low" : productivity.dataConfidence === "medium" ? "Medium" : "High"}
                  </Badge>
                </div>
                <p
                  className={`font-bold tabular-nums text-foreground ${
                    productivity.dataConfidence === "low" ? "text-xl" : "text-2xl"
                  }`}
                >
                  {productivity.score}%
                  {productivity.dataConfidence === "low" && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(estimate)</span>
                  )}
                </p>
                <p className="max-w-xl text-xs leading-snug text-muted-foreground">{productivity.hint}</p>
                <p className="max-w-xl text-[10px] leading-snug text-muted-foreground">{productivity.disclaimer}</p>
                <details className="group rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-foreground list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                    How this score is calculated
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground pl-1">
                    <li>
                      <span className="text-foreground">Attendance ({Math.round(employeePortalConfig.productivity.attendanceWeight * 100)}%):</span>{" "}
                      {productivity.usedAttendanceFallback ? (
                        <>neutral placeholder (~{employeePortalConfig.productivity.neutralAttendanceFallback}%) → ~{productivity.attendancePointsDisplay} pts</>
                      ) : (
                        <>{productivity.attendanceRateActual}% this month → ~{productivity.attendancePointsDisplay} pts</>
                      )}
                    </li>
                    <li>
                      <span className="text-foreground">Tasks ({Math.round(employeePortalConfig.productivity.taskWeight * 100)}%):</span>{" "}
                      {productivity.usedTaskFallback ? (
                        <>neutral placeholder (~{employeePortalConfig.productivity.neutralTaskFallback}%) → ~{productivity.taskPointsDisplay} pts</>
                      ) : (
                        <>{productivity.completedTaskCount}/{productivity.assignedTaskCount} done ({productivity.taskCompletionPercentActual}%) → ~{productivity.taskPointsDisplay} pts</>
                      )}
                    </li>
                  </ul>
                  <p className="mt-2 border-t border-border/50 pt-2 font-mono text-[10px] text-muted-foreground">{productivity.formulaSummary}</p>
                </details>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => go("attendance")}>
                Attendance
              </Button>
              <Button size="sm" variant="outline" onClick={() => go("tasks")}>
                Tasks
              </Button>
            </div>
          </div>

          <div className="border-t border-border/50 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{model.performanceBlock.headline}</p>
            <ul className="space-y-2 text-xs">
              {model.performanceBlock.lines.map((line) => (
                <li key={line.label} className="flex flex-col sm:flex-row sm:gap-3 gap-0.5">
                  <span className="font-medium text-muted-foreground shrink-0 w-40">{line.label}</span>
                  <span className="text-foreground/90 leading-snug">{line.value}</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">{model.performanceBlock.footnote}</p>
          </div>
        </CardContent>
      </Card>

      {!employeePortalConfig.compliance.governmentFeaturesEnabled && (
        <p className="text-[11px] text-muted-foreground px-1 flex items-start gap-2">
          <Landmark className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-70" />
          <span>
            <span className="font-medium text-foreground/80">Government / MoL integrations</span> — planned; not connected yet. No external compliance data is shown here.
          </span>
        </p>
      )}

      {/* Attendance + leave */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-green-500" /> This month (HR marks)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {attendanceRate !== null ? (
              <>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-3xl font-bold text-green-600">{attendanceRate}%</p>
                  <p className="text-xs text-muted-foreground text-right">
                    {attSummary.present + attSummary.late} / {attSummary.total} days recorded
                  </p>
                </div>
                <Progress value={attendanceRate} className="h-2" />
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-green-50 dark:bg-green-950/20 rounded p-2">
                    <p className="font-bold text-green-700">{attSummary.present}</p>
                    <p className="text-muted-foreground">On time</p>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950/20 rounded p-2">
                    <p className="font-bold text-amber-700">{attSummary.late}</p>
                    <p className="text-muted-foreground">Late</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950/20 rounded p-2">
                    <p className="font-bold text-red-700">{attSummary.absent}</p>
                    <p className="text-muted-foreground">Absent</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => go("attendance")}>
                  Check-ins &amp; corrections
                </Button>
              </>
            ) : (
              <div className="text-center py-4 space-y-2">
                <p className="text-sm text-muted-foreground">
                  {todayAttendanceRecord?.checkIn
                    ? "No HR summary rows for this month yet — your check-ins still count in Attendance."
                    : "No HR attendance summary for this month yet."}
                </p>
                <Button size="sm" onClick={() => go("attendance")}>
                  {todayAttendanceRecord?.checkIn ? "Open attendance" : "Check in"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" /> Leave ({leaveYear})
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => setShowLeaveDialog(true)}>
                <Plus className="w-3 h-3 mr-1" /> Request
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {model.leaveSignals.pendingCount > 0 && (
              <div className="rounded-md border border-amber-200/80 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-xs">
                <span className="font-medium text-amber-900 dark:text-amber-100">
                  {model.leaveSignals.pendingCount} request{model.leaveSignals.pendingCount === 1 ? "" : "s"} awaiting approval
                </span>
              </div>
            )}
            {model.leaveSignals.lastRequest && (
              <p className="text-xs text-muted-foreground">
                Last request:{" "}
                <span className="font-medium text-foreground capitalize">{model.leaveSignals.lastRequest.status}</span>
                {" · "}
                {leaveTypeLabel(model.leaveSignals.lastRequest.type)} · {formatDate(model.leaveSignals.lastRequest.startDate)}
              </p>
            )}
            {[
              { label: "Annual", total: entitlements.annual, color: "bg-blue-500", remaining: balance.annual },
              { label: "Sick", total: entitlements.sick, color: "bg-amber-500", remaining: balance.sick },
              { label: "Emergency", total: entitlements.emergency, color: "bg-red-500", remaining: balance.emergency },
            ].map(({ label, total, color, remaining }) => {
              const used = Math.min(total, Math.max(0, total - remaining));
              return (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-semibold ${leaveRemainingTone(remaining, total)}`}>
                      {remaining} / {total} days left
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${total > 0 ? Math.min(100, (used / total) * 100) : 0}%` }} />
                  </div>
                </div>
              );
            })}
            {model.leaveSignals.warnings.length > 0 && (
              <ul className="text-[11px] text-amber-800 dark:text-amber-200 space-y-1 border-t border-border/50 pt-2">
                {model.leaveSignals.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="secondary" className="w-full" onClick={() => go("leave")}>
              Open leave tab
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Shortcuts */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowLeaveDialog(true)}>
          <Calendar className="w-3.5 h-3.5" /> Request leave
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go("documents")}>
          <FileText className="w-3.5 h-3.5" /> Documents
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go("requests")}>
          <ArrowLeftRight className="w-3.5 h-3.5" /> Requests
          {pendingShiftRequests > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
              {pendingShiftRequests}
            </Badge>
          )}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go("kpi")}>
          <Target className="w-3.5 h-3.5" /> KPI
        </Button>
        {pendingExpenses > 0 && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go("expenses")}>
            <Wallet className="w-3.5 h-3.5" /> Expenses
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">
              {pendingExpenses}
            </Badge>
          </Button>
        )}
      </div>

      {/* Recent leave + tasks */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Recent leave
              </span>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => go("leave")}>
                All <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaveLoading ? (
              <Skeleton className="h-12" />
            ) : leave.length === 0 ? (
              <div className="text-center py-5 text-muted-foreground text-sm space-y-2">
                <p className="font-medium text-foreground">No leave requests yet</p>
                <p className="text-xs max-w-xs mx-auto leading-relaxed">Submit a request to start the approval flow with HR.</p>
                <Button size="sm" variant="outline" className="mt-1" onClick={() => setShowLeaveDialog(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Request leave
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {leave.slice(0, 4).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-sm gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{leaveTypeLabel(l.leaveType)}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(l.startDate)}</p>
                    </div>
                    <Badge
                      variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : l.status === "cancelled" ? "outline" : "secondary"}
                      className="capitalize text-xs shrink-0"
                    >
                      {l.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4" /> Tasks
              </span>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => go("tasks")}>
                All <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasksLoading ? (
              <Skeleton className="h-12" />
            ) : model.taskStats.openCount === 0 ? (
              <div className="text-center py-5 text-muted-foreground text-sm space-y-2">
                <p className="font-medium text-foreground">No open tasks</p>
                <p className="text-xs max-w-xs mx-auto leading-relaxed">If you expected work items, check with your manager.</p>
                <Button size="sm" variant="outline" onClick={() => go("training")}>
                  Training
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-md border bg-muted/40 py-2">
                    <p className="text-lg font-bold text-foreground">{model.taskStats.openCount}</p>
                    <p className="text-muted-foreground">Open</p>
                  </div>
                  <div className="rounded-md border border-red-200/60 bg-red-50/50 dark:bg-red-950/20 py-2">
                    <p className="text-lg font-bold text-red-700 dark:text-red-400">{model.taskStats.overdueCount}</p>
                    <p className="text-muted-foreground">Overdue</p>
                  </div>
                  <div className="rounded-md border py-2">
                    <p className="text-lg font-bold">{model.taskStats.dueTodayCount}</p>
                    <p className="text-muted-foreground">Due today</p>
                  </div>
                  <div className="rounded-md border border-amber-200/60 bg-amber-50/50 py-2">
                    <p className="text-lg font-bold text-amber-800">{model.taskStats.urgentOpen}</p>
                    <p className="text-muted-foreground">Urgent</p>
                  </div>
                  <div className="rounded-md border border-orange-200/50 bg-orange-50/40 dark:bg-orange-950/15 py-2 sm:col-span-2">
                    <p className="text-lg font-bold text-orange-800 dark:text-orange-300">{model.taskStats.highOpen}</p>
                    <p className="text-muted-foreground">Important (high)</p>
                  </div>
                </div>
                {model.taskStats.topTask && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Top priority</p>
                    <p className="text-sm font-medium line-clamp-2">{model.taskStats.topTask.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-md ${PRIORITY_COLOR[model.taskStats.topTask.priority as Priority] ?? PRIORITY_COLOR.medium}`}>
                        {model.taskStats.topTask.priority}
                      </span>
                      <Button size="sm" className="h-8 text-xs" onClick={() => onOpenTaskById(model.taskStats.topTask!.id)}>
                        Open task
                      </Button>
                    </div>
                  </div>
                )}
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {(tasks as any[]).filter((t: any) => t.status !== "completed" && t.status !== "cancelled").slice(0, 5).map((t: any) => {
                    const overdue = getDueUrgency(t.dueDate, t.status) === "overdue";
                    const pr = (t.priority ?? "medium") as Priority;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onOpenTaskById(t.id)}
                        className="flex w-full items-center gap-2 text-sm text-left rounded-md p-1.5 hover:bg-muted/60"
                      >
                        {TASK_STATUS_ICON[t.status as TaskStatus] ?? TASK_STATUS_ICON.pending}
                        <span className={`flex-1 truncate ${overdue ? "text-red-600 font-medium" : ""}`}>{t.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${PRIORITY_COLOR[pr] ?? PRIORITY_COLOR.medium}`}>{pr}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity timeline */}
      {model.recentTimeline.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent activity</CardTitle>
            <p className="text-xs text-muted-foreground font-normal">Notifications, check-ins, leave updates, and completed tasks.</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {model.recentTimeline.map((row) => (
                <li key={row.id} className="flex gap-3 text-sm border-b border-border/40 last:border-0 pb-3 last:pb-0">
                  <div className="w-24 shrink-0 text-[10px] text-muted-foreground leading-tight">
                    {row.at.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{row.title}</p>
                    {row.subtitle && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{row.subtitle}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Announcements */}
      {(announcements as any[])?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" /> Announcements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(announcements as any[]).slice(0, 3).map((a: any) => (
              <div key={a.id} className={`p-3 rounded-lg border text-sm ${!a.isRead ? "border-primary/30 bg-primary/5" : "bg-muted/30"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{a.title}</p>
                    {a.content && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.content}</p>}
                  </div>
                  {!a.isRead && <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(a.createdAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Document expiry */}
      {expiringDocs.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4" /> Document expiry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiringDocs.map((d: any) => {
              const days = daysUntilExpiry(d.expiresAt);
              return (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span>{DOC_LABELS[d.documentType] ?? d.documentType}</span>
                  <span
                    className={`text-xs font-medium ${
                      days !== null && days < 0 ? "text-red-600" : days !== null && days <= 30 ? "text-red-500" : "text-amber-600"
                    }`}
                  >
                    {days !== null && days < 0 ? "Expired" : days !== null && days === 0 ? "Today" : `${days} days`}
                  </span>
                </div>
              );
            })}
            <Button size="sm" variant="outline" className="w-full mt-1" onClick={() => go("documents")}>
              Open documents
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
