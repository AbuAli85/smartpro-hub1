/**
 * When an employee has multiple active schedule rows on the same calendar day
 * (e.g. morning + evening shifts), pick the one that applies to `now` for
 * check-in eligibility, site matching, and portal hints — deterministic, not DB row order.
 */
import { getShiftInstantBounds } from "./employeePortalShift";

export type SchedulePickRow = {
  id: number;
  siteId: number;
  shiftTemplateId: number;
  workingDays: string;
};

export type ShiftTimes = {
  startTime: string;
  endTime: string;
  gracePeriodMinutes?: number | null;
};

function workingDaysNumbers(workingDays: string): number[] {
  return workingDays.split(",").map((x) => Number(x.trim()));
}

/**
 * Picks one schedule row for the given instant.
 *
 * - **Holiday** or **no row for this weekday**: returns the lexically first row by `id` for stable display only.
 * - **Single working row**: returns it.
 * - **Multiple rows same day**: prefers the shift whose wall-clock window contains `now`
 *   (from `start - grace` through `end`, overnight-aware). If none, before first open → first shift;
 *   after last end → last shift; in a gap before the next shift opens → next shift.
 */
export function pickScheduleRowForNow<T extends SchedulePickRow>(params: {
  now: Date;
  businessDate: string;
  dow: number;
  isHoliday: boolean;
  scheduleRows: T[];
  getShift: (shiftTemplateId: number) => ShiftTimes | null | undefined;
}): T | null {
  const { now, businessDate, dow, isHoliday, scheduleRows, getShift } = params;
  if (scheduleRows.length === 0) return null;

  const byId = [...scheduleRows].sort((a, b) => a.id - b.id);
  if (isHoliday) return byId[0] ?? null;

  const workingToday = scheduleRows.filter((s) => workingDaysNumbers(s.workingDays).includes(dow));
  if (workingToday.length === 0) return byId[0] ?? null;

  type Enriched = { row: T; shiftStart: Date; shiftEnd: Date; graceMs: number };
  const enriched: Enriched[] = [];
  const [yy, mm, dd] = businessDate.split("-").map((x) => parseInt(x, 10));
  const dayAnchor = new Date(yy, mm - 1, dd, 12, 0, 0, 0);

  for (const row of workingToday) {
    const st = getShift(row.shiftTemplateId);
    if (!st?.startTime || !st?.endTime) continue;
    const grace = st.gracePeriodMinutes ?? 15;
    const { shiftStart, shiftEnd } = getShiftInstantBounds(st.startTime, st.endTime, dayAnchor);
    enriched.push({ row, shiftStart, shiftEnd, graceMs: grace * 60_000 });
  }

  if (enriched.length === 0) return workingToday.sort((a, b) => a.id - b.id)[0] ?? null;
  if (enriched.length === 1) return enriched[0]!.row;

  enriched.sort((a, b) => a.shiftStart.getTime() - b.shiftStart.getTime());
  const t = now.getTime();

  for (const e of enriched) {
    const open = e.shiftStart.getTime() - e.graceMs;
    const end = e.shiftEnd.getTime();
    if (t >= open && t <= end) return e.row;
  }

  const first = enriched[0]!;
  const last = enriched[enriched.length - 1]!;
  if (t < first.shiftStart.getTime() - first.graceMs) return first.row;
  if (t > last.shiftEnd.getTime()) return last.row;

  for (const e of enriched) {
    if (t < e.shiftStart.getTime() - e.graceMs) return e.row;
  }
  return last.row;
}
