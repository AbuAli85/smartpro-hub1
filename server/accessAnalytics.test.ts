import { describe, expect, it } from "vitest";
import { buildAccessAnalyticsOverview } from "./accessAnalytics";
import type { EmployeeWithAccessDataRow } from "./employeesWithAccessData";

function row(partial: Partial<EmployeeWithAccessDataRow> & Pick<EmployeeWithAccessDataRow, "accessState" | "stateReason">): EmployeeWithAccessDataRow {
  return {
    employeeId: partial.employeeId ?? 1,
    firstName: "A",
    lastName: "B",
    firstNameAr: null,
    lastNameAr: null,
    email: "a@x.com",
    department: null,
    position: null,
    employeeStatus: "active",
    employeeNumber: null,
    nationality: null,
    hireDate: null,
    accessStatus: "no_access",
    memberRole: null,
    memberId: partial.memberId ?? null,
    hasLogin: false,
    lastSignedIn: null,
    loginEmail: null,
    accessState: partial.accessState,
    flags: partial.flags ?? { needsLink: false, conflict: false, missingEmail: false },
    primaryAction: "GRANT_ACCESS",
    stateReason: partial.stateReason,
    ...partial,
  };
}

describe("buildAccessAnalyticsOverview", () => {
  it("aggregates core counts and stateReason distribution", () => {
    const employeeRows: EmployeeWithAccessDataRow[] = [
      row({ employeeId: 1, accessState: "HR_ONLY", stateReason: "HR_ONLY_NO_MEMBER_NO_PENDING_INVITE", memberId: null }),
      row({ employeeId: 2, accessState: "INVITED", stateReason: "INVITED_PENDING", memberId: null }),
      row({ employeeId: 3, accessState: "ACTIVE", stateReason: "ACTIVE_MEMBER", memberId: 100 }),
      row({ employeeId: 4, accessState: "SUSPENDED", stateReason: "SUSPENDED_MEMBER", memberId: 101 }),
    ];
    const memberRows = [
      { memberId: 100, isActive: true },
      { memberId: 200, isActive: true },
    ];
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const out = buildAccessAnalyticsOverview({
      employeeRows,
      memberRows,
      pendingInviteExpiresAt: [future],
    });

    expect(out.window).toBe("live");
    expect(out.core.totalHrEmployees).toBe(4);
    expect(out.core.hrOnly).toBe(1);
    expect(out.core.invitePendingHrRows).toBe(1);
    expect(out.core.activeAccess).toBe(1);
    expect(out.core.suspended).toBe(1);
    expect(out.core.directAccessOnly).toBe(1);
    expect(out.diagnostics.stateReasonCounts.INVITED_PENDING).toBe(1);
    expect(out.invitesTable.pendingCount).toBe(1);
    expect(out.invitesTable.soonestExpiryDays).not.toBeNull();
    expect(out.invitesTable.farthestExpiryDays).not.toBeNull();
    expect(out.invitesTable.soonestExpiryDays).toBe(out.invitesTable.farthestExpiryDays);
    expect(out.topIssues.length).toBeGreaterThan(0);
  });

  it("uses an explicit unlabeled topIssue label when stateReason is not in STATE_REASON_INTEL", () => {
    const out = buildAccessAnalyticsOverview({
      employeeRows: [
        row({
          employeeId: 99,
          accessState: "ACTIVE",
          stateReason: "NEW_REASON_FROM_RESOLVER",
          memberId: 1,
        }),
      ],
      memberRows: [{ memberId: 1, isActive: true }],
      pendingInviteExpiresAt: [],
    });
    const srIssue = out.topIssues.find((t) => t.key === "STATE_REASON:NEW_REASON_FROM_RESOLVER");
    expect(srIssue).toBeDefined();
    expect(srIssue?.label).toBe("Unlabeled: NEW_REASON_FROM_RESOLVER");
    expect(srIssue?.severity).toBe("info");
  });

  it("sets expiry days to null when there are no pending invites", () => {
    const out = buildAccessAnalyticsOverview({
      employeeRows: [row({ employeeId: 1, accessState: "ACTIVE", stateReason: "ACTIVE_MEMBER", memberId: 1 })],
      memberRows: [{ memberId: 1, isActive: true }],
      pendingInviteExpiresAt: [],
    });
    expect(out.invitesTable.pendingCount).toBe(0);
    expect(out.invitesTable.soonestExpiryDays).toBeNull();
    expect(out.invitesTable.farthestExpiryDays).toBeNull();
  });

  it("counts needsAttention and conflict diagnostics", () => {
    const employeeRows: EmployeeWithAccessDataRow[] = [
      row({
        employeeId: 1,
        accessState: "ACTIVE",
        stateReason: "CONFLICT_MULTIPLE_MEMBERS",
        flags: { needsLink: true, conflict: true, missingEmail: false },
        memberId: 1,
      }),
      row({
        employeeId: 2,
        accessState: "HR_ONLY",
        stateReason: "HR_ONLY_NO_IDENTITY",
        flags: { needsLink: false, conflict: false, missingEmail: true },
        memberId: null,
      }),
    ];
    const out = buildAccessAnalyticsOverview({
      employeeRows,
      memberRows: [{ memberId: 1, isActive: true }],
      pendingInviteExpiresAt: [],
    });
    expect(out.core.needsAttention).toBe(2);
    expect(out.diagnostics.identityConflict).toBe(1);
    expect(out.diagnostics.accountNotLinked).toBe(1);
    expect(out.diagnostics.missingEmail).toBe(1);
    expect(out.diagnostics.conflictMultipleMembers).toBe(1);
    expect(out.invitesTable.soonestExpiryDays).toBeNull();
    expect(out.topIssues.some((t) => t.key === "IDENTITY_CONFLICT")).toBe(true);
  });
});
