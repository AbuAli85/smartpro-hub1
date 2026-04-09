import { describe, expect, it } from "vitest";
import { getAgeInDays, getAgingLevel, isOverdue, isStuck } from "./aging";
import { buildExecutionMeta } from "./executionMeta";
import { isAssigned, isAssignedToSelf } from "./ownership";
import type { ActionQueueItem } from "./actionQueueTypes";

function aq(overrides: Partial<ActionQueueItem> & Pick<ActionQueueItem, "id" | "kind">): ActionQueueItem {
  return {
    title: "T",
    severity: "medium",
    blocking: false,
    source: "hr",
    href: "/x",
    ctaLabel: "Open",
    ...overrides,
  };
}

describe("getAgeInDays / getAgingLevel", () => {
  it("computes age from dueAt when present", () => {
    const now = new Date("2026-04-10T12:00:00.000Z");
    const item = aq({
      id: "1",
      kind: "task_overdue",
      dueAt: "2026-04-01T00:00:00.000Z",
    });
    const days = getAgeInDays(item, now);
    expect(days).not.toBeNull();
    expect(days!).toBeGreaterThanOrEqual(6);
    expect(getAgingLevel(days)).toBe("stale");
  });

  it("falls back to createdAt then updatedAt", () => {
    const now = new Date("2026-04-10T12:00:00.000Z");
    const fromCreated = aq({
      id: "1",
      kind: "generic_attention",
      createdAt: "2026-04-08T00:00:00.000Z",
    });
    expect(getAgeInDays(fromCreated, now)).toBeGreaterThanOrEqual(1);
    const fromUpdated = aq({
      id: "2",
      kind: "generic_attention",
      updatedAt: "2026-04-09T00:00:00.000Z",
    });
    expect(getAgeInDays(fromUpdated, now)).not.toBeNull();
  });

  it("returns null when no date fields exist", () => {
    expect(getAgeInDays(aq({ id: "1", kind: "generic_attention" }), new Date())).toBeNull();
    expect(getAgingLevel(null)).toBeNull();
  });

  it("classifies fresh vs aging vs stale", () => {
    expect(getAgingLevel(0)).toBe("fresh");
    expect(getAgingLevel(1)).toBe("fresh");
    expect(getAgingLevel(2)).toBe("aging");
    expect(getAgingLevel(5)).toBe("aging");
    expect(getAgingLevel(6)).toBe("stale");
  });
});

describe("isOverdue", () => {
  it("detects past dueAt in Muscat calendar", () => {
    const now = new Date("2026-04-10T12:00:00.000Z");
    expect(isOverdue(aq({ id: "1", kind: "task_overdue", dueAt: "2026-04-09T00:00:00.000Z" }), now)).toBe(true);
    expect(isOverdue(aq({ id: "2", kind: "task_overdue", dueAt: "2026-04-11T00:00:00.000Z" }), now)).toBe(false);
  });
});

describe("ownership", () => {
  it("detects unassigned", () => {
    expect(isAssigned(aq({ id: "1", kind: "generic_attention" }))).toBe(false);
    expect(isAssigned(aq({ id: "2", kind: "generic_attention", ownerUserId: "42" }))).toBe(true);
    expect(isAssigned(aq({ id: "3", kind: "generic_attention", ownerLabel: "Someone" }))).toBe(true);
  });

  it("detects assigned to self by ownerUserId", () => {
    const item = aq({ id: "1", kind: "generic_attention", ownerUserId: "7", ownerLabel: "User 7" });
    expect(isAssignedToSelf(item, { id: 7, name: "X" })).toBe(true);
    expect(isAssignedToSelf(item, { id: 99, name: "X" })).toBe(false);
  });
});

describe("isStuck", () => {
  it("is true only when aging is stale", () => {
    const now = new Date("2026-04-20T12:00:00.000Z");
    const stale = aq({
      id: "1",
      kind: "task_overdue",
      dueAt: "2026-04-01T00:00:00.000Z",
    });
    expect(isStuck(stale, now)).toBe(true);
  });
});

describe("buildExecutionMeta", () => {
  it("flags needsOwner for high severity unassigned items", () => {
    const meta = buildExecutionMeta(
      aq({
        id: "1",
        kind: "payroll_blocker",
        severity: "high",
        blocking: true,
      }),
      null,
    );
    expect(meta.needsOwner).toBe(true);
    expect(meta.assigned).toBe(false);
  });

  it("does not flag needsOwner when owner exists", () => {
    const meta = buildExecutionMeta(
      aq({
        id: "1",
        kind: "payroll_blocker",
        severity: "high",
        blocking: true,
        ownerUserId: "1",
        ownerLabel: "User 1",
      }),
      { id: 2, name: "Other" },
    );
    expect(meta.needsOwner).toBe(false);
    expect(meta.assigned).toBe(true);
  });
});
