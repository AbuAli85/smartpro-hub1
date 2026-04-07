import { describe, expect, it } from "vitest";
import { taskWorkspaceScore } from "./workspaceData";

type TRow = Parameters<typeof taskWorkspaceScore>[0];

function T(partial: Partial<TRow>): TRow {
  return {
    id: 1,
    companyId: 1,
    assignedToEmployeeId: 1,
    assignedByUserId: 1,
    assignedAt: new Date(),
    title: "T",
    description: null,
    priority: "medium",
    status: "pending",
    dueDate: null,
    estimatedDurationMinutes: null,
    startedAt: null,
    completedAt: null,
    completedByUserId: null,
    notes: null,
    blockedReason: null,
    checklist: null,
    attachmentLinks: null,
    notifiedOverdue: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as TRow;
}

describe("taskWorkspaceScore", () => {
  it("ranks blocked above pending when similar due", () => {
    const today = "2026-04-07";
    const a = T({ status: "pending", priority: "medium", dueDate: today });
    const b = T({ status: "blocked", priority: "medium", dueDate: today, blockedReason: "x" });
    expect(taskWorkspaceScore(b, today)).toBeGreaterThan(taskWorkspaceScore(a, today));
  });

  it("ranks overdue above due later", () => {
    const today = "2026-04-07";
    const overdue = T({ status: "pending", priority: "low", dueDate: "2026-04-01" });
    const future = T({ status: "pending", priority: "low", dueDate: "2026-04-20" });
    expect(taskWorkspaceScore(overdue, today)).toBeGreaterThan(taskWorkspaceScore(future, today));
  });
});
