import { describe, expect, it } from "vitest";
import { muscatWallDateTimeToUtc } from "./attendanceMuscatTime";
import { countOverdueOpenCheckoutsOnBoard, muscatShiftWallEndMs } from "./attendanceBoardOverdue";

describe("muscatShiftWallEndMs", () => {
  it("returns a wall end after wall start for a same-calendar-day shift", () => {
    const start = muscatWallDateTimeToUtc("2026-04-11", "09:00:00").getTime();
    const end = muscatShiftWallEndMs("2026-04-11", "09:00", "17:00");
    expect(end).toBeGreaterThan(start);
  });
});

describe("countOverdueOpenCheckoutsOnBoard", () => {
  it("counts rows with check-in, no check-out, and now past Muscat shift end", () => {
    const ymd = "2026-04-11";
    const endMs = muscatShiftWallEndMs(ymd, "09:00", "17:00");
    const n = countOverdueOpenCheckoutsOnBoard(
      [
        {
          checkInAt: new Date(endMs - 60_000),
          checkOutAt: null,
          expectedStart: "09:00",
          expectedEnd: "17:00",
        },
      ],
      ymd,
      endMs + 1
    );
    expect(n).toBe(1);
  });

  it("does not count when checkout exists", () => {
    const ymd = "2026-04-11";
    const endMs = muscatShiftWallEndMs(ymd, "09:00", "17:00");
    const n = countOverdueOpenCheckoutsOnBoard(
      [
        {
          checkInAt: new Date(endMs - 60_000),
          checkOutAt: new Date(endMs),
          expectedStart: "09:00",
          expectedEnd: "17:00",
        },
      ],
      ymd,
      endMs + 60_000
    );
    expect(n).toBe(0);
  });

  it("does not count before shift end", () => {
    const ymd = "2026-04-11";
    const endMs = muscatShiftWallEndMs(ymd, "09:00", "17:00");
    const n = countOverdueOpenCheckoutsOnBoard(
      [
        {
          checkInAt: new Date(endMs - 3_600_000),
          checkOutAt: null,
          expectedStart: "09:00",
          expectedEnd: "17:00",
        },
      ],
      ymd,
      endMs - 1
    );
    expect(n).toBe(0);
  });
});
