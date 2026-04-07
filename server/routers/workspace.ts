import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireActiveCompanyId } from "../_core/tenant";
import { canReadTeamWorkspace } from "../personPerformanceAccess";
import { loadMyWorkspace, loadTeamWorkspace } from "../workspaceData";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

/**
 * Daily workspace: my snapshot + optional team snapshot (same company).
 * Team section is omitted when the user lacks HR/KPI team read access.
 */
export const workspaceRouter = router({
  getWorkspace: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        year: z.number().optional(),
        month: z.number().optional(),
        /** When true, include team summary if RBAC allows (default true; server still hides if forbidden). */
        includeTeam: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const now = new Date();
      const year = input.year ?? now.getFullYear();
      const month = input.month ?? now.getMonth() + 1;
      const includeTeam = input.includeTeam !== false;

      const my = await loadMyWorkspace(db, companyId, ctx.user.id, year, month);

      let team = null;
      if (includeTeam && (await canReadTeamWorkspace(ctx.user, companyId))) {
        team = await loadTeamWorkspace(db, companyId, year, month);
      }

      return { year, month, my, team };
    }),
});
