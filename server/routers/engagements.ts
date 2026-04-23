/**
 * Engagements — unified client workspace over existing domain tables (company-scoped).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { seesPlatformOperatorNav } from "@shared/clientNav";
import { router, protectedProcedure } from "../_core/trpc";
import { requireWorkspaceMembership, requireNotAuditor } from "../_core/membership";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { getDb } from "../db";
import type { User } from "../../drizzle/schema";
import type { CompanyMember } from "../../drizzle/schema";
import {
  engagements,
  engagementTasks,
  employeeTasks,
  engagementDocuments,
  engagementMessages,
  notifications,
  contracts,
  companyMembers,
} from "../../drizzle/schema";
import {
  assertEngagementInCompany,
  addEngagementLink,
  removeEngagementLink,
  addEngagementInternalNote,
  backfillEngagementsForCompany,
  buildEngagementDetail,
  createEngagementFromSource,
  createRenewalEngagement,
  getOrCreateWorkspaceEngagement,
  listEngagementInternalNotes,
  listUnifiedThread,
  logEngagementActivity,
  markEngagementMessageRead,
  sendClientEngagementMessage,
  sendPlatformEngagementMessage,
} from "../services/engagementsService";
import { syncEngagementDerivedState } from "../services/engagements/deriveEngagementState";
import { applyEngagementWorkflowTransition } from "../services/engagements/engagementWorkflowService";
import {
  markPaidExternallyForEngagement,
  requestPaymentInstructions,
  submitTransferProof,
  verifyTransferProof,
} from "../services/engagements/engagementPaymentOps";
import {
  assignEngagementOwner,
  escalateEngagement,
  getEngagementsOpsSummary,
  listEngagementsForOps,
  listMyEngagementQueue,
  setEngagementOpsPriority,
  type OpsBucket,
} from "../services/engagements/engagementOpsService";
import { resyncHotEngagementDerivedState } from "../jobs/engagementDerivedRollupRefresh";

const createFromSourceInput = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("pro_service"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("government_case"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("marketplace_booking"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("contract"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("pro_billing_cycle"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("client_service_invoice"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("staffing_month"), sourceKey: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ sourceType: z.literal("service_request"), sourceId: z.number().int().positive() }),
]);

const createFromSourceWithWorkspace = z.intersection(createFromSourceInput, optionalActiveWorkspace);

function canReviewDocuments(role: CompanyMember["role"], user: User): boolean {
  if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user)) return true;
  return role === "company_admin" || role === "hr_admin" || role === "finance_admin";
}

function canUseEngagementOps(role: CompanyMember["role"], user: User): boolean {
  return canReviewDocuments(role, user);
}

const opsBucketSchema = z.enum([
  "all",
  "open",
  "awaiting_team",
  "awaiting_client",
  "overdue",
  "at_risk",
  "no_owner",
  "pending_replies",
  "overdue_payments",
  "pending_signatures",
  "docs_pending_review",
]);

function insertId(result: unknown): number {
  const id = Number((result as { insertId?: number }).insertId);
  if (!Number.isFinite(id)) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Insert failed" });
  return id;
}

export const engagementsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(100).default(25),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) return { items: [] as (typeof engagements.$inferSelect)[], total: 0 };
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db
        .select()
        .from(engagements)
        .where(eq(engagements.companyId, companyId))
        .orderBy(desc(engagements.updatedAt))
        .limit(input.pageSize)
        .offset(offset);
      const [cnt] = await db.select({ c: count() }).from(engagements).where(eq(engagements.companyId, companyId));
      return { items: rows, total: Number(cnt?.c ?? 0) };
    }),

  getById: protectedProcedure
    .input(z.object({ engagementId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return buildEngagementDetail(db, input.engagementId, companyId);
    }),

  createFromSource: protectedProcedure
    .input(createFromSourceWithWorkspace)
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      const { companyId: _ws, ...src } = input;
      return createEngagementFromSource(
        db,
        m.companyId,
        ctx.user.id,
        src as Parameters<typeof createEngagementFromSource>[3],
      );
    }),

  addLink: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          linkType: z.enum([
            "pro_service",
            "government_case",
            "marketplace_booking",
            "contract",
            "pro_billing_cycle",
            "client_service_invoice",
            "staffing_month",
            "work_permit",
            "employee_document",
            "service_request",
          ]),
          entityId: z.number().int().positive().optional().nullable(),
          entityKey: z.string().max(128).optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      await addEngagementLink(
        db,
        m.companyId,
        ctx.user.id,
        input.engagementId,
        input.linkType,
        input.entityId ?? null,
        input.entityKey ?? null,
      );
      return { success: true as const };
    }),

  /** All engagement status changes must pass workflow guards (role + allowed edge). */
  applyTransition: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          to: z.enum([
            "draft",
            "active",
            "waiting_client",
            "waiting_platform",
            "blocked",
            "completed",
            "archived",
          ]),
          reason: z.string().max(2000).optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      await applyEngagementWorkflowTransition(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        to: input.to,
        actorUserId: ctx.user.id,
        memberRole: m.role,
        user: ctx.user as User,
        reason: input.reason,
      });
      return { success: true as const };
    }),

  /** @deprecated Use `applyTransition` — kept for older clients; forwards to workflow engine. */
  updateStatus: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          status: z.enum([
            "draft",
            "active",
            "waiting_client",
            "waiting_platform",
            "blocked",
            "completed",
            "archived",
          ]),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      await applyEngagementWorkflowTransition(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        to: input.status,
        actorUserId: ctx.user.id,
        memberRole: m.role,
        user: ctx.user as User,
        reason: "legacy.updateStatus",
      });
      return { success: true as const };
    }),

  listForOps: protectedProcedure
    .input(
      z
        .object({
          bucket: opsBucketSchema.default("open"),
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(100).default(50),
          resyncDerived: z.boolean().optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const u = ctx.user as User;
      if (seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u)) {
        return listEngagementsForOps(db, {
          scope: "platform",
          companyId: input.companyId ?? null,
          bucket: input.bucket as OpsBucket,
          page: input.page,
          pageSize: input.pageSize,
          resyncDerived: input.resyncDerived,
        });
      }
      const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      if (!canUseEngagementOps(m.role, u)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions for ops queue" });
      }
      return listEngagementsForOps(db, {
        scope: "tenant",
        companyId: m.companyId,
        bucket: input.bucket as OpsBucket,
        page: input.page,
        pageSize: input.pageSize,
        resyncDerived: input.resyncDerived,
      });
    }),

  getOpsSummary: protectedProcedure.input(optionalActiveWorkspace)
    .query(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      const u = ctx.user as User;
      let m: Awaited<ReturnType<typeof requireWorkspaceMembership>> | null = null;
      if (!seesPlatformOperatorNav(u) && !canAccessGlobalAdminProcedures(u)) {
        m = await requireWorkspaceMembership(u, input.companyId);
        if (!canUseEngagementOps(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions for ops summary" });
        }
      }
      const db = await getDb();
      const emptyCounts: Record<OpsBucket, number> = {
        all: 0,
        open: 0,
        awaiting_team: 0,
        awaiting_client: 0,
        overdue: 0,
        at_risk: 0,
        no_owner: 0,
        pending_replies: 0,
        overdue_payments: 0,
        pending_signatures: 0,
        docs_pending_review: 0,
      };
      if (!db) return { counts: emptyCounts, latestDerivedStateSyncedAt: null as Date | null };
      if (seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u)) {
        return getEngagementsOpsSummary(db, { scope: "platform", companyId: input.companyId ?? null });
      }
      return getEngagementsOpsSummary(db, { scope: "tenant", companyId: m!.companyId });
    }),

  /**
   * Recompute persisted roll-ups for hot engagements (open / overdue-ish / at-risk / recently updated).
   * Same cohort as the server interval job; bounded for safety.
   */
  refreshRollups: protectedProcedure.input(optionalActiveWorkspace.optional()).mutation(async ({ ctx, input }) => {
    const u = ctx.user as User;
    if (seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u)) {
      const companyId = input?.companyId ?? null;
      const r = await resyncHotEngagementDerivedState({
        companyId,
        limit: companyId != null ? 500 : 800,
      });
      return { ...r, finishedAt: new Date() };
    }
    const m = await requireWorkspaceMembership(u, input?.companyId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    if (!canUseEngagementOps(m.role, u)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions to refresh rollups" });
    }
    const r = await resyncHotEngagementDerivedState({ companyId: m.companyId, limit: 500 });
    return { ...r, finishedAt: new Date() };
  }),

  removeLink: protectedProcedure
    .input(z.object({ linkId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      await removeEngagementLink(db, m.companyId, ctx.user.id, input.linkId);
      return { success: true as const };
    }),

  getMyQueue: protectedProcedure
    .input(
      z
        .object({
          page: z.number().int().positive().default(1),
          pageSize: z.number().int().positive().max(100).default(50),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const u = ctx.user as User;
      if (seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u)) {
        return listMyEngagementQueue(db, {
          userId: ctx.user.id,
          scope: "platform",
          page: input.page,
          pageSize: input.pageSize,
        });
      }
      const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      if (!canUseEngagementOps(m.role, u)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions for ops queue" });
      }
      return listMyEngagementQueue(db, {
        userId: ctx.user.id,
        companyId: m.companyId,
        scope: "tenant",
        page: input.page,
        pageSize: input.pageSize,
      });
    }),

  assignOwner: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          ownerUserId: z.number().int().positive().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        requireNotAuditor(m.role);
        if (!canUseEngagementOps(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot assign owner" });
        }
        companyId = m.companyId;
      }
      await assertEngagementInCompany(db, input.engagementId, companyId);
      if (input.ownerUserId != null && !isPlatform) {
        const [mem] = await db
          .select({ id: companyMembers.id })
          .from(companyMembers)
          .where(
            and(
              eq(companyMembers.companyId, companyId),
              eq(companyMembers.userId, input.ownerUserId),
              eq(companyMembers.isActive, true),
            ),
          )
          .limit(1);
        if (!mem) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Owner must be an active member of this company" });
        }
      }
      await assignEngagementOwner(db, {
        engagementId: input.engagementId,
        companyId,
        ownerUserId: input.ownerUserId,
        actorUserId: ctx.user.id,
      });
      return { success: true as const };
    }),

  setPriority: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          priority: z.enum(["normal", "high", "urgent"]),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        requireNotAuditor(m.role);
        if (!canUseEngagementOps(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot change priority" });
        }
        companyId = m.companyId;
      }
      await assertEngagementInCompany(db, input.engagementId, companyId);
      await setEngagementOpsPriority(db, {
        engagementId: input.engagementId,
        companyId,
        priority: input.priority,
        actorUserId: ctx.user.id,
      });
      return { success: true as const };
    }),

  escalate: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          note: z.string().max(2000).optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        requireNotAuditor(m.role);
        if (!canUseEngagementOps(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot escalate" });
        }
        companyId = m.companyId;
      }
      await assertEngagementInCompany(db, input.engagementId, companyId);
      await escalateEngagement(db, {
        engagementId: input.engagementId,
        companyId,
        actorUserId: ctx.user.id,
        note: input.note,
      });
      return { success: true as const };
    }),

  listInternalNotes: protectedProcedure
    .input(z.object({ engagementId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      // AUTH FIRST: guard before DB
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
        if (!canReviewDocuments(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Internal notes are restricted" });
        }
        companyId = m.companyId;
      }
      const db = await getDb();
      if (!db) return { items: [] };
      const items = await listEngagementInternalNotes(db, input.engagementId, companyId);
      return { items };
    }),

  addInternalNote: protectedProcedure
    .input(
      z.object({ engagementId: z.number().int().positive(), body: z.string().min(1).max(8000) }).merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        requireNotAuditor(m.role);
        if (!canReviewDocuments(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot add internal notes" });
        }
        companyId = m.companyId;
      }
      const id = await addEngagementInternalNote(db, input.engagementId, companyId, ctx.user.id, input.body);
      return { noteId: id };
    }),

  requestPaymentInstructions: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          instructionsText: z.string().min(1).max(8000),
          clientServiceInvoiceId: z.number().int().positive().optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        requireNotAuditor(m.role);
        if (!canReviewDocuments(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only staff can send payment instructions" });
        }
        companyId = m.companyId;
      }
      await requestPaymentInstructions(db, {
        engagementId: input.engagementId,
        companyId,
        actorUserId: ctx.user.id,
        instructionsText: input.instructionsText,
        clientServiceInvoiceId: input.clientServiceInvoiceId ?? null,
      });
      return { success: true as const };
    }),

  submitTransferProof: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          proofUrl: z.string().min(1).max(2048).regex(/^https?:\/\//i),
          proofReference: z.string().max(255).optional().nullable(),
          amountClaimedOmr: z.number().positive().optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      await assertEngagementInCompany(db, input.engagementId, m.companyId);
      await submitTransferProof(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        proofUrl: input.proofUrl,
        proofReference: input.proofReference,
        amountClaimedOmr: input.amountClaimedOmr,
      });
      return { success: true as const };
    }),

  verifyTransferProof: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          accept: z.boolean(),
          note: z.string().max(2000).optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        requireNotAuditor(m.role);
        if (!canReviewDocuments(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only staff can verify proofs" });
        }
        companyId = m.companyId;
      }
      await verifyTransferProof(db, {
        engagementId: input.engagementId,
        companyId,
        actorUserId: ctx.user.id,
        accept: input.accept,
        note: input.note,
      });
      return { success: true as const };
    }),

  markPaidExternally: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          clientServiceInvoiceId: z.number().int().positive().optional().nullable(),
          amountOmr: z.number().positive().optional().nullable(),
          reference: z.string().max(255).optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const u = ctx.user as User;
      const isPlatform = seesPlatformOperatorNav(u) || canAccessGlobalAdminProcedures(u);
      let companyId: number;
      if (isPlatform) {
        if (input.companyId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "companyId is required for platform operators" });
        }
        companyId = input.companyId;
      } else {
        const m = await requireWorkspaceMembership(u, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        requireNotAuditor(m.role);
        if (!canReviewDocuments(m.role, u)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only staff can mark reconciled" });
        }
        companyId = m.companyId;
      }
      return markPaidExternallyForEngagement(db, {
        engagementId: input.engagementId,
        companyId,
        actorUserId: ctx.user.id,
        clientServiceInvoiceId: input.clientServiceInvoiceId,
        amountOmr: input.amountOmr ?? null,
        reference: input.reference,
      });
    }),

  listTasks: protectedProcedure
    .input(z.object({ engagementId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) return { items: [] };
      await assertEngagementInCompany(db, input.engagementId, companyId);
      const items = await db
        .select()
        .from(engagementTasks)
        .where(and(eq(engagementTasks.engagementId, input.engagementId), eq(engagementTasks.companyId, companyId)))
        .orderBy(asc(engagementTasks.sortOrder));
      return { items };
    }),

  updateTask: protectedProcedure
    .input(
      z
        .object({
          taskId: z.number().int().positive(),
          status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional(),
          title: z.string().min(1).max(512).optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      const [t] = await db
        .select()
        .from(engagementTasks)
        .where(and(eq(engagementTasks.id, input.taskId), eq(engagementTasks.companyId, m.companyId)))
        .limit(1);
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      await assertEngagementInCompany(db, t.engagementId, m.companyId);
      await db
        .update(engagementTasks)
        .set({
          status: input.status ?? t.status,
          title: input.title ?? t.title,
        })
        .where(eq(engagementTasks.id, input.taskId));
      await logEngagementActivity(db, {
        engagementId: t.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "task.updated",
        payload: { taskId: input.taskId, status: input.status, title: input.title },
      });
      await syncEngagementDerivedState(db, t.engagementId, m.companyId);
      return { success: true as const };
    }),

  createTask: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          title: z.string().min(1).max(512),
          dueDate: z.date().optional().nullable(),
          /** Links this client-visible task to an internal `employee_tasks` row. */
          linkedEmployeeTaskId: z.number().int().positive().optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      await assertEngagementInCompany(db, input.engagementId, m.companyId);
      if (input.linkedEmployeeTaskId != null) {
        const [et] = await db
          .select({ id: employeeTasks.id })
          .from(employeeTasks)
          .where(and(eq(employeeTasks.id, input.linkedEmployeeTaskId), eq(employeeTasks.companyId, m.companyId)))
          .limit(1);
        if (!et) throw new TRPCError({ code: "NOT_FOUND", message: "Employee task not found" });
      }
      const [ins] = await db.insert(engagementTasks).values({
        engagementId: input.engagementId,
        companyId: m.companyId,
        title: input.title,
        status: "pending",
        dueDate: input.dueDate ?? null,
        sortOrder: 99,
        linkedEmployeeTaskId: input.linkedEmployeeTaskId ?? null,
      });
      const id = insertId(ins);
      await logEngagementActivity(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "task.created",
        payload: { taskId: id },
      });
      await syncEngagementDerivedState(db, input.engagementId, m.companyId);
      return { taskId: id };
    }),

  listMessages: protectedProcedure
    .input(z.object({ engagementId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) return { items: [] };
      await assertEngagementInCompany(db, input.engagementId, companyId);
      const items = await db
        .select()
        .from(engagementMessages)
        .where(and(eq(engagementMessages.engagementId, input.engagementId), eq(engagementMessages.companyId, companyId)))
        .orderBy(asc(engagementMessages.createdAt));
      return { items };
    }),

  /** Workspace thread + legacy client_message notifications (read-only legacy). */
  listUnifiedMessages: protectedProcedure.input(optionalActiveWorkspace.optional()).query(async ({ ctx, input }) => {
    const { companyId } = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
    const db = await getDb();
    if (!db) return { items: [] };
    const items = await listUnifiedThread(db, companyId, ctx.user.id);
    return { items };
  }),

  sendMessage: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive().optional(),
          subject: z.string().min(1).max(200),
          body: z.string().min(1).max(4000),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      if (input.engagementId != null) {
        await assertEngagementInCompany(db, input.engagementId, m.companyId);
        await db.insert(engagementMessages).values({
          engagementId: input.engagementId,
          companyId: m.companyId,
          author: "client",
          authorUserId: ctx.user.id,
          subject: input.subject,
          body: input.body,
        });
        await logEngagementActivity(db, {
          engagementId: input.engagementId,
          companyId: m.companyId,
          actorUserId: ctx.user.id,
          action: "message.client_sent",
          payload: { subject: input.subject },
        });
        await syncEngagementDerivedState(db, input.engagementId, m.companyId);
        try {
          const { notifyOwner } = await import("../_core/notification");
          await notifyOwner({
            title: `Engagement message: ${input.subject}`,
            content: `Company ${m.companyId} / engagement ${input.engagementId}\n\n${input.body}`,
          });
        } catch {
          /* non-fatal */
        }
        return { success: true as const };
      }
      await sendClientEngagementMessage(db, m.companyId, ctx.user.id, input.subject, input.body);
      return { success: true as const };
    }),

  /** Staff / tenant admin reply visible to clients on the engagement thread. */
  replyFromPlatform: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          subject: z.string().min(1).max(200),
          body: z.string().min(1).max(8000),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      requireNotAuditor(m.role);
      if (!canReviewDocuments(m.role, ctx.user as User)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role to post platform replies" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await sendPlatformEngagementMessage(
        db,
        m.companyId,
        ctx.user.id,
        input.engagementId,
        input.subject,
        input.body,
      );
      return { success: true as const };
    }),

  markMessageRead: protectedProcedure
    .input(
      z
        .object({
          messageId: z.number().int().positive(),
          legacyNotification: z.boolean().optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      if (input.legacyNotification) {
        await db
          .update(notifications)
          .set({ isRead: true })
          .where(
            and(
              eq(notifications.id, input.messageId),
              eq(notifications.userId, ctx.user.id),
              eq(notifications.type, "client_message"),
            ),
          );
        return { success: true as const };
      }
      await markEngagementMessageRead(db, m.companyId, ctx.user.id, input.messageId);
      return { success: true as const };
    }),

  listDocuments: protectedProcedure
    .input(z.object({ engagementId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) return { items: [] };
      await assertEngagementInCompany(db, input.engagementId, companyId);
      const items = await db
        .select()
        .from(engagementDocuments)
        .where(
          and(eq(engagementDocuments.engagementId, input.engagementId), eq(engagementDocuments.companyId, companyId)),
        )
        .orderBy(desc(engagementDocuments.createdAt));
      return { items };
    }),

  uploadDocument: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          title: z.string().min(1).max(512),
          fileUrl: z
            .string()
            .min(1)
            .max(2048)
            .regex(/^https?:\/\//i, "URL must start with http:// or https://"),
          storageKey: z.string().max(1024).optional().nullable(),
          mimeType: z.string().max(255).optional().nullable(),
          sizeBytes: z.number().int().nonnegative().optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      await assertEngagementInCompany(db, input.engagementId, m.companyId);
      const [ins] = await db.insert(engagementDocuments).values({
        engagementId: input.engagementId,
        companyId: m.companyId,
        title: input.title,
        fileUrl: input.fileUrl,
        status: "pending",
        uploadedByUserId: ctx.user.id,
        storageKey: input.storageKey ?? null,
        mimeType: input.mimeType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        scanStatus: "pending",
      });
      const id = insertId(ins);
      await logEngagementActivity(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "document.uploaded",
        payload: { documentId: id },
      });
      await syncEngagementDerivedState(db, input.engagementId, m.companyId);
      return { documentId: id };
    }),

  reviewDocument: protectedProcedure
    .input(
      z
        .object({
          documentId: z.number().int().positive(),
          status: z.enum(["approved", "rejected"]),
          note: z.string().max(2000).optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      requireNotAuditor(m.role);
      if (!canReviewDocuments(m.role, ctx.user as User)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient role to review documents" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [doc] = await db
        .select()
        .from(engagementDocuments)
        .where(and(eq(engagementDocuments.id, input.documentId), eq(engagementDocuments.companyId, m.companyId)))
        .limit(1);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      await db
        .update(engagementDocuments)
        .set({
          status: input.status,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
          reviewNote: input.note ?? null,
        })
        .where(eq(engagementDocuments.id, input.documentId));
      await logEngagementActivity(db, {
        engagementId: doc.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "document.reviewed",
        payload: { documentId: input.documentId, status: input.status },
      });
      await syncEngagementDerivedState(db, doc.engagementId, m.companyId);
      return { success: true as const };
    }),

  requestRenewal: protectedProcedure
    .input(
      z
        .object({
          workPermitId: z.number().int().positive(),
          notes: z.string().min(1).max(4000),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      const id = await createRenewalEngagement(db, m.companyId, ctx.user.id, input.workPermitId, input.notes);
      return { engagementId: id };
    }),

  startContractSigning: protectedProcedure
    .input(z.object({ contractId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      requireNotAuditor(m.role);
      const [c] = await db
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, input.contractId), eq(contracts.companyId, m.companyId)))
        .limit(1);
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
      if (c.status !== "pending_signature") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Contract is not awaiting signature" });
      }
      const signPath = `/contracts/${c.id}/sign`;
      const { engagementId } = await createEngagementFromSource(db, m.companyId, ctx.user.id, {
        sourceType: "contract",
        sourceId: c.id,
      });
      await logEngagementActivity(db, {
        engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "contract.signing_started",
        payload: { contractId: c.id, signPath },
      });
      return { signPath, engagementId };
    }),

  backfillFromTenant: protectedProcedure.input(optionalActiveWorkspace.optional()).mutation(async ({ ctx, input }) => {
    const m = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
    requireNotAuditor(m.role);
    if (m.role !== "company_admin" && !seesPlatformOperatorNav(ctx.user) && !canAccessGlobalAdminProcedures(ctx.user as User)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only workspace owners can run a full backfill" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    }
    return backfillEngagementsForCompany(db, m.companyId, ctx.user.id);
  }),
});
