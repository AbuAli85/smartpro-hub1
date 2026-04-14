/**
 * Human labels + severity for Access Intelligence (`topIssues`, future UI).
 * Keys align with `StateReason` in `employeeAccessResolver.ts` — update both when adding reasons.
 */
export type AccessIntelSeverity = "critical" | "warning" | "info";

export const STATE_REASON_INTEL: Record<
  string,
  { label: string; severity: AccessIntelSeverity }
> = {
  HR_ONLY_NO_IDENTITY: { label: "HR record — no email", severity: "warning" },
  HR_ONLY_USER_EXISTS_NO_MEMBER: { label: "User exists — no membership", severity: "warning" },
  HR_ONLY_NO_MEMBER_NO_PENDING_INVITE: { label: "HR only — no invite", severity: "info" },
  INVITED_PENDING: { label: "Invite pending (HR row)", severity: "info" },
  ACTIVE_MEMBER: { label: "Active member", severity: "info" },
  ACTIVE_MEMBER_LINK_DRIFT: { label: "Active — link drift", severity: "warning" },
  SUSPENDED_MEMBER: { label: "Suspended member", severity: "info" },
  SUSPENDED_MEMBER_LINK_DRIFT: { label: "Suspended — link drift", severity: "warning" },
  CONFLICT_IDENTITY_MISMATCH: { label: "Conflict — identity mismatch", severity: "critical" },
  CONFLICT_EMAIL_MISMATCH: { label: "Conflict — email mismatch", severity: "critical" },
  CONFLICT_MULTIPLE_MEMBERS: { label: "Conflict — multiple members", severity: "critical" },
  CONFLICT_MULTIPLE_INVITES: { label: "Conflict — multiple invites", severity: "critical" },
};
