/**
 * Client Workspace (/client/*) — read-mostly aggregates scoped to workspace company.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { requireWorkspaceMembership } from "../_core/membership";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { getDb } from "../db";
import type { User } from "../../drizzle/schema";
import {
  getClientHomeSummary,
  listClientEngagements,
  listClientWorkspaceDocuments,
  listClientWorkspaceInvoices,
  listClientWorkspaceTeam,
  listClientWorkspaceThreads,
  type ClientEngagementFilter,
  type ClientEngagementSort,
} from "../services/clientWorkspaceService";

const engagementFilterSchema = z.enum([
  "all",
  "awaiting_your_action",
  "in_progress",
  "completed",
  "overdue",
  "at_risk",
  "awaiting_payment",
  "awaiting_signature",
]);

const engagementSortSchema = z.enum(["due_date", "recently_updated", "priority"]);

export const clientWorkspaceRouter = router({
  getHomeSummary: protectedProcedure.input(optionalActiveWorkspace.optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const m = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
    return getClientHomeSummary(db, m.companyId);
  }),

  listEngagements: protectedProcedure
    .input(
      z
        .object({
          filter: engagementFilterSchema.default("all"),
          sort: engagementSortSchema.default("recently_updated"),
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(100).default(25),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      return listClientEngagements(db, {
        companyId: m.companyId,
        filter: input.filter as ClientEngagementFilter,
        sort: input.sort as ClientEngagementSort,
        page: input.page,
        pageSize: input.pageSize,
      });
    }),

  listDocuments: protectedProcedure
    .input(
      z
        .object({
          filter: z.enum(["all", "pending", "rejected", "expiring_soon"]).default("all"),
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(100).default(50),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      return listClientWorkspaceDocuments(db, {
        companyId: m.companyId,
        filter: input.filter,
        page: input.page,
        pageSize: input.pageSize,
      });
    }),

  listInvoices: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(100).default(50),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      return listClientWorkspaceInvoices(db, {
        companyId: m.companyId,
        page: input.page,
        pageSize: input.pageSize,
      });
    }),

  listThreads: protectedProcedure.input(optionalActiveWorkspace.optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const m = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
    return listClientWorkspaceThreads(db, { companyId: m.companyId });
  }),

  listTeam: protectedProcedure.input(optionalActiveWorkspace.optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const m = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
    return listClientWorkspaceTeam(db, m.companyId);
  }),
});
