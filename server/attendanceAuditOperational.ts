import { ATTENDANCE_AUDIT_ACTION, type AttendanceAuditActionType } from "@shared/attendanceAuditTaxonomy";

export type OperationalAuditLensResolution =
  | { kind: "none" }
  | { kind: "operational_all" }
  | { kind: "operational_one"; action: AttendanceAuditActionType }
  | { kind: "generic"; action: string };

/**
 * Pure helper for `listAttendanceAudit` — keeps operational vs generic action filtering testable without DB.
 */
export function resolveOperationalAuditLensFilter(input: {
  auditLens: "all" | "operational";
  operationalAction?: "all" | "acknowledge" | "resolve" | "assign";
  actionType?: string;
}): OperationalAuditLensResolution {
  if (input.auditLens === "operational") {
    if (input.operationalAction && input.operationalAction !== "all") {
      return { kind: "operational_one", action: mapOperationalSubActionToAuditAction(input.operationalAction) };
    }
    return { kind: "operational_all" };
  }
  if (input.actionType) {
    return { kind: "generic", action: input.actionType };
  }
  return { kind: "none" };
}

export const OPERATIONAL_TRIAGE_AUDIT_ACTIONS: AttendanceAuditActionType[] = [
  ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE,
  ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_RESOLVE,
  ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN,
];

export function mapOperationalSubActionToAuditAction(
  sub: "acknowledge" | "resolve" | "assign",
): AttendanceAuditActionType {
  const m = {
    acknowledge: ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE,
    resolve: ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_RESOLVE,
    assign: ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ASSIGN,
  } as const;
  return m[sub];
}

const ISSUE_KEY_PREFIX: Record<
  "overdue_checkout" | "missed_shift" | "correction_pending" | "manual_pending",
  string
> = {
  overdue_checkout: "overdue_checkout:%",
  missed_shift: "missed_shift:%",
  correction_pending: "correction_pending:%",
  manual_pending: "manual_pending:%",
};

export function operationalIssueKindToIssueKeyLikePattern(
  kind: keyof typeof ISSUE_KEY_PREFIX,
): string {
  return ISSUE_KEY_PREFIX[kind];
}
