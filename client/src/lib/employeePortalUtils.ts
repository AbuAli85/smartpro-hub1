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
 * Handles overnight shifts when end <= start on the clock.
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

export function computeProductivityScore(params: {
  attendanceRatePercent: number | null;
  tasks: { status: string }[] | null | undefined;
}): { score: number; hint: string } {
  const { attendanceWeight, taskWeight, neutralAttendanceFallback, neutralTaskFallback } =
    employeePortalConfig.productivity;
  const att =
    params.attendanceRatePercent != null && !Number.isNaN(params.attendanceRatePercent)
      ? params.attendanceRatePercent
      : neutralAttendanceFallback;
  const list = params.tasks ?? [];
  const total = list.length;
  const completed = list.filter((t) => t.status === "completed").length;
  const taskPct = total > 0 ? Math.round((completed / total) * 100) : neutralTaskFallback;
  const score = Math.round(
    Math.min(100, att * attendanceWeight + taskPct * taskWeight)
  );
  let hint = "Based on this month’s attendance and your task completion.";
  if (params.attendanceRatePercent == null && total === 0) {
    hint = "Check in and complete tasks to build your score.";
  } else if (params.attendanceRatePercent == null) {
    hint = "Attendance will weigh more once this month has records.";
  } else if (total === 0) {
    hint = "Task completion will refine this score when you’re assigned work.";
  }
  return { score, hint };
}
