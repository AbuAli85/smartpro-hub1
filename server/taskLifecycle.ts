import { TRPCError } from "@trpc/server";

export const TASK_STATUSES = ["pending", "in_progress", "completed", "cancelled", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Admin-only transitions between statuses (same → same is always allowed). */
const ADMIN_ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress", "blocked", "cancelled", "completed"],
  in_progress: ["completed", "blocked", "cancelled", "pending"],
  blocked: ["in_progress", "pending", "cancelled", "completed"],
  completed: ["in_progress", "cancelled"],
  cancelled: ["pending"],
};

export function assertAdminStatusTransition(from: TaskStatus, to: TaskStatus): void {
  if (from === to) return;
  const ok = ADMIN_ALLOWED[from]?.includes(to);
  if (!ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid task status change: ${from} → ${to}`,
    });
  }
}

export function statusUpdateSideEffects(
  existing: { status: string; startedAt: Date | null | undefined },
  nextStatus: TaskStatus,
): { completedAt?: Date | null; startedAt?: Date | null } {
  const out: { completedAt?: Date | null; startedAt?: Date | null } = {};
  if (nextStatus === "completed") {
    out.completedAt = new Date();
  } else if (existing.status === "completed") {
    out.completedAt = null;
  }
  if (nextStatus === "in_progress" && existing.status !== "in_progress") {
    if (!existing.startedAt) {
      out.startedAt = new Date();
    }
  }
  return out;
}
