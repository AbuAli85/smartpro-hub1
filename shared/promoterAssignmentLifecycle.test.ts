import { describe, expect, it } from "vitest";
import {
  canTransitionAssignmentStatus,
  dateRangesOverlap,
  isAssignmentTerminal,
  migrateLegacyAssignmentStatus,
  normalizeAssignmentDates,
  requiresEndDateForTerminalTransition,
} from "./promoterAssignmentLifecycle";

describe("promoterAssignmentLifecycle", () => {
  it("allows expected transitions", () => {
    expect(canTransitionAssignmentStatus("draft", "active")).toBe(true);
    expect(canTransitionAssignmentStatus("draft", "terminated")).toBe(true);
    expect(canTransitionAssignmentStatus("active", "suspended")).toBe(true);
    expect(canTransitionAssignmentStatus("suspended", "active")).toBe(true);
  });

  it("disallows invalid transitions", () => {
    expect(canTransitionAssignmentStatus("completed", "active")).toBe(false);
    expect(canTransitionAssignmentStatus("terminated", "active")).toBe(false);
    expect(canTransitionAssignmentStatus("draft", "completed")).toBe(false);
  });

  it("detects terminal statuses", () => {
    expect(isAssignmentTerminal("completed")).toBe(true);
    expect(isAssignmentTerminal("terminated")).toBe(true);
    expect(isAssignmentTerminal("active")).toBe(false);
  });

  it("requires end date for terminal transitions", () => {
    expect(requiresEndDateForTerminalTransition("completed")).toBe(true);
    expect(requiresEndDateForTerminalTransition("terminated")).toBe(true);
    expect(requiresEndDateForTerminalTransition("active")).toBe(false);
  });

  it("normalizeAssignmentDates rejects end before start", () => {
    expect(() =>
      normalizeAssignmentDates("2026-06-01", "2026-05-01"),
    ).toThrow(/before/i);
  });

  it("normalizeAssignmentDates allows null end", () => {
    const r = normalizeAssignmentDates("2026-06-01", null);
    expect(r.endDate).toBeNull();
  });

  it("dateRangesOverlap handles null ends as open-ended", () => {
    const s = new Date("2026-01-01");
    const t = new Date("2026-06-01");
    expect(dateRangesOverlap(s, null, t, null)).toBe(true);
    expect(dateRangesOverlap(s, new Date("2026-02-01"), t, new Date("2026-12-31"))).toBe(false);
  });

  it("migrateLegacyAssignmentStatus maps old values", () => {
    expect(migrateLegacyAssignmentStatus("active")).toBe("active");
    expect(migrateLegacyAssignmentStatus("inactive")).toBe("suspended");
    expect(migrateLegacyAssignmentStatus("expired")).toBe("completed");
  });
});
