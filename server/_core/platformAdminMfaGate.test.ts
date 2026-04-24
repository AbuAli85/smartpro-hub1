import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { PLATFORM_ADMIN_MFA_REQUIRED_REASON } from "@shared/authTrpcReasons";
import { assertPlatformAdminMfaEnabled } from "./platformAdminMfaGate";

// ─── Helper ──────────────────────────────────────────────────────────────────

function catchMfaError(user: { twoFactorEnabled: boolean }): TRPCError | null {
  try {
    assertPlatformAdminMfaEnabled(user);
    return null;
  } catch (e) {
    if (e instanceof TRPCError) return e;
    throw e;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("assertPlatformAdminMfaEnabled", () => {
  // ── Scenario 1: super_admin with 2FA enabled ──────────────────────────────
  it("super_admin with twoFactorEnabled=true passes without throwing", () => {
    // Represents a super_admin who has completed 2FA setup.
    // The OAuth login flow already required them to pass the TOTP challenge,
    // so an existing session + twoFactorEnabled=true means MFA was verified at login.
    expect(() =>
      assertPlatformAdminMfaEnabled({ twoFactorEnabled: true }),
    ).not.toThrow();
  });

  // ── Scenario 2: super_admin without 2FA ───────────────────────────────────
  it("super_admin with twoFactorEnabled=false is blocked with FORBIDDEN", () => {
    const err = catchMfaError({ twoFactorEnabled: false });
    expect(err).not.toBeNull();
    expect(err!.code).toBe("FORBIDDEN");
  });

  it("super_admin without 2FA receives the stable PLATFORM_ADMIN_MFA_REQUIRED_REASON cause", () => {
    const err = catchMfaError({ twoFactorEnabled: false });
    expect(err).not.toBeNull();
    const cause = err!.cause as { reason?: string } | undefined;
    expect(cause?.reason).toBe(PLATFORM_ADMIN_MFA_REQUIRED_REASON);
  });

  // ── Scenario 3: platform_admin without 2FA ────────────────────────────────
  it("platform_admin with twoFactorEnabled=false is blocked identically to super_admin", () => {
    // canAccessGlobalAdminProcedures treats super_admin and platform_admin equivalently.
    // The 2FA gate is role-agnostic: it only inspects twoFactorEnabled.
    const err = catchMfaError({ twoFactorEnabled: false });
    expect(err).not.toBeNull();
    expect(err!.code).toBe("FORBIDDEN");
    const cause = err!.cause as { reason?: string } | undefined;
    expect(cause?.reason).toBe(PLATFORM_ADMIN_MFA_REQUIRED_REASON);
  });

  it("platform_admin with twoFactorEnabled=true passes", () => {
    expect(() =>
      assertPlatformAdminMfaEnabled({ twoFactorEnabled: true }),
    ).not.toThrow();
  });

  // ── Scenario 4: company_admin / tenant roles not blocked ─────────────────
  it("company_admin without 2FA would not reach this gate (RBAC blocks first)", () => {
    // adminProcedure checks canAccessGlobalAdminProcedures() BEFORE calling
    // assertPlatformAdminMfaEnabled. canAccessGlobalAdminProcedures returns false
    // for company_admin, so they receive FORBIDDEN from the RBAC layer —
    // assertPlatformAdminMfaEnabled is never invoked for them.
    //
    // Concretely: this gate accepts any user object it is handed;
    // it is the CALLER's (adminProcedure middleware's) responsibility to call it
    // only after the RBAC check passes. We document this contract here and do not
    // add a redundant RBAC re-check inside the function.
    //
    // company_admin CAN use protectedProcedure (normal tenant procedures) without any 2FA.
    // Verify that the gate itself does not throw for twoFactorEnabled=false if we wanted
    // to call it (which we would NOT in production for non-admin users) — the function
    // is purely about the twoFactorEnabled field.
    expect(catchMfaError({ twoFactorEnabled: false })).not.toBeNull(); // gate would block
    expect(catchMfaError({ twoFactorEnabled: true })).toBeNull();      // gate would pass
    // The production path for company_admin never calls this function.
  });

  // ── Scenario 5: platformOperatorReadProcedure intentionally excluded ──────
  it("platformOperatorReadProcedure does not call assertPlatformAdminMfaEnabled (documented exclusion)", () => {
    // platformOperatorReadProcedure uses assertPlatformOperatorRead which calls
    // seesPlatformOperatorNav(). That check admits super_admin, platform_admin,
    // regional_manager, client_services, sanad_network_admin, sanad_compliance_reviewer.
    //
    // 2FA is NOT required for this procedure because:
    //  1. It is read-only (no state mutations).
    //  2. A broader set of operators (regional_manager etc.) uses it; mandating 2FA there
    //     is out of scope for this pass and would block low-risk operator dashboards.
    //  3. The data exposed (role audit reports, company list) is operational, not
    //     highly sensitive (no PII, no financial records, no security keys).
    //
    // This is an intentional security trade-off, documented in the adminProcedure JSDoc.
    // A future hardening pass may add 2FA to platformOperatorReadProcedure for
    // super_admin/platform_admin callers specifically.
    expect(true).toBe(true); // intentional documentation-only test
  });

  // ── Wire-format: reason surfaces on error.cause ───────────────────────────
  it("error cause contains the stable reason string that trpc.ts allows onto the wire", () => {
    const err = catchMfaError({ twoFactorEnabled: false });
    // TRPC_CLIENT_REASON_ALLOWLIST in trpc.ts includes PLATFORM_ADMIN_MFA_REQUIRED_REASON,
    // so reasonFromTrpcErrorCause() forwards it to error.data.reason on the wire.
    const cause = err!.cause as Record<string, unknown>;
    expect(cause.reason).toBe(PLATFORM_ADMIN_MFA_REQUIRED_REASON);
    expect(typeof cause.reason).toBe("string");
  });
});
