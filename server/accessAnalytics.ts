/**
 * Access Intelligence — aggregates from the same canonical rows as Team Access (`resolveEmployeeAccess`).
 * v0: live snapshot only; time-series / daily rollups can consume the same shapes later.
 *
 * **Metrics distinction (do not conflate in UI):**
 * - `core.invitePendingHrRows` — count of **HR employee rows** in canonical `INVITED` access state.
 * - `invitesTable.pendingCount` — count of rows in **`company_invites`** that are pending (not accepted/revoked, not expired).
 *   These differ because invites can exist without a matching HR row, and HR can show INVITED from resolver context.
 *
 * **Expiry fields:** `soonestExpiryDays` / `farthestExpiryDays` are **`null` when `pendingCount === 0`**.
 * With exactly one pending invite, both equal the same value. With several, soonest ≤ farthest.
 */
import type { EmployeeWithAccessDataRow } from "./employeesWithAccessData";
import type { AccessIntelSeverity } from "./accessIntelLabels";
import { STATE_REASON_INTEL } from "./accessIntelLabels";

export type AccessIntelTopIssue = {
  /** Stable key: synthetic `ACCOUNT_NOT_LINKED` / `STATE_REASON:…` / etc. */
  key: string;
  count: number;
  severity: AccessIntelSeverity;
  label: string;
};

export type AccessAnalyticsOverview = {
  /** ISO timestamp when this snapshot was computed */
  generatedAt: string;
  /** v0 is always live query — historical windows plug in here later */
  window: "live";
  core: {
    totalHrEmployees: number;
    hrOnly: number;
    /**
     * HR rows whose canonical `accessState` is `INVITED` (invite tied to that employee email in resolver).
     * **Not** the same as `invitesTable.pendingCount`.
     */
    invitePendingHrRows: number;
    activeAccess: number;
    suspended: number;
    needsAttention: number;
    directAccessOnly: number;
  };
  diagnostics: {
    /**
     * Counts keyed by resolver `stateReason` string. Prefer `KNOWN_STATE_REASONS` for UI;
     * unknown keys may appear if the resolver adds reasons before labels are updated.
     */
    stateReasonCounts: Record<string, number>;
    accountNotLinked: number;
    identityConflict: number;
    missingEmail: number;
    conflictMultipleMembers: number;
    conflictMultipleInvites: number;
    conflictEmailMismatch: number;
  };
  /** Top operational issues — merged flag summaries + per–state-reason counts (max 5). */
  topIssues: AccessIntelTopIssue[];
  invitesTable: {
    /** Pending rows in `company_invites` (operational queue), not HR-row INVITED count */
    pendingCount: number;
    /**
     * Days until the **soonest** expiry among pending invites — **`null` if `pendingCount === 0`**.
     * Non-null implies at least one pending invite.
     */
    soonestExpiryDays: number | null;
    /**
     * Days until the **farthest** expiry among pending invites — **`null` if `pendingCount === 0`**.
     * With a single pending invite, equals `soonestExpiryDays`.
     */
    farthestExpiryDays: number | null;
  };
};

function employeeNeedsAttention(flags: { needsLink?: boolean; conflict?: boolean; missingEmail?: boolean }): boolean {
  return !!(flags.conflict || flags.needsLink || flags.missingEmail);
}

function buildTopIssues(input: {
  stateReasonCounts: Record<string, number>;
  accountNotLinked: number;
  missingEmail: number;
  identityConflict: number;
}): AccessIntelTopIssue[] {
  const { stateReasonCounts, accountNotLinked, missingEmail, identityConflict } = input;
  const candidates: AccessIntelTopIssue[] = [];

  if (accountNotLinked > 0) {
    candidates.push({
      key: "ACCOUNT_NOT_LINKED",
      count: accountNotLinked,
      severity: "warning",
      label: "Account not linked (needs link)",
    });
  }
  if (missingEmail > 0) {
    candidates.push({
      key: "MISSING_EMAIL",
      count: missingEmail,
      severity: "warning",
      label: "Missing email",
    });
  }
  if (identityConflict > 0) {
    candidates.push({
      key: "IDENTITY_CONFLICT",
      count: identityConflict,
      severity: "critical",
      label: "Identity conflict",
    });
  }

  for (const [reason, count] of Object.entries(stateReasonCounts)) {
    if (count <= 0) continue;
    const meta = STATE_REASON_INTEL[reason];
    candidates.push({
      key: `STATE_REASON:${reason}`,
      count,
      severity: meta?.severity ?? "info",
      label: meta?.label ?? reason,
    });
  }

  candidates.sort((a, b) => b.count - a.count);

  const seen = new Set<string>();
  const out: AccessIntelTopIssue[] = [];
  for (const c of candidates) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    out.push(c);
    if (out.length >= 5) break;
  }
  return out;
}

export function buildAccessAnalyticsOverview(input: {
  employeeRows: EmployeeWithAccessDataRow[];
  memberRows: { memberId: number; isActive: boolean }[];
  pendingInviteExpiresAt: Date[];
}): AccessAnalyticsOverview {
  const { employeeRows, memberRows, pendingInviteExpiresAt } = input;
  const now = Date.now();

  const linkedMemberIds = new Set(
    employeeRows
      .map((r) => r.memberId)
      .filter((id): id is number => typeof id === "number" && Number.isFinite(id)),
  );
  const activeMembers = memberRows.filter((m) => m.isActive);
  const directAccessOnly = activeMembers.filter((m) => !linkedMemberIds.has(m.memberId)).length;

  let hrOnly = 0;
  let invitePendingHrRows = 0;
  let activeAccess = 0;
  let suspended = 0;
  let needsAttention = 0;
  let accountNotLinked = 0;
  let identityConflict = 0;
  let missingEmail = 0;
  let conflictMultipleMembers = 0;
  let conflictMultipleInvites = 0;
  let conflictEmailMismatch = 0;

  const stateReasonCounts: Record<string, number> = {};

  for (const row of employeeRows) {
    const sr = row.stateReason ?? "UNKNOWN";
    stateReasonCounts[sr] = (stateReasonCounts[sr] ?? 0) + 1;

    switch (row.accessState) {
      case "HR_ONLY":
        hrOnly += 1;
        break;
      case "INVITED":
        invitePendingHrRows += 1;
        break;
      case "ACTIVE":
        activeAccess += 1;
        break;
      case "SUSPENDED":
        suspended += 1;
        break;
      default:
        break;
    }

    const f = row.flags ?? { needsLink: false, conflict: false, missingEmail: false };
    if (employeeNeedsAttention(f)) needsAttention += 1;
    if (f.needsLink) accountNotLinked += 1;
    if (f.conflict) identityConflict += 1;
    if (f.missingEmail) missingEmail += 1;

    if (sr === "CONFLICT_MULTIPLE_MEMBERS") conflictMultipleMembers += 1;
    if (sr === "CONFLICT_MULTIPLE_INVITES") conflictMultipleInvites += 1;
    if (sr === "CONFLICT_EMAIL_MISMATCH") conflictEmailMismatch += 1;
  }

  const pendingCount = pendingInviteExpiresAt.length;

  let soonestExpiryDays: number | null = null;
  let farthestExpiryDays: number | null = null;
  if (pendingCount > 0) {
    const daysList = pendingInviteExpiresAt.map((d) => (d.getTime() - now) / (1000 * 60 * 60 * 24));
    const minD = Math.min(...daysList);
    const maxD = Math.max(...daysList);
    soonestExpiryDays = Math.round(minD * 10) / 10;
    farthestExpiryDays = Math.round(maxD * 10) / 10;
  }

  const topIssues = buildTopIssues({
    stateReasonCounts,
    accountNotLinked,
    missingEmail,
    identityConflict,
  });

  return {
    generatedAt: new Date().toISOString(),
    window: "live",
    core: {
      totalHrEmployees: employeeRows.length,
      hrOnly,
      invitePendingHrRows,
      activeAccess,
      suspended,
      needsAttention,
      directAccessOnly,
    },
    diagnostics: {
      stateReasonCounts,
      accountNotLinked,
      identityConflict,
      missingEmail,
      conflictMultipleMembers,
      conflictMultipleInvites,
      conflictEmailMismatch,
    },
    topIssues,
    invitesTable: {
      pendingCount,
      soonestExpiryDays,
      farthestExpiryDays,
    },
  };
}
