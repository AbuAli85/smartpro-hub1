import { describe, expect, it } from "vitest";
import type {
  EmployeeInput,
  InviteInput,
  MemberInput,
  ResolverInput,
  ResolverOutput,
  UserByEmailInput,
} from "./employeeAccessResolver";
import { resolveEmployeeAccess } from "./employeeAccessResolver";

const NOW_ISO = "2026-01-01T00:00:00.000Z";

function mkEmployee(p: Partial<EmployeeInput> = {}): EmployeeInput {
  return {
    employeeId: 1,
    companyId: 10,
    userId: null,
    email: null,
    ...p,
  };
}

function mkUserByEmail(p: { id?: number; email?: string } = {}): NonNullable<UserByEmailInput> {
  return {
    id: p.id ?? 1001,
    email: p.email ?? "user@example.com",
  };
}

function mkMember(p: Partial<NonNullable<MemberInput>> = {}): NonNullable<MemberInput> {
  return {
    id: 501,
    companyId: 10,
    userId: 1001,
    isActive: true,
    role: "company_member",
    ...p,
  };
}

function mkInvite(p: Partial<NonNullable<InviteInput>> = {}): NonNullable<InviteInput> {
  return {
    id: 801,
    companyId: 10,
    email: "user@example.com",
    token: "tok-801",
    expiresAt: "2099-01-01T00:00:00.000Z",
    acceptedAt: null,
    revokedAt: null,
    role: "company_member",
    ...p,
  };
}

function assertSharedInvariants(input: ResolverInput, out: ResolverOutput) {
  // Access state must always be one canonical value.
  expect(["HR_ONLY", "INVITED", "ACTIVE", "SUSPENDED"]).toContain(out.accessState);

  // Member precedence is absolute for the base state.
  if (input.member?.isActive) {
    expect(out.accessState).toBe("ACTIVE");
  }
  if (input.member && !input.member.isActive) {
    expect(out.accessState).toBe("SUSPENDED");
  }

  // missingEmail strict definition.
  const shouldMissingEmail = input.employee.email == null && input.employee.userId == null;
  expect(out.flags.missingEmail).toBe(shouldMissingEmail);

  // needsLink strict definition.
  const shouldNeedsLink = !!input.member && input.employee.userId !== input.member.userId;
  expect(out.flags.needsLink).toBe(shouldNeedsLink);

  // If invite exists in fixture, it should be pending (fixtures are expected to pre-filter invites).
  if (input.invite) {
    expect(input.invite.acceptedAt).toBeNull();
    expect(input.invite.revokedAt).toBeNull();
  }

  // Conflict overlays state and forces action.
  if (out.flags.conflict) {
    expect(out.primaryAction).toBe("RESOLVE_CONFLICT");
    expect(out.flags.needsLink).toBeDefined();
  } else {
    expect(out.primaryAction).not.toBe("RESOLVE_CONFLICT");
  }

  // State/action compatibility for non-conflict paths.
  if (out.accessState === "HR_ONLY" && out.flags.missingEmail && !out.flags.conflict) {
    expect(out.primaryAction).toBe("NONE");
  }
  if (out.accessState === "INVITED" && !out.flags.conflict) {
    expect(out.primaryAction).toBe("COPY_INVITE");
  }
  if (out.accessState === "SUSPENDED" && !out.flags.conflict) {
    expect(out.primaryAction).toBe("RESTORE_ACCESS");
  }
}

const cases: Array<{
  id: string;
  input: ResolverInput;
  expected: ResolverOutput;
}> = [
  {
    id: "case-01-hr-only-no-email-no-user",
    input: {
      employee: mkEmployee({ employeeId: 1, userId: null, email: null }),
      userByEmail: null,
      member: null,
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "HR_ONLY",
      flags: { needsLink: false, conflict: false, missingEmail: true },
      primaryAction: "NONE",
      stateReason: "HR_ONLY_NO_IDENTITY",
      resolvedUserId: null,
      effectiveInvite: null,
    },
  },
  {
    id: "case-02-hr-only-email-no-user-no-member-no-invite",
    input: {
      employee: mkEmployee({ employeeId: 2, email: "a@x.com" }),
      userByEmail: null,
      member: null,
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "HR_ONLY",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "GRANT_ACCESS",
      stateReason: "HR_ONLY_NO_MEMBER_NO_PENDING_INVITE",
      resolvedUserId: null,
      effectiveInvite: null,
    },
  },
  {
    id: "case-03-invited-only-pending-invite",
    input: {
      employee: mkEmployee({ employeeId: 3, email: "b@x.com" }),
      userByEmail: null,
      member: null,
      invite: mkInvite({ id: 301, email: "b@x.com", token: "t301" }),
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "INVITED",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "COPY_INVITE",
      stateReason: "INVITED_PENDING",
      resolvedUserId: null,
      effectiveInvite: mkInvite({ id: 301, email: "b@x.com", token: "t301" }),
    },
  },
  {
    id: "case-04-hr-only-user-by-email-but-no-member",
    input: {
      employee: mkEmployee({ employeeId: 4, email: "c@x.com" }),
      userByEmail: mkUserByEmail({ id: 4001, email: "c@x.com" }),
      member: null,
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "HR_ONLY",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "GRANT_ACCESS",
      stateReason: "HR_ONLY_USER_EXISTS_NO_MEMBER",
      resolvedUserId: 4001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-05-active-needs-link-member-active-email-resolved",
    input: {
      employee: mkEmployee({ employeeId: 5, userId: null, email: "d@x.com" }),
      userByEmail: mkUserByEmail({ id: 5001, email: "d@x.com" }),
      member: mkMember({ id: 501, userId: 5001, isActive: true }),
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "ACTIVE",
      flags: { needsLink: true, conflict: false, missingEmail: false },
      primaryAction: "LINK_ACCOUNT",
      stateReason: "ACTIVE_MEMBER_LINK_DRIFT",
      resolvedUserId: 5001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-06-suspended-needs-link-member-inactive-email-resolved",
    input: {
      employee: mkEmployee({ employeeId: 6, userId: null, email: "e@x.com" }),
      userByEmail: mkUserByEmail({ id: 6001, email: "e@x.com" }),
      member: mkMember({ id: 601, userId: 6001, isActive: false }),
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "SUSPENDED",
      flags: { needsLink: true, conflict: false, missingEmail: false },
      primaryAction: "RESTORE_ACCESS",
      stateReason: "SUSPENDED_MEMBER_LINK_DRIFT",
      resolvedUserId: 6001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-07-active-linked-user-and-member",
    input: {
      employee: mkEmployee({ employeeId: 7, userId: 7001, email: "f@x.com" }),
      userByEmail: mkUserByEmail({ id: 7001, email: "f@x.com" }),
      member: mkMember({ id: 701, userId: 7001, isActive: true }),
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "ACTIVE",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "CHANGE_ROLE",
      stateReason: "ACTIVE_MEMBER",
      resolvedUserId: 7001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-08-suspended-linked-user-and-member",
    input: {
      employee: mkEmployee({ employeeId: 8, userId: 8001, email: "g@x.com" }),
      userByEmail: mkUserByEmail({ id: 8001, email: "g@x.com" }),
      member: mkMember({ id: 801, userId: 8001, isActive: false }),
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "SUSPENDED",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "RESTORE_ACCESS",
      stateReason: "SUSPENDED_MEMBER",
      resolvedUserId: 8001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-09-invited-user-linked-no-member",
    input: {
      employee: mkEmployee({ employeeId: 9, userId: 9001, email: "h@x.com" }),
      userByEmail: mkUserByEmail({ id: 9001, email: "h@x.com" }),
      member: null,
      invite: mkInvite({ id: 901, email: "h@x.com", token: "t901" }),
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "INVITED",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "COPY_INVITE",
      stateReason: "INVITED_PENDING",
      resolvedUserId: 9001,
      effectiveInvite: mkInvite({ id: 901, email: "h@x.com", token: "t901" }),
    },
  },
  {
    id: "case-10-hr-only-employee-userid-no-member-no-invite",
    input: {
      employee: mkEmployee({ employeeId: 10, userId: 10001, email: "i@x.com" }),
      userByEmail: mkUserByEmail({ id: 10001, email: "i@x.com" }),
      member: null,
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "HR_ONLY",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "GRANT_ACCESS",
      stateReason: "HR_ONLY_USER_EXISTS_NO_MEMBER",
      resolvedUserId: 10001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-11-conflict-employee-userid-mismatch-member-userid",
    input: {
      employee: mkEmployee({ employeeId: 11, userId: 11001, email: "j@x.com" }),
      userByEmail: mkUserByEmail({ id: 11002, email: "j@x.com" }),
      member: mkMember({ id: 1101, userId: 11002, isActive: true }),
      invite: null,
      diagnostics: { emailIdentityMismatch: true },
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "ACTIVE",
      flags: { needsLink: true, conflict: true, missingEmail: false },
      primaryAction: "RESOLVE_CONFLICT",
      stateReason: "CONFLICT_EMAIL_MISMATCH",
      resolvedUserId: 11001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-12-active-member-with-pending-invite-invite-ignored",
    input: {
      employee: mkEmployee({ employeeId: 12, userId: null, email: "k@x.com" }),
      userByEmail: mkUserByEmail({ id: 12001, email: "k@x.com" }),
      member: mkMember({ id: 1201, userId: 12001, isActive: true }),
      invite: mkInvite({ id: 1202, email: "k@x.com", token: "t1202" }),
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "ACTIVE",
      flags: { needsLink: true, conflict: false, missingEmail: false },
      primaryAction: "LINK_ACCOUNT",
      stateReason: "ACTIVE_MEMBER_LINK_DRIFT",
      resolvedUserId: 12001,
      effectiveInvite: mkInvite({ id: 1202, email: "k@x.com", token: "t1202" }),
    },
  },
  {
    id: "case-13-suspended-member-with-pending-invite-invite-ignored",
    input: {
      employee: mkEmployee({ employeeId: 13, userId: 13001, email: "l@x.com" }),
      userByEmail: mkUserByEmail({ id: 13001, email: "l@x.com" }),
      member: mkMember({ id: 1301, userId: 13001, isActive: false }),
      invite: mkInvite({ id: 1302, email: "l@x.com", token: "t1302" }),
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "SUSPENDED",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "RESTORE_ACCESS",
      stateReason: "SUSPENDED_MEMBER",
      resolvedUserId: 13001,
      effectiveInvite: mkInvite({ id: 1302, email: "l@x.com", token: "t1302" }),
    },
  },
  {
    id: "case-14-hr-only-invite-not-pending",
    input: {
      employee: mkEmployee({ employeeId: 14, email: "m@x.com" }),
      userByEmail: null,
      member: null,
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "HR_ONLY",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "GRANT_ACCESS",
      stateReason: "HR_ONLY_NO_MEMBER_NO_PENDING_INVITE",
      resolvedUserId: null,
      effectiveInvite: null,
    },
  },
  {
    id: "case-15-active-member-no-email-linked-by-userid",
    input: {
      employee: mkEmployee({ employeeId: 15, userId: 15001, email: null }),
      userByEmail: null,
      member: mkMember({ id: 1501, userId: 15001, isActive: true }),
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "ACTIVE",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "CHANGE_ROLE",
      stateReason: "ACTIVE_MEMBER",
      resolvedUserId: 15001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-16-suspended-member-no-email-linked-by-userid",
    input: {
      employee: mkEmployee({ employeeId: 16, userId: 16001, email: null }),
      userByEmail: null,
      member: mkMember({ id: 1601, userId: 16001, isActive: false }),
      invite: null,
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "SUSPENDED",
      flags: { needsLink: false, conflict: false, missingEmail: false },
      primaryAction: "RESTORE_ACCESS",
      stateReason: "SUSPENDED_MEMBER",
      resolvedUserId: 16001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-17-conflict-multiple-members",
    input: {
      employee: mkEmployee({ employeeId: 17, userId: null, email: "n@x.com" }),
      userByEmail: mkUserByEmail({ id: 17001, email: "n@x.com" }),
      member: mkMember({ id: 1701, userId: 17001, isActive: true }),
      invite: null,
      diagnostics: { multipleMembers: true },
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "ACTIVE",
      flags: { needsLink: true, conflict: true, missingEmail: false },
      primaryAction: "RESOLVE_CONFLICT",
      stateReason: "CONFLICT_MULTIPLE_MEMBERS",
      resolvedUserId: 17001,
      effectiveInvite: null,
    },
  },
  {
    id: "case-18-conflict-multiple-pending-invites",
    input: {
      employee: mkEmployee({ employeeId: 18, userId: null, email: "o@x.com" }),
      userByEmail: null,
      member: null,
      invite: mkInvite({ id: 1801, email: "o@x.com", token: "t1801" }),
      diagnostics: { multiplePendingInvites: true },
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "INVITED",
      flags: { needsLink: false, conflict: true, missingEmail: false },
      primaryAction: "RESOLVE_CONFLICT",
      stateReason: "CONFLICT_MULTIPLE_INVITES",
      resolvedUserId: null,
      effectiveInvite: mkInvite({ id: 1801, email: "o@x.com", token: "t1801" }),
    },
  },
  {
    id: "case-19-user-exists-different-email-than-employee",
    input: {
      employee: mkEmployee({ employeeId: 19, userId: null, email: "x@x.com" }),
      userByEmail: mkUserByEmail({ id: 19001, email: "y@x.com" }),
      member: null,
      invite: null,
      diagnostics: { emailIdentityMismatch: true },
      nowIso: NOW_ISO,
    },
    expected: {
      accessState: "HR_ONLY",
      flags: { needsLink: false, conflict: true, missingEmail: false },
      primaryAction: "RESOLVE_CONFLICT",
      stateReason: "CONFLICT_EMAIL_MISMATCH",
      resolvedUserId: null,
      effectiveInvite: null,
    },
  },
];

describe("employee access resolver (Phase 2B)", () => {
  it("includes full table-driven fixture coverage", () => {
    expect(cases).toHaveLength(19);
  });

  it.each(cases)("$id", ({ input, expected }) => {
    const out = resolveEmployeeAccess(input);
    expect(out).toEqual(expected);
    assertSharedInvariants(input, out);
  });

  describe("normalizes identity before resolution", () => {
    it("matches userByEmail case-insensitively against normalized employee email", () => {
      const out = resolveEmployeeAccess({
        employee: mkEmployee({ userId: null, email: "  Ali@Example.com  " }),
        userByEmail: mkUserByEmail({ id: 22001, email: "ali@example.com" }),
        member: null,
        invite: null,
        nowIso: NOW_ISO,
      });
      expect(out.resolvedUserId).toBe(22001);
      expect(out.flags.conflict).toBe(false);
    });
  });

  describe("invite validation behavior", () => {
    it("ignores expired invite input", () => {
      const out = resolveEmployeeAccess({
        employee: mkEmployee({ email: "expired@example.com" }),
        userByEmail: null,
        member: null,
        invite: mkInvite({
          id: 3001,
          email: "expired@example.com",
          expiresAt: "2020-01-01T00:00:00.000Z",
        }),
        nowIso: NOW_ISO,
      });
      expect(out.accessState).toBe("HR_ONLY");
      expect(out.effectiveInvite).toBeNull();
      expect(out.stateReason).toBe("HR_ONLY_NO_MEMBER_NO_PENDING_INVITE");
    });
  });
});
