import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getCompanies, getDb, getUserCompanies } from "../db";
import {
  attendanceSites,
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
   * Work locations (attendance sites) for the client / first party only — where the promoter will work.
   */
  listClientWorkLocations: protectedProcedure
    .input(z.object({ clientCompanyId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);

      if (!isPlatform) {
        await requireActiveCompanyId(ctx.user.id);
        await requireCanManagePromoterAssignments(ctx.user, input.clientCompanyId);
      }

      return db
        .select({
          id: attendanceSites.id,
          name: attendanceSites.name,
          location: attendanceSites.location,
          clientName: attendanceSites.clientName,
        })
        .from(attendanceSites)
        .where(
          and(
            eq(attendanceSites.companyId, input.clientCompanyId),
            eq(attendanceSites.isActive, true)
          )
        )
        .orderBy(desc(attendanceSites.createdAt));
    }),

  /**
   * Employees of the employer (second party) eligible as promoters.
   * Permission is checked against the selected client (first party), not only the workspace active company.
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
        await requireCanManagePromoterAssignments(ctx.user, clientId);
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
          status: employees.status,
        })
        .from(employees)
        .where(
          and(
            eq(employees.companyId, input.employerCompanyId),
            inArray(employees.status, ["active", "on_leave"])
          )
        )
        .orderBy(asc(employees.lastName), asc(employees.firstName));

      return rows;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id);
    await requireCanManagePromoterAssignments(ctx.user, activeId);
    const db = await getDb();
    if (!db) return [];

    const firstParty = alias(companies, "pa_list_first_party");
    const secondParty = alias(companies, "pa_list_second_party");

    const base = db
      .select({
        id: promoterAssignments.id,
        companyId: promoterAssignments.companyId,
        firstPartyCompanyId: promoterAssignments.firstPartyCompanyId,
        secondPartyCompanyId: promoterAssignments.secondPartyCompanyId,
        clientSiteId: promoterAssignments.clientSiteId,
        promoterEmployeeId: promoterAssignments.promoterEmployeeId,
        locationAr: promoterAssignments.locationAr,
        locationEn: promoterAssignments.locationEn,
        startDate: promoterAssignments.startDate,
        endDate: promoterAssignments.endDate,
        status: promoterAssignments.status,
        contractReferenceNumber: promoterAssignments.contractReferenceNumber,
        issueDate: promoterAssignments.issueDate,
        createdAt: promoterAssignments.createdAt,
        updatedAt: promoterAssignments.updatedAt,
        firstPartyName: firstParty.name,
        secondPartyName: secondParty.name,
        promoterFirstName: employees.firstName,
        promoterLastName: employees.lastName,
      })
      .from(promoterAssignments)
      .leftJoin(firstParty, eq(firstParty.id, promoterAssignments.firstPartyCompanyId))
      .leftJoin(secondParty, eq(secondParty.id, promoterAssignments.secondPartyCompanyId))
      .leftJoin(employees, eq(employees.id, promoterAssignments.promoterEmployeeId));

    const rows = canAccessGlobalAdminProcedures(ctx.user)
      ? await base.orderBy(desc(promoterAssignments.createdAt))
      : await base
          .where(eq(promoterAssignments.companyId, activeId))
          .orderBy(desc(promoterAssignments.createdAt));

    return rows.map((r) => {
      const promoterName =
        `${r.promoterFirstName ?? ""} ${r.promoterLastName ?? ""}`.trim() || `Employee #${r.promoterEmployeeId}`;
      return {
        id: r.id,
        companyId: r.companyId,
        firstPartyCompanyId: r.firstPartyCompanyId,
        secondPartyCompanyId: r.secondPartyCompanyId,
        clientSiteId: r.clientSiteId,
        promoterEmployeeId: r.promoterEmployeeId,
        locationAr: r.locationAr,
        locationEn: r.locationEn,
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
        contractReferenceNumber: r.contractReferenceNumber,
        issueDate: r.issueDate,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        firstPartyName: r.firstPartyName ?? "Unknown company",
        secondPartyName: r.secondPartyName ?? "Unknown company",
        promoterName,
      };
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const activeId = await requireActiveCompanyId(ctx.user.id);
      const [row] = await db
        .select({ id: promoterAssignments.id, companyId: promoterAssignments.companyId })
        .from(promoterAssignments)
        .where(eq(promoterAssignments.id, input.id))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
      }

      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await requireCanManagePromoterAssignments(ctx.user, activeId);
        if (row.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You cannot delete this assignment" });
        }
      }

      await db.delete(promoterAssignments).where(eq(promoterAssignments.id, input.id));
      return { ok: true as const };
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
        /** Optional: attendance site on the client (first party) — documents where the work happens */
        clientSiteId: z.number().int().positive().optional(),
        status: z.enum(["active", "inactive", "expired"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);

      if (!isPlatform) {
        await requireActiveCompanyId(ctx.user.id);
        await requireCanManagePromoterAssignments(ctx.user, input.clientCompanyId);
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

      let clientSiteId: number | null = null;
      if (input.clientSiteId != null) {
        const [site] = await db
          .select({ id: attendanceSites.id })
          .from(attendanceSites)
          .where(
            and(
              eq(attendanceSites.id, input.clientSiteId),
              eq(attendanceSites.companyId, input.clientCompanyId),
              eq(attendanceSites.isActive, true)
            )
          )
          .limit(1);
        if (!site) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Work location must be an active site belonging to the client (first party)",
          });
        }
        clientSiteId = site.id;
      }

      const id = crypto.randomUUID();
      const issue = input.issueDate?.trim();
      const row: InsertPromoterAssignment = {
        id,
        companyId: input.clientCompanyId,
        firstPartyCompanyId: input.clientCompanyId,
        secondPartyCompanyId: input.employerCompanyId,
        clientSiteId,
        promoterEmployeeId: input.promoterEmployeeId,
        locationAr: input.locationAr,
        locationEn: input.locationEn,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        contractReferenceNumber: input.contractReferenceNumber?.trim() || null,
        issueDate: issue ? new Date(issue) : null,
        status: input.status ?? "active",
      };
      await db.insert(promoterAssignments).values(row);

      return { id };
    }),
});
