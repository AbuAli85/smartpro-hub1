import { TRPCError } from "@trpc/server";
import { ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON } from "@shared/attendanceTrpcReasons";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allowMissingAttendanceSessionsTable,
  isAttendanceSessionsTableMissingError,
  syncAttendanceSessionsFromAttendanceRecordTx,
} from "./attendanceSessionFromRecord";
import type { AttendanceRecord } from "../drizzle/schema";

function baseRecord(over: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 42,
    companyId: 1,
    employeeId: 9,
    scheduleId: 3,
    siteId: 5,
    promoterAssignmentId: null,
    siteName: "HQ",
    checkIn: new Date("2026-04-23T05:00:00.000Z"),
    checkOut: new Date("2026-04-23T13:00:00.000Z"),
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    method: "manual",
    notes: "n",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("syncAttendanceSessionsFromAttendanceRecordTx", () => {
  it("inserts when no session row exists", async () => {
    const insert = vi.fn().mockResolvedValue(undefined);
    const selectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };
    const tx = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn(() => ({ values: insert })),
      update: vi.fn(),
    };

    await syncAttendanceSessionsFromAttendanceRecordTx(tx as never, baseRecord({}));

    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.sourceRecordId).toBe(42);
    expect(payload.status).toBe("closed");
    expect(payload.businessDate).toBe("2026-04-23");
  });

  it("updates when session rows exist", async () => {
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    const update = vi.fn(() => ({ set }));
    const selectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 99 }]),
      }),
    };
    const tx = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn(),
      update,
    };

    await syncAttendanceSessionsFromAttendanceRecordTx(tx as never, baseRecord({ checkOut: null }));

    expect(update).toHaveBeenCalled();
    expect(set).toHaveBeenCalled();
    const payload = set.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("open");
    expect(payload.checkOutAt).toBeNull();
  });

  it("detects MySQL missing-table errors", () => {
    const err = new Error("Table 'x.attendance_sessions' doesn't exist");
    expect(isAttendanceSessionsTableMissingError(err)).toBe(true);
    expect(isAttendanceSessionsTableMissingError(new Error("duplicate"))).toBe(false);
  });
});

describe("attendance_sessions missing-table production policy", () => {
  const PREV = process.env.ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE;

  beforeEach(() => {
    delete process.env.ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE;
  });

  afterEach(() => {
    if (PREV === undefined) delete process.env.ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE;
    else process.env.ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE = PREV;
  });

  it("default (strict): sync throws with actionable message", async () => {
    const missing = new Error("Table 'db.attendance_sessions' doesn't exist");
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(missing),
        }),
      }),
    };

    await expect(syncAttendanceSessionsFromAttendanceRecordTx(tx as never, baseRecord({}))).rejects.toSatisfy(
      (e: unknown) => {
        if (!(e instanceof TRPCError)) return false;
        const cause = e.cause as { reason?: string } | undefined;
        return (
          e.code === "BAD_REQUEST" &&
          cause?.reason === ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON &&
          /0034_attendance_sessions/.test(e.message) &&
          /ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE/.test(e.message)
        );
      },
    );
    expect(allowMissingAttendanceSessionsTable()).toBe(false);
  });

  it("ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE=1: sync skips without throwing", async () => {
    process.env.ALLOW_MISSING_ATTENDANCE_SESSIONS_TABLE = "1";
    const missing = new Error("Table 'db.attendance_sessions' doesn't exist");
    const tx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(missing),
        }),
      }),
    };

    await expect(syncAttendanceSessionsFromAttendanceRecordTx(tx as never, baseRecord({}))).resolves.toBeUndefined();
  });
});
