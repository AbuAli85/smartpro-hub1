/**
 * Attendance Client Approval Router (Phase 10A + 10B).
 *
 * Phase 10A: Internal HR/admin approval package model.
 * Phase 10B: Secure client-facing approval via signed JWT tokens.
 *
 * Authorization model (Phase 10B — Option B: Secure approval link):
 *   1. HR submits a batch (draft → submitted).
 *   2. HR calls generateClientApprovalToken to get a 14-day signed JWT.
 *   3. HR sends the approval URL to the external client contact (email/WhatsApp).
 *   4. Client opens /attendance-approval/:token (public page, no login needed).
 *   5. Public tRPC procedures verify the JWT and scope every DB query to the
 *      (batchId, companyId) pair embedded in the token — clients cannot access
 *      any other tenant or batch.
 *
 * Data redaction: public token procedures never return companyId, employeeId,
 * internal audit payloads, payroll figures, or HR-only notes.
 *
 * Tenant isolation: companyId is always derived from the authenticated caller's
 * active workspace (protected procedures) or from the verified JWT (public ones).
 *
 * Procedures:
 *   createClientApprovalBatch        — draft batch + items from attendance data
 *   submitClientApprovalBatch        — draft → submitted
 *   approveClientApprovalBatch       — submitted → approved (internal HR/admin)
 *   rejectClientApprovalBatch        — submitted → rejected (internal HR/admin)
 *   listClientApprovalBatches        — list with filters
 *   getClientApprovalBatch           — batch + items detail (internal)
 *   generateClientApprovalToken      — signs a 14-day JWT for a submitted batch
 *   getClientApprovalBatchByToken    — redacted batch view via JWT (public)
 *   clientApproveByToken             — approve via JWT (public)
 *   clientRejectByToken              — reject with reason via JWT (public)
 */

import { TRPCError } from "@trpc/server";
import { and, asc, between, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  attendanceClientApprovalBatches,
  attendanceClientApprovalItems,
  attendanceRecords,
  attendanceSessions,
  employees,
  employeeSchedules,
} from "../../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../../_core/trpc";
import { requireActiveCompanyId } from "../../_core/tenant";
import {
  signClientApprovalToken,
  verifyClientApprovalToken,
  CLIENT_APPROVAL_TOKEN_EXPIRY_DAYS,
} from "../../attendanceApprovalToken";
import { ENV } from "../../_core/env";
import {
  canSubmitBatch,
  canApproveBatch,
  canRejectBatch,
  canCancelBatch,
  type BatchStatus,
} from "@shared/attendanceClientApproval";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_ENTITY,
  ATTENDANCE_AUDIT_SOURCE,
} from "@shared/attendanceAuditTaxonomy";
import { attendancePayloadJson, logAttendanceAuditSafe } from "../../attendanceAudit";
import {
  requireDb,
  requireCanCreateAttendanceClientApproval,
  requireCanSubmitAttendanceClientApproval,
  requireCanApproveAttendanceClientApproval,
  requireCanViewAttendanceClientApproval,
} from "./helpers";
import type { User } from "../../../drizzle/schema";

// ─── Input schemas ────────────────────────────────────────────────────────────

const dateRangeInput = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  siteId: z.number().int().positive().optional(),
  clientCompanyId: z.number().int().positive().optional(),
  promoterAssignmentId: z.number().int().positive().optional(),
});

const batchIdInput = z.object({
  batchId: z.number().int().positive(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Enumerate all YYYY-MM-DD dates within [start, end] inclusive. */
function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T12:00:00Z");
  const last = new Date(end + "T12:00:00Z");
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Resolve batch and guard tenant isolation. Throws if not found or wrong company. */
async function requireBatchForCompany(
  db: Awaited<ReturnType<typeof requireDb>>,
  batchId: number,
  companyId: number,
) {
  const rows = await db
    .select()
    .from(attendanceClientApprovalBatches)
    .where(and(eq(attendanceClientApprovalBatches.id, batchId), eq(attendanceClientApprovalBatches.companyId, companyId)))
    .limit(1);
  const batch = rows[0];
  if (!batch) throw new TRPCError({ code: "NOT_FOUND", message: "Approval batch not found." });
  return batch;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const clientApprovalRouter = router({
  /**
   * Create a new client approval batch (draft) for a date range.
   * Builds one item row per active employee × date within the period.
   * Employees are scoped to those with a schedule linked to the given site
   * (if siteId provided) or all active employees (if no siteId).
   * If a session or record exists for an employee × date, its IDs are captured.
   * Duplicate batch prevention: rejects if an existing non-cancelled batch
   * already covers the exact same (company, site, periodStart, periodEnd).
   */
  createClientApprovalBatch: protectedProcedure
    .input(dateRangeInput)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanCreateAttendanceClientApproval(user);
      const cid = m.companyId;
      const db = await requireDb();

      if (input.periodStart > input.periodEnd) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "periodStart must not be after periodEnd." });
      }

      // Duplicate batch prevention
      const existing = await db
        .select({ id: attendanceClientApprovalBatches.id, status: attendanceClientApprovalBatches.status })
        .from(attendanceClientApprovalBatches)
        .where(
          and(
            eq(attendanceClientApprovalBatches.companyId, cid),
            eq(attendanceClientApprovalBatches.periodStart, input.periodStart),
            eq(attendanceClientApprovalBatches.periodEnd, input.periodEnd),
            input.siteId != null
              ? eq(attendanceClientApprovalBatches.siteId, input.siteId)
              : isNull(attendanceClientApprovalBatches.siteId),
          )
        )
        .limit(1);

      if (existing.length > 0 && existing[0].status !== "cancelled") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `An approval batch already exists for this period (status: ${existing[0].status}, id: ${existing[0].id}).`,
        });
      }

      const dates = enumerateDates(input.periodStart, input.periodEnd);

      // Load active employees (scoped to site via schedules if siteId given)
      const empQuery = db
        .selectDistinct({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.companyId, cid),
            inArray(employees.status, ["active", "on_leave"])
          )
        );

      let empRows: { id: number }[];
      if (input.siteId != null) {
        const siteId = input.siteId;
        const scheduleRows = await db
          .selectDistinct({ employeeUserId: employeeSchedules.employeeUserId })
          .from(employeeSchedules)
          .where(
            and(
              eq(employeeSchedules.companyId, cid),
              eq(employeeSchedules.siteId, siteId),
              eq(employeeSchedules.isActive, true),
              lte(employeeSchedules.startDate, input.periodEnd),
              or(isNull(employeeSchedules.endDate), gte(employeeSchedules.endDate, input.periodStart))
            )
          );

        const userIds = scheduleRows.map((r) => r.employeeUserId).filter((uid): uid is number => uid != null);
        if (userIds.length === 0) {
          empRows = [];
        } else {
          empRows = await db
            .select({ id: employees.id })
            .from(employees)
            .where(
              and(
                eq(employees.companyId, cid),
                inArray(employees.userId, userIds),
                inArray(employees.status, ["active", "on_leave"])
              )
            );
        }
      } else {
        empRows = await empQuery;
      }

      if (empRows.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active employees found for the given scope. Cannot create an empty batch.",
        });
      }

      const employeeIds = empRows.map((e) => e.id);

      // Load sessions and records in the period for attendance linkage
      const [sessionRows, recordRows] = await Promise.all([
        db
          .select({
            id: attendanceSessions.id,
            employeeId: attendanceSessions.employeeId,
            businessDate: attendanceSessions.businessDate,
          })
          .from(attendanceSessions)
          .where(
            and(
              eq(attendanceSessions.companyId, cid),
              inArray(attendanceSessions.employeeId, employeeIds),
              between(attendanceSessions.businessDate, input.periodStart, input.periodEnd)
            )
          ),

        db
          .select({
            id: attendanceRecords.id,
            employeeId: attendanceRecords.employeeId,
            // records use checkIn timestamp; we capture date string from sessions above
          })
          .from(attendanceRecords)
          .where(
            and(
              eq(attendanceRecords.companyId, cid),
              inArray(attendanceRecords.employeeId, employeeIds)
            )
          ),
      ]);

      // Build quick lookup: "employeeId:date" → session id
      const sessionByKey = new Map<string, number>();
      for (const s of sessionRows) {
        sessionByKey.set(`${s.employeeId}:${s.businessDate}`, s.id);
      }

      // Build lookup: employeeId → first record id (rough linkage; Phase 10B can refine)
      const recordByEmployee = new Map<number, number>();
      for (const r of recordRows) {
        if (!recordByEmployee.has(r.employeeId)) recordByEmployee.set(r.employeeId, r.id);
      }

      // Create batch row
      const [batchInsert] = await db
        .insert(attendanceClientApprovalBatches)
        .values({
          companyId: cid,
          siteId: input.siteId ?? null,
          clientCompanyId: input.clientCompanyId ?? null,
          promoterAssignmentId: input.promoterAssignmentId ?? null,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: "draft",
        })
        .$returningId();

      const batchId = batchInsert.id;

      // Build item rows — one per employee × date
      const itemValues = dates.flatMap((date) =>
        employeeIds.map((employeeId) => ({
          batchId,
          companyId: cid,
          employeeId,
          attendanceDate: date,
          attendanceSessionId: sessionByKey.get(`${employeeId}:${date}`) ?? null,
          attendanceRecordId: recordByEmployee.get(employeeId) ?? null,
          dailyStateJson: null,
          status: "pending" as const,
        }))
      );

      if (itemValues.length > 0) {
        await db.insert(attendanceClientApprovalItems).values(itemValues);
      }

      await logAttendanceAuditSafe({
        companyId: cid,
        actorUserId: user.id,
        actorRole: m.role,
        actionType: ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_CREATED,
        entityType: ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH,
        entityId: batchId,
        afterPayload: attendancePayloadJson({
          batchId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          siteId: input.siteId,
          employeeCount: employeeIds.length,
          itemCount: itemValues.length,
        }),
        source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
      });

      return { batchId, itemCount: itemValues.length };
    }),

  /**
   * Submit a draft batch for client/internal review (draft → submitted).
   */
  submitClientApprovalBatch: protectedProcedure
    .input(batchIdInput)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanSubmitAttendanceClientApproval(user);
      const cid = m.companyId;
      const db = await requireDb();

      const batch = await requireBatchForCompany(db, input.batchId, cid);
      if (!canSubmitBatch(batch.status as BatchStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot submit a batch with status '${batch.status}'. Only draft batches can be submitted.`,
        });
      }

      const now = new Date();
      await db
        .update(attendanceClientApprovalBatches)
        .set({ status: "submitted", submittedAt: now, submittedByUserId: user.id })
        .where(eq(attendanceClientApprovalBatches.id, input.batchId));

      await logAttendanceAuditSafe({
        companyId: cid,
        actorUserId: user.id,
        actorRole: m.role,
        actionType: ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_SUBMITTED,
        entityType: ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH,
        entityId: input.batchId,
        beforePayload: attendancePayloadJson({ status: batch.status }),
        afterPayload: attendancePayloadJson({ status: "submitted", submittedAt: now }),
        source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
      });

      return { batchId: input.batchId, status: "submitted" };
    }),

  /**
   * Approve a submitted batch (submitted → approved).
   * In Phase 10A this is performed internally by HR/admin.
   * Phase 10B will expose this to a client portal with an external role.
   */
  approveClientApprovalBatch: protectedProcedure
    .input(batchIdInput.extend({ clientComment: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanApproveAttendanceClientApproval(user);
      const cid = m.companyId;
      const db = await requireDb();

      const batch = await requireBatchForCompany(db, input.batchId, cid);
      if (!canApproveBatch(batch.status as BatchStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve a batch with status '${batch.status}'. Only submitted batches can be approved.`,
        });
      }

      const now = new Date();
      await db
        .update(attendanceClientApprovalBatches)
        .set({
          status: "approved",
          approvedAt: now,
          approvedByUserId: user.id,
          clientComment: input.clientComment ?? null,
        })
        .where(eq(attendanceClientApprovalBatches.id, input.batchId));

      // Approve all pending items
      await db
        .update(attendanceClientApprovalItems)
        .set({ status: "approved" })
        .where(
          and(
            eq(attendanceClientApprovalItems.batchId, input.batchId),
            eq(attendanceClientApprovalItems.status, "pending")
          )
        );

      await logAttendanceAuditSafe({
        companyId: cid,
        actorUserId: user.id,
        actorRole: m.role,
        actionType: ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_APPROVED,
        entityType: ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH,
        entityId: input.batchId,
        beforePayload: attendancePayloadJson({ status: batch.status }),
        afterPayload: attendancePayloadJson({ status: "approved", approvedAt: now, clientComment: input.clientComment }),
        source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
      });

      return { batchId: input.batchId, status: "approved" };
    }),

  /**
   * Reject a submitted batch (submitted → rejected).
   * Rejection reason is required.
   */
  rejectClientApprovalBatch: protectedProcedure
    .input(batchIdInput.extend({
      rejectionReason: z.string().min(1, "Rejection reason is required.").max(2000),
      clientComment: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanApproveAttendanceClientApproval(user);
      const cid = m.companyId;
      const db = await requireDb();

      const batch = await requireBatchForCompany(db, input.batchId, cid);
      if (!canRejectBatch(batch.status as BatchStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot reject a batch with status '${batch.status}'. Only submitted batches can be rejected.`,
        });
      }

      const now = new Date();
      await db
        .update(attendanceClientApprovalBatches)
        .set({
          status: "rejected",
          rejectedAt: now,
          rejectedByUserId: user.id,
          rejectionReason: input.rejectionReason,
          clientComment: input.clientComment ?? null,
        })
        .where(eq(attendanceClientApprovalBatches.id, input.batchId));

      await logAttendanceAuditSafe({
        companyId: cid,
        actorUserId: user.id,
        actorRole: m.role,
        actionType: ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_REJECTED,
        entityType: ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH,
        entityId: input.batchId,
        beforePayload: attendancePayloadJson({ status: batch.status }),
        afterPayload: attendancePayloadJson({
          status: "rejected",
          rejectedAt: now,
          rejectionReason: input.rejectionReason,
        }),
        reason: input.rejectionReason,
        source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
      });

      return { batchId: input.batchId, status: "rejected" };
    }),

  /**
   * List client approval batches with optional filters.
   */
  listClientApprovalBatches: protectedProcedure
    .input(z.object({
      status: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]).optional(),
      siteId: z.number().int().positive().optional(),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanViewAttendanceClientApproval(user);
      const cid = m.companyId;
      const db = await requireDb();

      const conditions = [eq(attendanceClientApprovalBatches.companyId, cid)];

      if (input.status) {
        conditions.push(eq(attendanceClientApprovalBatches.status, input.status));
      }
      if (input.siteId != null) {
        conditions.push(eq(attendanceClientApprovalBatches.siteId, input.siteId));
      }
      if (input.periodStart) {
        conditions.push(gte(attendanceClientApprovalBatches.periodStart, input.periodStart));
      }
      if (input.periodEnd) {
        conditions.push(lte(attendanceClientApprovalBatches.periodEnd, input.periodEnd));
      }

      const batches = await db
        .select()
        .from(attendanceClientApprovalBatches)
        .where(and(...conditions))
        .orderBy(desc(attendanceClientApprovalBatches.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Attach item counts per batch
      const batchIds = batches.map((b) => b.id);
      const itemCountRows =
        batchIds.length > 0
          ? await db
              .select({
                batchId: attendanceClientApprovalItems.batchId,
                status: attendanceClientApprovalItems.status,
                cnt: sql<number>`count(*)`,
              })
              .from(attendanceClientApprovalItems)
              .where(inArray(attendanceClientApprovalItems.batchId, batchIds))
              .groupBy(attendanceClientApprovalItems.batchId, attendanceClientApprovalItems.status)
          : [];

      type StatusCount = Record<string, number>;
      const countsByBatch = new Map<number, StatusCount>();
      for (const row of itemCountRows) {
        if (!countsByBatch.has(row.batchId)) countsByBatch.set(row.batchId, {});
        countsByBatch.get(row.batchId)![row.status] = Number(row.cnt);
      }

      return batches.map((b) => {
        const counts = countsByBatch.get(b.id) ?? {};
        return {
          ...b,
          itemCounts: {
            total: Object.values(counts).reduce((s, c) => s + c, 0),
            pending: counts["pending"] ?? 0,
            approved: counts["approved"] ?? 0,
            rejected: counts["rejected"] ?? 0,
            disputed: counts["disputed"] ?? 0,
          },
        };
      });
    }),

  /**
   * Get a single batch with all its items.
   */
  getClientApprovalBatch: protectedProcedure
    .input(batchIdInput)
    .query(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanViewAttendanceClientApproval(user);
      const cid = m.companyId;
      const db = await requireDb();

      const batch = await requireBatchForCompany(db, input.batchId, cid);

      const items = await db
        .select()
        .from(attendanceClientApprovalItems)
        .where(eq(attendanceClientApprovalItems.batchId, input.batchId))
        .orderBy(asc(attendanceClientApprovalItems.attendanceDate), asc(attendanceClientApprovalItems.employeeId));

      return { batch, items };
    }),

  // ─── Phase 10B: Token-based client approval ───────────────────────────────

  /**
   * Generate a signed 14-day JWT that allows an external client to
   * view and approve/reject one specific submitted batch.
   *
   * Only HR/admin can call this; the batch must already be submitted.
   * The returned approvalUrl is ready to be shared (email, WhatsApp, etc.).
   */
  generateClientApprovalToken: protectedProcedure
    .input(batchIdInput)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user as User;
      const m = await requireCanViewAttendanceClientApproval(user);
      const cid = m.companyId;
      const db = await requireDb();

      const batch = await requireBatchForCompany(db, input.batchId, cid);

      if (batch.status !== "submitted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Only submitted batches can have an approval token generated. Current status: '${batch.status}'.`,
        });
      }

      const token = await signClientApprovalToken({ batchId: batch.id, companyId: cid });
      if (!token) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Token signing is unavailable (JWT_SECRET too short).",
        });
      }

      const base = ENV.appPublicUrl || "";
      const approvalUrl = base
        ? `${base}/attendance-approval/${token}`
        : `/attendance-approval/${token}`;

      return {
        token,
        expiresInDays: CLIENT_APPROVAL_TOKEN_EXPIRY_DAYS,
        approvalUrl,
      };
    }),

  /**
   * Public: resolve a batch from a signed JWT and return a redacted view.
   * No authentication required — access is scoped to exactly one batch via token.
   *
   * Redaction rules: no companyId, employeeId, audit payloads, payroll data,
   * or internal HR notes. Employee names are safe to expose (display use only).
   */
  getClientApprovalBatchByToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const payload = await verifyClientApprovalToken(input.token);
      if (!payload) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired approval token." });
      }

      const db = await requireDb();

      const batchRows = await db
        .select({
          id: attendanceClientApprovalBatches.id,
          periodStart: attendanceClientApprovalBatches.periodStart,
          periodEnd: attendanceClientApprovalBatches.periodEnd,
          status: attendanceClientApprovalBatches.status,
          submittedAt: attendanceClientApprovalBatches.submittedAt,
          approvedAt: attendanceClientApprovalBatches.approvedAt,
          rejectedAt: attendanceClientApprovalBatches.rejectedAt,
          rejectionReason: attendanceClientApprovalBatches.rejectionReason,
          clientComment: attendanceClientApprovalBatches.clientComment,
        })
        .from(attendanceClientApprovalBatches)
        .where(
          and(
            eq(attendanceClientApprovalBatches.id, payload.batchId),
            eq(attendanceClientApprovalBatches.companyId, payload.companyId),
          )
        )
        .limit(1);

      const batch = batchRows[0];
      if (!batch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Approval batch not found." });
      }

      // Load items with employee display name (first + last name only — no IDs exposed)
      const rawItems = await db
        .select({
          id: attendanceClientApprovalItems.id,
          attendanceDate: attendanceClientApprovalItems.attendanceDate,
          status: attendanceClientApprovalItems.status,
          clientComment: attendanceClientApprovalItems.clientComment,
          employeeFirstName: employees.firstName,
          employeeLastName: employees.lastName,
        })
        .from(attendanceClientApprovalItems)
        .innerJoin(employees, eq(attendanceClientApprovalItems.employeeId, employees.id))
        .where(eq(attendanceClientApprovalItems.batchId, payload.batchId))
        .orderBy(
          asc(attendanceClientApprovalItems.attendanceDate),
          asc(employees.firstName),
          asc(employees.lastName),
        );

      const items = rawItems.map((r) => ({
        id: r.id,
        attendanceDate: r.attendanceDate,
        status: r.status,
        clientComment: r.clientComment,
        employeeDisplayName: `${r.employeeFirstName} ${r.employeeLastName}`.trim(),
      }));

      return { batch, items };
    }),

  /**
   * Public: approve a submitted batch via a signed JWT.
   * Approves the batch and all pending items.
   * Audit actor is identified as "client_portal_token" (no user account).
   */
  clientApproveByToken: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      clientComment: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = await verifyClientApprovalToken(input.token);
      if (!payload) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired approval token." });
      }

      const db = await requireDb();
      const batch = await requireBatchForCompany(db, payload.batchId, payload.companyId);

      if (!canApproveBatch(batch.status as BatchStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot approve a batch with status '${batch.status}'. Only submitted batches can be approved.`,
        });
      }

      const now = new Date();
      await db
        .update(attendanceClientApprovalBatches)
        .set({
          status: "approved",
          approvedAt: now,
          clientComment: input.clientComment ?? null,
        })
        .where(eq(attendanceClientApprovalBatches.id, payload.batchId));

      await db
        .update(attendanceClientApprovalItems)
        .set({ status: "approved" })
        .where(
          and(
            eq(attendanceClientApprovalItems.batchId, payload.batchId),
            eq(attendanceClientApprovalItems.status, "pending"),
          )
        );

      await logAttendanceAuditSafe({
        companyId: payload.companyId,
        actorUserId: 0,
        actorRole: "client_portal_token",
        actionType: ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_APPROVED,
        entityType: ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH,
        entityId: payload.batchId,
        beforePayload: attendancePayloadJson({ status: batch.status }),
        afterPayload: attendancePayloadJson({
          status: "approved",
          approvedAt: now,
          clientComment: input.clientComment,
          via: "client_portal_token",
        }),
        source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
      });

      return { batchId: payload.batchId, status: "approved" as const };
    }),

  /**
   * Public: reject a submitted batch via a signed JWT.
   * Rejection reason is required.
   * Audit actor is identified as "client_portal_token" (no user account).
   */
  clientRejectByToken: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      rejectionReason: z.string().min(1, "Rejection reason is required.").max(2000),
      clientComment: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      const payload = await verifyClientApprovalToken(input.token);
      if (!payload) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired approval token." });
      }

      const db = await requireDb();
      const batch = await requireBatchForCompany(db, payload.batchId, payload.companyId);

      if (!canRejectBatch(batch.status as BatchStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot reject a batch with status '${batch.status}'. Only submitted batches can be rejected.`,
        });
      }

      const now = new Date();
      await db
        .update(attendanceClientApprovalBatches)
        .set({
          status: "rejected",
          rejectedAt: now,
          rejectionReason: input.rejectionReason,
          clientComment: input.clientComment ?? null,
        })
        .where(eq(attendanceClientApprovalBatches.id, payload.batchId));

      await logAttendanceAuditSafe({
        companyId: payload.companyId,
        actorUserId: 0,
        actorRole: "client_portal_token",
        actionType: ATTENDANCE_AUDIT_ACTION.CLIENT_APPROVAL_BATCH_REJECTED,
        entityType: ATTENDANCE_AUDIT_ENTITY.CLIENT_APPROVAL_BATCH,
        entityId: payload.batchId,
        beforePayload: attendancePayloadJson({ status: batch.status }),
        afterPayload: attendancePayloadJson({
          status: "rejected",
          rejectedAt: now,
          rejectionReason: input.rejectionReason,
          via: "client_portal_token",
        }),
        reason: input.rejectionReason,
        source: ATTENDANCE_AUDIT_SOURCE.HR_PANEL,
      });

      return { batchId: payload.batchId, status: "rejected" as const };
    }),
});
