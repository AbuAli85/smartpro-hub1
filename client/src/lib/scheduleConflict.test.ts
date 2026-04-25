import { describe, expect, it } from "vitest";
import { datesOverlap, findOverlappingSchedule, type SchedulePeriod } from "./scheduleConflict";

// ─── datesOverlap ─────────────────────────────────────────────────────────────

describe("datesOverlap", () => {
  it("returns false when either start is empty", () => {
    expect(datesOverlap("", null, "2026-01-01", null)).toBe(false);
    expect(datesOverlap("2026-01-01", null, "", null)).toBe(false);
  });

  it("detects simple overlap", () => {
    expect(datesOverlap("2026-01-01", "2026-03-31", "2026-02-01", "2026-04-30")).toBe(true);
  });

  it("detects touching boundaries as overlap", () => {
    // ends on the same day the other starts — still overlapping (inclusive)
    expect(datesOverlap("2026-01-01", "2026-03-01", "2026-03-01", "2026-05-01")).toBe(true);
  });

  it("returns false for adjacent ranges that do not touch", () => {
    expect(datesOverlap("2026-01-01", "2026-02-28", "2026-03-01", "2026-05-01")).toBe(false);
  });

  it("treats null end as open-ended", () => {
    // open-ended vs fixed range in the future → overlap
    expect(datesOverlap("2026-01-01", null, "2027-01-01", "2027-12-31")).toBe(true);
  });

  it("returns false when ranges are entirely disjoint", () => {
    expect(datesOverlap("2025-01-01", "2025-06-30", "2026-01-01", "2026-06-30")).toBe(false);
  });

  it("a is entirely inside b", () => {
    expect(datesOverlap("2026-03-01", "2026-03-31", "2026-01-01", "2026-12-31")).toBe(true);
  });

  it("both open-ended → always overlap if they start before each other ends", () => {
    expect(datesOverlap("2026-01-01", null, "2026-06-01", null)).toBe(true);
  });
});

// ─── findOverlappingSchedule ──────────────────────────────────────────────────

function period(
  employeeUserId: number,
  startDate: string,
  endDate: string | null,
  groupId: number | null = null,
): SchedulePeriod & { groupId: number | null } {
  return { employeeUserId, startDate, endDate, groupId };
}

describe("findOverlappingSchedule", () => {
  const schedules = [
    period(10, "2026-01-01", "2026-06-30", 1),
    period(10, "2026-07-01", null, 2),    // open-ended from July
    period(20, "2026-01-01", "2026-12-31", 3), // different employee
  ];

  const noExclusion = () => false;

  it("returns null when candidate employee has no schedules", () => {
    expect(findOverlappingSchedule(schedules, 99, "2026-01-01", null, noExclusion)).toBeNull();
  });

  it("returns null when candidate is for a different employee", () => {
    expect(findOverlappingSchedule(schedules, 20, "2027-01-01", null, noExclusion)).toBeNull();
  });

  it("detects overlap with a bounded existing schedule", () => {
    const result = findOverlappingSchedule(schedules, 10, "2026-05-01", "2026-08-01", noExclusion);
    expect(result).not.toBeNull();
    expect((result as any).groupId).toBe(1);
  });

  it("detects overlap with an open-ended existing schedule", () => {
    const result = findOverlappingSchedule(schedules, 10, "2026-09-01", null, noExclusion);
    expect(result).not.toBeNull();
    expect((result as any).groupId).toBe(2);
  });

  it("returns null when candidate is after all existing ranges", () => {
    // schedules[1] is open-ended from 2026-07-01 — so 2027 still overlaps
    // Use a narrow range entirely before all schedules
    const before = [period(10, "2027-01-01", "2027-06-30", 99)];
    expect(
      findOverlappingSchedule(before, 10, "2026-01-01", "2026-06-30", noExclusion),
    ).toBeNull();
  });

  it("excludes the entry the predicate marks", () => {
    // Editing groupId=1 — should not flag it as a conflict with itself
    const result = findOverlappingSchedule(
      schedules,
      10,
      "2026-03-01",
      "2026-05-31",
      (e) => (e as any).groupId === 1,
    );
    expect(result).toBeNull();
  });

  it("finds a different conflict when one is excluded", () => {
    // candidate overlaps both 1 (Jan–Jun) and 2 (Jul–open). Exclude 1 → should find 2.
    const result = findOverlappingSchedule(
      schedules,
      10,
      "2026-05-01",
      "2026-09-01",
      (e) => (e as any).groupId === 1,
    );
    expect(result).not.toBeNull();
    expect((result as any).groupId).toBe(2);
  });
});
