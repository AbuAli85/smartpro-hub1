/**
 * Temporal interpretation of promoter assignments (Asia/Muscat calendar dates).
 *
 * "Operational today" rule (dashboard headcount / coverage):
 * — `assignment_status === 'active'`
 * — `start_date <= referenceDate`
 * — `end_date` is null OR `end_date >= referenceDate`
 *
 * Suspended assignments are never operationally deployed regardless of dates.
 * Completed/terminated are historical end states.
 *
 * Future-dated active: `active` with `start_date > referenceDate` → scheduled, not yet deployable.
 */

import type { AssignmentStatus } from "./promoterAssignmentLifecycle";

export type AssignmentTemporalState =
  | "draft"
  | "scheduled_future"
  | "operational"
  | "suspended"
  | "ended"
  | "completed"
  | "terminated";

export type AssignmentLikeForTemporal = {
  assignmentStatus: AssignmentStatus;
  startDate: Date | string;
  endDate: Date | string | null;
};

function ymd(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Reference date for "today" checks — pass Muscat local date string YYYY-MM-DD when available. */
export function getAssignmentTemporalState(
  a: AssignmentLikeForTemporal,
  referenceDate: Date | string,
): AssignmentTemporalState {
  const ref = ymd(referenceDate);
  const start = ymd(a.startDate);
  const end = a.endDate == null ? null : ymd(a.endDate);

  if (a.assignmentStatus === "draft") return "draft";
  if (a.assignmentStatus === "suspended") return "suspended";
  if (a.assignmentStatus === "completed") return "completed";
  if (a.assignmentStatus === "terminated") return "terminated";

  if (a.assignmentStatus === "active") {
    if (end != null && end < ref) return "ended";
    if (start > ref) return "scheduled_future";
    return "operational";
  }

  return "ended";
}

export function isAssignmentOperationalOnReferenceDate(
  a: AssignmentLikeForTemporal,
  referenceDate: Date | string,
): boolean {
  return getAssignmentTemporalState(a, referenceDate) === "operational";
}

export function isAssignmentFutureScheduled(
  a: AssignmentLikeForTemporal,
  referenceDate: Date | string,
): boolean {
  return getAssignmentTemporalState(a, referenceDate) === "scheduled_future";
}

export function isAssignmentEndedOnReferenceDate(
  a: AssignmentLikeForTemporal,
  referenceDate: Date | string,
): boolean {
  const s = getAssignmentTemporalState(a, referenceDate);
  return s === "ended" || s === "completed" || s === "terminated";
}

/** "Deployable" in the sense of staffing: operational now, not suspended / draft / future. */
export function isAssignmentCurrentlyOperational(
  a: AssignmentLikeForTemporal,
  referenceDate: Date | string,
): boolean {
  return isAssignmentOperationalOnReferenceDate(a, referenceDate);
}
