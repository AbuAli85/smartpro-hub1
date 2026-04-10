/**
 * Pure builders for Employee Portal Overview — action center, task/leave stats, timeline, performance copy.
 * Navigation stays in the page; this module only decides what to show and in what order.
 */
import type { OverviewShiftCardPresentation } from "@/lib/employeePortalOverviewPresentation";
import type { ProductivitySnapshot } from "@/lib/employeePortalUtils";
import { getDueUrgency } from "@/lib/taskSla";
import { employeePortalConfig } from "@/config/employeePortalConfig";
import { getShiftInstantBounds } from "@shared/employeePortalShift";
import type { EmployeeWorkStatusSummary } from "@shared/employeePortalWorkStatusSummary";

/** Max priority rows in the home “Top actions” queue (EOS command center). */
export const EMPLOYEE_PORTAL_TOP_ACTIONS_MAX = 5;

export type PortalNavTab =
  | "overview"
  | "more"
  | "attendance"
  | "leave"
  | "payroll"
  | "tasks"
  | "documents"
  | "requests"
  | "kpi"
  | "expenses"
  | "worklog"
  | "training"
  | "reviews"
  | "profile";

export type ActionSeverity = "critical" | "warning" | "info";

/** Action center row category for scanability */
export type ActionCenterCategory = "attendance" | "task" | "hr";

export interface ActionCenterItem {
  key: string;
  severity: ActionSeverity;
  /** attendance | task | HR/compliance */
  actionType: ActionCenterCategory;
  /** Imperative next step (short) */
  nextStep: string;
  headline: string;
  detail: string | null;
  ctaLabel: string;
  tab: PortalNavTab;
}

/** Aligns with portal status system: critical → needs action → due today → on track */
export type AttentionState = "critical" | "needs_action" | "due_today" | "on_track";

export interface AttentionItem {
  key: string;
  state: AttentionState;
  label: string;
}

export interface OverviewTaskStats {
  openCount: number;
  urgentOpen: number;
  highOpen: number;
  overdueCount: number;
  dueTodayCount: number;
  blockedCount: number;
  /** Highest-priority open task for CTA */
  topTask: { id: number; title: string; priority: string; dueDate: string | Date | null } | null;
}

export interface LeaveOverviewSignals {
  pendingCount: number;
  lastRequest: { type: string; status: string; startDate: string | Date } | null;
  warnings: string[];
}

export interface TimelineRow {
  id: string;
  at: Date;
  title: string;
  subtitle: string | null;
}

export interface PerformanceBlock {
  headline: string;
  lines: { label: string; value: string }[];
  footnote: string;
}

export interface ShiftTimingExtras {
  isLateNoCheckIn: boolean;
  /** Shift is active, no check-in yet, still inside grace (before late threshold). */
  lateRiskCheckIn: boolean;
  lateDetail: string | null;
  checkInSummary: string | null;
  checkOutSummary: string | null;
  siteLine: string | null;
  nextStepLine: string;
}

export type HeroSeverity = "critical" | "warning" | "normal";

export interface HeroPresentation {
  /** Primary status chip: Late, On shift, Checked in, Upcoming, etc. */
  stateLabel: string;
  severity: HeroSeverity;
  /** One-line proactive hint (missed check-in, docs, etc.) */
  proactiveHint: string | null;
}

export interface OverviewDashboardModel {
  actionCenter: ActionCenterItem[];
  attentionItems: AttentionItem[];
  taskStats: OverviewTaskStats;
  leaveSignals: LeaveOverviewSignals;
  recentTimeline: TimelineRow[];
  performanceBlock: PerformanceBlock;
  shiftTiming: ShiftTimingExtras | null;
  profileReminder: string | null;
  hero: HeroPresentation | null;
  /** Max 3 short hints for strip under hero */
  proactiveHints: string[];
}

type TaskLike = {
  id: number;
  title?: string | null;
  status: string;
  priority?: string | null;
  dueDate?: string | Date | null;
};

function taskPriorityRank(p: string | undefined | null): number {
  const x = (p ?? "medium").toLowerCase();
  if (x === "urgent") return 0;
  if (x === "high") return 1;
  if (x === "medium") return 2;
  return 3;
}

export function buildOverviewTaskStats(tasks: TaskLike[] | null | undefined, now: Date = new Date()): OverviewTaskStats {
  const list = tasks ?? [];
  const open = list.filter((t) => t.status !== "completed" && t.status !== "cancelled");
  let overdueCount = 0;
  let dueTodayCount = 0;
  let urgentOpen = 0;
  let highOpen = 0;
  let blockedCount = 0;
  for (const t of open) {
    if (t.status === "blocked") blockedCount++;
    const p = (t.priority ?? "medium").toLowerCase();
    if (p === "urgent") urgentOpen++;
    if (p === "high") highOpen++;
    const u = getDueUrgency(t.dueDate, t.status, now);
    if (u === "overdue") overdueCount++;
    if (u === "due_today") dueTodayCount++;
  }
  const sorted = [...open].sort((a, b) => {
    const au = getDueUrgency(a.dueDate, a.status, now);
    const bu = getDueUrgency(b.dueDate, b.status, now);
    const score = (u: ReturnType<typeof getDueUrgency>) =>
      u === "overdue" ? 0 : u === "due_today" ? 1 : u === "upcoming" ? 2 : 3;
    const ds = score(au) - score(bu);
    if (ds !== 0) return ds;
    const pr = taskPriorityRank(a.priority) - taskPriorityRank(b.priority);
    if (pr !== 0) return pr;
    return (a.id ?? 0) - (b.id ?? 0);
  });
  const top = sorted[0];
  return {
    openCount: open.length,
    urgentOpen,
    highOpen,
    overdueCount,
    dueTodayCount,
    blockedCount,
    topTask: top
      ? {
          id: top.id,
          title: top.title ?? "Task",
          priority: top.priority ?? "medium",
          dueDate: top.dueDate ?? null,
        }
      : null,
  };
}

export function buildLeaveOverviewSignals(
  leave: { leaveType: string; status: string; startDate: string | Date; createdAt?: string | Date | null }[],
  balance: { annual: number; sick: number; emergency: number },
  entitlements: { annual: number; sick: number; emergency: number },
): LeaveOverviewSignals {
  const pendingCount = leave.filter((l) => l.status === "pending").length;
  const sorted = [...leave].sort((a, b) => {
    const ta = new Date((a.createdAt as string) ?? a.startDate).getTime();
    const tb = new Date((b.createdAt as string) ?? b.startDate).getTime();
    return tb - ta;
  });
  const lastRequest = sorted[0]
    ? { type: sorted[0].leaveType, status: sorted[0].status, startDate: sorted[0].startDate }
    : null;

  const warnings: string[] = [];
  const { criticalDays, warnRatio } = employeePortalConfig.leave;
  for (const { key, rem, total } of [
    { key: "Annual", rem: balance.annual, total: entitlements.annual },
    { key: "Sick", rem: balance.sick, total: entitlements.sick },
    { key: "Emergency", rem: balance.emergency, total: entitlements.emergency },
  ] as const) {
    if (total <= 0) continue;
    if (rem <= criticalDays) warnings.push(`${key} leave is very low (${rem} days left).`);
    else if (rem / total <= warnRatio) warnings.push(`${key} leave is running low (${rem} of ${total} days left).`);
  }
  return { pendingCount, lastRequest, warnings };
}

function parseNotifDate(n: { createdAt?: string | Date }): Date {
  const t = new Date(n.createdAt as string);
  return Number.isNaN(t.getTime()) ? new Date(0) : t;
}

export function buildRecentTimeline(input: {
  notifications: { id: number; title?: string | null; message?: string | null; createdAt?: string | Date }[];
  checkIn: Date | null;
  checkOut: Date | null;
  leaveForTimeline: { id: number; status: string; leaveType: string; startDate: string | Date; updatedAt?: string | Date | null }[];
  taskEvents: { id: number; title?: string | null; status: string; updatedAt?: string | Date | null }[];
  limit?: number;
}): TimelineRow[] {
  const limit = input.limit ?? 5;
  const rows: TimelineRow[] = [];

  for (const n of input.notifications ?? []) {
    rows.push({
      id: `n-${n.id}`,
      at: parseNotifDate(n),
      title: n.title ?? "Notification",
      subtitle: n.message ? String(n.message).slice(0, 120) : null,
    });
  }

  if (input.checkIn) {
    rows.push({
      id: "att-in",
      at: input.checkIn,
      title: "Checked in",
      subtitle: input.checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  }
  if (input.checkOut) {
    rows.push({
      id: "att-out",
      at: input.checkOut,
      title: "Checked out",
      subtitle: input.checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    });
  }

  for (const l of input.leaveForTimeline ?? []) {
    const st = l.status;
    if (st !== "approved" && st !== "rejected" && st !== "pending") continue;
    const at = new Date((l.updatedAt as string) ?? l.startDate);
    rows.push({
      id: `leave-${l.id}`,
      at,
      title:
        st === "approved"
          ? "Leave approved"
          : st === "rejected"
            ? "Leave request updated"
            : "Leave request submitted",
      subtitle: `${l.leaveType} · ${st}`,
    });
  }

  for (const t of input.taskEvents ?? []) {
    if (t.status !== "completed") continue;
    const at = new Date((t.updatedAt as string) ?? 0);
    if (Number.isNaN(at.getTime())) continue;
    rows.push({
      id: `task-${t.id}`,
      at,
      title: "Task completed",
      subtitle: t.title ?? null,
    });
  }

  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows.slice(0, limit);
}

export function buildPerformanceBlock(
  productivity: ProductivitySnapshot,
  attSummary: { present: number; late: number; absent: number; total: number },
  taskStats: OverviewTaskStats,
  trainingDue: number,
  pendingReviews: number,
): PerformanceBlock {
  const attTotal = attSummary.total;
  const consistency =
    attTotal > 0
      ? `${Math.round(((attSummary.present + attSummary.late) / attTotal) * 100)}% present or late (this month, HR marks)`
      : "No HR attendance rows for this month yet — use check-ins as your live record.";

  const taskLine =
    taskStats.openCount === 0
      ? "No open tasks in the portal."
      : `${taskStats.openCount} open · ${taskStats.overdueCount} overdue · ${taskStats.dueTodayCount} due today`;

  const lines: { label: string; value: string }[] = [
    { label: "Attendance (month view)", value: consistency },
    { label: "Tasks", value: taskLine },
  ];

  if (trainingDue > 0) {
    lines.push({ label: "Training", value: `${trainingDue} module${trainingDue === 1 ? "" : "s"} need attention` });
  } else {
    lines.push({ label: "Training", value: "Nothing overdue in your assigned list" });
  }

  lines.push({
    label: "Reviews",
    value: pendingReviews > 0 ? `${pendingReviews} self-review${pendingReviews === 1 ? "" : "s"} to complete` : "No pending self-reviews",
  });

  const headline =
    productivity.dataConfidence === "low"
      ? "Informal activity index (limited data)"
      : productivity.dataConfidence === "medium"
        ? "Informal activity index"
        : "Activity index";

  const footnote =
    productivity.dataConfidence === "low"
      ? "Score uses neutral placeholders until attendance summaries and tasks are both meaningful — not a performance rating."
      : productivity.disclaimer;

  return { headline, lines, footnote };
}

export function buildShiftTimingExtras(input: {
  shift: { startTime?: string | null; endTime?: string | null; gracePeriodMinutes?: number | null } | null;
  isWorkingDay: boolean;
  hasHoliday: boolean;
  now: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  shiftOverview: OverviewShiftCardPresentation;
  primaryCtaLabel: string;
  siteName: string | null | undefined;
}): ShiftTimingExtras | null {
  const { shift, isWorkingDay, hasHoliday, now, checkIn, checkOut, shiftOverview, primaryCtaLabel, siteName } = input;
  if (hasHoliday || !shift?.startTime || !shift?.endTime) return null;

  const { shiftStart, shiftEnd } = getShiftInstantBounds(shift.startTime, shift.endTime, now);
  const graceMs = Math.max(0, (shift.gracePeriodMinutes ?? 0) * 60_000);
  const lateThreshold = shiftStart.getTime() + graceMs;
  const isLateNoCheckIn =
    isWorkingDay &&
    !checkIn &&
    now.getTime() > lateThreshold &&
    (shiftOverview.phase === "active" || shiftOverview.phase === "ended");

  const lateRiskCheckIn =
    isWorkingDay &&
    !checkIn &&
    now.getTime() >= shiftStart.getTime() &&
    now.getTime() <= lateThreshold &&
    shiftOverview.phase === "active";

  let lateDetail: string | null = null;
  if (isLateNoCheckIn) {
    const mins = Math.max(1, Math.round((now.getTime() - lateThreshold) / 60_000));
    lateDetail =
      shiftOverview.phase === "ended"
        ? `No check-in recorded; shift ended (${mins} min past grace window).`
        : `No check-in yet — ${mins} min past your grace window.`;
  }

  return {
    isLateNoCheckIn,
    lateRiskCheckIn,
    lateDetail,
    checkInSummary: checkIn ? `Checked in ${checkIn.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : null,
    checkOutSummary: checkOut ? `Checked out ${checkOut.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : null,
    siteLine: siteName ? `Site: ${siteName}` : null,
    nextStepLine: `Next step: ${primaryCtaLabel}`,
  };
}

export function profileCompletenessReminder(emp: {
  phone?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
} | null | undefined): string | null {
  if (!emp) return null;
  const missing: string[] = [];
  if (!emp.phone?.trim()) missing.push("phone");
  if (!emp.emergencyContact?.trim()) missing.push("emergency contact name");
  if (!emp.emergencyPhone?.trim()) missing.push("emergency phone");
  if (missing.length === 0) return null;
  return `Complete your profile: add ${missing.join(", ")}.`;
}

/**
 * Single hero chip + severity for mobile-first status (no fake data).
 */
export function buildHeroPresentation(input: {
  todayAttendanceLoading: boolean;
  myActiveSchedule: {
    isHoliday?: boolean;
    schedule?: unknown;
    shift?: unknown;
    hasSchedule?: boolean;
    isWorkingDay?: boolean;
  } | null | undefined;
  shiftOverview: OverviewShiftCardPresentation;
  shiftTiming: ShiftTimingExtras | null;
  checkIn: Date | null;
  checkOut: Date | null;
}): HeroPresentation | null {
  if (input.todayAttendanceLoading) return null;
  const s = input.myActiveSchedule;
  if (s?.isHoliday) {
    return { stateLabel: "Holiday", severity: "normal", proactiveHint: null };
  }
  if (s != null && s.hasSchedule === false) {
    return {
      stateLabel: "No schedule",
      severity: "warning",
      proactiveHint: "Ask HR to assign your shift.",
    };
  }
  const hasShift = !!(s?.schedule && (s as { shift?: unknown }).shift);
  if (hasShift && s?.isWorkingDay === false) {
    return { stateLabel: "Off today", severity: "normal", proactiveHint: null };
  }

  if (input.shiftOverview.attendanceInconsistent) {
    return {
      stateLabel: "Action needed",
      severity: "critical",
      proactiveHint: "Attendance record is inconsistent — use Correction.",
    };
  }
  if (input.shiftOverview.showMissedEndedWarning) {
    return {
      stateLabel: "Missed attendance",
      severity: "critical",
      proactiveHint: "No record for this shift — request correction if you worked.",
    };
  }

  if (input.checkIn && !input.checkOut) {
    if (input.shiftOverview.phase === "ended") {
      return {
        stateLabel: "Missing check-out",
        severity: "warning",
        proactiveHint: "Shift ended with no check-out — complete it or submit a correction.",
      };
    }
    return { stateLabel: "Checked in", severity: "normal", proactiveHint: null };
  }
  if (input.checkIn && input.checkOut) {
    return { stateLabel: "Checked out", severity: "normal", proactiveHint: null };
  }

  if (input.shiftTiming?.isLateNoCheckIn) {
    return {
      stateLabel: "Late",
      severity: "critical",
      proactiveHint: input.shiftTiming.lateDetail,
    };
  }

  const phase = input.shiftOverview.phase;
  if (phase === "active") {
    if (input.shiftTiming?.lateRiskCheckIn) {
      return {
        stateLabel: "Late risk",
        severity: "warning",
        proactiveHint: "Grace window — check in now to avoid a late mark.",
      };
    }
    return {
      stateLabel: "On shift",
      severity: "warning",
      proactiveHint: "Check in now to record attendance.",
    };
  }
  if (phase === "upcoming") {
    return { stateLabel: "Upcoming", severity: "normal", proactiveHint: null };
  }
  if (phase === "ended") {
    return { stateLabel: "Shift ended", severity: "normal", proactiveHint: null };
  }
  return { stateLabel: "Today", severity: "normal", proactiveHint: null };
}

export function buildOverviewDashboardModel(input: {
  shiftOverview: OverviewShiftCardPresentation;
  myActiveSchedule: {
    isHoliday?: boolean;
    schedule?: unknown;
    shift?: { startTime?: string | null; endTime?: string | null; gracePeriodMinutes?: number | null } | null;
    site?: { name?: string | null } | null;
    hasSchedule?: boolean;
    isWorkingDay?: boolean;
  } | null | undefined;
  todayAttendanceRecord: { checkIn?: string | Date | null; checkOut?: string | Date | null; siteName?: string | null } | null | undefined;
  workStatusSummary: EmployeeWorkStatusSummary | null | undefined;
  expiringDocs: { id: number; documentType?: string; expiresAt?: string | null }[];
  tasks: TaskLike[] | null | undefined;
  leave: { id: number; leaveType: string; status: string; startDate: string | Date; createdAt?: string | Date | null; updatedAt?: string | Date | null }[];
  balance: { annual: number; sick: number; emergency: number };
  entitlements: { annual: number; sick: number; emergency: number };
  productivity: ProductivitySnapshot;
  attSummary: { present: number; late: number; absent: number; total: number };
  notifications: { id: number; title?: string | null; message?: string | null; createdAt?: string | Date }[];
  myTraining?: { trainingStatus?: string | null }[] | null;
  mySelfReviews?: { reviewStatus?: string | null }[] | null;
  emp?: { phone?: string | null; emergencyContact?: string | null; emergencyPhone?: string | null } | null;
  /** Pending shift / time-off requests (portal queue). */
  pendingShiftRequests?: number;
  /** Pending expense submissions. */
  pendingExpenses?: number;
  now?: Date;
  /** When true, hero is omitted (loading); proactive hints stay conservative */
  todayAttendanceLoading?: boolean;
}): OverviewDashboardModel {
  const now = input.now ?? new Date();
  const checkIn = input.todayAttendanceRecord?.checkIn ? new Date(input.todayAttendanceRecord.checkIn) : null;
  const checkOut = input.todayAttendanceRecord?.checkOut ? new Date(input.todayAttendanceRecord.checkOut) : null;

  const taskStats = buildOverviewTaskStats(input.tasks, now);
  const leaveSignals = buildLeaveOverviewSignals(input.leave, input.balance, input.entitlements);

  const trainingDue =
    (input.myTraining ?? []).filter(
      (t) => t.trainingStatus === "overdue" || t.trainingStatus === "assigned",
    ).length ?? 0;

  const pendingReviews = (input.mySelfReviews ?? []).filter((r) => r.reviewStatus === "draft").length;

  const performanceBlock = buildPerformanceBlock(
    input.productivity,
    input.attSummary,
    taskStats,
    trainingDue,
    pendingReviews,
  );

  const sched = input.myActiveSchedule;
  const isHoliday = !!sched?.isHoliday;
  const hasShift = !!(sched?.schedule && sched?.shift);
  const isWorkingDay = hasShift && !isHoliday && (sched as { isWorkingDay?: boolean }).isWorkingDay !== false;

  const primaryCta = input.shiftOverview.primaryCtaLabel;
  const shiftTiming =
    sched?.shift && hasShift
      ? buildShiftTimingExtras({
          shift: sched.shift,
          isWorkingDay: !!isWorkingDay,
          hasHoliday: isHoliday,
          now,
          checkIn,
          checkOut,
          shiftOverview: input.shiftOverview,
          primaryCtaLabel: primaryCta,
          siteName: sched.site?.name ?? input.todayAttendanceRecord?.siteName,
        })
      : null;

  const profileReminder = profileCompletenessReminder(input.emp);

  const expiredDocs = input.expiringDocs.filter((d) => {
    if (!d.expiresAt) return false;
    return new Date(d.expiresAt).getTime() < now.getTime();
  });
  const soonDocs = input.expiringDocs.filter((d) => {
    if (!d.expiresAt) return false;
    const days = Math.ceil((new Date(d.expiresAt).getTime() - now.getTime()) / 86400000);
    return days >= 0 && days <= 14;
  });

  type Candidate = { score: number; item: ActionCenterItem };
  const candidates: Candidate[] = [];

  if (input.shiftOverview.attendanceInconsistent) {
    candidates.push({
      score: 100,
      item: {
        key: "att-inconsistent",
        severity: "critical",
        actionType: "attendance",
        nextStep: "Attendance → Correction",
        headline: "Attendance needs review",
        detail: "Check-out without check-in — HR must fix the record.",
        ctaLabel: "Go to attendance",
        tab: "attendance",
      },
    });
  }

  if (input.shiftOverview.showMissedEndedWarning) {
    candidates.push({
      score: 95,
      item: {
        key: "missed-ended",
        severity: "critical",
        actionType: "attendance",
        nextStep: "Submit a correction",
        headline: "No attendance for today’s shift",
        detail: input.shiftOverview.correctionPendingNote ?? "Correction if you worked today.",
        ctaLabel: "Fix attendance",
        tab: "attendance",
      },
    });
  }

  if (input.workStatusSummary?.overallStatus === "urgent") {
    const pa = input.workStatusSummary.primaryAction;
    if (pa.type !== "none") {
      candidates.push({
        score: 88,
        item: {
          key: "work-urgent",
          severity: "critical",
          actionType: "hr",
          nextStep: "Resolve permit or documents",
          headline: "HR: urgent items",
          detail: [input.workStatusSummary.permit.label, input.workStatusSummary.documents.label].join(" · "),
          ctaLabel: pa.label,
          tab: (pa.tab as PortalNavTab) ?? "documents",
        },
      });
    }
  }

  if (expiredDocs.length > 0) {
    candidates.push({
      score: 86,
      item: {
        key: "docs-expired",
        severity: "critical",
        actionType: "hr",
        nextStep: "Renew or upload in Documents",
        headline: "Expired documents",
        detail: `${expiredDocs.length} past expiry — update now.`,
        ctaLabel: "Open documents",
        tab: "documents",
      },
    });
  }

  if (taskStats.overdueCount > 0) {
    candidates.push({
      score: 84,
      item: {
        key: "tasks-overdue",
        severity: "warning",
        actionType: "task",
        nextStep: "Finish the oldest overdue task first",
        headline: `${taskStats.overdueCount} overdue task${taskStats.overdueCount === 1 ? "" : "s"}`,
        detail: taskStats.topTask ? `Start: ${taskStats.topTask.title}` : null,
        ctaLabel: taskStats.topTask ? "Open top task" : "Open tasks",
        tab: "tasks",
      },
    });
  }

  if (input.shiftOverview.showMissedActiveWarning || (shiftTiming?.isLateNoCheckIn && !input.shiftOverview.attendancePending)) {
    candidates.push({
      score: 80,
      item: {
        key: "check-in",
        severity: "warning",
        actionType: "attendance",
        nextStep: "Check in at your assigned site",
        headline: shiftTiming?.isLateNoCheckIn ? "Late — check in now" : "Check in for your shift",
        detail: shiftTiming?.lateDetail ?? "Shift is active — no check-in yet.",
        ctaLabel: primaryCta.includes("Check") ? primaryCta : "Check in now",
        tab: "attendance",
      },
    });
  }

  if (taskStats.dueTodayCount > 0 && taskStats.overdueCount === 0) {
    candidates.push({
      score: 58,
      item: {
        key: "tasks-today",
        severity: "info",
        actionType: "task",
        nextStep: "Complete tasks due today",
        headline: `${taskStats.dueTodayCount} due today`,
        detail: taskStats.topTask?.title ?? null,
        ctaLabel: "Open tasks",
        tab: "tasks",
      },
    });
  }

  if (soonDocs.length > 0 && expiredDocs.length === 0) {
    candidates.push({
      score: 56,
      item: {
        key: "docs-soon",
        severity: "warning",
        actionType: "hr",
        nextStep: "Review expiring files",
        headline: "Documents expiring soon",
        detail: `${soonDocs.length} renew within 2 weeks.`,
        ctaLabel: "Review documents",
        tab: "documents",
      },
    });
  }

  if (trainingDue > 0) {
    candidates.push({
      score: 54,
      item: {
        key: "training",
        severity: "info",
        actionType: "hr",
        nextStep: "Complete assigned modules",
        headline: "Training waiting",
        detail: `${trainingDue} module${trainingDue === 1 ? "" : "s"} assigned or overdue.`,
        ctaLabel: "Open training",
        tab: "training",
      },
    });
  }

  if (input.workStatusSummary?.overallStatus === "needs_attention") {
    const pa = input.workStatusSummary.primaryAction;
    if (pa.type !== "none") {
      candidates.push({
        score: 52,
        item: {
          key: "work-attn",
          severity: "warning",
          actionType: "hr",
          nextStep: "Clear permit / docs / tasks",
          headline: "Work status needs attention",
          detail: input.workStatusSummary.tasks.label,
          ctaLabel: pa.label,
          tab: (pa.tab as PortalNavTab) ?? "tasks",
        },
      });
    }
  }

  if (leaveSignals.pendingCount > 0) {
    candidates.push({
      score: 35,
      item: {
        key: "leave-pending",
        severity: "info",
        actionType: "hr",
        nextStep: "Track approval in Leave",
        headline: "Leave awaiting approval",
        detail: `${leaveSignals.pendingCount} open request${leaveSignals.pendingCount === 1 ? "" : "s"}.`,
        ctaLabel: "View leave",
        tab: "leave",
      },
    });
  }

  const pendingShifts = input.pendingShiftRequests ?? 0;
  if (pendingShifts > 0) {
    candidates.push({
      score: 34,
      item: {
        key: "shift-req-pending",
        severity: "info",
        actionType: "hr",
        nextStep: "Follow up on shift or time-off requests",
        headline: "Shift requests pending",
        detail: `${pendingShifts} open submission${pendingShifts === 1 ? "" : "s"} awaiting HR.`,
        ctaLabel: "Open requests",
        tab: "requests",
      },
    });
  }

  const pendingEx = input.pendingExpenses ?? 0;
  if (pendingEx > 0) {
    candidates.push({
      score: 33,
      item: {
        key: "expense-pending",
        severity: "info",
        actionType: "hr",
        nextStep: "Track reimbursement status",
        headline: "Expenses pending review",
        detail: `${pendingEx} claim${pendingEx === 1 ? "" : "s"} in the queue.`,
        ctaLabel: "Open expenses",
        tab: "expenses",
      },
    });
  }

  if (profileReminder) {
    candidates.push({
      score: 32,
      item: {
        key: "profile",
        severity: "info",
        actionType: "hr",
        nextStep: "Add missing profile fields",
        headline: "Profile incomplete",
        detail: profileReminder,
        ctaLabel: "Edit profile",
        tab: "profile",
      },
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      score: 0,
      item: {
        key: "all-clear",
        severity: "info",
        actionType: "attendance",
        nextStep: "Keep attendance and tasks current",
        headline: "On track",
        detail: null,
        ctaLabel: primaryCta,
        tab: "attendance",
      },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const actionCenter: ActionCenterItem[] = [];
  for (const c of candidates) {
    if (seen.has(c.item.key)) continue;
    seen.add(c.item.key);
    actionCenter.push(c.item);
    if (actionCenter.length >= EMPLOYEE_PORTAL_TOP_ACTIONS_MAX) break;
  }

  const attentionItems: AttentionItem[] = [];
  const addAtt = (x: AttentionItem) => {
    if (attentionItems.length >= 5) return;
    if (attentionItems.some((a) => a.key === x.key)) return;
    attentionItems.push(x);
  };

  if (input.shiftOverview.attendanceInconsistent) {
    addAtt({ key: "a1", state: "critical", label: "Attendance record inconsistent" });
  }
  if (taskStats.overdueCount > 0) {
    addAtt({ key: "a2", state: "critical", label: `${taskStats.overdueCount} overdue tasks` });
  }
  if (taskStats.blockedCount > 0) {
    addAtt({ key: "a2b", state: "needs_action", label: `${taskStats.blockedCount} blocked` });
  }
  if (taskStats.dueTodayCount > 0 && taskStats.overdueCount === 0) {
    addAtt({
      key: "a2c",
      state: "due_today",
      label: `${taskStats.dueTodayCount} task${taskStats.dueTodayCount === 1 ? "" : "s"} due today`,
    });
  }
  if (expiredDocs.length > 0) {
    addAtt({ key: "a3", state: "critical", label: "Expired documents" });
  }
  if (input.shiftOverview.showMissedActiveWarning || shiftTiming?.isLateNoCheckIn) {
    addAtt({ key: "a4", state: "needs_action", label: "Check-in required" });
  }
  if (trainingDue > 0) {
    addAtt({ key: "a5", state: "needs_action", label: "Training due" });
  }
  if (pendingReviews > 0) {
    addAtt({ key: "a6", state: "needs_action", label: "Self-review pending" });
  }

  const recentTimeline = buildRecentTimeline({
    notifications: input.notifications,
    checkIn,
    checkOut,
    leaveForTimeline: input.leave,
    taskEvents: (input.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      updatedAt: (t as { updatedAt?: string | Date }).updatedAt,
    })),
  });

  const todayAttendanceLoading = input.todayAttendanceLoading ?? false;
  const hero = todayAttendanceLoading
    ? null
    : buildHeroPresentation({
        todayAttendanceLoading: false,
        myActiveSchedule: input.myActiveSchedule,
        shiftOverview: input.shiftOverview,
        shiftTiming,
        checkIn,
        checkOut,
      });

  const proactiveHints: string[] = [];
  const pushHint = (msg: string) => {
    if (proactiveHints.length >= 3) return;
    if (proactiveHints.includes(msg)) return;
    if (hero?.proactiveHint && msg === hero.proactiveHint) return;
    proactiveHints.push(msg);
  };

  if (!todayAttendanceLoading) {
    if (taskStats.overdueCount > 0) {
      pushHint(
        taskStats.overdueCount === 1
          ? "1 task is overdue — open Tasks."
          : `${taskStats.overdueCount} tasks are overdue — open Tasks.`,
      );
    }
    if (profileReminder) pushHint(profileReminder);
    if (expiredDocs.length > 0) {
      pushHint(
        expiredDocs.length === 1
          ? "1 expired document — update in Documents."
          : `${expiredDocs.length} expired documents — update in Documents.`,
      );
    }
    if (soonDocs.length > 0 && expiredDocs.length === 0) {
      pushHint(`${soonDocs.length} document(s) expiring within 2 weeks.`);
    }
    if (input.shiftOverview.showMissedActiveWarning && !checkIn) {
      pushHint("No check-in yet for your active shift.");
    }
  }

  return {
    actionCenter,
    attentionItems,
    taskStats,
    leaveSignals,
    recentTimeline,
    performanceBlock,
    shiftTiming,
    profileReminder,
    hero,
    proactiveHints,
  };
}
