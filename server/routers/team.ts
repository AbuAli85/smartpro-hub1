import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
} from "../db";
import { getActiveCompanyMembership } from "../_core/membership";
import { requireNotAuditor } from "../_core/membership";
import { assertRowBelongsToActiveCompany } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";

// ─── helpers ─────────────────────────────────────────────────────────────────

async function requireCompanyId(userId: number): Promise<number> {
  const m = await getActiveCompanyMembership(userId);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
  return m.companyId;
}

async function requireMembership(userId: number) {
  const m = await getActiveCompanyMembership(userId);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
  return m;
}

// ─── router ──────────────────────────────────────────────────────────────────

export const teamRouter = router({
  /** List all staff for the caller's company, with optional search + filters */
  listMembers: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z.enum(["active", "on_leave", "terminated", "resigned"]).optional(),
        department: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const companyId = await requireCompanyId(ctx.user.id);
      const rows = await getEmployees(companyId, {
        status: input.status,
        department: input.department,
      });
      if (!input.search) return rows;
      const q = input.search.toLowerCase();
      return rows.filter(
        (e) =>
          e.firstName.toLowerCase().includes(q) ||
          e.lastName.toLowerCase().includes(q) ||
          (e.email ?? "").toLowerCase().includes(q) ||
          (e.position ?? "").toLowerCase().includes(q) ||
          (e.department ?? "").toLowerCase().includes(q)
      );
    }),

  /** Full profile of a single staff member */
  getMember: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      await assertRowBelongsToActiveCompany(ctx.user, emp.companyId, "Staff member");
      return emp;
    }),

  /** Add a new staff member */
  addMember: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        nationalId: z.string().optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        employmentType: z
          .enum(["full_time", "part_time", "contract", "intern"])
          .default("full_time"),
        salary: z.number().positive().optional(),
        currency: z.string().default("OMR"),
        hireDate: z.string().optional(),
        employeeNumber: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user.id);
      requireNotAuditor(membership.role, "External Auditors cannot add staff.");
      await createEmployee({
        ...input,
        email: input.email || undefined,
        companyId: membership.companyId,
        salary: input.salary != null ? String(input.salary) : undefined,
        hireDate: input.hireDate ? new Date(input.hireDate) : undefined,
      });
      return { success: true };
    }),

  /** Update staff member details */
  updateMember: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        status: z.enum(["active", "on_leave", "terminated", "resigned"]).optional(),
        salary: z.number().positive().optional(),
        employmentType: z
          .enum(["full_time", "part_time", "contract", "intern"])
          .optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        nationalId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user.id);
      requireNotAuditor(membership.role, "External Auditors cannot update staff.");
      const { id, ...data } = input;
      const existing = await getEmployeeById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "Staff member");
      const updateData: Record<string, unknown> = { ...data };
      if (data.salary != null) updateData.salary = String(data.salary);
      if ("email" in data && data.email === "") updateData.email = null;
      await updateEmployee(id, updateData as any);
      return { success: true };
    }),

  /** Soft-delete / offboard a staff member (sets status to terminated) */
  removeMember: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user.id);
      requireNotAuditor(membership.role, "External Auditors cannot remove staff.");
      const existing = await getEmployeeById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "Staff member");
      await updateEmployee(input.id, {
        status: "terminated",
        terminationDate: new Date(),
      } as any);
      return { success: true };
    }),

  /** Team statistics: headcount, status breakdown, department breakdown, recent hires */
  getTeamStats: protectedProcedure.query(async ({ ctx }) => {
    const companyId = await requireCompanyId(ctx.user.id);
    const all = await getEmployees(companyId, {});

    const byStatus: Record<string, number> = {};
    const byDept: Record<string, number> = {};
    const recentHires: typeof all = [];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const e of all) {
      byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
      const dept = e.department ?? "Unassigned";
      byDept[dept] = (byDept[dept] ?? 0) + 1;
      if (e.hireDate && new Date(e.hireDate) >= thirtyDaysAgo) {
        recentHires.push(e);
      }
    }

    return {
      total: all.length,
      active: byStatus["active"] ?? 0,
      onLeave: byStatus["on_leave"] ?? 0,
      terminated: byStatus["terminated"] ?? 0,
      resigned: byStatus["resigned"] ?? 0,
      byStatus,
      byDepartment: Object.entries(byDept)
        .map(([dept, count]) => ({ dept, count }))
        .sort((a, b) => b.count - a.count),
      recentHires: recentHires.slice(0, 5),
    };
  }),
});
