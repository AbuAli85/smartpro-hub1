import { describe, it, expect } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import { pickAttendanceRecordForShift, shiftAttendanceWindowUtcMs } from "./pickAttendanceRecordForShift";

describe("muscatWallDateTimeToUtc", () => {
  it("maps 10:00 Muscat on 2026-04-11 to 06:00 UTC same calendar day", () => {
    const d = muscatWallDateTimeToUtc("2026-04-11", "10:00:00");
    expect(d.toISOString()).toBe("2026-04-11T06:00:00.000Z");
  });
  it("maps 14:00 Muscat to 10:00 UTC", () => {
    const d = muscatWallDateTimeToUtc("2026-04-11", "14:00");
    expect(d.toISOString()).toBe("2026-04-11T10:00:00.000Z");
  });
});

describe("pickAttendanceRecordForShift", () => {
  const businessDate = "2026-04-11";
  const siteId = 1;
  /** One session 10:00–14:00 Muscat */
  const morningPunch = {
    id: 1,
    siteId,
    checkIn: muscatWallDateTimeToUtc(businessDate, "10:00:00"),
    checkOut: muscatWallDateTimeToUtc(businessDate, "14:00:00"),
  };

  it("assigns the punch to the morning shift, not the evening shift", () => {
    const now = muscatWallDateTimeToUtc(businessDate, "23:00:00").getTime();
    const morning = pickAttendanceRecordForShift(
      [morningPunch],
      siteId,
      businessDate,
      "10:00",
      "13:00",
      15,
      now
    );
    const evening = pickAttendanceRecordForShift(
      [morningPunch],
      siteId,
      businessDate,
      "18:00",
      "22:00",
      15,
      now
    );
    expect(morning?.id).toBe(1);
    expect(evening).toBeUndefined();
  });

  it("does not reuse the same record for two shifts when a second punch exists", () => {
    const eveningPunch = {
      id: 2,
      siteId,
      checkIn: muscatWallDateTimeToUtc(businessDate, "18:00:00"),
      checkOut: muscatWallDateTimeToUtc(businessDate, "22:00:00"),
    };
    const pool = [morningPunch, eveningPunch];
    const now = muscatWallDateTimeToUtc(businessDate, "23:00:00").getTime();
    const m = pickAttendanceRecordForShift(pool, siteId, businessDate, "10:00", "13:00", 15, now);
    const e = pickAttendanceRecordForShift(pool, siteId, businessDate, "18:00", "22:00", 15, now);
    expect(m?.id).toBe(1);
    expect(e?.id).toBe(2);
  });
});

describe("shiftAttendanceWindowUtcMs", () => {
  it("returns a wider end than start for normal same-day shift", () => {
    const w = shiftAttendanceWindowUtcMs("2026-04-11", "10:00", "13:00", 15);
    expect(w.endMs).toBeGreaterThan(w.startMs);
  });
});
