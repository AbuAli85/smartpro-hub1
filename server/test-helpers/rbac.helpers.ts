/**
 * Shared RBAC test helpers for SmartPRO integration tests.
 *
 * Provides context factories for every role combination tested across
 * the HR, payroll, finance, company-config, collections, org-structure,
 * tasks, recruitment, and automation domains.
 */
import type { TrpcContext } from "../_core/context";

// ─── Context factories ────────────────────────────────────────────────────────

/** Build a TrpcContext for a given user shape. */
export function makeCtx(
  overrides: Partial<NonNullable<TrpcContext["user"]>> = {},
): TrpcContext {
  const user = {
    id: 1,
    openId: "test-open-id",
    email: "test@smartpro.om",
    name: "Test User",
    loginMethod: "manus" as const,
    role: "user" as const,
    platformRole: "company_admin" as const,
    isActive: true,
    twoFactorEnabled: false,
    platformRoles: [] as string[],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

/** Platform admin context — bypasses all tenant-level guards. */
export function makePlatformAdminCtx(): TrpcContext {
  return makeCtx({
    id: 999,
    platformRole: "platform_admin",
    platformRoles: ["platform_admin"],
    role: "admin" as const,
  });
}

/** Unauthenticated context (no user). */
export function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ─── Membership mock builders ─────────────────────────────────────────────────

/** Build a single-company membership row for getUserCompanyById / getUserCompanies. */
export function makeMembership(
  companyId: number,
  role: string,
  userId = 1,
): {
  company: { id: number; name: string; slug: string; country: string; status: string };
  member: { role: string; isActive: boolean; userId: number; companyId: number; permissions: string[] };
} {
  return {
    company: { id: companyId, name: "Test Co", slug: "test-co", country: "OM", status: "active" },
    member: { role, isActive: true, userId, companyId, permissions: [] },
  };
}

/** Build a DB row returned by db.getDb() select queries for membership checks. */
export function makeDbMemberRow(role: string): { role: string } {
  return { role };
}

// ─── Role constants ───────────────────────────────────────────────────────────

export const ROLES = {
  COMPANY_ADMIN: "company_admin",
  HR_ADMIN: "hr_admin",
  FINANCE_ADMIN: "finance_admin",
  COMPANY_MEMBER: "company_member",
  REVIEWER: "reviewer",
  EXTERNAL_AUDITOR: "external_auditor",
  CLIENT: "client",
} as const;

export type MemberRole = (typeof ROLES)[keyof typeof ROLES];

// ─── Assertion helpers ────────────────────────────────────────────────────────

/** Assert that a promise rejects with FORBIDDEN. */
export async function expectForbidden(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
}

/** Assert that a promise rejects with UNAUTHORIZED. */
export async function expectUnauthorized(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: "UNAUTHORIZED" });
}
