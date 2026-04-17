import { z } from "zod";

/**
 * Optional active workspace id for tRPC inputs. Multi-membership callers must pass `companyId`
 * (resolved by {@link requireActiveCompanyId} in handlers).
 */
export const optionalActiveWorkspace = z.object({
  companyId: z.number().int().positive().optional(),
});

/**
 * Required workspace id — use for `clientWorkspace` tRPC procedures and any handler that must
 * never infer company from “first membership” at the API boundary.
 */
export const requiredActiveWorkspace = z.object({
  companyId: z.number().int().positive(),
});
