import { z } from "zod";
import { and, desc, eq, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { createNotification, getDb, getUserCompany } from "../db";
import { shiftChangeRequests, employees, shiftTemplates } from "../../drizzle/schema";
import { requireActiveCompanyId } from "../_core/tenant";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";

function randomSuffix() { return Math.random().toString(36).slice(2, 8); }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the employee_user_id to use for this user.
 *  Tries ctx.user.id first; if no employee record found, falls back to employees.id
 *  (handles schedules assigned before the user account was linked). */
async function resolveEmployeeUserId(userId: number, companyId: number): Promise<number> {
  const db = await getDb();
  if (!db) return userId;
  // Check if there's a direct schedule entry by userId
  const [direct] = await db.select({ id: shiftChangeRequests.id })
    .from(shiftChangeRequests)
    .where(and(eq(shiftChangeRequests.companyId, companyId), eq(shiftChangeRequests.employeeUserId, userId)))
    .limit(1);
  if (direct) return userId;
  // Fall back to employees.id
  const [empRow] = await db.select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.userId, userId)))
    .limit(1);
  return empRow?.id ?? userId;
}

async function requireAdminOrHR(userId: number) {
  const membership = await getUserCompany(userId);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "Not a company member" });
  const role = membership.member.role;
  if (!["company_admin", "hr_admin"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "HR or Admin access required" });
  }
  return { company: membership.company, role: membership.member.role };
}

/** Send an in-app notification to a specific user. Non-critical — never throws. */
async function sendInAppNotification(params: {
  toUserId: number;
  companyId: number;
  type: string;
  title: string;
  message: string;
  link?: string;
  actorUserId?: number | null;
}) {
  try {
    await createNotification(
      {
        userId: params.toUserId,
        companyId: params.companyId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
        isRead: false,
      },
      { actorUserId: params.actorUserId ?? null },
    );
  } catch {
    // Non-critical — don't fail the main action if notification fails
  }
}

/** Resolve the actual login userId from an employeeUserId (which may be employees.id). */
async function resolveLoginUserId(employeeUserId: number): Promise<number> {
  const db = await getDb();
  if (!db) return employeeUserId;
  // If employeeUserId is a userId directly, return it
  // Otherwise find the employee row and return their userId
  const [empRow] = await db.select({ userId: employees.userId })
    .from(employees)
    .where(or(
      eq(employees.userId, employeeUserId),
      eq(employees.id, employeeUserId)
    ))
    .limit(1);
  return empRow?.userId ?? employeeUserId;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const shiftRequestsRouter = router({

  // ── Employee: Submit a new shift change / time off request ──────────────────
  submit: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      requestType: z.enum(["shift_change", "time_off", "early_leave", "late_arrival", "day_swap"]),
      requestedDate: z.string(),          // YYYY-MM-DD
      requestedEndDate: z.string().optional(),
      preferredShiftId: z.number().optional(),
      requestedTime: z.string().optional(), // HH:MM for early_leave / late_arrival
      reason: z.string().min(5).max(1000),
      attachmentUrl: z.string().url().optional(), // S3 URL for supporting document
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Use the employee's own userId as the key (consistent with schedule lookup)
      const empUserId = await resolveEmployeeUserId(ctx.user.id, companyId);
      const [inserted] = await db.insert(shiftChangeRequests).values({
        companyId,
        employeeUserId: empUserId,
        requestType: input.requestType,
        requestedDate: input.requestedDate,
        requestedEndDate: input.requestedEndDate ?? null,
        preferredShiftId: input.preferredShiftId ?? null,
        requestedTime: input.requestedTime ?? null,
        reason: input.reason,
        attachmentUrl: input.attachmentUrl ?? null,
        status: "pending",
      });
      // Notify the platform owner (HR/admin) about the new request
      const typeLabel = input.requestType.replace(/_/g, " ");
      try {
        await notifyOwner({
          title: `New ${typeLabel} request submitted`,
          content: `An employee has submitted a ${typeLabel} request for ${input.requestedDate}. Reason: ${input.reason.slice(0, 200)}`,
        });
      } catch {
        // Non-critical
      }
      return { id: (inserted as any).insertId as number };
    }),

  // ── Employee: List my requests ───────────────────────────────────────────────
  listMine: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      // Dual lookup: by userId AND by employees.id
      const [empRow] = await db.select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.userId, ctx.user.id)))
        .limit(1);
      const myIds = [ctx.user.id, ...(empRow ? [empRow.id] : [])];
      const requests = await db.select({
        request: shiftChangeRequests,
        preferredShift: {
          id: shiftTemplates.id,
          name: shiftTemplates.name,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
        },
      })
        .from(shiftChangeRequests)
        .leftJoin(shiftTemplates, eq(shiftChangeRequests.preferredShiftId, shiftTemplates.id))
        .where(and(
          eq(shiftChangeRequests.companyId, companyId),
          or(...myIds.map(id => eq(shiftChangeRequests.employeeUserId, id)))
        ))
        .orderBy(desc(shiftChangeRequests.createdAt))
        .limit(50);
      return requests;
    }),

  // ── Employee: Cancel a pending request ───────────────────────────────────────
  cancel: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [empRow] = await db.select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.userId, ctx.user.id)))
        .limit(1);
      const myIds = [ctx.user.id, ...(empRow ? [empRow.id] : [])];
      const [req] = await db.select().from(shiftChangeRequests)
        .where(and(
          eq(shiftChangeRequests.id, input.id),
          eq(shiftChangeRequests.companyId, companyId),
          or(...myIds.map(id => eq(shiftChangeRequests.employeeUserId, id)))
        ))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      if (req.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "Only pending requests can be cancelled" });
      await db.update(shiftChangeRequests)
        .set({ status: "cancelled" })
        .where(eq(shiftChangeRequests.id, input.id));
      return { success: true };
    }),

  // ── Admin: List all requests for the company ─────────────────────────────────
  adminList: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).default("pending"),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id);
      const companyId = input.companyId ?? membership.company.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const requests = await db.select({
        request: shiftChangeRequests,
        employee: {
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          position: employees.position,
          department: employees.department,
          avatarUrl: employees.avatarUrl,
        },
        preferredShift: {
          id: shiftTemplates.id,
          name: shiftTemplates.name,
          startTime: shiftTemplates.startTime,
          endTime: shiftTemplates.endTime,
        },
      })
        .from(shiftChangeRequests)
        .leftJoin(employees, or(
          eq(shiftChangeRequests.employeeUserId, employees.userId!),
          eq(shiftChangeRequests.employeeUserId, employees.id)
        ))
        .leftJoin(shiftTemplates, eq(shiftChangeRequests.preferredShiftId, shiftTemplates.id))
        .where(and(
          eq(shiftChangeRequests.companyId, companyId),
          input.status !== "all" ? eq(shiftChangeRequests.status, input.status) : undefined
        ))
        .orderBy(desc(shiftChangeRequests.createdAt))
        .limit(100);
      return requests;
    }),

  // ── Admin: Approve a request ──────────────────────────────────────────────────
  approve: protectedProcedure
    .input(z.object({
      id: z.number(),
      adminNotes: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id);
      const companyId = input.companyId ?? membership.company.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [req] = await db.select().from(shiftChangeRequests)
        .where(and(eq(shiftChangeRequests.id, input.id), eq(shiftChangeRequests.companyId, companyId)))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(shiftChangeRequests)
        .set({
          status: "approved",
          adminNotes: input.adminNotes ?? null,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(shiftChangeRequests.id, input.id));
      // Send in-app notification to the employee
      const typeLabel = req.requestType.replace(/_/g, " ");
      const loginUserId = await resolveLoginUserId(req.employeeUserId);
      await sendInAppNotification({
        toUserId: loginUserId,
        companyId,
        type: "shift_request_approved",
        title: `Request Approved ✓`,
        message: `Your ${typeLabel} request for ${req.requestedDate} has been approved.${
          input.adminNotes ? ` HR note: ${input.adminNotes}` : ""
        }`,
        link: "/my-portal?tab=requests",
        actorUserId: ctx.user.id,
      });
      return { success: true };
    }),

  // ── Admin: Reject a request ───────────────────────────────────────────────────
  reject: protectedProcedure
    .input(z.object({
      id: z.number(),
      adminNotes: z.string().min(1),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id);
      const companyId = input.companyId ?? membership.company.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [req] = await db.select().from(shiftChangeRequests)
        .where(and(eq(shiftChangeRequests.id, input.id), eq(shiftChangeRequests.companyId, companyId)))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(shiftChangeRequests)
        .set({
          status: "rejected",
          adminNotes: input.adminNotes,
          reviewedByUserId: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(shiftChangeRequests.id, input.id));
      // Send in-app notification to the employee
      const typeLabel2 = req.requestType.replace(/_/g, " ");
      const loginUserId2 = await resolveLoginUserId(req.employeeUserId);
      await sendInAppNotification({
        toUserId: loginUserId2,
        companyId,
        type: "shift_request_rejected",
        title: `Request Not Approved`,
        message: `Your ${typeLabel2} request for ${req.requestedDate} was not approved. Reason: ${input.adminNotes}`,
        link: "/my-portal?tab=requests",
        actorUserId: ctx.user.id,
      });
      return { success: true };
    }),

  // ── Employee: Upload attachment for a request ──────────────────────────────
  uploadAttachment: protectedProcedure
    .input(z.object({
      fileBase64: z.string(),
      fileName: z.string(),
      mimeType: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const ext = input.fileName.split(".").pop() ?? "pdf";
      const key = `shift-request-attachments/${companyId}/${ctx.user.id}-${randomSuffix()}.${ext}`;
      const buffer = Buffer.from(input.fileBase64, "base64");
      const { url } = await storagePut(key, buffer, input.mimeType ?? "application/octet-stream");
      return { url };
    }),

  // ── Admin: Stats summary ──────────────────────────────────────────────────────
  adminStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const membership = await requireAdminOrHR(ctx.user.id);
      const companyId = input.companyId ?? membership.company.id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const all = await db.select({ status: shiftChangeRequests.status })
        .from(shiftChangeRequests)
        .where(eq(shiftChangeRequests.companyId, companyId));
      return {
        pending: all.filter((r: { status: string }) => r.status === "pending").length,
        approved: all.filter((r: { status: string }) => r.status === "approved").length,
        rejected: all.filter((r: { status: string }) => r.status === "rejected").length,
        total: all.length,
      };
    }),
});
