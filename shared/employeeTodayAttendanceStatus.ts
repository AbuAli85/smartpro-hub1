function fmtHm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function fmtYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export interface EmployeeTodayStatusModel {
  /** Single primary line for the “Today status” block */
  primaryLine: string;
  /** Optional subtitle (pending HR, Muscat date label, etc.) */
  secondaryLine: string | null;
}

/**
 * Compact official today status for the employee attendance tab — driven by server hints + strip flags.
 */
type HintsLike = {
  businessDate: string;
  eligibilityHeadline: string;
  eligibilityDetail: string;
  hasPendingCorrection: boolean;
  pendingCorrectionCount: number;
  hasPendingManualCheckIn: boolean;
  pendingManualCheckInCount: number;
  allShiftsHaveClosedAttendance: boolean;
};

export function buildEmployeeTodayAttendanceStatus(params: {
  hints: HintsLike | null | undefined;
  hintsReady: boolean;
  /** From getAttendanceTodayStripPresentation */
  attendanceInconsistent: boolean;
  /** Shift-matched punch times (same as card) */
  checkIn: Date | null;
  checkOut: Date | null;
  isHoliday: boolean;
  hasSchedule: boolean;
  isWorkingDay: boolean;
}): EmployeeTodayStatusModel {
  if (!params.hintsReady) {
    return { primaryLine: "Loading today’s status…", secondaryLine: null };
  }
  if (!params.hints) {
    return {
      primaryLine: "Attendance status unavailable",
      secondaryLine: "Your employee profile may be incomplete — contact HR.",
    };
  }

  const h = params.hints;
  const dateLine = fmtYmdShort(h.businessDate);

  if (params.attendanceInconsistent) {
    return {
      primaryLine: "Needs HR review",
      secondaryLine: "Attendance record is inconsistent — use Fix attendance.",
    };
  }

  const pendingBits: string[] = [];
  if (h.hasPendingCorrection) {
    pendingBits.push(
      h.pendingCorrectionCount > 1
        ? `${h.pendingCorrectionCount} correction requests pending`
        : "Correction request pending"
    );
  }
  if (h.hasPendingManualCheckIn) {
    pendingBits.push(
      h.pendingManualCheckInCount > 1
        ? `${h.pendingManualCheckInCount} manual check-in requests pending`
        : "Manual attendance request pending"
    );
  }
  if (pendingBits.length > 0) {
    return {
      primaryLine: "Needs HR review",
      secondaryLine: `${pendingBits.join(" · ")} (${dateLine})`,
    };
  }

  if (params.isHoliday && params.hasSchedule) {
    return {
      primaryLine: "No attendance required",
      secondaryLine: `Company holiday · ${dateLine}`,
    };
  }

  if (params.hasSchedule && !params.isWorkingDay) {
    return {
      primaryLine: "Not a working day",
      secondaryLine: dateLine,
    };
  }

  if (params.checkIn && !params.checkOut) {
    return {
      primaryLine: `Checked in at ${fmtHm(params.checkIn)} · Not checked out`,
      secondaryLine: dateLine,
    };
  }

  if (params.checkIn && params.checkOut && h.allShiftsHaveClosedAttendance) {
    return {
      primaryLine: `Day complete · Checked out at ${fmtHm(params.checkOut)}`,
      secondaryLine: dateLine,
    };
  }

  if (params.checkIn && params.checkOut && !h.allShiftsHaveClosedAttendance) {
    return {
      primaryLine: `Checked out at ${fmtHm(params.checkOut)} · Next shift pending`,
      secondaryLine: dateLine,
    };
  }

  if (!params.checkIn && !params.checkOut) {
    return {
      primaryLine: "No attendance recorded today",
      secondaryLine: `${h.eligibilityHeadline} · ${dateLine}`,
    };
  }

  return {
    primaryLine: h.eligibilityHeadline,
    secondaryLine: `${h.eligibilityDetail} · ${dateLine}`,
  };
}
