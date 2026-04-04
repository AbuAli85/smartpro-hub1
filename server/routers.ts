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
import { workforceRouter } from "./routers/workforce";
import { officersRouter } from "./routers/officers";
import { billingRouter } from "./routers/billing";
import { renewalWorkflowsRouter } from "./routers/renewalWorkflows";
import { ratingsRouter } from "./routers/ratings";
import { reportsRouter } from "./routers/reports";
import { alertsRouter } from "./routers/alerts";
import { platformOpsRouter } from "./routers/platformOps";
import { payrollRouter } from "./routers/payroll";
import { recruitmentRouter } from "./routers/recruitment";
import { clientPortalRouter } from "./routers/clientPortal";
import { operationsRouter } from "./routers/operations";
import { quotationsRouter } from "./routers/quotations";
import { slaRouter } from "./routers/sla";
import { complianceRouter } from "./routers/compliance";
import { teamRouter } from "./routers/team";
import { documentsRouter } from "./routers/documents";
import { hrLettersRouter } from "./routers/hrLetters";
import { orgStructureRouter } from "./routers/orgStructure";
import { tasksRouter } from "./routers/tasks";
import { announcementsRouter } from "./routers/announcements";
import { employeePortalRouter } from "./routers/employeePortal";
import { attendanceRouter } from "./routers/attendance";
import { employeeRequestsRouter } from "./routers/employeeRequests";
import { schedulingRouter } from "./routers/scheduling";
import { shiftRequestsRouter } from "./routers/shiftRequests";
import { kpiRouter } from "./routers/kpi";
import { workLogsRouter } from "./routers/workLogs";
import { financeHRRouter } from "./routers/financeHR";

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
  workforce: workforceRouter,
  officers: officersRouter,
  billing: billingRouter,
  renewalWorkflows: renewalWorkflowsRouter,
  ratings: ratingsRouter,
  reports: reportsRouter,
  alerts: alertsRouter,
  platformOps: platformOpsRouter,
  payroll: payrollRouter,
  recruitment: recruitmentRouter,
  clientPortal: clientPortalRouter,
  operations: operationsRouter,
  quotations: quotationsRouter,
  sla: slaRouter,
  compliance: complianceRouter,
  team: teamRouter,
  documents: documentsRouter,
  hrLetters: hrLettersRouter,
  orgStructure: orgStructureRouter,
  tasks: tasksRouter,
  announcements: announcementsRouter,
  employeePortal: employeePortalRouter,
  attendance: attendanceRouter,
  employeeRequests: employeeRequestsRouter,
  scheduling: schedulingRouter,
  shiftRequests: shiftRequestsRouter,
  kpi: kpiRouter,
  workLogs: workLogsRouter,
  financeHR: financeHRRouter,
});

export type AppRouter = typeof appRouter;
