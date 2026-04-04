import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { departments, positions, employees } from "../../drizzle/schema";
import { getDb, getUserCompany, getUserCompanyById } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

async function getMembership(userId: number, companyId?: number | null) {
  if (companyId) return getUserCompanyById(userId, companyId);
  return getUserCompany(userId);
}

export const orgStructureRouter = router({
  // ── Departments ─────────────────────────────────────────────────────────────
  listDepartments: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const membership = await getMembership(ctx.user.id, input?.companyId);
      if (!membership) return [];
      const db = await requireDb();
      const depts = await db
        .select()
        .from(departments)
        .where(and(eq(departments.companyId, membership.company.id), eq(departments.isActive, true)))
        .orderBy(asc(departments.name));

      const emps = await db
        .select({ id: employees.id, department: employees.department })
        .from(employees)
        .where(and(eq(employees.companyId, membership.company.id), eq(employees.status, "active")));

      return depts.map((d) => ({
        ...d,
        employeeCount: emps.filter((e) => e.department === d.name).length,
      }));
    }),

  createDepartment: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      nameAr: z.string().max(128).optional(),
      description: z.string().optional(),
      headEmployeeId: z.number().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
      const db = await requireDb();
      const { companyId: _cid, ...rest } = input;
      const [result] = await db.insert(departments).values({
        companyId: membership.company.id,
        name: rest.name,
        nameAr: rest.nameAr,
        description: rest.description,
        headEmployeeId: rest.headEmployeeId,
      });
      return { id: (result as any).insertId };
    }),

  updateDepartment: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(128).optional(),
      nameAr: z.string().max(128).optional(),
      description: z.string().optional(),
      headEmployeeId: z.number().nullable().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [existing] = await db.select().from(departments).where(eq(departments.id, input.id));
      if (!existing || existing.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });
      const { id, companyId: _cid, ...data } = input;
      await db.update(departments).set(data as any).where(eq(departments.id, id));
      return { success: true };
    }),

  deleteDepartment: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [existing] = await db.select().from(departments).where(eq(departments.id, input.id));
      if (!existing || existing.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND", message: "Department not found" });
      await db.update(departments).set({ isActive: false }).where(eq(departments.id, input.id));
      return { success: true };
    }),

  // ── Positions ────────────────────────────────────────────────────────────────
  listPositions: protectedProcedure
    .input(z.object({ departmentId: z.number().optional(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) return [];
      const db = await requireDb();
      const rows = await db
        .select()
        .from(positions)
        .where(and(eq(positions.companyId, membership.company.id), eq(positions.isActive, true)))
        .orderBy(asc(positions.title));
      if (input.departmentId) return rows.filter((p) => p.departmentId === input.departmentId);
      return rows;
    }),

  createPosition: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(128),
      titleAr: z.string().max(128).optional(),
      departmentId: z.number().optional(),
      description: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const { companyId: _cid, ...rest } = input;
      const [result] = await db.insert(positions).values({
        companyId: membership.company.id,
        title: rest.title,
        titleAr: rest.titleAr,
        departmentId: rest.departmentId,
        description: rest.description,
      });
      return { id: (result as any).insertId };
    }),

  updatePosition: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(128).optional(),
      titleAr: z.string().max(128).optional(),
      departmentId: z.number().nullable().optional(),
      description: z.string().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [existing] = await db.select().from(positions).where(eq(positions.id, input.id));
      if (!existing || existing.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
      const { id, companyId: _cid, ...data } = input;
      await db.update(positions).set(data as any).where(eq(positions.id, id));
      return { success: true };
    }),

  deletePosition: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await requireDb();
      const [existing] = await db.select().from(positions).where(eq(positions.id, input.id));
      if (!existing || existing.companyId !== membership.company.id)
        throw new TRPCError({ code: "NOT_FOUND", message: "Position not found" });
      await db.update(positions).set({ isActive: false }).where(eq(positions.id, input.id));
      return { success: true };
    }),

  // ── Org Chart Data ────────────────────────────────────────────────────────────
  getOrgChartData: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getMembership(ctx.user.id, input.companyId);
      if (!membership) return { departments: [], unassigned: [] };
      const db = await requireDb();
      const cid = membership.company.id;

      const [depts, pos, emps] = await Promise.all([
        db.select().from(departments)
          .where(and(eq(departments.companyId, cid), eq(departments.isActive, true)))
          .orderBy(asc(departments.name)),
        db.select().from(positions)
          .where(and(eq(positions.companyId, cid), eq(positions.isActive, true)))
          .orderBy(asc(positions.title)),
        db.select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          position: employees.position,
          department: employees.department,
          managerId: employees.managerId,
          status: employees.status,
        }).from(employees)
          .where(and(eq(employees.companyId, cid), eq(employees.status, "active"))),
      ]);

      const deptNodes = depts.map((d) => {
        const deptPositions = pos.filter((p) => p.departmentId === d.id);
        const deptEmployees = emps.filter((e) => e.department === d.name);
        const head = d.headEmployeeId ? emps.find((e) => e.id === d.headEmployeeId) : null;
        return {
          id: d.id,
          name: d.name,
          nameAr: d.nameAr,
          description: d.description,
          headEmployeeId: d.headEmployeeId,
          headName: head ? `${head.firstName} ${head.lastName}` : null,
          employeeCount: deptEmployees.length,
          positions: deptPositions.map((p) => ({
            id: p.id,
            title: p.title,
            titleAr: p.titleAr,
            employeeCount: deptEmployees.filter((e) => e.position === p.title).length,
          })),
          employees: deptEmployees.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName}`,
            position: e.position ?? null,
            managerId: e.managerId ?? null,
          })),
        };
      });

      const assignedDeptNames = new Set(depts.map((d) => d.name));
      const unassigned = emps
        .filter((e) => !e.department || !assignedDeptNames.has(e.department))
        .map((e) => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
          position: e.position ?? null,
          department: e.department ?? null,
        }));

      return { departments: deptNodes, unassigned };
    }),
});
