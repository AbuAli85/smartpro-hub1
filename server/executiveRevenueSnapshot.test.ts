import { describe, expect, it } from "vitest";
import { addDays, startOfIsoWeekMonday, startOfLocalDay } from "./executiveRevenueSnapshot";

describe("executiveRevenueSnapshot date helpers", () => {
  it("startOfLocalDay normalizes to midnight", () => {
    const d = new Date(2026, 3, 7, 15, 30, 45);
    const s = startOfLocalDay(d);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getDate()).toBe(7);
  });

  it("startOfIsoWeekMonday returns Monday for a Wednesday in April 2026", () => {
    // Wed 8 Apr 2026
    const wed = new Date(2026, 3, 8, 12, 0, 0);
    const mon = startOfIsoWeekMonday(wed);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(6);
  });

  it("startOfIsoWeekMonday treats Sunday as end of week (Monday is prior week)", () => {
    // Sun 12 Apr 2026
    const sun = new Date(2026, 3, 12, 10, 0, 0);
    const mon = startOfIsoWeekMonday(sun);
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(6);
  });

  it("addDays", () => {
    const d = new Date(2026, 0, 31);
    expect(addDays(d, 1).getDate()).toBe(1);
    expect(addDays(d, 1).getMonth()).toBe(1);
  });
});
