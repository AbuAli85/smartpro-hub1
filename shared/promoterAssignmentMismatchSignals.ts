/**
 * Attendance ↔ assignment mismatch and compliance signals (Phase 2.5).
 * Reusable from server summaries and UI.
 */

import type { AttendanceAssignmentResolution } from "./attendanceAssignmentResolution";
import type { AssignmentStatus } from "./promoterAssignmentLifecycle";
import { getAssignmentTemporalState } from "./promoterAssignmentTemporal";

export const MISMATCH_SIGNALS = [
  "unlinked_attendance",
  "no_operational_assignment",
  "future_assignment_attendance_attempt",
  "wrong_site_attendance",
  "suspended_assignment_attendance_attempt",
  "multiple_operational_assignments",
  "assignment_not_operational_on_date",
  "attendance_without_assignment_site_context",
  "assignment_linked_but_temporally_invalid",
  "none",
] as const;

export type MismatchSignal = (typeof MISMATCH_SIGNALS)[number];

export function mismatchSignalLabel(s: MismatchSignal): string {
  const labels: Record<string, string> = {
    unlinked_attendance: "Attendance not linked to an assignment",
    no_operational_assignment: "No operational assignment for this date/site",
    future_assignment_attendance_attempt: "Check-in while assignment starts in the future",
    wrong_site_attendance: "Site does not match assignment work location",
    suspended_assignment_attendance_attempt: "Attendance while assignment is suspended",
    multiple_operational_assignments: "Multiple assignments match — ambiguous",
    assignment_not_operational_on_date: "Assignment not deployable on this date",
    attendance_without_assignment_site_context: "No site on attendance where assignment requires one",
    assignment_linked_but_temporally_invalid: "Linked assignment fails date/status check",
    none: "No mismatch",
  };
  return labels[s] ?? s;
}

type AssignmentRowLite = {
  id: string;
  assignmentStatus: AssignmentStatus;
  startDate: Date | string;
  endDate: Date | string | null;
  clientSiteId: number | null;
};

/**
 * Classify a clock row after resolution attempt (or when reading stored link).
 */
export function classifyAttendanceMismatch(input: {
  businessDateYmd: string;
  attendanceSiteId: number | null;
  resolution: AttendanceAssignmentResolution | null;
  linkedAssignment: AssignmentRowLite | null;
}): { signal: MismatchSignal; reason: string } {
  const ref = input.businessDateYmd.slice(0, 10);

  if (input.linkedAssignment) {
    const a = input.linkedAssignment;
    if (a.assignmentStatus === "suspended") {
      return {
        signal: "suspended_assignment_attendance_attempt",
        reason: "Assignment is suspended",
      };
    }

    const temporal = getAssignmentTemporalState(
      {
        assignmentStatus: a.assignmentStatus,
        startDate: a.startDate,
        endDate: a.endDate,
      },
      ref,
    );

    if (a.assignmentStatus === "active" && temporal === "scheduled_future") {
      return {
        signal: "future_assignment_attendance_attempt",
        reason: "Assignment start is after this date",
      };
    }

    if (a.clientSiteId != null) {
      if (input.attendanceSiteId == null || input.attendanceSiteId !== a.clientSiteId) {
        return {
          signal: "wrong_site_attendance",
          reason: "Attendance site does not match assignment client site",
        };
      }
    }

    if (a.assignmentStatus === "active" && temporal === "operational") {
      return { signal: "none", reason: "Linked assignment is operational for this date" };
    }

    if (temporal !== "operational") {
      return {
        signal: "assignment_not_operational_on_date",
        reason: `Temporal state: ${temporal}`,
      };
    }

    return {
      signal: "assignment_linked_but_temporally_invalid",
      reason: "Linked row failed validation",
    };
  }

  if (!input.resolution) {
    return { signal: "unlinked_attendance", reason: "No resolution result" };
  }

  if (input.resolution.kind === "ambiguous") {
    return {
      signal: "multiple_operational_assignments",
      reason: "More than one operational assignment matched",
    };
  }

  if (input.resolution.kind === "no_match") {
    if (input.resolution.reason === "site_mismatch") {
      return { signal: "wrong_site_attendance", reason: "No assignment matches this site" };
    }
    if (input.resolution.reason === "future_assignment") {
      return {
        signal: "future_assignment_attendance_attempt",
        reason: "Only future-dated active assignments exist",
      };
    }
    if (input.resolution.reason === "suspended_or_terminal") {
      return {
        signal: "suspended_assignment_attendance_attempt",
        reason: "Only suspended or non-active assignments",
      };
    }
    if (input.attendanceSiteId == null) {
      return {
        signal: "attendance_without_assignment_site_context",
        reason: "Missing site on clock row where required",
      };
    }
    return {
      signal: "no_operational_assignment",
      reason: "No operational assignment for employee/brand/date",
    };
  }

  return { signal: "none", reason: "Resolved" };
}
