import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { analyticsRouter } from "./routers/analytics";
import { subscriptionsRouter } from "./routers/subscriptions";
import { companiesRouter } from "./routers/companies";
import { contractsRouter } from "./routers/contracts";
import { crmRouter } from "./routers/crm";
import { hrRouter } from "./routers/hr";
import { marketplaceRouter } from "./routers/marketplace";
import { proRouter } from "./routers/pro";
import { sanadRouter } from "./routers/sanad";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  companies: companiesRouter,
  sanad: sanadRouter,
  pro: proRouter,
  marketplace: marketplaceRouter,
  contracts: contractsRouter,
  hr: hrRouter,
  crm: crmRouter,
  analytics: analyticsRouter,
  subscriptions: subscriptionsRouter,
});

export type AppRouter = typeof appRouter;
