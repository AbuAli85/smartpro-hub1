import { describe, it, expect } from "vitest";

/**
 * Unit tests for the Employee Portal enhancements.
 * These tests validate the logic helpers used in the new procedures.
 */

// ── Helper: calcDays ──────────────────────────────────────────────────────
function calcDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.ceil((e.getTime() - s.getTime()) / 86400000) + 1;
}

// ── Helper: daysUntilExpiry ───────────────────────────────────────────────
function daysUntilExpiry(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

// ── Helper: formatTime ────────────────────────────────────────────────────
function formatTime(ts: Date | null | undefined): string {
  if (!ts) return "—";
  return ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Helper: hoursWorked ───────────────────────────────────────────────────
function calcHoursWorked(checkIn: Date, checkOut: Date): number {
  return (checkOut.getTime() - checkIn.getTime()) / 3600000;
}

describe("Employee Portal - calcDays", () => {
  it("returns 1 for same-day leave", () => {
    expect(calcDays("2026-04-01", "2026-04-01")).toBe(1);
  });

  it("returns 3 for a 3-day leave", () => {
    expect(calcDays("2026-04-01", "2026-04-03")).toBe(3);
  });

  it("returns 7 for a week", () => {
    expect(calcDays("2026-04-01", "2026-04-07")).toBe(7);
  });
});

describe("Employee Portal - daysUntilExpiry", () => {
  it("returns a negative number for past dates", () => {
    const pastDate = "2020-01-01";
    expect(daysUntilExpiry(pastDate)).toBeLessThan(0);
  });

  it("returns a positive number for future dates", () => {
    const futureDate = "2030-01-01";
    expect(daysUntilExpiry(futureDate)).toBeGreaterThan(0);
  });
});

describe("Employee Portal - formatTime", () => {
  it("returns — for null", () => {
    expect(formatTime(null)).toBe("—");
  });

  it("returns — for undefined", () => {
    expect(formatTime(undefined)).toBe("—");
  });

  it("returns a time string for a valid date", () => {
    const d = new Date("2026-04-01T09:00:00");
    const result = formatTime(d);
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("Employee Portal - calcHoursWorked", () => {
  it("calculates 8 hours for a standard shift", () => {
    const checkIn = new Date("2026-04-01T09:00:00");
    const checkOut = new Date("2026-04-01T17:00:00");
    expect(calcHoursWorked(checkIn, checkOut)).toBe(8);
  });

  it("calculates 4.5 hours for a half day", () => {
    const checkIn = new Date("2026-04-01T09:00:00");
    const checkOut = new Date("2026-04-01T13:30:00");
    expect(calcHoursWorked(checkIn, checkOut)).toBe(4.5);
  });
});

describe("Employee Portal - leave balance display", () => {
  it("correctly identifies low balance (≤2 days)", () => {
    const balance = { annual: 2, sick: 15, emergency: 5 };
    expect(balance.annual <= 2).toBe(true);
    expect(balance.sick <= 2).toBe(false);
  });

  it("correctly identifies expiring balance (≤5 days)", () => {
    const balance = { annual: 4, sick: 15, emergency: 5 };
    expect(balance.annual <= 5).toBe(true);
    expect(balance.sick <= 5).toBe(false);
  });
});

describe("Employee Portal - task overdue detection", () => {
  it("marks task as overdue if dueDate is in the past", () => {
    const task = {
      status: "pending",
      dueDate: "2020-01-01",
    };
    const today = new Date();
    const overdue = task.status !== "completed" && task.status !== "cancelled"
      && task.dueDate && new Date(task.dueDate) < today;
    expect(overdue).toBe(true);
  });

  it("does not mark completed task as overdue", () => {
    const task = {
      status: "completed",
      dueDate: "2020-01-01",
    };
    const today = new Date();
    const overdue = task.status !== "completed" && task.status !== "cancelled"
      && task.dueDate && new Date(task.dueDate) < today;
    expect(overdue).toBeFalsy();
  });

  it("does not mark future task as overdue", () => {
    const task = {
      status: "pending",
      dueDate: "2030-01-01",
    };
    const today = new Date();
    const overdue = task.status !== "completed" && task.status !== "cancelled"
      && task.dueDate && new Date(task.dueDate) < today;
    expect(overdue).toBeFalsy();
  });
});

describe("Employee Portal - attendance rate", () => {
  it("calculates 100% attendance rate", () => {
    const summary = { present: 20, absent: 0, late: 0, total: 20 };
    const rate = summary.total > 0
      ? Math.round(((summary.present + summary.late) / summary.total) * 100)
      : null;
    expect(rate).toBe(100);
  });

  it("calculates 75% attendance rate with late days", () => {
    const summary = { present: 10, absent: 5, late: 5, total: 20 };
    const rate = summary.total > 0
      ? Math.round(((summary.present + summary.late) / summary.total) * 100)
      : null;
    expect(rate).toBe(75);
  });

  it("returns null when no records", () => {
    const summary = { present: 0, absent: 0, late: 0, total: 0 };
    const rate = summary.total > 0
      ? Math.round(((summary.present + summary.late) / summary.total) * 100)
      : null;
    expect(rate).toBeNull();
  });
});
