import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncCheckoutToLegacyAttendanceTx } from "./routers/attendance";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    createAttendanceRecordTx: vi.fn(),
  };
});

function makeTx(legacyRows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(legacyRows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return {
    select,
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  };
}

describe("checkOut legacy HR sync", () => {
  beforeEach(() => {
    vi.mocked(db.createAttendanceRecordTx).mockReset();
  });

  it("should create a legacy attendance row when employee checks out (no existing legacy row)", async () => {
    const tx = makeTx([]);
    vi.mocked(db.createAttendanceRecordTx).mockResolvedValue(101);
    await syncCheckoutToLegacyAttendanceTx(tx as never, {
      companyId: 10,
      employeeId: 3,
      clockRecordId: 55,
      checkIn: new Date("2026-04-15T04:00:00.000Z"),
      checkOut: new Date("2026-04-15T12:00:00.000Z"),
      businessDateYmd: "2026-04-15",
    });
    expect(db.createAttendanceRecordTx).toHaveBeenCalledTimes(1);
  });

  it("should update existing legacy row if one exists for the same business date", async () => {
    const tx = makeTx([{ id: 7, notes: "old" }]);
    vi.mocked(db.createAttendanceRecordTx).mockResolvedValue(0);
    await syncCheckoutToLegacyAttendanceTx(tx as never, {
      companyId: 10,
      employeeId: 3,
      clockRecordId: 55,
      checkIn: new Date("2026-04-15T04:00:00.000Z"),
      checkOut: new Date("2026-04-15T12:00:00.000Z"),
      businessDateYmd: "2026-04-15",
    });
    expect(db.createAttendanceRecordTx).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
  });

  it("should not block checkout if legacy sync fails", async () => {
    const tx = makeTx([]);
    vi.mocked(db.createAttendanceRecordTx).mockRejectedValue(new Error("insert failed"));
    await expect(
      syncCheckoutToLegacyAttendanceTx(tx as never, {
        companyId: 10,
        employeeId: 3,
        clockRecordId: 55,
        checkIn: new Date("2026-04-15T04:00:00.000Z"),
        checkOut: new Date("2026-04-15T12:00:00.000Z"),
        businessDateYmd: "2026-04-15",
      }),
    ).resolves.toBeUndefined();
  });
});
