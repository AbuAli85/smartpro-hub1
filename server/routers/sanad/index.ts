import { router } from "../../_core/trpc";
import { sanadCatalogueProcedures } from "./catalogue.router";
import { sanadCoreProcedures } from "./sanadCore";
import { sanadMarketplaceProcedures } from "./marketplace.router";
import { sanadRosterProcedures } from "./roster.router";

export const sanadRouter = router({
  ...sanadCoreProcedures,
  ...sanadCatalogueProcedures,
  ...sanadMarketplaceProcedures,
  ...sanadRosterProcedures,
});

export { PROVIDER_TYPES, SERVICE_TYPES, WORK_ORDER_STATUSES } from "./sanadCore";
