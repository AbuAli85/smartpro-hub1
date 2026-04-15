/**
 * Buyer Portal router — customer-scoped (see server/buyer/buyerContext.ts).
 * Gated by ENV.buyerPortalEnabled. Not for same-tenant clientPortal flows.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  buyerRoleMayAccessOverview,
  listBuyerAccountsForUser,
  resolveBuyerContext,
} from "../buyer/buyerContext";
import { queryBuyerInvoicesForAccount } from "../buyer/buyerInvoices";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as drizzleSchema from "../../drizzle/schema";

const customerAccountInput = z.object({
  customerAccountId: z.number().int().positive(),
});

/** Read on each request so tests can toggle `BUYER_PORTAL_ENABLED` without reloading modules. */
function isBuyerPortalEnabled(): boolean {
  return process.env.BUYER_PORTAL_ENABLED === "true";
}

const buyerPortalProcedure = protectedProcedure.use(async ({ next }) => {
  if (!isBuyerPortalEnabled()) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Buyer portal is not enabled" });
  }
  return next();
});

const listInvoicesInput = customerAccountInput.extend({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  status: z.enum(["pending", "paid", "overdue", "cancelled", "waived"]).optional(),
});

export const buyerPortalRouter = router({
  listMyAccounts: buyerPortalProcedure.query(async ({ ctx }) => {
    const user = ctx.user;
    return listBuyerAccountsForUser(user.id);
  }),

  getOverview: buyerPortalProcedure
    .input(customerAccountInput)
    .query(async ({ ctx, input }) => {
      const user = ctx.user;
      const buyer = await resolveBuyerContext(user, input);
      if (!buyerRoleMayAccessOverview(buyer.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient buyer role" });
      }
      return {
        customerAccountId: buyer.customerAccountId,
        providerCompanyId: buyer.providerCompanyId,
        role: buyer.role,
        membershipId: buyer.membershipId,
        stub: true as const,
      };
    }),

  listInvoices: buyerPortalProcedure
    .input(listInvoicesInput)
    .query(async ({ ctx, input }) => {
      const buyer = await resolveBuyerContext(ctx.user, input);
      if (!buyerRoleMayAccessOverview(buyer.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient buyer role" });
      }
      const db = await getDb();
      if (!db) {
        return { items: [], total: 0 };
      }
      return queryBuyerInvoicesForAccount(db as unknown as MySql2Database<typeof drizzleSchema>, buyer, {
        page: input.page,
        pageSize: input.pageSize,
        status: input.status,
      });
    }),
});
