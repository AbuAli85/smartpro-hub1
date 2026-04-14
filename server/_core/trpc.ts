import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { User } from "../../drizzle/schema";
import {
  extractCompanyIdFromRawInput,
  isAccessV2ShadowCompanyEnabled,
  recordCompanyShadowMismatch,
} from "./accessShadow";
import { getImplicitWorkspaceCompanyIdForShadow } from "./membership";

type AuthenticatedContext = Omit<TrpcContext, "user"> & { user: User };

/** Base tRPC instance (for composing feature-specific middleware). */
export const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
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
 * Allows legacy `users.role === "admin"` or platformRole super_admin / platform_admin.
 */
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !canAccessGlobalAdminProcedures(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: ctx as AuthenticatedContext,
    });
  }),
);
