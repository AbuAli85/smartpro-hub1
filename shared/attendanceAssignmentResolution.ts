/**
 * Resolves which promoter assignment (if any) applies to an attendance event.
 * Pure logic — DB loading lives in server repositories.
 */

import type { AssignmentStatus } from "./promoterAssignmentLifecycle";
import { getAssignmentTemporalState, type AssignmentTemporalState } from "./promoterAssignmentTemporal";

export type AttendanceAssignmentResolution =
  | { kind: "resolved"; promoterAssignmentId: string; siteId: number | null; reason?: null }
  | {
      kind: "no_match";
      reason: "no_operational_assignment" | "site_mismatch" | "future_assignment" | "suspended_or_terminal";
    }
  | { kind: "ambiguous"; candidateAssignmentIds: string[]; reason: "multiple_operational_assignments" };

export type AssignmentCandidateForAttendance = {
  id: string;
  assignmentStatus: AssignmentStatus;
  startDate: Date | string;
  endDate: Date | string | null;
  /** When set, attendance must occur at this client site. */
  clientSiteId: number | null;
};

/**
 * Filter assignments to those operationally valid for check-in on `businessDateYmd` (Asia/Muscat calendar).
 */
export function resolvePromoterAssignmentForAttendance(
  candidates: AssignmentCandidateForAttendance[],
  input: { businessDateYmd: string; attendanceSiteId: number | null },
): AttendanceAssignmentResolution {
  const ref = input.businessDateYmd.slice(0, 10);

  const activeRows = candidates.filter((c) => c.assignmentStatus === "active");
  if (activeRows.length === 0) {
    const suspended = candidates.some((c) => c.assignmentStatus === "suspended");
    if (suspended) {
      return { kind: "no_match", reason: "suspended_or_terminal" };
    }
    return { kind: "no_match", reason: "no_operational_assignment" };
  }

  const operational: AssignmentCandidateForAttendance[] = [];
  let onlyFuture = true;

  for (const c of activeRows) {
    const temporal = getAssignmentTemporalState(
      {
        assignmentStatus: c.assignmentStatus,
        startDate: c.startDate,
        endDate: c.endDate,
      },
      ref,
    );
    if (temporal === "scheduled_future") {
      continue;
    }
    onlyFuture = false;
    if (temporal !== "operational") {
      continue;
    }
    if (c.clientSiteId != null) {
      if (input.attendanceSiteId == null || c.clientSiteId !== input.attendanceSiteId) {
        continue;
      }
    }
    /** `clientSiteId` null on assignment = not site-bound; any client site check-in can match. */
    operational.push(c);
  }

  if (operational.length === 1) {
    return {
      kind: "resolved",
      promoterAssignmentId: operational[0].id,
      siteId: operational[0].clientSiteId ?? input.attendanceSiteId,
    };
  }

  if (operational.length > 1) {
    return {
      kind: "ambiguous",
      candidateAssignmentIds: operational.map((c) => c.id),
      reason: "multiple_operational_assignments",
    };
  }

  /** Distinguish future-only actives vs site mismatch vs none. */
  const hadSiteRequiredMismatch = activeRows.some((c) => {
    const temporal = getAssignmentTemporalState(
      {
        assignmentStatus: c.assignmentStatus,
        startDate: c.startDate,
        endDate: c.endDate,
      },
      ref,
    );
    if (temporal !== "operational") return false;
    return c.clientSiteId != null && (input.attendanceSiteId == null || c.clientSiteId !== input.attendanceSiteId);
  });
  if (hadSiteRequiredMismatch) {
    return { kind: "no_match", reason: "site_mismatch" };
  }

  if (onlyFuture && activeRows.some((c) => getAssignmentTemporalState(
    { assignmentStatus: c.assignmentStatus, startDate: c.startDate, endDate: c.endDate },
    ref,
  ) === "scheduled_future")) {
    return { kind: "no_match", reason: "future_assignment" };
  }

  return { kind: "no_match", reason: "no_operational_assignment" };
}

/** Maps temporal state to coarse execution bucket for dashboards. */
export function temporalStateToExecutionBucket(s: AssignmentTemporalState): string {
  switch (s) {
    case "operational":
      return "operational";
    case "scheduled_future":
      return "future_scheduled";
    case "suspended":
      return "suspended";
    case "completed":
    case "terminated":
    case "ended":
      return "ended";
    default:
      return "other";
  }
}
