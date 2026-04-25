/**
 * Period lock enforcement — procedure-level integration tests (P5 certification).
 *
 * Verifies that each attendance write procedure that calls the period lock guard
 * propagates a CONFLICT TRPCError when the guard fires.
 *
 * Covered procedures:
 *   - checkOut          (employee self-service)
 *   - forceCheckout     (HR admin)
 *   - approveManualCheckIn  (HR admin)
 *   - approveCorrection     (HR admin)
 *
 * Strategy: mock `./lib/attendancePeriodGuard` to throw CONFLICT, mock just
 * enough DB/auth so each procedure reaches the guard call, then assert CONFLICT.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// ---------------------------------------------------------------------------
// Module mocks (hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("./db.client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db.client")>();
  return { ...actual, requireDb: vi.fn(), getDb: vi.fn() };
});

vi.mock("./repositories/companies.repository", () => ({
  getUserCompanyById: vi.fn(),
  getUserCompanies: vi.fn(),
}));

vi.mock("./attendanceAudit", () => ({
  logAttendanceAuditSafe: vi.fn().mockResolvedValue(undefined),
  attendancePayloadJson: vi.fn((v) => v),
  insertAttendanceAuditRow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./lib/attendancePeriodGuard", () => ({
  loadAndAssertPeriodNotLocked: vi.fn(),
  loadAndAssertPeriodNotLockedForInstant: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as dbModule from "./db";
import * as companiesRepo from "./repositories/companies.repository";
import * as periodGuard from "./lib/attendancePeriodGuard";
import { attendanceRouter } from "./routers/attendance";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard context for an employee self-service call. */
function makeEmployeeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `o${userId}`,
      email: "emp@test.om",
      name: "Employee",
      loginMethod: "manus",
      role: "user",
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/** Standard context for an HR/admin call. */
function makeHrCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `o${userId}`,
      email: "hr@test.om",
      name: "HR",
      loginMethod: "manus",
      role: "user",
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

/**
 * Build a mock DB whose `select()` calls return rows from `responses` in
 * order (each call increments an index).  Extra calls return `[]`.
 */
function makeMockDb(responses: Array<unknown[]>): any {
  let idx = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      const rows = responses[idx++] ?? [];
      const chain: any = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
          orderBy: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(rows),
            }),
          }),
        }),
      };
      return chain;
    }),
    transaction: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{ id: 99 }]) }),
  };
}

/**
 * Custom mock for deduplicateAttendanceRecords: the outer openRows query ends
 * at .where() (no .limit()), while the inner per-pair query ends at .orderBy().
 */
function makeDeduplicateMockDb(outerRows: unknown[], innerRows: unknown[]): any {
  let selectCount = 0;
  return {
    select: vi.fn().mockImplementation(() => {
      const idx = selectCount++;
      if (idx === 0) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(outerRows),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(innerRows),
          }),
        }),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
    transaction: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
  };
}

const LOCKED_ERROR = new TRPCError({
  code: "CONFLICT",
  message: "Period 2026-04 is locked. Reopen the period before making further attendance changes.",
  cause: { reason: "ATTENDANCE_PERIOD_ALREADY_LOCKED" },
});

const ADMIN_MEMBERSHIP = {
  company: { id: 10 },
  member: { role: "company_admin", status: "active" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: period is locked for both guard variants
  vi.mocked(periodGuard.loadAndAssertPeriodNotLocked).mockRejectedValue(LOCKED_ERROR);
  vi.mocked(periodGuard.loadAndAssertPeriodNotLockedForInstant).mockRejectedValue(LOCKED_ERROR);
  // Default: valid admin membership
  vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue(ADMIN_MEMBERSHIP as never);
});

describe("period lock enforcement — procedure-level", () => {
  // ── forceCheckout ──────────────────────────────────────────────────────────

  describe("forceCheckout", () => {
    it("throws CONFLICT when the record's check-in period is locked", async () => {
      const openRecord = {
        id: 5,
        companyId: 10,
        employeeId: 3,
        checkIn: new Date("2026-04-15T06:00:00Z"),
        checkOut: null,
        method: "self",
        scheduleId: null,
        siteId: null,
      };
      // DB: select [0] = attendance record lookup
      vi.mocked(dbModule.getDb).mockResolvedValue(makeMockDb([[openRecord]]) as never);

      const caller = attendanceRouter.createCaller(makeHrCtx());
      await expect(
        caller.forceCheckout({
          companyId: 10,
          attendanceRecordId: 5,
          reason: "1234567890 test force",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(periodGuard.loadAndAssertPeriodNotLockedForInstant).toHaveBeenCalledOnce();
    });
  });

  // ── checkOut (employee self-service) ──────────────────────────────────────

  describe("checkOut", () => {
    it("throws CONFLICT when the check-in period is locked", async () => {
      const empRow = { id: 3, companyId: 10, userId: 1, email: "emp@test.om", firstName: "Ali", lastName: "Said" };
      const openRecord = {
        id: 5,
        checkIn: new Date("2026-04-15T06:00:00Z"),
        checkOut: null,
        siteId: null,
      };
      // DB calls in order:
      //   [0] resolveMyEmployee   → employees table
      //   [1] main select         → attendanceRecords (open session)
      vi.mocked(dbModule.getDb).mockResolvedValue(makeMockDb([[empRow], [openRecord]]) as never);

      const caller = attendanceRouter.createCaller(makeEmployeeCtx());
      await expect(
        caller.checkOut({ companyId: 10 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(periodGuard.loadAndAssertPeriodNotLockedForInstant).toHaveBeenCalledOnce();
    });
  });

  // ── approveCorrection ──────────────────────────────────────────────────────

  describe("approveCorrection", () => {
    it("throws CONFLICT when the correction's date period is locked", async () => {
      const correctionReq = {
        id: 1,
        companyId: 10,
        employeeId: 3,
        attendanceRecordId: null,
        requestedDate: "2026-04-15",
        requestedCheckIn: "2026-04-15T07:00:00.000Z",
        requestedCheckOut: "2026-04-15T15:00:00.000Z",
        status: "pending",
        justification: "Late entry",
        reviewedByUserId: null,
        reviewedAt: null,
        adminNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // DB: select [0] = correction request lookup
      vi.mocked(dbModule.getDb).mockResolvedValue(makeMockDb([[correctionReq]]) as never);

      const caller = attendanceRouter.createCaller(makeHrCtx());
      await expect(
        caller.approveCorrection({ correctionId: 1, companyId: 10 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(periodGuard.loadAndAssertPeriodNotLocked).toHaveBeenCalledOnce();
    });
  });

  // ── approveManualCheckIn ───────────────────────────────────────────────────

  describe("approveManualCheckIn", () => {
    it("throws CONFLICT when the request's business date period is locked", async () => {
      const manualReq = {
        id: 1,
        companyId: 10,
        employeeUserId: 5,
        siteId: null,
        requestedAt: new Date("2026-04-15T08:00:00Z"),
        requestedBusinessDate: "2026-04-15",
        // Provide a schedule id so inferScheduleIdForTimestamp is skipped
        requestedScheduleId: 1,
        justification: "QR offline",
        lat: null,
        lng: null,
        distanceMeters: null,
        status: "pending",
        reviewedByUserId: null,
        reviewedAt: null,
        adminNote: null,
        attendanceRecordId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const empRow = { id: 3, companyId: 10, userId: 5 };
      // DB calls in order:
      //   [0] manualCheckinRequests lookup
      //   [1] employees lookup
      vi.mocked(dbModule.getDb).mockResolvedValue(makeMockDb([[manualReq], [empRow]]) as never);

      const caller = attendanceRouter.createCaller(makeHrCtx());
      await expect(
        caller.approveManualCheckIn({ requestId: 1, companyId: 10 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(periodGuard.loadAndAssertPeriodNotLocked).toHaveBeenCalledOnce();
    });
  });

  // ── rejectCorrection ───────────────────────────────────────────────────────

  describe("rejectCorrection", () => {
    it("throws CONFLICT when the correction's date period is locked", async () => {
      const correctionReq = {
        id: 1,
        companyId: 10,
        employeeId: 3,
        attendanceRecordId: null,
        requestedDate: "2026-04-15",
        requestedCheckIn: "2026-04-15T07:00:00.000Z",
        requestedCheckOut: "2026-04-15T15:00:00.000Z",
        status: "pending",
        justification: "Wrong times",
        reviewedByUserId: null,
        reviewedAt: null,
        adminNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // DB: select [0] = correction request lookup
      vi.mocked(dbModule.getDb).mockResolvedValue(makeMockDb([[correctionReq]]) as never);

      const caller = attendanceRouter.createCaller(makeHrCtx());
      await expect(
        caller.rejectCorrection({ correctionId: 1, companyId: 10, adminNote: "Incorrect times submitted" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(periodGuard.loadAndAssertPeriodNotLocked).toHaveBeenCalledOnce();
    });
  });

  // ── rejectManualCheckIn ────────────────────────────────────────────────────

  describe("rejectManualCheckIn", () => {
    it("throws CONFLICT when the request's business date period is locked", async () => {
      const manualReq = {
        id: 1,
        companyId: 10,
        employeeUserId: 5,
        siteId: null,
        requestedAt: new Date("2026-04-15T08:00:00Z"),
        requestedBusinessDate: "2026-04-15",
        requestedScheduleId: 1,
        justification: "QR offline",
        lat: null,
        lng: null,
        distanceMeters: null,
        status: "pending",
        reviewedByUserId: null,
        reviewedAt: null,
        adminNote: null,
        attendanceRecordId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const empRow = { id: 3, companyId: 10, userId: 5 };
      // DB calls in order:
      //   [0] manualCheckinRequests lookup
      //   [1] employees lookup
      vi.mocked(dbModule.getDb).mockResolvedValue(makeMockDb([[manualReq], [empRow]]) as never);

      const caller = attendanceRouter.createCaller(makeHrCtx());
      await expect(
        caller.rejectManualCheckIn({ requestId: 1, companyId: 10, adminNote: "Absent without leave" }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(periodGuard.loadAndAssertPeriodNotLocked).toHaveBeenCalledOnce();
    });
  });

  // ── repairSessionFromAttendanceRecord ──────────────────────────────────────

  describe("repairSessionFromAttendanceRecord", () => {
    it("throws CONFLICT when the record's check-in period is locked", async () => {
      const openRecord = {
        id: 5,
        companyId: 10,
        employeeId: 3,
        checkIn: new Date("2026-04-15T06:00:00Z"),
        checkOut: null,
        method: "self",
        scheduleId: null,
        siteId: null,
      };
      // DB: select [0] = attendance record lookup
      vi.mocked(dbModule.getDb).mockResolvedValue(makeMockDb([[openRecord]]) as never);

      const caller = attendanceRouter.createCaller(makeHrCtx());
      await expect(
        caller.repairSessionFromAttendanceRecord({ attendanceRecordId: 5, companyId: 10 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(periodGuard.loadAndAssertPeriodNotLockedForInstant).toHaveBeenCalledOnce();
    });
  });

  // ── deduplicateAttendanceRecords ───────────────────────────────────────────

  describe("deduplicateAttendanceRecords", () => {
    it("silently skips locked rows — succeeds but returns patchedIds: []", async () => {
      // Two open rows for the same (employee=3, schedule=7) pair → one duplicate group
      const outerRows = [
        { employeeId: 3, scheduleId: 7 },
        { employeeId: 3, scheduleId: 7 },
      ];
      // The per-pair detail query returns: keep (id=10, newer) + stale (id=9, older)
      const innerRows = [
        { id: 10, checkIn: new Date("2026-04-15T08:00:00Z"), checkOut: null },
        { id: 9, checkIn: new Date("2026-04-14T08:00:00Z"), checkOut: null },
      ];
      vi.mocked(dbModule.getDb).mockResolvedValue(makeDeduplicateMockDb(outerRows, innerRows) as never);

      const caller = attendanceRouter.createCaller(makeHrCtx());
      // dryRun: false so the guard is reached; guard throws → stale row skipped
      const result = await caller.deduplicateAttendanceRecords({ companyId: 10, dryRun: false });

      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]?.patchedIds).toEqual([]);
      expect(periodGuard.loadAndAssertPeriodNotLockedForInstant).toHaveBeenCalledOnce();
    });
  });
});
