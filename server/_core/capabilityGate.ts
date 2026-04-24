import { TRPCError } from "@trpc/server";
import {
  resolveEffectiveCapabilities,
  type Capability,
  type CompanyModule,
  MODULE_CAPABILITIES,
} from "@shared/capabilities";

/**
 * Throws FORBIDDEN if the member does not have the required capability.
 *
 * Use this inside tRPC procedures after resolving workspace membership:
 *
 *   const { role, permissions, enabledModules } = await requireCapableMembership(ctx.user, companyId, "view_payroll");
 *
 * Or call directly when you already have the membership data:
 *
 *   requireCapability(role, permissions, enabledModules, "view_payroll");
 */
export function requireCapability(
  role: string,
  permissions: string[] | null | undefined,
  enabledModules: string[] | null | undefined,
  capability: Capability,
): void {
  const effective = resolveEffectiveCapabilities(role, permissions, enabledModules);
  if (!effective.has(capability)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Missing required capability: ${capability}`,
    });
  }
}

/**
 * Throws FORBIDDEN if the company has an explicit module list that does NOT include the module.
 * null enabledModules = all modules active (legacy / unlimited plan) — never throws.
 */
export function requireModuleEnabled(
  enabledModules: string[] | null | undefined,
  module: CompanyModule,
): void {
  if (enabledModules == null) return;
  if (!enabledModules.includes(module)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Module '${module}' is not enabled for this company.`,
    });
  }
}

/**
 * Combine module + capability check in one call.
 * Throws FORBIDDEN if either the module is disabled OR the member lacks the capability.
 */
export function requireCapabilityAndModule(
  role: string,
  permissions: string[] | null | undefined,
  enabledModules: string[] | null | undefined,
  capability: Capability,
): void {
  // Determine which module owns this capability
  const ownerModule = (Object.entries(MODULE_CAPABILITIES) as Array<[CompanyModule, ReadonlyArray<Capability>]>)
    .find(([, caps]) => caps.includes(capability))?.[0];

  if (ownerModule) {
    requireModuleEnabled(enabledModules, ownerModule);
  }
  requireCapability(role, permissions, enabledModules, capability);
}
