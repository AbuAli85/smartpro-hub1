export type AccessState = "HR_ONLY" | "INVITED" | "ACTIVE" | "SUSPENDED";

export type PrimaryAction =
  | "NONE"
  | "GRANT_ACCESS"
  | "COPY_INVITE"
  | "RESTORE_ACCESS"
  | "CHANGE_ROLE"
  | "LINK_ACCOUNT"
  | "RESOLVE_CONFLICT";

export type StateReason =
  | "HR_ONLY_NO_IDENTITY"
  | "HR_ONLY_USER_EXISTS_NO_MEMBER"
  | "HR_ONLY_NO_MEMBER_NO_PENDING_INVITE"
  | "INVITED_PENDING"
  | "ACTIVE_MEMBER"
  | "ACTIVE_MEMBER_LINK_DRIFT"
  | "SUSPENDED_MEMBER"
  | "SUSPENDED_MEMBER_LINK_DRIFT"
  | "CONFLICT_IDENTITY_MISMATCH"
  | "CONFLICT_EMAIL_MISMATCH"
  | "CONFLICT_MULTIPLE_MEMBERS"
  | "CONFLICT_MULTIPLE_INVITES";

export type EmployeeInput = {
  employeeId: number;
  companyId: number;
  userId: number | null;
  email: string | null;
};

export type UserByEmailInput = {
  id: number;
  email: string;
} | null;

export type MemberInput = {
  id: number;
  companyId: number;
  userId: number;
  isActive: boolean;
  role?: string;
} | null;

export type InviteInput = {
  id: number;
  companyId: number;
  email: string;
  token: string;
  role?: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
} | null;

export type ResolverInput = {
  employee: EmployeeInput;
  userByEmail: UserByEmailInput;
  member: MemberInput;
  invite: InviteInput;
  nowIso?: string;
  diagnostics?: {
    multipleMembers?: boolean;
    multiplePendingInvites?: boolean;
    emailIdentityMismatch?: boolean;
  };
};

export type ResolverOutput = {
  accessState: AccessState;
  flags: {
    needsLink: boolean;
    conflict: boolean;
    missingEmail: boolean;
  };
  primaryAction: PrimaryAction;
  stateReason: StateReason;
  resolvedUserId: number | null;
  effectiveInvite: InviteInput;
};

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const norm = value.trim().toLowerCase();
  return norm.length > 0 ? norm : null;
}

function isPendingInvite(invite: InviteInput, now: Date): invite is NonNullable<InviteInput> {
  if (!invite) return false;
  if (invite.acceptedAt != null) return false;
  if (invite.revokedAt != null) return false;
  const expiry = new Date(invite.expiresAt);
  return expiry.getTime() > now.getTime();
}

function toPrimaryAction(accessState: AccessState, flags: ResolverOutput["flags"]): PrimaryAction {
  if (flags.conflict) return "RESOLVE_CONFLICT";
  if (accessState === "HR_ONLY") return flags.missingEmail ? "NONE" : "GRANT_ACCESS";
  if (accessState === "INVITED") return "COPY_INVITE";
  if (accessState === "SUSPENDED") return "RESTORE_ACCESS";
  return flags.needsLink ? "LINK_ACCOUNT" : "CHANGE_ROLE";
}

function toStateReason(
  accessState: AccessState,
  flags: ResolverOutput["flags"],
  context: {
    normalizedUserByEmail: UserByEmailInput;
    diagnostics?: ResolverInput["diagnostics"];
    employeeUserId: number | null;
    memberUserId: number | null;
    emailMismatch: boolean;
  },
): StateReason {
  if (flags.conflict) {
    if (context.diagnostics?.multipleMembers) return "CONFLICT_MULTIPLE_MEMBERS";
    if (context.diagnostics?.multiplePendingInvites) return "CONFLICT_MULTIPLE_INVITES";
    if (context.emailMismatch || context.diagnostics?.emailIdentityMismatch) return "CONFLICT_EMAIL_MISMATCH";
    if (context.employeeUserId != null && context.memberUserId != null && context.employeeUserId !== context.memberUserId) {
      return "CONFLICT_IDENTITY_MISMATCH";
    }
    return "CONFLICT_IDENTITY_MISMATCH";
  }

  if (accessState === "HR_ONLY") {
    if (flags.missingEmail) return "HR_ONLY_NO_IDENTITY";
    if (context.normalizedUserByEmail) return "HR_ONLY_USER_EXISTS_NO_MEMBER";
    return "HR_ONLY_NO_MEMBER_NO_PENDING_INVITE";
  }
  if (accessState === "INVITED") return "INVITED_PENDING";
  if (accessState === "ACTIVE") return flags.needsLink ? "ACTIVE_MEMBER_LINK_DRIFT" : "ACTIVE_MEMBER";
  return flags.needsLink ? "SUSPENDED_MEMBER_LINK_DRIFT" : "SUSPENDED_MEMBER";
}

export function resolveEmployeeAccess(input: ResolverInput): ResolverOutput {
  const normalizedEmployeeEmail = normalizeEmail(input.employee.email);
  const normalizedUserByEmail = input.userByEmail && normalizeEmail(input.userByEmail.email) === normalizedEmployeeEmail
    ? input.userByEmail
    : null;
  const resolvedUserId = input.employee.userId ?? normalizedUserByEmail?.id ?? null;

  const member = input.member;
  const now = input.nowIso ? new Date(input.nowIso) : new Date();
  const effectiveInvite = isPendingInvite(input.invite, now) ? input.invite : null;

  const needsLink = !!member && input.employee.userId !== member.userId;
  const missingEmail = normalizedEmployeeEmail == null && input.employee.userId == null;

  const emailMismatch = !!input.userByEmail && normalizeEmail(input.userByEmail.email) !== normalizedEmployeeEmail;
  const identityMismatch = !!member && input.employee.userId != null && input.employee.userId !== member.userId;
  const conflict =
    Boolean(input.diagnostics?.multipleMembers) ||
    Boolean(input.diagnostics?.multiplePendingInvites) ||
    Boolean(input.diagnostics?.emailIdentityMismatch) ||
    emailMismatch ||
    identityMismatch;

  // Absolute precedence: member state always drives base access state.
  let accessState: AccessState;
  if (member) {
    accessState = member.isActive ? "ACTIVE" : "SUSPENDED";
  } else if (effectiveInvite) {
    accessState = "INVITED";
  } else {
    accessState = "HR_ONLY";
  }

  const flags = { needsLink, conflict, missingEmail };
  return {
    accessState,
    flags,
    primaryAction: toPrimaryAction(accessState, flags),
    stateReason: toStateReason(accessState, flags, {
      normalizedUserByEmail,
      diagnostics: input.diagnostics,
      employeeUserId: input.employee.userId,
      memberUserId: member?.userId ?? null,
      emailMismatch,
    }),
    resolvedUserId,
    effectiveInvite,
  };
}
