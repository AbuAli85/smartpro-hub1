import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";
import { getActiveCompanyMembership } from "../_core/membership";
import { getDb } from "../db";
import {
  promoterAssignments,
  companies,
  employees,
} from "../../drizzle/schema";
import { randomUUID } from "crypto";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";

export const promoterAssignmentsRouter = router({
  /** List all promoter assignments for the active company */
  list: protectedProcedure.query(async ({ ctx }) => {
    const companyId = await requireActiveCompanyId(ctx.user.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const rows = await db
      .select()
      .from(promoterAssignments)
      .where(eq(promoterAssignments.companyId, companyId))
      .orderBy(desc(promoterAssignments.createdAt));

    // Enrich with company and employee names
    const companyIds = [...new Set(rows.flatMap((r) => [r.firstPartyCompanyId, r.secondPartyCompanyId]))];
    const employeeIds = [...new Set(rows.map((r) => r.promoterEmployeeId))];

    const companiesData = companyIds.length
      ? await db.select({ id: companies.id, name: companies.name, nameAr: companies.nameAr })
          .from(companies)
          .where(or(...companyIds.map((id) => eq(companies.id, id))))
      : [];

    const employeesData = employeeIds.length
      ? await db.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, firstNameAr: employees.firstNameAr, lastNameAr: employees.lastNameAr })
          .from(employees)
          .where(or(...employeeIds.map((id) => eq(employees.id, id))))
      : [];

    const companyMap = new Map(companiesData.map((c) => [c.id, c]));
    const employeeMap = new Map(employeesData.map((e) => [e.id, e]));

    return rows.map((r) => {
      const fp = companyMap.get(r.firstPartyCompanyId);
      const sp = companyMap.get(r.secondPartyCompanyId);
      const emp = employeeMap.get(r.promoterEmployeeId);
      return {
        ...r,
        firstPartyName: fp?.name ?? `Company #${r.firstPartyCompanyId}`,
        secondPartyName: sp?.name ?? `Company #${r.secondPartyCompanyId}`,
        promoterName: emp
          ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || `Employee #${r.promoterEmployeeId}`
          : `Employee #${r.promoterEmployeeId}`,
      };
    });
  }),

  /** Create a new promoter assignment */
  create: protectedProcedure
    .input(
      z.object({
        firstPartyCompanyId: z.number().int().positive(),
        secondPartyCompanyId: z.number().int().positive(),
        promoterEmployeeId: z.number().int().positive(),
        locationAr: z.string().min(1, "Arabic location is required"),
        locationEn: z.string().min(1, "English location is required"),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
        contractReferenceNumber: z.string().optional(),
        issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        status: z.enum(["active", "inactive", "expired"]).default("active"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const membership = await getActiveCompanyMembership(ctx.user.id, companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const id = randomUUID();
      await db.insert(promoterAssignments).values({
        id,
        companyId,
        firstPartyCompanyId: input.firstPartyCompanyId,
        secondPartyCompanyId: input.secondPartyCompanyId,
        promoterEmployeeId: input.promoterEmployeeId,
        locationAr: input.locationAr,
        locationEn: input.locationEn,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        status: input.status,
        contractReferenceNumber: input.contractReferenceNumber ?? null,
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
      });

      return { id };
    }),

  /** Delete a promoter assignment */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = await requireActiveCompanyId(ctx.user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [row] = await db
        .select({ id: promoterAssignments.id, companyId: promoterAssignments.companyId })
        .from(promoterAssignments)
        .where(eq(promoterAssignments.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
      if (row.companyId !== companyId && !canAccessGlobalAdminProcedures(ctx.user)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your assignment" });
      }

      await db.delete(promoterAssignments).where(eq(promoterAssignments.id, input.id));
      return { success: true };
    }),

  /** List companies available for party selection (companies the user has access to) */
  listAvailableCompanies: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db
      .select({ id: companies.id, name: companies.name, nameAr: companies.nameAr, crNumber: companies.crNumber, registrationNumber: companies.registrationNumber })
      .from(companies)
      .orderBy(companies.name);
  }),

  /** List employees for promoter selection */
  listAvailableEmployees: protectedProcedure
    .input(z.object({ companyId: z.number().int().positive().optional() }))
    .query(async ({ ctx, input }) => {
      const activeCompanyId = await requireActiveCompanyId(ctx.user.id);
      const targetCompanyId = input.companyId ?? activeCompanyId;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      return db
        .select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          firstNameAr: employees.firstNameAr,
          lastNameAr: employees.lastNameAr,
          nationalId: employees.nationalId,
          passportNumber: employees.passportNumber,
          jobTitle: employees.jobTitle,
        })
        .from(employees)
        .where(and(eq(employees.companyId, targetCompanyId), eq(employees.status, "active")))
        .orderBy(employees.firstName);
    }),
});
