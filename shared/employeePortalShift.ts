/**
 * Shared shift clock helpers for employee portal — used by client UI and server hints.
 * Business date / policy remain server concerns; this only compares wall times to a given `now`.
 */

export type ShiftPhase = "upcoming" | "active" | "ended";

export interface ShiftOperationalState {
  phase: ShiftPhase;
  statusLabel: string;
  statusDotClass: string;
  detailLine: string | null;
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
 * Compare wall-clock times (HH:mm) to `now` for today’s shift row.
 * Handles overnight shifts when end <= start on the clock.
 *
 * Limitation: early morning after an overnight shift before today’s parsed start time
 * is treated as **upcoming** — authoritative business date / shift assignment belongs on the server.
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
