import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { requireWorkspaceMembership } from "../_core/membership";
import { getDb } from "../db";
import { companies, companyMembers } from "../../drizzle/schema";
import {
  CAPABILITY_KEYS,
  MODULE_KEYS,
  ROLE_DEFAULT_CAPABILITIES,
  resolveEffectiveCapabilities,
  buildPermissionsOverride,
  type Capability,
} from "@shared/capabilities";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";

// ─── Input schemas ─────────────────────────────────────────────────────────────

const companyIdInput = z.object({ companyId: z.number().int().positive() });

const updateMemberCapabilitiesInput = z.object({
  companyId: z.number().int().positive(),
  userId: z.number().int().positive(),
  /** The desired complete effective capability list for this member. */
  effectiveCapabilities: z.array(z.enum(CAPABILITY_KEYS)),
});

const updateCompanyModulesInput = z.object({
  companyId: z.number().int().positive(),
  /**
   * null = restore unlimited (all modules enabled).
   * string[] = explicit allowlist (only listed modules are active).
   */
  enabledModules: z.array(z.enum(MODULE_KEYS)).nullable(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function assertIsCompanyAdmin(role: string) {
  if (role !== "company_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only company admins can manage capabilities." });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const capabilitiesRouter = router({
  /**
   * List all members with their effective capabilities and per-role defaults.
   * Accessible to company_admin and platform operators.
   */
  listMemberCapabilities: protectedProcedure
    .input(companyIdInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const isPlatformOp = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatformOp) {
        const { role } = await requireWorkspaceMembership(ctx.user, input.companyId);
        assertIsCompanyAdmin(role);
      }

      // Fetch company (for enabledModules)
      const [company] = await db
        .select({ enabledModules: companies.enabledModules })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);

      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });

      const members = await db
        .select({
          userId: companyMembers.userId,
          role: companyMembers.role,
          permissions: companyMembers.permissions,
        })
        .from(companyMembers)
        .where(
          and(eq(companyMembers.companyId, input.companyId), eq(companyMembers.isActive, true)),
        );

      return members.map((m) => {
        const roleDefaults = Array.from(ROLE_DEFAULT_CAPABILITIES[m.role] ?? []);
        const effective = Array.from(
          resolveEffectiveCapabilities(m.role, m.permissions, company.enabledModules),
        );
        const grants = (m.permissions ?? []).filter((p: string) => !p.startsWith("-")) as Capability[];
        const denials = (m.permissions ?? [])
          .filter((p: string) => p.startsWith("-"))
          .map((p: string) => p.slice(1)) as Capability[];

        return {
          userId: m.userId,
          role: m.role,
          roleDefaults,
          grants,
          denials,
          effective,
        };
      });
    }),

  /**
   * Update a member's capability overrides.
   * Admin supplies the desired complete effective set; this function encodes it as minimal overrides.
   */
  updateMemberCapabilities: protectedProcedure
    .input(updateMemberCapabilitiesInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const isPlatformOp = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatformOp) {
        const { role } = await requireWorkspaceMembership(ctx.user, input.companyId);
        assertIsCompanyAdmin(role);
      }

      // Fetch target member's current role
      const [target] = await db
        .select({ role: companyMembers.role })
        .from(companyMembers)
        .where(
          and(
            eq(companyMembers.companyId, input.companyId),
            eq(companyMembers.userId, input.userId),
            eq(companyMembers.isActive, true),
          ),
        )
        .limit(1);

      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found." });

      // Prevent admins from editing their own capabilities (platform operators exempt)
      if (!isPlatformOp && ctx.user.id === input.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot edit your own capabilities." });
      }

      const newPermissions = buildPermissionsOverride(target.role, input.effectiveCapabilities);

      await db
        .update(companyMembers)
        .set({ permissions: newPermissions })
        .where(
          and(
            eq(companyMembers.companyId, input.companyId),
            eq(companyMembers.userId, input.userId),
            eq(companyMembers.isActive, true),
          ),
        );

      return { success: true, permissions: newPermissions };
    }),

  /** Get the company's active module configuration. */
  getCompanyModules: protectedProcedure
    .input(companyIdInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const isPlatformOp = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatformOp) {
        await requireWorkspaceMembership(ctx.user, input.companyId);
      }

      const [company] = await db
        .select({ enabledModules: companies.enabledModules })
        .from(companies)
        .where(eq(companies.id, input.companyId))
        .limit(1);

      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found." });

      return {
        enabledModules: company.enabledModules,
        allModulesEnabled: company.enabledModules == null,
      };
    }),

  /**
   * Update which modules are enabled for a company.
   * Only company_admin and platform operators may call this.
   */
  updateCompanyModules: protectedProcedure
    .input(updateCompanyModulesInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const isPlatformOp = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatformOp) {
        const { role } = await requireWorkspaceMembership(ctx.user, input.companyId);
        assertIsCompanyAdmin(role);
      }

      await db
        .update(companies)
        .set({ enabledModules: input.enabledModules })
        .where(eq(companies.id, input.companyId));

      return { success: true, enabledModules: input.enabledModules };
    }),
});
