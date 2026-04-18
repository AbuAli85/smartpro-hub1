import { router } from "../../_core/trpc";
import { sanadCoreProcedures } from "./sanadCore";
import { sanadRosterProcedures } from "./roster.router";

export const sanadRouter = router({
  ...sanadCoreProcedures,
  ...sanadRosterProcedures,
});

export { PROVIDER_TYPES, SERVICE_TYPES, WORK_ORDER_STATUSES } from "./sanadCore";
