import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getCompanies, getDb, getUserCompanies } from "../db";
import {
  companies,
  employees,
  promoterAssignments,
  type InsertPromoterAssignment,
} from "../../drizzle/schema";
import {
  getActiveCompanyMembership,
  requireNotAuditor,
} from "../_core/membership";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";

const ASSIGNMENT_ROLES = ["company_admin", "hr_admin"] as const;

async function requireCanManagePromoterAssignments(
  user: { id: number; role?: string | null; platformRole?: string | null },
  companyId: number
): Promise<void> {
  const m = await getActiveCompanyMembership(user.id, companyId);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  requireNotAuditor(m.role);
  if (!canAccessGlobalAdminProcedures(user) && !(ASSIGNMENT_ROLES as readonly string[]).includes(m.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only company administrators and HR can manage promoter assignments.",
    });
  }
}

export const promoterAssignmentsRouter = router({
  /**
   * Client (first party) options: companies the user belongs to.
   * Employer (second party) options: other active companies (tenant) or full list (platform admin).
   */
  companiesForPartyPickers: protectedProcedure
    .input(z.object({ clientCompanyId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id);
    await requireCanManagePromoterAssignments(ctx.user, activeId);
    const db = await getDb();
    if (!db) {
      return {
        clientOptions: [] as { id: number; name: string; nameAr: string | null }[],
        employerOptions: [] as { id: number; name: string; nameAr: string | null }[],
      };
    }

    if (canAccessGlobalAdminProcedures(ctx.user)) {
      const all = await getCompanies();
      const slim = all
        .filter((c) => c.status === "active")
        .map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr ?? null }));
      slim.sort((a, b) => a.name.localeCompare(b.name));
      return { clientOptions: slim, employerOptions: slim };
    }

    const userCos = await getUserCompanies(ctx.user.id);
    const clientOptions = userCos.map((r) => ({
      id: r.company.id,
      name: r.company.name,
      nameAr: r.company.nameAr ?? null,
    }));

    const excludeForEmployer = input?.clientCompanyId ?? activeId;
    const employerRows = await db
      .select({ id: companies.id, name: companies.name, nameAr: companies.nameAr })
      .from(companies)
      .where(and(eq(companies.status, "active"), ne(companies.id, excludeForEmployer)))
      .orderBy(asc(companies.name));

    const employerOptions = employerRows.map((c) => ({
      id: c.id,
      name: c.name,
      nameAr: c.nameAr ?? null,
    }));

    return { clientOptions, employerOptions };
  }),

  /**
   * Active employees of the employer (second party). Caller must represent the client (active company).
   */
  listEmployerEmployees: protectedProcedure
    .input(
      z.object({
        employerCompanyId: z.number().int().positive(),
        clientCompanyId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      const activeId = await requireActiveCompanyId(ctx.user.id);
      const clientId = input.clientCompanyId ?? activeId;

      if (isPlatform && input.clientCompanyId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select the client company before loading employer employees",
        });
      }

      if (!isPlatform) {
        await requireCanManagePromoterAssignments(ctx.user, activeId);
        if (clientId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Client company must match your active company" });
        }
      }

      if (input.employerCompanyId === clientId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Employer must differ from client company" });
      }

      const rows = await db
        .select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          firstNameAr: employees.firstNameAr,
          lastNameAr: employees.lastNameAr,
          nationalId: employees.nationalId,
          passportNumber: employees.passportNumber,
        })
        .from(employees)
        .where(and(eq(employees.companyId, input.employerCompanyId), eq(employees.status, "active")))
        .orderBy(asc(employees.lastName), asc(employees.firstName));

      return rows;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id);
    await requireCanManagePromoterAssignments(ctx.user, activeId);
    const db = await getDb();
    if (!db) return [];
    if (canAccessGlobalAdminProcedures(ctx.user)) {
      return db.select().from(promoterAssignments).orderBy(desc(promoterAssignments.createdAt));
    }
    return db
      .select()
      .from(promoterAssignments)
      .where(eq(promoterAssignments.companyId, activeId))
      .orderBy(desc(promoterAssignments.createdAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        clientCompanyId: z.number().int().positive(),
        employerCompanyId: z.number().int().positive(),
        promoterEmployeeId: z.number().int().positive(),
        locationAr: z.string().min(1),
        locationEn: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
        contractReferenceNumber: z.string().optional(),
        issueDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      const activeId = await requireActiveCompanyId(ctx.user.id);

      if (!isPlatform) {
        await requireCanManagePromoterAssignments(ctx.user, activeId);
        if (input.clientCompanyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Client company must match your active company" });
        }
      }

      if (input.clientCompanyId === input.employerCompanyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Client and employer must be different companies" });
      }

      const [emp] = await db
        .select({ id: employees.id, companyId: employees.companyId })
        .from(employees)
        .where(eq(employees.id, input.promoterEmployeeId))
        .limit(1);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      if (emp.companyId !== input.employerCompanyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Promoter must be an employee of the employer (second party) company",
        });
      }

      const id = crypto.randomUUID();
      const issue = input.issueDate?.trim();
      const row: InsertPromoterAssignment = {
        id,
        companyId: input.clientCompanyId,
        firstPartyCompanyId: input.clientCompanyId,
        secondPartyCompanyId: input.employerCompanyId,
        promoterEmployeeId: input.promoterEmployeeId,
        locationAr: input.locationAr,
        locationEn: input.locationEn,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        contractReferenceNumber: input.contractReferenceNumber?.trim() || null,
        issueDate: issue ? new Date(issue) : null,
        status: "active",
      };
      await db.insert(promoterAssignments).values(row);

      return { id };
    }),
});
