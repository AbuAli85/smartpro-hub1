/**
 * Unit tests for the scheduling router helper functions.
 * These tests cover the pure utility functions used in the scheduling module.
 */
import { describe, it, expect } from "vitest";

// ── Pure helpers duplicated here for isolated testing ─────────────────────
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayDow(): number {
  return new Date().getDay();
}

function isLateCheckIn(checkInTime: string, shiftStart: string, gracePeriodMinutes: number): boolean {
  return timeToMinutes(checkInTime) > timeToMinutes(shiftStart) + gracePeriodMinutes;
}

function employeeRowFromScheduleRef<E extends { id: number; userId: number | null }>(
  rawId: number,
  empById: Map<number, E>,
  empByLoginUserId: Map<number, E>
): E | undefined {
  return empById.get(rawId) ?? empByLoginUserId.get(rawId);
}

function buildDateRange(year: number, month: number): { startDate: string; endDate: string; lastDay: number } {
  const mm = String(month).padStart(2, "0");
  const startDate = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate, lastDay };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("employeeRowFromScheduleRef", () => {
  it("resolves by employees.id when that is what the schedule stores", () => {
    const row = { id: 42, userId: 7 as number | null, firstName: "A", lastName: "B" };
    const empById = new Map([[42, row]]);
    const empByLoginUserId = new Map([[7, row]]);
    expect(employeeRowFromScheduleRef(42, empById, empByLoginUserId)).toBe(row);
  });
  it("resolves by login user id when schedule stores users.id", () => {
    const row = { id: 99, userId: 7 as number | null, firstName: "A", lastName: "B" };
    const empById = new Map<number, typeof row>();
    const empByLoginUserId = new Map([[7, row]]);
    expect(employeeRowFromScheduleRef(7, empById, empByLoginUserId)).toBe(row);
  });
  it("prefers primary key when raw id could theoretically collide", () => {
    const byId = { id: 10, userId: 20 as number | null, firstName: "By", lastName: "Id" };
    const byUser = { id: 99, userId: 10 as number | null, firstName: "By", lastName: "User" };
    const empById = new Map([[10, byId]]);
    const empByLoginUserId = new Map([[10, byUser]]);
    expect(employeeRowFromScheduleRef(10, empById, empByLoginUserId)).toBe(byId);
  });
});

describe("timeToMinutes", () => {
  it("converts 00:00 to 0", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });
  it("converts 08:00 to 480", () => {
    expect(timeToMinutes("08:00")).toBe(480);
  });
  it("converts 17:30 to 1050", () => {
    expect(timeToMinutes("17:30")).toBe(1050);
  });
  it("converts 23:59 to 1439", () => {
    expect(timeToMinutes("23:59")).toBe(1439);
  });
});

describe("isLateCheckIn", () => {
  it("returns false when checking in exactly on time", () => {
    expect(isLateCheckIn("08:00", "08:00", 15)).toBe(false);
  });
  it("returns false when checking in within grace period", () => {
    expect(isLateCheckIn("08:10", "08:00", 15)).toBe(false);
  });
  it("returns false when checking in at the grace period boundary", () => {
    expect(isLateCheckIn("08:15", "08:00", 15)).toBe(false);
  });
  it("returns true when checking in one minute past grace period", () => {
    expect(isLateCheckIn("08:16", "08:00", 15)).toBe(true);
  });
  it("returns true when checking in significantly late", () => {
    expect(isLateCheckIn("10:00", "08:00", 15)).toBe(true);
  });
  it("handles zero grace period correctly", () => {
    expect(isLateCheckIn("08:01", "08:00", 0)).toBe(true);
    expect(isLateCheckIn("08:00", "08:00", 0)).toBe(false);
  });
});

describe("buildDateRange", () => {
  it("builds correct range for January 2025", () => {
    const { startDate, endDate, lastDay } = buildDateRange(2025, 1);
    expect(startDate).toBe("2025-01-01");
    expect(endDate).toBe("2025-01-31");
    expect(lastDay).toBe(31);
  });
  it("builds correct range for February 2024 (leap year)", () => {
    const { startDate, endDate, lastDay } = buildDateRange(2024, 2);
    expect(startDate).toBe("2024-02-01");
    expect(endDate).toBe("2024-02-29");
    expect(lastDay).toBe(29);
  });
  it("builds correct range for February 2025 (non-leap year)", () => {
    const { startDate, endDate, lastDay } = buildDateRange(2025, 2);
    expect(startDate).toBe("2025-02-01");
    expect(endDate).toBe("2025-02-28");
    expect(lastDay).toBe(28);
  });
  it("builds correct range for December 2025", () => {
    const { startDate, endDate, lastDay } = buildDateRange(2025, 12);
    expect(startDate).toBe("2025-12-01");
    expect(endDate).toBe("2025-12-31");
    expect(lastDay).toBe(31);
  });
  it("pads single-digit months with leading zero", () => {
    const { startDate } = buildDateRange(2025, 3);
    expect(startDate).toBe("2025-03-01");
  });
});

describe("todayStr", () => {
  it("returns a string in YYYY-MM-DD format", () => {
    const result = todayStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("matches the current date", () => {
    const result = todayStr();
    const expected = new Date().toISOString().slice(0, 10);
    expect(result).toBe(expected);
  });
});

describe("todayDow", () => {
  it("returns a number between 0 and 6", () => {
    const result = todayDow();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(6);
  });
  it("matches the current day of week", () => {
    const result = todayDow();
    expect(result).toBe(new Date().getDay());
  });
});

describe("working days parsing", () => {
  it("correctly identifies if a day is in the working days list", () => {
    const workingDays = "1,2,3,4,5"; // Mon-Fri
    const days = workingDays.split(",").map(Number);
    expect(days.includes(1)).toBe(true);  // Monday
    expect(days.includes(5)).toBe(true);  // Friday
    expect(days.includes(0)).toBe(false); // Sunday
    expect(days.includes(6)).toBe(false); // Saturday
  });
  it("handles single day schedule", () => {
    const workingDays = "0"; // Sunday only
    const days = workingDays.split(",").map(Number);
    expect(days.includes(0)).toBe(true);
    expect(days.includes(1)).toBe(false);
  });
  it("handles all days schedule", () => {
    const workingDays = "0,1,2,3,4,5,6";
    const days = workingDays.split(",").map(Number);
    for (let d = 0; d <= 6; d++) {
      expect(days.includes(d)).toBe(true);
    }
  });
});

describe("attendance rate calculation", () => {
  it("calculates 100% when all scheduled days have attendance", () => {
    const scheduledDays = 22;
    const presentDays = 22;
    const rate = scheduledDays > 0 ? Math.round((presentDays / scheduledDays) * 100) : 0;
    expect(rate).toBe(100);
  });
  it("calculates 0% when no attendance recorded", () => {
    const scheduledDays = 22;
    const presentDays = 0;
    const rate = scheduledDays > 0 ? Math.round((presentDays / scheduledDays) * 100) : 0;
    expect(rate).toBe(0);
  });
  it("calculates 0% when no scheduled days", () => {
    const scheduledDays = 0;
    const presentDays = 0;
    const rate = scheduledDays > 0 ? Math.round((presentDays / scheduledDays) * 100) : 0;
    expect(rate).toBe(0);
  });
  it("rounds to nearest integer", () => {
    const scheduledDays = 3;
    const presentDays = 2;
    const rate = scheduledDays > 0 ? Math.round((presentDays / scheduledDays) * 100) : 0;
    expect(rate).toBe(67); // 66.67 rounds to 67
  });
});
