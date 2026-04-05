import { employeePortalConfig } from "@/config/employeePortalConfig";

export type ShiftPhase = "upcoming" | "active" | "ended";

export interface ShiftOperationalState {
  phase: ShiftPhase;
  statusLabel: string;
  statusDotClass: string;
  detailLine: string | null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Format milliseconds as "2h 15m" or "45m" */
export function formatCountdownMs(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/**
 * Compare wall-clock times (HH:mm) to "now" for today's shift row.
 * Handles overnight shifts when end <= start on the clock (e.g. same evening still “active”).
 *
 * Limitation: if the shift started **yesterday** evening and “now” is early morning before
 * today’s parsed start time, this treats the window as **upcoming** — server/local “business
 * date” for the attendance row should be the source of truth for cross-midnight correctness.
 */
export function getShiftOperationalState(
  startTime: string,
  endTime: string,
  now: Date = new Date()
): ShiftOperationalState {
  const parse = (t: string) => {
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    return { h: h || 0, m: Number.isFinite(m) ? m : 0 };
  };
  const a = parse(startTime);
  const b = parse(endTime);
  const start = new Date(now);
  start.setHours(a.h, a.m, 0, 0);
  let end = new Date(now);
  end.setHours(b.h, b.m, 0, 0);
  if (end.getTime() <= start.getTime()) {
    end = new Date(end.getTime() + 86400000);
  }

  const t = now.getTime();
  if (t < start.getTime()) {
    return {
      phase: "upcoming",
      statusLabel: "Upcoming",
      statusDotClass: "bg-amber-500",
      detailLine: `Starts in ${formatCountdownMs(start.getTime() - t)}`,
    };
  }
  if (t <= end.getTime()) {
    return {
      phase: "active",
      statusLabel: "Active now",
      statusDotClass: "bg-emerald-500",
      detailLine: `Ends in ${formatCountdownMs(end.getTime() - t)}`,
    };
  }
  return {
    phase: "ended",
    statusLabel: "Ended",
    statusDotClass: "bg-slate-400",
    detailLine: null,
  };
}

export function titleCaseFirstName(raw: string | null | undefined): string {
  if (!raw?.trim()) return "there";
  const s = raw.trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export type ProductivityDataConfidence = "low" | "medium" | "high";

export interface ProductivitySnapshot {
  score: number;
  hint: string;
  /** Weighted attendance leg before final rounding (0–55 with default weights) */
  attendanceWeightedRaw: number;
  /** Weighted task leg before final rounding (0–45 with default weights) */
  taskWeightedRaw: number;
  /** Rounded display points for attendance leg (may differ slightly from raw with headline score) */
  attendancePointsDisplay: number;
  /** Rounded display points for task leg */
  taskPointsDisplay: number;
  /** Actual attendance % when present; null when neutral fill-in is used */
  attendanceRateActual: number | null;
  /** Task completion % when tasks exist; null when neutral fill-in is used */
  taskCompletionPercentActual: number | null;
  assignedTaskCount: number;
  completedTaskCount: number;
  usedAttendanceFallback: boolean;
  usedTaskFallback: boolean;
  dataConfidence: ProductivityDataConfidence;
  /** Shown under the headline — legal/product posture */
  disclaimer: string;
  /** One-line formula for transparency */
  formulaSummary: string;
}

function productivityConfidence(params: {
  usedAttendanceFallback: boolean;
  usedTaskFallback: boolean;
  taskCount: number;
}): ProductivityDataConfidence {
  const { usedAttendanceFallback, usedTaskFallback, taskCount } = params;
  if (usedAttendanceFallback && usedTaskFallback) return "low";
  if (usedAttendanceFallback || usedTaskFallback) return "medium";
  if (taskCount > 0 && taskCount < 3) return "medium";
  return "high";
}

/**
 * Informal “work activity” index — not an HR performance rating.
 * Formula: round(min(100, attendance%×wA + taskCompletion%×wT)) with neutral substitutes when data is missing.
 */
export function computeProductivityScore(params: {
  attendanceRatePercent: number | null;
  tasks: { status: string }[] | null | undefined;
}): ProductivitySnapshot {
  const { attendanceWeight, taskWeight, neutralAttendanceFallback, neutralTaskFallback } =
    employeePortalConfig.productivity;
  const usedAttendanceFallback =
    params.attendanceRatePercent == null || Number.isNaN(params.attendanceRatePercent as number);
  const att = usedAttendanceFallback ? neutralAttendanceFallback : params.attendanceRatePercent!;
  const list = params.tasks ?? [];
  const total = list.length;
  const completed = list.filter((t) => t.status === "completed").length;
  const usedTaskFallback = total === 0;
  const taskPct = usedTaskFallback ? neutralTaskFallback : Math.round((completed / total) * 100);

  const attendanceWeightedRaw = att * attendanceWeight;
  const taskWeightedRaw = taskPct * taskWeight;
  const score = Math.round(Math.min(100, attendanceWeightedRaw + taskWeightedRaw));
  const attendancePointsDisplay = Math.round(attendanceWeightedRaw);
  const taskPointsDisplay = Math.round(taskWeightedRaw);

  let hint = "Blend of this month’s attendance rate and your assigned task completion.";
  if (usedAttendanceFallback && usedTaskFallback) {
    hint = "Neutral placeholders are filling in until you have monthly attendance rows and assigned tasks.";
  } else if (usedAttendanceFallback) {
    hint = "Attendance uses a neutral placeholder until this month’s summary has enough rows.";
  } else if (usedTaskFallback) {
    hint = "Tasks use a neutral placeholder until you have assigned work in the portal.";
  }

  const dataConfidence = productivityConfidence({
    usedAttendanceFallback,
    usedTaskFallback,
    taskCount: total,
  });

  const disclaimer =
    "Informal snapshot for your awareness only — not a formal performance review, rating, or disciplinary input.";

  const formulaSummary = `round(min(100, attendance×${attendanceWeight} + tasks×${taskWeight}))`;

  return {
    score,
    hint,
    attendanceWeightedRaw,
    taskWeightedRaw,
    attendancePointsDisplay,
    taskPointsDisplay,
    attendanceRateActual: usedAttendanceFallback ? null : params.attendanceRatePercent,
    taskCompletionPercentActual: usedTaskFallback ? null : Math.round((completed / total) * 100),
    assignedTaskCount: total,
    completedTaskCount: completed,
    usedAttendanceFallback,
    usedTaskFallback,
    dataConfidence,
    disclaimer,
    formulaSummary,
  };
}
