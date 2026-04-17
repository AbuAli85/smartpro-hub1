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
  engagementDocuments,
  engagementMessages,
  notifications,
  contracts,
} from "../../drizzle/schema";
import {
  assertEngagementInCompany,
  addEngagementLink,
  backfillEngagementsForCompany,
  buildEngagementDetail,
  createEngagementFromSource,
  createRenewalEngagement,
  getOrCreateWorkspaceEngagement,
  listUnifiedThread,
  logEngagementActivity,
  markEngagementMessageRead,
  sendClientEngagementMessage,
  sendPlatformEngagementMessage,
} from "../services/engagementsService";

const createFromSourceInput = z.discriminatedUnion("sourceType", [
  z.object({ sourceType: z.literal("pro_service"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("government_case"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("marketplace_booking"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("contract"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("pro_billing_cycle"), sourceId: z.number().int().positive() }),
  z.object({ sourceType: z.literal("staffing_month"), sourceKey: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ sourceType: z.literal("service_request"), sourceId: z.number().int().positive() }),
]);

const createFromSourceWithWorkspace = z.intersection(createFromSourceInput, optionalActiveWorkspace);

function canReviewDocuments(role: CompanyMember["role"], user: User): boolean {
  if (seesPlatformOperatorNav(user) || canAccessGlobalAdminProcedures(user)) return true;
  return role === "company_admin" || role === "hr_admin" || role === "finance_admin";
}

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
      const db = await getDb();
      if (!db) return { items: [] as (typeof engagements.$inferSelect)[], total: 0 };
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      return buildEngagementDetail(db, input.engagementId, companyId);
    }),

  createFromSource: protectedProcedure
    .input(createFromSourceWithWorkspace)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      requireNotAuditor(m.role);
      await assertEngagementInCompany(db, input.engagementId, m.companyId);
      await db.update(engagements).set({ status: input.status }).where(eq(engagements.id, input.engagementId));
      await logEngagementActivity(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "status.updated",
        payload: { status: input.status },
      });
      return { success: true as const };
    }),

  listTasks: protectedProcedure
    .input(z.object({ engagementId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
      return { success: true as const };
    }),

  createTask: protectedProcedure
    .input(
      z
        .object({
          engagementId: z.number().int().positive(),
          title: z.string().min(1).max(512),
          dueDate: z.date().optional().nullable(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      requireNotAuditor(m.role);
      await assertEngagementInCompany(db, input.engagementId, m.companyId);
      const [ins] = await db.insert(engagementTasks).values({
        engagementId: input.engagementId,
        companyId: m.companyId,
        title: input.title,
        status: "pending",
        dueDate: input.dueDate ?? null,
        sortOrder: 99,
      });
      const id = insertId(ins);
      await logEngagementActivity(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "task.created",
        payload: { taskId: id },
      });
      return { taskId: id };
    }),

  listMessages: protectedProcedure
    .input(z.object({ engagementId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [] };
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
    const db = await getDb();
    if (!db) return { items: [] };
    const { companyId } = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
      const db = await getDb();
      if (!db) return { items: [] };
      const { companyId } = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      requireNotAuditor(m.role);
      await assertEngagementInCompany(db, input.engagementId, m.companyId);
      const [ins] = await db.insert(engagementDocuments).values({
        engagementId: input.engagementId,
        companyId: m.companyId,
        title: input.title,
        fileUrl: input.fileUrl,
        status: "pending",
        uploadedByUserId: ctx.user.id,
      });
      const id = insertId(ins);
      await logEngagementActivity(db, {
        engagementId: input.engagementId,
        companyId: m.companyId,
        actorUserId: ctx.user.id,
        action: "document.uploaded",
        payload: { documentId: id },
      });
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
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      requireNotAuditor(m.role);
      const id = await createRenewalEngagement(db, m.companyId, ctx.user.id, input.workPermitId, input.notes);
      return { engagementId: id };
    }),

  startContractSigning: protectedProcedure
    .input(z.object({ contractId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const m = await requireWorkspaceMembership(ctx.user as User, input.companyId);
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
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const m = await requireWorkspaceMembership(ctx.user as User, input?.companyId);
    requireNotAuditor(m.role);
    if (m.role !== "company_admin" && !seesPlatformOperatorNav(ctx.user) && !canAccessGlobalAdminProcedures(ctx.user as User)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only workspace owners can run a full backfill" });
    }
    return backfillEngagementsForCompany(db, m.companyId, ctx.user.id);
  }),
});
