/**
 * Period lock enforcement tests (P1).
 *
 * Verifies that:
 *   1. validatePeriodIsOpen returns ok for open / reopened periods.
 *   2. validatePeriodIsOpen returns CONFLICT error for locked / exported periods.
 *   3. loadAndAssertPeriodNotLocked reads the DB and throws TRPCError CONFLICT when locked.
 *   4. loadAndAssertPeriodNotLocked passes when row is absent (virtual open state).
 *   5. loadAndAssertPeriodNotLocked passes when status is reopened.
 *   6. loadAndAssertPeriodNotLockedForInstant derives YMD from UTC instant correctly.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { validatePeriodIsOpen, defaultPeriodLockState } from "../shared/attendancePeriodLock";
import { ATTENDANCE_PERIOD_ALREADY_LOCKED } from "../shared/attendanceTrpcReasons";
import {
  loadAndAssertPeriodNotLocked,
  loadAndAssertPeriodNotLockedForInstant,
} from "./lib/attendancePeriodGuard";

// ---------------------------------------------------------------------------
// Unit tests for validatePeriodIsOpen (pure, no DB)
// ---------------------------------------------------------------------------

describe("validatePeriodIsOpen — pure unit tests", () => {
  it("returns ok=true for open status", () => {
    const result = validatePeriodIsOpen(defaultPeriodLockState(1, 2026, 4));
    expect(result.ok).toBe(true);
  });

  it("returns ok=true for reopened status", () => {
    const result = validatePeriodIsOpen({ status: "reopened", year: 2026, month: 4, companyId: 1 });
    expect(result.ok).toBe(true);
  });

  it("returns CONFLICT error for locked status", () => {
    const result = validatePeriodIsOpen({ status: "locked", year: 2026, month: 4, companyId: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFLICT");
      expect(result.reason).toBe(ATTENDANCE_PERIOD_ALREADY_LOCKED);
      expect(result.message).toContain("2026-04");
      expect(result.message).toContain("locked");
    }
  });

  it("returns CONFLICT error for exported status", () => {
    const result = validatePeriodIsOpen({ status: "exported", year: 2026, month: 3, companyId: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CONFLICT");
      expect(result.reason).toBe(ATTENDANCE_PERIOD_ALREADY_LOCKED);
      expect(result.message).toContain("2026-03");
      expect(result.message).toContain("exported");
    }
  });
});

// ---------------------------------------------------------------------------
// Integration-style tests for loadAndAssertPeriodNotLocked (DB mocked)
// ---------------------------------------------------------------------------

function makeMockDb(rows: Array<{ status: string }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { select };
}

describe("loadAndAssertPeriodNotLocked", () => {
  it("passes (no throw) when no DB row exists (virtual open state)", async () => {
    const db = makeMockDb([]);
    await expect(loadAndAssertPeriodNotLocked(db as any, 1, "2026-04-15")).resolves.toMatchObject({
      status: "open",
      year: 2026,
      month: 4,
      companyId: 1,
    });
  });

  it("passes when DB row status is open", async () => {
    const db = makeMockDb([{ status: "open" }]);
    await expect(loadAndAssertPeriodNotLocked(db as any, 1, "2026-04-15")).resolves.toMatchObject({
      status: "open",
    });
  });

  it("passes when DB row status is reopened", async () => {
    const db = makeMockDb([{ status: "reopened" }]);
    await expect(loadAndAssertPeriodNotLocked(db as any, 1, "2026-04-15")).resolves.toMatchObject({
      status: "reopened",
    });
  });

  it("throws CONFLICT when DB row status is locked", async () => {
    const db = makeMockDb([{ status: "locked" }]);
    await expect(loadAndAssertPeriodNotLocked(db as any, 1, "2026-04-15")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("throws CONFLICT when DB row status is exported", async () => {
    const db = makeMockDb([{ status: "exported" }]);
    await expect(loadAndAssertPeriodNotLocked(db as any, 1, "2026-04-15")).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("includes ATTENDANCE_PERIOD_ALREADY_LOCKED reason in error cause", async () => {
    const db = makeMockDb([{ status: "locked" }]);
    try {
      await loadAndAssertPeriodNotLocked(db as any, 1, "2026-04-15");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).cause).toMatchObject({ reason: ATTENDANCE_PERIOD_ALREADY_LOCKED });
    }
  });
});

describe("loadAndAssertPeriodNotLockedForInstant", () => {
  it("derives April 2026 from a UTC instant in Muscat April", async () => {
    // 2026-04-15T12:00:00Z → Muscat is UTC+4 → 2026-04-15 (still same day)
    const db = makeMockDb([]);
    const result = await loadAndAssertPeriodNotLockedForInstant(
      db as any,
      1,
      new Date("2026-04-15T12:00:00Z"),
    );
    expect(result.month).toBe(4);
    expect(result.year).toBe(2026);
  });

  it("derives March 2026 from a UTC instant that is late March in Muscat", async () => {
    // 2026-03-31T20:59:00Z → Muscat UTC+4 = 2026-04-01T00:59 → April!
    // vs 2026-03-31T10:00:00Z → Muscat = 2026-03-31T14:00 → March
    const db = makeMockDb([]);
    const result = await loadAndAssertPeriodNotLockedForInstant(
      db as any,
      1,
      new Date("2026-03-31T10:00:00Z"),
    );
    expect(result.month).toBe(3);
    expect(result.year).toBe(2026);
  });
});
