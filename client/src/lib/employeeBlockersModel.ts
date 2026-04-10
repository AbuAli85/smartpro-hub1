/**
 * Command Center blockers — higher priority than Top Actions (Phase 2).
 * Presentation-only; sources are flags passed from the portal page / overview model.
 */
import type { OverviewShiftCardPresentation } from "@/lib/employeePortalOverviewPresentation";
import type { EmployeeWorkStatusSummary } from "@shared/employeePortalWorkStatusSummary";
import type { ShiftPhase } from "@/lib/employeePortalUtils";

export type EmployeeBlockerType =
  | "attendance"
  | "document"
  | "payroll"
  | "compliance"
  | "profile"
  | "request";

export type EmployeeBlocker = {
  id: string;
  type: EmployeeBlockerType;
  title: string;
  description?: string;
  actionLabel: string;
  /** Portal tab */
  actionTab: "attendance" | "documents" | "profile" | "requests" | "payroll" | "tasks" | "leave";
  severity: "warning" | "critical";
  /** Priority: lower = more urgent (sort ascending) */
  rank: number;
};

/** Top Actions keys to drop when a blocker covers the same work */
export const BLOCKER_SUPPRESSED_ACTION_KEYS: Record<string, readonly string[]> = {
  "blocker-att-inconsistent": ["att-inconsistent"],
  "blocker-missed-shift": ["missed-ended"],
  "blocker-missing-checkout": ["check-in"],
  "blocker-docs-expired": ["docs-expired"],
  "blocker-docs-soon": ["docs-soon"],
  "blocker-work-urgent": ["work-urgent"],
  "blocker-profile": ["profile"],
};

export function suppressedActionKeysFromBlockers(blockers: EmployeeBlocker[]): Set<string> {
  const out = new Set<string>();
  for (const b of blockers) {
    const extra = BLOCKER_SUPPRESSED_ACTION_KEYS[b.id];
    if (extra) for (const k of extra) out.add(k);
  }
  return out;
}

const MAX_BLOCKERS = 3;

export function buildEmployeeBlockers(input: {
  shiftOverview: OverviewShiftCardPresentation;
  phase: ShiftPhase | null;
  checkIn: Date | null;
  checkOut: Date | null;
  workStatusSummary: EmployeeWorkStatusSummary | null | undefined;
  expiredDocCount: number;
  /** Expiring within 7 days — warning blocker if no expired */
  criticalSoonDocCount: number;
  profileReminder: string | null;
}): EmployeeBlocker[] {
  const list: EmployeeBlocker[] = [];

  if (input.shiftOverview.attendanceInconsistent) {
    list.push({
      id: "blocker-att-inconsistent",
      type: "attendance",
      title: "Attendance needs review",
      description: "Check-out without check-in — HR must fix the record before payroll can trust the day.",
      actionLabel: "Fix attendance",
      actionTab: "attendance",
      severity: "critical",
      rank: 10,
    });
  }

  if (input.shiftOverview.showMissedEndedWarning) {
    list.push({
      id: "blocker-missed-shift",
      type: "attendance",
      title: "No attendance for today’s shift",
      description: input.shiftOverview.correctionPendingNote ?? "Submit a correction if you worked.",
      actionLabel: "Fix attendance",
      actionTab: "attendance",
      severity: "critical",
      rank: 20,
    });
  }

  if (input.checkIn && !input.checkOut && input.phase === "ended") {
    list.push({
      id: "blocker-missing-checkout",
      type: "attendance",
      title: "Missing check-out",
      description: "You checked in but did not check out after the shift ended. This can block payroll for the day.",
      actionLabel: "Fix attendance",
      actionTab: "attendance",
      severity: "critical",
      rank: 15,
    });
  }

  if (input.workStatusSummary?.overallStatus === "urgent") {
    const pa = input.workStatusSummary.primaryAction;
    list.push({
      id: "blocker-work-urgent",
      type: "compliance",
      title: "HR: urgent compliance items",
      description: [input.workStatusSummary.permit.label, input.workStatusSummary.documents.label].filter(Boolean).join(" · "),
      actionLabel: pa.type !== "none" ? pa.label : "Review status",
      actionTab: (pa.tab as EmployeeBlocker["actionTab"]) ?? "documents",
      severity: "critical",
      rank: 12,
    });
  }

  if (input.expiredDocCount > 0) {
    list.push({
      id: "blocker-docs-expired",
      type: "document",
      title: "Expired documents",
      description: `${input.expiredDocCount} file(s) past expiry — renew or upload replacements.`,
      actionLabel: "Upload document",
      actionTab: "documents",
      severity: "critical",
      rank: 25,
    });
  } else if (input.criticalSoonDocCount > 0) {
    list.push({
      id: "blocker-docs-soon",
      type: "document",
      title: "Documents expiring very soon",
      description: `${input.criticalSoonDocCount} item(s) expire within 7 days.`,
      actionLabel: "Review documents",
      actionTab: "documents",
      severity: "warning",
      rank: 40,
    });
  }

  if (input.profileReminder) {
    list.push({
      id: "blocker-profile",
      type: "profile",
      title: "Profile incomplete",
      description: input.profileReminder,
      actionLabel: "Complete profile",
      actionTab: "profile",
      severity: "warning",
      rank: 50,
    });
  }

  list.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const dedup = new Map<string, EmployeeBlocker>();
  for (const b of list) dedup.set(b.id, b);
  return Array.from(dedup.values()).slice(0, MAX_BLOCKERS);
}
