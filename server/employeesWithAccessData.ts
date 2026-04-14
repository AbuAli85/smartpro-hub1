/**
 * Shared loader for HR employee rows + canonical access resolution.
 * Used by `companies.employeesWithAccess` and `companies.accessAnalyticsOverview`
 * so intelligence and UI always share the same resolver output.
 */
import { and, asc, eq, or } from "drizzle-orm";
import { companyInvites, companyMembers, employees, users } from "../drizzle/schema";
import { resolveEmployeeAccess } from "./employeeAccessResolver";

/** Non-null DB handle from `getDb()` — avoids importing `getDb` only for typing. */
export type NonNullDb = NonNullable<Awaited<ReturnType<typeof import("./db").getDb>>>;

/** Same shape as `companies.employeesWithAccess` query result rows. */
export type EmployeeWithAccessDataRow = {
  employeeId: number;
  firstName: string;
  lastName: string;
  firstNameAr: string | null;
  lastNameAr: string | null;
  email: string | null;
  department: string | null;
  position: string | null;
  employeeStatus: string | null;
  employeeNumber: string | null;
  nationality: string | null;
  hireDate: Date | null;
  accessStatus: string;
  memberRole: string | null;
  memberId: number | null;
  hasLogin: boolean;
  lastSignedIn: Date | null;
  loginEmail: string | null;
  accessState: string;
  flags: { needsLink: boolean; conflict: boolean; missingEmail: boolean };
  primaryAction: string;
  stateReason: string;
};

export async function fetchEmployeesWithAccessData(
  db: NonNullDb,
  companyId: number,
): Promise<EmployeeWithAccessDataRow[]> {
  const allEmployees = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      firstNameAr: employees.firstNameAr,
      lastNameAr: employees.lastNameAr,
      email: employees.email,
      department: employees.department,
      position: employees.position,
      status: employees.status,
      userId: employees.userId,
      employeeNumber: employees.employeeNumber,
      nationality: employees.nationality,
      hireDate: employees.hireDate,
    })
    .from(employees)
    .where(and(
      eq(employees.companyId, companyId),
      or(eq(employees.status, "active"), eq(employees.status, "on_leave")),
    ))
    .orderBy(asc(employees.firstName));

  const allMembers = await db
    .select({
      id: companyMembers.id,
      userId: companyMembers.userId,
      role: companyMembers.role,
      isActive: companyMembers.isActive,
      joinedAt: companyMembers.joinedAt,
    })
    .from(companyMembers)
    .where(eq(companyMembers.companyId, companyId));

  const memberUserIds = allMembers.map((m) => m.userId);
  const userDetails = memberUserIds.length > 0
    ? await db
        .select({ id: users.id, name: users.name, email: users.email, lastSignedIn: users.lastSignedIn })
        .from(users)
        .where(or(...memberUserIds.map((uid) => eq(users.id, uid))))
    : [];

  const userMap = new Map(userDetails.map((u) => [u.id, u]));
  const userByEmail = new Map(
    userDetails
      .filter((u) => !!u.email)
      .map((u) => [u.email!.trim().toLowerCase(), u]),
  );
  const memberByUserId = new Map(allMembers.map((m) => [m.userId, m]));
  const memberCountByUserId = allMembers.reduce((acc, m) => {
    acc.set(m.userId, (acc.get(m.userId) ?? 0) + 1);
    return acc;
  }, new Map<number, number>());

  const inviteRows = await db
    .select({
      id: companyInvites.id,
      email: companyInvites.email,
      role: companyInvites.role,
      token: companyInvites.token,
      expiresAt: companyInvites.expiresAt,
      acceptedAt: companyInvites.acceptedAt,
      revokedAt: companyInvites.revokedAt,
    })
    .from(companyInvites)
    .where(eq(companyInvites.companyId, companyId));

  const now = Date.now();
  const pendingInvitesByEmail = inviteRows.reduce((acc, inv) => {
    const norm = inv.email?.trim().toLowerCase();
    if (!norm) return acc;
    if (inv.acceptedAt || inv.revokedAt) return acc;
    if (new Date(inv.expiresAt).getTime() <= now) return acc;
    const list = acc.get(norm) ?? [];
    list.push(inv);
    acc.set(norm, list);
    return acc;
  }, new Map<string, typeof inviteRows>());
  for (const list of pendingInvitesByEmail.values()) {
    list.sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());
  }

  return allEmployees.map((emp) => {
    const normalizedEmail = emp.email?.trim().toLowerCase() ?? null;
    const emailUser = normalizedEmail ? userByEmail.get(normalizedEmail) ?? null : null;
    const memberFromEmployeeUser = emp.userId ? memberByUserId.get(emp.userId) ?? null : null;
    const memberFromEmail = emailUser ? memberByUserId.get(emailUser.id) ?? null : null;
    const resolvedMember = memberFromEmployeeUser ?? memberFromEmail ?? null;
    const chosenPendingInvite = normalizedEmail ? (pendingInvitesByEmail.get(normalizedEmail)?.[0] ?? null) : null;
    const resolved = resolveEmployeeAccess({
      employee: {
        employeeId: emp.id,
        companyId,
        userId: emp.userId,
        email: emp.email,
      },
      userByEmail: emailUser ? { id: emailUser.id, email: emailUser.email ?? "" } : null,
      member: resolvedMember
        ? {
            id: resolvedMember.id,
            companyId,
            userId: resolvedMember.userId,
            isActive: resolvedMember.isActive,
            role: resolvedMember.role,
          }
        : null,
      invite: chosenPendingInvite
        ? {
            id: chosenPendingInvite.id,
            companyId,
            email: chosenPendingInvite.email,
            role: chosenPendingInvite.role,
            token: chosenPendingInvite.token,
            expiresAt: chosenPendingInvite.expiresAt.toISOString(),
            acceptedAt: chosenPendingInvite.acceptedAt ? chosenPendingInvite.acceptedAt.toISOString() : null,
            revokedAt: chosenPendingInvite.revokedAt ? chosenPendingInvite.revokedAt.toISOString() : null,
          }
        : null,
      diagnostics: {
        multipleMembers: !!resolvedMember && (memberCountByUserId.get(resolvedMember.userId) ?? 0) > 1,
        multiplePendingInvites: !!normalizedEmail && (pendingInvitesByEmail.get(normalizedEmail)?.length ?? 0) > 1,
        emailIdentityMismatch: !!(emp.userId && emailUser && emp.userId !== emailUser.id),
      },
    });
    const userInfo = resolved.resolvedUserId ? userMap.get(resolved.resolvedUserId) : null;
    const accessStatus =
      resolved.accessState === "ACTIVE"
        ? "active"
        : resolved.accessState === "SUSPENDED"
          ? "inactive"
          : "no_access";

    return {
      employeeId: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      firstNameAr: emp.firstNameAr,
      lastNameAr: emp.lastNameAr,
      email: emp.email,
      department: emp.department,
      position: emp.position,
      employeeStatus: emp.status,
      employeeNumber: emp.employeeNumber,
      nationality: emp.nationality,
      hireDate: emp.hireDate,
      accessStatus,
      memberRole: resolvedMember?.role ?? null,
      memberId: resolvedMember?.id ?? null,
      hasLogin: !!resolved.resolvedUserId,
      lastSignedIn: userInfo?.lastSignedIn ?? null,
      loginEmail: userInfo?.email ?? null,
      accessState: resolved.accessState,
      flags: resolved.flags,
      primaryAction: resolved.primaryAction,
      stateReason: resolved.stateReason,
    };
  });
}
