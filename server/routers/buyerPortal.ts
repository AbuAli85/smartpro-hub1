/**
 * Buyer Portal router — customer-scoped (see server/buyer/buyerContext.ts).
 * Gated by ENV.buyerPortalEnabled. Not for same-tenant clientPortal flows.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { buyerRoleMayAccessOverview, resolveBuyerContext } from "../buyer/buyerContext";

const customerAccountInput = z.object({
  customerAccountId: z.number().int().positive(),
});

const buyerPortalProcedure = protectedProcedure.use(async ({ next }) => {
  if (!ENV.buyerPortalEnabled) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Buyer portal is not enabled" });
  }
  return next();
});

export const buyerPortalRouter = router({
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
});
