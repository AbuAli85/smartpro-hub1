import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db")>();
  return { ...actual, getDb: vi.fn() };
});

import { runMarkMissedShiftsAbsent } from "./markMissedShiftsAbsent";
import * as db from "../db";

const baseSchedule = {
  id: 1,
  companyId: 10,
  employeeUserId: 500,
  siteId: 3,
  shiftTemplateId: 88,
  groupId: null as number | null,
  workingDays: "0,1,2,3,4,5,6",
  startDate: "2020-01-01",
  endDate: null as string | null,
  isActive: true,
  notes: null as string | null,
  createdByUserId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseShift = {
  id: 88,
  companyId: 10,
  name: "Morning",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 0,
  gracePeriodMinutes: 15,
  color: "#000",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const resolvedEmployee = {
  id: 42,
  firstName: "Test",
  lastName: "User",
};

/**
 * Drizzle query builders are awaitable; some chains add `.limit(1)`. One `next()` per awaited query.
 */
function mockDbWithQuerySequence(rows: unknown[][], insertValues = vi.fn(() => Promise.resolve(undefined))) {
  let i = 0;
  const next = () => Promise.resolve(rows[i++] ?? []);
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const p = next();
          return {
            limit: () => p,
            then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => p.then(onF, onR),
            catch: (onR: (e: unknown) => unknown) => p.catch(onR),
          };
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: insertValues,
    })),
  };
}

describe("runMarkMissedShiftsAbsent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T15:00:00.000Z")); // 19:00 Muscat — after 18:00 shift end
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns zeros when database is unavailable", async () => {
    vi.mocked(db.getDb).mockResolvedValue(null as never);
    const result = await runMarkMissedShiftsAbsent();
    expect(result).toEqual({ scanned: 0, marked: 0, skipped: 0, errors: 0 });
  });

  it("skips schedules where shift has not ended yet", async () => {
    vi.setSystemTime(new Date("2026-04-15T10:00:00.000Z")); // 14:00 Muscat — before 18:00 end
    const mockDb = mockDbWithQuerySequence([
      [{ ...baseSchedule }],
      [{ ...baseShift }],
      [],
    ]);
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);

    const result = await runMarkMissedShiftsAbsent();
    expect(result.scanned).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.marked).toBe(0);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("skips employees who already have an attendance_records punch today", async () => {
    const mockDb = mockDbWithQuerySequence([
      [{ ...baseSchedule }],
      [{ ...baseShift }],
      [],
      [resolvedEmployee],
      [{ id: 999 }],
    ]);
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);

    const result = await runMarkMissedShiftsAbsent();
    expect(result.scanned).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.marked).toBe(0);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("marks absent when shift has ended and no punch exists", async () => {
    const insertValues = vi.fn(() => Promise.resolve(undefined));
    const mockDb = mockDbWithQuerySequence(
      [
        [{ ...baseSchedule }],
        [{ ...baseShift }],
        [],
        [resolvedEmployee],
        [],
        [],
      ],
      insertValues,
    );
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);

    const result = await runMarkMissedShiftsAbsent();
    expect(result.marked).toBe(1);
    expect(result.errors).toBe(0);
    expect(insertValues).toHaveBeenCalledTimes(1);
  });

  it("skips when an attendance row already exists (any status)", async () => {
    const mockDb = mockDbWithQuerySequence([
      [{ ...baseSchedule }],
      [{ ...baseShift }],
      [],
      [resolvedEmployee],
      [],
      [{ id: 77 }],
    ]);
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);

    const result = await runMarkMissedShiftsAbsent();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(result.marked).toBe(0);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
