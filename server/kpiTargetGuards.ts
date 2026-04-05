import { TRPCError } from "@trpc/server";

export type KpiTargetStatus = "draft" | "active" | "completed" | "archived" | "cancelled";

/**
 * Lifecycle transitions (PR-5). Same-state is a no-op at the guard level (caller may skip update).
 * - draft: publish to active, or cancel
 * - active: complete, archive, or cancel
 * - completed: may be archived for housekeeping
 * - archived: may be reactivated to active
 * - cancelled: terminal (no transitions)
 */
export function assertKpiTargetStatusTransition(from: KpiTargetStatus, to: KpiTargetStatus): void {
  if (from === to) return;
  const allowed: Record<KpiTargetStatus, KpiTargetStatus[]> = {
    draft: ["active", "cancelled"],
    active: ["completed", "archived", "cancelled"],
    completed: ["archived"],
    archived: ["active"],
    cancelled: [],
  };
  const list = allowed[from];
  if (!list.includes(to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid KPI target status transition: ${from} → ${to}`,
    });
  }
}

/** Metric / notes edits allowed only for draft and active targets. */
export function assertKpiTargetRowEditableForMetrics(status: KpiTargetStatus): void {
  if (status === "draft" || status === "active") return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Cannot edit target values while status is ${status}`,
  });
}
