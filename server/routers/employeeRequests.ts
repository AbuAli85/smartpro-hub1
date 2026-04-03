import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  employeeRequests,
  employees,
  companyMembers,
  users,
} from "../../drizzle/schema";
import { getDb, getUserCompany } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { Resend } from "resend";
import { ENV } from "../_core/env";

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!ENV.resendApiKey) return;
  const resend = new Resend(ENV.resendApiKey);
  await resend.emails.send({
    from: "SmartPRO Hub <noreply@thesmartpro.io>",
    to,
    subject,
    html,
  });
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function resolveMyEmployee(userId: number, userEmail: string, companyId: number) {
  const db = await getDb();
  if (!db) return null;
  const [byUserId] = await db
    .select()
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.userId, userId)))
    .limit(1);
  if (byUserId) return byUserId;
  if (userEmail) {
    const [byEmail] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.email, userEmail)))
      .limit(1);
    return byEmail ?? null;
  }
  return null;
}

const REQUEST_TYPES = ["leave", "document", "overtime", "expense", "equipment", "training", "other"] as const;

export const employeeRequestsRouter = router({
  // ─── Employee: Submit a new request ──────────────────────────────────────
  submit: protectedProcedure
    .input(z.object({
      type: z.enum(REQUEST_TYPES),
      subject: z.string().min(1).max(255),
      details: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee record not found" });

      const [result] = await db.insert(employeeRequests).values({
        companyId: membership.company.id,
        employeeId: emp.id,
        type: input.type,
        subject: input.subject,
        details: input.details ?? null,
        status: "pending",
      });
      const reqId = (result as any).insertId;
      const [req] = await db.select().from(employeeRequests).where(eq(employeeRequests.id, reqId)).limit(1);

      // Notify HR admin by email (fire-and-forget)
      const hrAdmins = await db
        .select({ userId: companyMembers.userId })
        .from(companyMembers)
        .where(and(
          eq(companyMembers.companyId, membership.company.id),
          eq(companyMembers.role, "hr_admin"),
          eq(companyMembers.isActive, true),
        ));
      if (hrAdmins.length > 0) {
        const hrUserIds = hrAdmins.map(h => h.userId);
        const hrUsers = await db
          .select({ email: users.email, name: users.name })
          .from(users)
          .where(inArray(users.id, hrUserIds));
        for (const hr of hrUsers) {
          if (hr.email) {
            sendEmail({
              to: hr.email,
              subject: `New Employee Request: ${input.subject}`,
              html: `
                <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
                  <h2 style="color:#1a1a2e">New Employee Request</h2>
                  <p>A new <strong>${input.type}</strong> request has been submitted by <strong>${emp.firstName} ${emp.lastName}</strong>.</p>
                  <table style="width:100%;border-collapse:collapse;margin:16px 0">
                    <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Type</td><td style="padding:8px">${input.type}</td></tr>
                    <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Subject</td><td style="padding:8px">${input.subject}</td></tr>
                    <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Employee</td><td style="padding:8px">${emp.firstName} ${emp.lastName}</td></tr>
                  </table>
                  <p>Please log in to SmartPRO Hub to review and action this request.</p>
                </div>
              `,
            }).catch(() => {});
          }
        }
      }

      return req;
    }),

  // ─── Employee: List own requests ──────────────────────────────────────────
  myRequests: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) return [];
      const db = await requireDb();
      const emp = await resolveMyEmployee(ctx.user.id, ctx.user.email ?? "", membership.company.id);
      if (!emp) return [];
      return db
        .select()
        .from(employeeRequests)
        .where(eq(employeeRequests.employeeId, emp.id))
        .orderBy(desc(employeeRequests.createdAt))
        .limit(input.limit);
    }),

  // ─── Admin/HR: List all requests with optional status filter ─────────────
  adminList: protectedProcedure
    .input(z.object({
      companyId: z.number().optional(),
      status: z.enum(["pending", "approved", "rejected", "cancelled", "all"]).default("all"),
      type: z.enum([...REQUEST_TYPES, "all"]).default("all"),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const role = membership.member.role;
      if (role !== "company_admin" && role !== "hr_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required" });
      }
      const companyId = input.companyId ?? membership.company.id;
      const db = await requireDb();

      const conditions = [eq(employeeRequests.companyId, companyId)];
      if (input.status !== "all") conditions.push(eq(employeeRequests.status, input.status));
      if (input.type !== "all") conditions.push(eq(employeeRequests.type, input.type as any));

      const requests = await db
        .select({
          request: employeeRequests,
          employee: {
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            position: employees.position,
            department: employees.department,
          },
        })
        .from(employeeRequests)
        .innerJoin(employees, eq(employeeRequests.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(employeeRequests.createdAt))
        .limit(input.limit);

      return requests;
    }),

  // ─── Admin/HR: Update request status (approve/reject) ────────────────────
  updateStatus: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      status: z.enum(["approved", "rejected", "cancelled"]),
      adminNote: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const membership = await getUserCompany(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const role = membership.member.role;
      if (role !== "company_admin" && role !== "hr_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "HR Admin or Company Admin required" });
      }
      const db = await requireDb();

      const [req] = await db
        .select()
        .from(employeeRequests)
        .where(and(
          eq(employeeRequests.id, input.requestId),
          eq(employeeRequests.companyId, membership.company.id),
        ))
        .limit(1);
      if (!req) throw new TRPCError({ code: "NOT_FOUND" });

      await db.update(employeeRequests).set({
        status: input.status,
        adminNote: input.adminNote ?? null,
        reviewedByUserId: ctx.user.id,
        reviewedAt: new Date(),
      }).where(eq(employeeRequests.id, input.requestId));

      // Notify employee by email (fire-and-forget)
      const [emp] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, req.employeeId))
        .limit(1);
      if (emp?.email) {
        const statusLabel = input.status === "approved" ? "✅ Approved" : input.status === "rejected" ? "❌ Rejected" : "Cancelled";
        sendEmail({
          to: emp.email,
          subject: `Your Request Has Been ${input.status.charAt(0).toUpperCase() + input.status.slice(1)}: ${req.subject}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
              <h2 style="color:#1a1a2e">Request Update</h2>
              <p>Your <strong>${req.type}</strong> request has been <strong>${statusLabel}</strong>.</p>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Request</td><td style="padding:8px">${req.subject}</td></tr>
                <tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Status</td><td style="padding:8px">${statusLabel}</td></tr>
                ${input.adminNote ? `<tr><td style="padding:8px;background:#f5f5f5;font-weight:600">Note</td><td style="padding:8px">${input.adminNote}</td></tr>` : ""}
              </table>
              <p>Log in to SmartPRO Hub to view the full details.</p>
            </div>
          `,
        }).catch(() => {});
      }

      const [updated] = await db.select().from(employeeRequests).where(eq(employeeRequests.id, input.requestId)).limit(1);
      return updated;
    }),
});
