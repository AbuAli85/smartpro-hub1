import { describe, expect, it, vi } from "vitest";
import {
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

  it("swallows only missing-table errors", async () => {
    const err = new Error("Table 'x.attendance_sessions' doesn't exist");
    expect(isAttendanceSessionsTableMissingError(err)).toBe(true);
    expect(isAttendanceSessionsTableMissingError(new Error("duplicate"))).toBe(false);
  });
});
