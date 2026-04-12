import { describe, expect, it } from "vitest";
import {
  computeProductivityScore,
  formatCountdownMs,
  getShiftOperationalState,
  titleCaseFirstName,
} from "./employeePortalUtils";

describe("formatCountdownMs", () => {
  it("formats hours and minutes", () => {
    expect(formatCountdownMs(7500000)).toBe("2h 5m");
    expect(formatCountdownMs(3600000)).toBe("1h");
    expect(formatCountdownMs(900000)).toBe("15m");
  });
  it("handles non-positive", () => {
    expect(formatCountdownMs(0)).toBe("0m");
    expect(formatCountdownMs(-1)).toBe("0m");
  });
});

describe("getShiftOperationalState", () => {
  it("same-day shift: upcoming then active then ended (Muscat wall times)", () => {
    // Instants chosen so Asia/Muscat local time is 08:00 / 12:00 / 18:00 on 2026-04-05 (UTC+4).
    const d = new Date(Date.UTC(2026, 3, 5, 4, 0, 0));
    expect(getShiftOperationalState("09:00", "17:00", d).phase).toBe("upcoming");
    const noon = new Date(Date.UTC(2026, 3, 5, 8, 0, 0));
    expect(getShiftOperationalState("09:00", "17:00", noon).phase).toBe("active");
    const evening = new Date(Date.UTC(2026, 3, 5, 14, 0, 0));
    expect(getShiftOperationalState("09:00", "17:00", evening).phase).toBe("ended");
  });

  it("overnight shift: late evening Muscat is active when end rolls to next calendar day", () => {
    const late = new Date(Date.UTC(2026, 3, 5, 19, 30, 0)); // 23:30 Asia/Muscat on 2026-04-05
    const s = getShiftOperationalState("22:00", "06:00", late);
    expect(s.phase).toBe("active");
  });
});

describe("titleCaseFirstName", () => {
  it("title-cases and handles empty", () => {
    expect(titleCaseFirstName("abdelrahman")).toBe("Abdelrahman");
    expect(titleCaseFirstName("  MARIA  ")).toBe("Maria");
    expect(titleCaseFirstName("")).toBe("there");
    expect(titleCaseFirstName(undefined)).toBe("there");
  });
});

describe("computeProductivityScore", () => {
  it("marks low confidence when both dimensions use fallbacks", () => {
    const r = computeProductivityScore({ attendanceRatePercent: null, tasks: [] });
    expect(r.dataConfidence).toBe("low");
    expect(r.usedAttendanceFallback).toBe(true);
    expect(r.usedTaskFallback).toBe(true);
    expect(r.disclaimer).toContain("not a formal performance review");
  });

  it("marks medium when only attendance is real", () => {
    const r = computeProductivityScore({ attendanceRatePercent: 80, tasks: [] });
    expect(r.dataConfidence).toBe("medium");
    expect(r.usedAttendanceFallback).toBe(false);
    expect(r.usedTaskFallback).toBe(true);
    expect(r.attendanceRateActual).toBe(80);
  });

  it("marks medium with few assigned tasks even when both signals exist", () => {
    const tasks = [{ status: "completed" }, { status: "pending" }];
    const r = computeProductivityScore({ attendanceRatePercent: 90, tasks });
    expect(r.dataConfidence).toBe("medium");
    expect(r.assignedTaskCount).toBe(2);
  });

  it("marks high with real attendance and enough tasks", () => {
    const tasks = [
      { status: "completed" },
      { status: "completed" },
      { status: "pending" },
    ];
    const r = computeProductivityScore({ attendanceRatePercent: 100, tasks });
    expect(r.dataConfidence).toBe("high");
    expect(r.usedTaskFallback).toBe(false);
    expect(r.taskCompletionPercentActual).toBe(67);
  });

  it("exposes formula summary and weighted breakdown fields", () => {
    const r = computeProductivityScore({ attendanceRatePercent: 80, tasks: [{ status: "completed" }] });
    expect(r.formulaSummary).toMatch(/attendance×0\.55/);
    expect(r.formulaSummary).toMatch(/tasks×0\.45/);
    expect(r.attendancePointsDisplay + r.taskPointsDisplay).toBeGreaterThan(0);
  });
});
