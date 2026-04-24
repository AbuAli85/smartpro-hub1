import {
  ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON,
  DUPLICATE_MANUAL_ATTENDANCE,
  INVALID_ATTENDANCE_TIME_RANGE,
  WEAK_AUDIT_REASON,
} from "@shared/attendanceTrpcReasons";
import { PLATFORM_ADMIN_MFA_REQUIRED_REASON } from "@shared/authTrpcReasons";
import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { assertPlatformAdminMfaEnabled } from "./platformAdminMfaGate";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { SessionUser } from "./sessionUser";
import {
  extractCompanyIdFromRawInput,
  isAccessV2ShadowCompanyEnabled,
  recordCompanyShadowMismatch,
} from "./accessShadow";
import { getImplicitWorkspaceCompanyIdForShadow } from "./membership";

type AuthenticatedContext = Omit<TrpcContext, "user"> & { user: SessionUser };

/** Only these values are copied onto the wire as `error.data.reason` (avoid leaking arbitrary `cause`). */
const TRPC_CLIENT_REASON_ALLOWLIST = new Set<string>([
  ATTENDANCE_SESSIONS_TABLE_REQUIRED_REASON,
  PLATFORM_ADMIN_MFA_REQUIRED_REASON,
  DUPLICATE_MANUAL_ATTENDANCE,
  INVALID_ATTENDANCE_TIME_RANGE,
  WEAK_AUDIT_REASON,
]);

function reasonFromTrpcErrorCause(cause: unknown): string | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const r = (cause as { reason?: unknown }).reason;
  if (typeof r !== "string" || !TRPC_CLIENT_REASON_ALLOWLIST.has(r)) return undefined;
  return r;
}

/** Base tRPC instance (for composing feature-specific middleware). */
export const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const reason = error instanceof TRPCError ? reasonFromTrpcErrorCause(error.cause) : undefined;
    const baseData =
      shape.data && typeof shape.data === "object" ? (shape.data as Record<string, unknown>) : {};
    return {
      ...shape,
      data: {
        ...baseData,
        ...(reason ? { reason } : {}),
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: ctx as AuthenticatedContext,
  });
});

/**
 * When `ACCESS_V2_SHADOW_COMPANY` is set, compares legacy implicit workspace (first membership)
 * to explicit `input.companyId` and aggregates mismatches (no enforcement).
 *
 * Note: intentionally calls `next()` without a `ctx` argument so that TypeScript preserves
 * the context-override type accumulated by prior middleware (e.g. the non-null user from
 * `requireUser`).  Passing `{ ctx }` here would widen the override back to `TrpcContext`.
 */
const shadowCompanyMismatchLogger = t.middleware(async (opts) => {
  if (!isAccessV2ShadowCompanyEnabled()) {
    return opts.next();
  }
  const ctx = opts.ctx;
  if (!ctx.user) {
    return opts.next();
  }
  let raw: unknown;
  try {
    raw = await opts.getRawInput();
  } catch {
    return opts.next();
  }
  const explicit = extractCompanyIdFromRawInput(raw);
  if (explicit === undefined) {
    return opts.next();
  }
  const implicit = await getImplicitWorkspaceCompanyIdForShadow(ctx.user.id);
  if (implicit !== explicit) {
    recordCompanyShadowMismatch({
      path: opts.path,
      userId: ctx.user.id,
      implicitCompanyId: implicit,
      explicitCompanyId: explicit,
    });
  }
  return opts.next();
});

export const protectedProcedure = t.procedure.use(requireUser).use(shadowCompanyMismatchLogger);

/**
 * Platform staff who may read cross-tenant reports (super/platform admin, regional_manager, client_services).
 * Mutations remain on {@link adminProcedure}.
 */
const assertPlatformOperatorRead = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (seesPlatformOperatorNav(ctx.user)) {
    return next({ ctx: ctx as AuthenticatedContext });
  }
  throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
});

export const platformOperatorReadProcedure = t.procedure
  .use(requireUser)
  .use(shadowCompanyMismatchLogger)
  .use(assertPlatformOperatorRead);

/**
 * Cross-tenant platform procedures (officers, platformOps mutations, system.notifyOwner).
 * Uses {@link canAccessGlobalAdminProcedures} (platform_user_roles + legacy fallbacks).
 *
 * Security layers applied in order:
 *  1. RBAC – caller must be super_admin or platform_admin (canAccessGlobalAdminProcedures).
 *  2. 2FA  – caller must have two-factor authentication enabled on their account.
 *             The live `users.twoFactorEnabled` field is read from the DB on every request;
 *             the OAuth login flow already enforces the MFA challenge when it is true, so a
 *             session that passes both checks was established after MFA verification.
 *
 * platformOperatorReadProcedure (read-only, broader operator set) intentionally does NOT
 * require 2FA: it is accessible to regional_manager / client_services / sanad roles whose
 * 2FA posture is managed separately, and the data it exposes is read-only and lower-risk.
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !canAccessGlobalAdminProcedures(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    assertPlatformAdminMfaEnabled(ctx.user);

    return next({
      ctx: ctx as AuthenticatedContext,
    });
  }),
);
