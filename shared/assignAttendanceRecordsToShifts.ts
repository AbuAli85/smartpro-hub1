import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import {
  pickAttendanceRecordForShift,
  isPositiveDurationAttendanceRecord,
  type AttendanceRecordLike,
} from "./pickAttendanceRecordForShift";

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function overlapMs(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Muscat wall clock date key YYYY-MM-DD for `d`, if it matches `businessDate` return minutes from midnight; else null. */
function muscatMinutesFromMidnightOn(d: Date, businessDate: string): number | null {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Muscat",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p = dtf.formatToParts(d);
  const g = (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? "";
  const dateKey = `${g("year")}-${g("month")}-${g("day")}`;
  if (dateKey !== businessDate) return null;
  return parseInt(g("hour"), 10) * 60 + parseInt(g("minute"), 10);
}

export type ShiftRowForAssignment = {
  scheduleId: number;
  siteId: number;
  employeeId: number;
  shiftStartTime: string;
  shiftEndTime: string;
  gracePeriodMinutes: number;
};

/**
 * Prefer a punch whose Muscat check-in falls inside this shift’s wall window (with grace + small pre-buffer).
 * Resolves “one long correction” vs two shift rows: check-in anchors to the intended shift (e.g. morning 10:00).
 */
function pickRecordByCheckInAnchor<T extends AttendanceRecordLike>(
  records: T[],
  businessDate: string,
  shiftStartTime: string,
  shiftEndTime: string,
  gracePeriodMinutes: number
): T | undefined {
  const startM = timeToMinutes(shiftStartTime);
  const endM = timeToMinutes(shiftEndTime);
  if (endM <= startM) return undefined;

  const lo = startM - gracePeriodMinutes - 30;
  const hi = endM + gracePeriodMinutes + 30;

  let best: T | undefined;
  let bestCheckIn = Infinity;
  for (const r of records) {
    if (!isPositiveDurationAttendanceRecord(r)) continue;
    const cinM = muscatMinutesFromMidnightOn(r.checkIn, businessDate);
    if (cinM == null) continue;
    if (cinM >= lo && cinM <= hi) {
      const t = r.checkIn.getTime();
      if (t < bestCheckIn) {
        bestCheckIn = t;
        best = r;
      }
    }
  }
  return best;
}

/**
 * Each physical clock row attaches to at most one schedule row per day.
 * 1) Anchor by Muscat check-in inside shift window.
 * 2) Remaining shifts pick by padded overlap; each record used once.
 */
export function assignAttendanceRecordsToShiftRows<T extends AttendanceRecordLike>(
  shiftRows: ShiftRowForAssignment[],
  recordsByEmployeeId: Map<number, T[]>,
  businessDate: string,
  nowMs: number = Date.now()
): Map<number, T | undefined> {
  const out = new Map<number, T | undefined>();
  for (const s of shiftRows) out.set(s.scheduleId, undefined);

  const byEmp = new Map<number, ShiftRowForAssignment[]>();
  for (const s of shiftRows) {
    const arr = byEmp.get(s.employeeId) ?? [];
    arr.push(s);
    byEmp.set(s.employeeId, arr);
  }

  for (const [employeeId, rows] of byEmp) {
    const records = (recordsByEmployeeId.get(employeeId) ?? []).filter(isPositiveDurationAttendanceRecord);
    const used = new Set<number>();

    const sorted = [...rows].sort((a, b) => timeToMinutes(a.shiftStartTime) - timeToMinutes(b.shiftStartTime));

    for (const s of sorted) {
      const pool = records.filter((r) => !used.has(r.id)).filter((r) => r.siteId == null || r.siteId === s.siteId);
      const anchored = pickRecordByCheckInAnchor(
        pool.length ? pool : records.filter((r) => !used.has(r.id)),
        businessDate,
        s.shiftStartTime,
        s.shiftEndTime,
        s.gracePeriodMinutes
      );
      if (anchored) {
        out.set(s.scheduleId, anchored);
        used.add(anchored.id);
      }
    }

    for (const s of sorted) {
      if (out.get(s.scheduleId)) continue;
      const pool = records.filter((r) => !used.has(r.id));
      const picked = pickAttendanceRecordForShift(
        pool,
        s.siteId,
        businessDate,
        s.shiftStartTime,
        s.shiftEndTime,
        s.gracePeriodMinutes,
        nowMs
      );
      if (picked) {
        out.set(s.scheduleId, picked);
        used.add(picked.id);
      }
    }
  }

  return out;
}

/**
 * True when every working schedule row for the employee has a closed attendance punch
 * assigned to it (same rules as Today’s Board assignment).
 */
export function allWorkingShiftRowsHaveClosedAttendance<T extends AttendanceRecordLike>(
  shiftRows: ShiftRowForAssignment[],
  employeeId: number,
  dayRecords: T[],
  businessDate: string,
  nowMs: number
): boolean {
  if (shiftRows.length === 0) return false;
  const clean = dayRecords.filter(isPositiveDurationAttendanceRecord);
  const byEmp = new Map<number, T[]>([[employeeId, clean]]);
  const m = assignAttendanceRecordsToShiftRows(shiftRows, byEmp, businessDate, nowMs);
  for (const s of shiftRows) {
    const r = m.get(s.scheduleId);
    if (!r?.checkOut) return false;
  }
  return true;
}

/** Minutes of overlap between the attendance interval and the nominal shift window (Muscat, same calendar day). */
export function attendanceOverlapShiftMinutes(
  checkIn: Date,
  checkOut: Date | null,
  businessDate: string,
  shiftStartTime: string,
  shiftEndTime: string,
  nowMs: number
): number {
  let winStart = muscatWallDateTimeToUtc(businessDate, `${shiftStartTime}:00`).getTime();
  let winEnd = muscatWallDateTimeToUtc(businessDate, `${shiftEndTime}:00`).getTime();
  if (winEnd <= winStart) winEnd += 86_400_000;
  const rStart = checkIn.getTime();
  const rEnd = checkOut ? checkOut.getTime() : nowMs;
  return Math.max(0, Math.round(overlapMs(rStart, rEnd, winStart, winEnd) / 60_000));
}
