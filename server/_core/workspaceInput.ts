import { z } from "zod";

/**
 * Optional active workspace id for tRPC inputs. Multi-membership callers must pass `companyId`
 * (resolved by {@link requireActiveCompanyId} in handlers).
 */
export const optionalActiveWorkspace = z.object({
  companyId: z.number().int().positive().optional(),
});
