import type { ShiftPhase } from "./employeePortalShift";
import { getShiftOperationalState } from "./employeePortalShift";

/**
 * Thin operational hints for employee portal presentation — not HR policy.
 * Optional fields may grow; clients merge with local defaults when absent.
 */
export interface PortalOperationalHints {
  /**
   * Calendar date used for schedule/holiday row matching (YYYY-MM-DD).
   * Matches `scheduling.getMyActiveSchedule` (`toISOString().slice(0, 10)` on the server).
   * Attendance “today” still uses local midnight in `attendance.myToday` — timezone edge cases may diverge until a single business timezone is modeled.
   */
  businessDate: string;
  /** ISO instant the server used for phase / countdown alignment. */
  serverNowIso: string;
  resolvedShiftPhase: ShiftPhase | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canRequestCorrection: boolean;
  hasPendingCorrection: boolean;
  pendingCorrectionCount: number;
}

export function computePortalOperationalHints(params: {
  now: Date;
  businessDate: string;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  isHoliday: boolean;
  isWorkingDay: boolean;
  hasSchedule: boolean;
  hasShift: boolean;
  checkIn: Date | null;
  checkOut: Date | null;
  pendingCorrectionCount: number;
}): PortalOperationalHints {
  const serverNowIso = params.now.toISOString();
  const operational =
    params.startTime && params.endTime
      ? getShiftOperationalState(params.startTime, params.endTime, params.now)
      : null;
  const resolvedShiftPhase = operational?.phase ?? null;

  const hasIn = !!params.checkIn;
  const hasOut = !!params.checkOut;
  const inconsistent = !hasIn && hasOut;

  const canCheckIn =
    params.hasSchedule &&
    params.hasShift &&
    params.isWorkingDay &&
    !params.isHoliday &&
    !hasIn &&
    !inconsistent;

  const canCheckOut = hasIn && !hasOut && !inconsistent;

  return {
    businessDate: params.businessDate,
    serverNowIso,
    resolvedShiftPhase,
    canCheckIn,
    canCheckOut,
    canRequestCorrection: true,
    hasPendingCorrection: params.pendingCorrectionCount > 0,
    pendingCorrectionCount: params.pendingCorrectionCount,
  };
}
