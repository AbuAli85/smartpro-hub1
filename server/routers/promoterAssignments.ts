/**
 * Legacy promoter assignments router — kept intact for backward compatibility.
 *
 * Dual-write: every create also writes into the new normalized CMS tables
 * (outsourcing_contracts + related). The list query now surfaces contracts
 * where the active company is EITHER the first party OR the second party
 * (ADR-001: role is per-contract, not per company).
 *
 * An `update` mutation has been added so existing assignments can be edited.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
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
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createOutsourcingContractFull,
  outsourcingContractExistsForId,
  updateOutsourcingContract,
  appendContractEvent,
} from "../modules/contractManagement/contractManagement.repository";

const ASSIGNMENT_ROLES = ["company_admin", "hr_admin"] as const;

async function requireCanManagePromoterAssignments(
  user: { id: number; role?: string | null; platformRole?: string | null },
  companyId: number
): Promise<void> {
  const m = await getActiveCompanyMembership(user.id, companyId);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  requireNotAuditor(m.role);
  if (
    !canAccessGlobalAdminProcedures(user) &&
    !(ASSIGNMENT_ROLES as readonly string[]).includes(m.role)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only company administrators and HR admins can manage promoter assignments.",
    });
  }
}

export const promoterAssignmentsRouter = router({
  // ─── COMPANY / PARTY PICKERS ────────────────────────────────────────────────

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
          .map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr ?? null }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return { clientOptions: slim, employerOptions: slim };
      }

      const userCos = await getUserCompanies(ctx.user.id);
      const clientOptions = userCos.map((r) => ({
        id: r.company.id,
        name: r.company.name,
        nameAr: r.company.nameAr ?? null,
      }));

      const excludeId = input?.clientCompanyId ?? activeId;
      const employerRows = await db
        .select({ id: companies.id, name: companies.name, nameAr: companies.nameAr })
        .from(companies)
        .where(and(eq(companies.status, "active"), ne(companies.id, excludeId)))
        .orderBy(asc(companies.name));

      return {
        clientOptions,
        employerOptions: employerRows.map((c) => ({
          id: c.id,
          name: c.name,
          nameAr: c.nameAr ?? null,
        })),
      };
    }),

  // ─── WORK LOCATIONS ────────────────────────────────────────────────────────

  /** Attendance sites belonging to the first party (client) — work location picker. */
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

  // ─── EMPLOYER EMPLOYEES ────────────────────────────────────────────────────

  /** Active and on-leave employees of the employer (second party). */
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

      return db
        .select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          firstNameAr: employees.firstNameAr,
          lastNameAr: employees.lastNameAr,
          nationalId: employees.nationalId,
          passportNumber: employees.passportNumber,
          nationality: employees.nationality,
          position: employees.position,
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
    }),

  // ─── LIST ──────────────────────────────────────────────────────────────────

  /**
   * List assignments visible to the active company.
   * ADR-001: a company sees contracts where it is either first_party OR second_party.
   * Previously only first_party (companyId) was checked — employer was invisible.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id);
    await requireCanManagePromoterAssignments(ctx.user, activeId);
    const db = await getDb();
    if (!db) return [];

    const fpAlias = alias(companies, "pa_fp");
    const spAlias = alias(companies, "pa_sp");

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
        firstPartyName: fpAlias.name,
        secondPartyName: spAlias.name,
        promoterFirstName: employees.firstName,
        promoterLastName: employees.lastName,
        promoterNationalId: employees.nationalId,
        promoterPassportNumber: employees.passportNumber,
        promoterNationality: employees.nationality,
      })
      .from(promoterAssignments)
      .leftJoin(fpAlias, eq(fpAlias.id, promoterAssignments.firstPartyCompanyId))
      .leftJoin(spAlias, eq(spAlias.id, promoterAssignments.secondPartyCompanyId))
      .leftJoin(employees, eq(employees.id, promoterAssignments.promoterEmployeeId));

    const rows = canAccessGlobalAdminProcedures(ctx.user)
      ? await base.orderBy(desc(promoterAssignments.createdAt))
      : await base
          // FIX: expose to BOTH first party and second party (ADR-001)
          .where(
            or(
              eq(promoterAssignments.companyId, activeId),
              eq(promoterAssignments.secondPartyCompanyId, activeId)
            )
          )
          .orderBy(desc(promoterAssignments.createdAt));

    return rows.map((r) => {
      const promoterName =
        `${r.promoterFirstName ?? ""} ${r.promoterLastName ?? ""}`.trim() ||
        `Employee #${r.promoterEmployeeId}`;
      // Determine the active company's role in this contract
      const activeCompanyRole =
        r.companyId === activeId ? "first_party" :
        r.secondPartyCompanyId === activeId ? "second_party" : "observer";
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
        promoterNationalId: r.promoterNationalId ?? null,
        promoterPassportNumber: r.promoterPassportNumber ?? null,
        promoterNationality: r.promoterNationality ?? null,
        /** 'first_party' | 'second_party' | 'observer' — for UI role badge */
        activeCompanyRole,
      };
    });
  }),

  // ─── DELETE ────────────────────────────────────────────────────────────────

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

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await requireCanManagePromoterAssignments(ctx.user, activeId);
        // Only first_party (companyId owner) can delete
        if (row.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can delete this assignment" });
        }
      }

      await db.delete(promoterAssignments).where(eq(promoterAssignments.id, input.id));
      return { ok: true as const };
    }),

  // ─── CREATE ────────────────────────────────────────────────────────────────

  /**
   * Create a promoter assignment and dual-write into the new CMS tables.
   * Identity fields (civilId, passportNumber, etc.) are optional for
   * backward compatibility but surfaced in the new CMS record.
   */
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
        clientSiteId: z.number().int().positive().optional(),
        status: z.enum(["active", "inactive", "expired"]).optional(),
        // Identity fields — optional for back-compat, encouraged going forward
        civilId: z.string().max(50).optional(),
        passportNumber: z.string().max(50).optional(),
        passportExpiry: z.string().optional(),
        nationality: z.string().max(100).optional(),
        jobTitleEn: z.string().max(255).optional(),
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

      // Load employee with full identity fields for dual-write
      const [emp] = await db
        .select({
          id: employees.id,
          companyId: employees.companyId,
          firstName: employees.firstName,
          lastName: employees.lastName,
          firstNameAr: employees.firstNameAr,
          lastNameAr: employees.lastNameAr,
          nationalId: employees.nationalId,
          passportNumber: employees.passportNumber,
          nationality: employees.nationality,
          position: employees.position,
          profession: employees.profession,
        })
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

      // ── DUAL-WRITE to new CMS tables ──────────────────────────────────────
      // Non-fatal: if the CMS write fails, the legacy record still exists.
      try {
        const alreadyMigrated = await outsourcingContractExistsForId(db, id);
        if (!alreadyMigrated) {
          const coIds = [input.clientCompanyId, input.employerCompanyId];
          const coRows = await db
            .select({
              id: companies.id,
              name: companies.name,
              nameAr: companies.nameAr,
              crNumber: companies.crNumber,
              registrationNumber: companies.registrationNumber,
            })
            .from(companies)
            .where(inArray(companies.id, coIds));

          const coMap = new Map(coRows.map((c) => [c.id, c]));
          const clientCo = coMap.get(input.clientCompanyId);
          const employerCo = coMap.get(input.employerCompanyId);

          if (clientCo && employerCo) {
            const fullNameEn = `${emp.firstName} ${emp.lastName}`.trim();
            const fullNameAr =
              `${emp.firstNameAr ?? ""} ${emp.lastNameAr ?? ""}`.trim() || fullNameEn;

            await createOutsourcingContractFull(db, {
              contractId: id,
              companyId: input.clientCompanyId,
              contractTypeId: "promoter_assignment",
              contractNumber: input.contractReferenceNumber?.trim() || null,
              status: (input.status === "active" ? "active" : "draft") as "draft" | "active",
              issueDate: issue ? new Date(issue) : null,
              effectiveDate: new Date(input.startDate),
              expiryDate: new Date(input.endDate),
              createdBy: ctx.user.id,
              firstParty: {
                companyId: clientCo.id,
                nameEn: clientCo.name,
                nameAr: clientCo.nameAr ?? null,
                regNumber: clientCo.crNumber ?? clientCo.registrationNumber ?? null,
              },
              secondParty: {
                companyId: employerCo.id,
                nameEn: employerCo.name,
                nameAr: employerCo.nameAr ?? null,
                regNumber: employerCo.crNumber ?? employerCo.registrationNumber ?? null,
              },
              location: {
                locationEn: input.locationEn.trim(),
                locationAr: input.locationAr.trim(),
                clientSiteId,
              },
              promoter: {
                employeeId: emp.id,
                employerCompanyId: input.employerCompanyId,
                fullNameEn,
                fullNameAr,
                civilId: input.civilId?.trim() || emp.nationalId?.trim() || null,
                passportNumber: input.passportNumber?.trim() || emp.passportNumber?.trim() || null,
                passportExpiry: input.passportExpiry ? new Date(input.passportExpiry) : null,
                nationality: input.nationality?.trim() || emp.nationality?.trim() || null,
                jobTitleEn: input.jobTitleEn?.trim() || emp.position?.trim() || emp.profession?.trim() || null,
                jobTitleAr: null,
              },
              actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
            });
          }
        }
      } catch (dualWriteErr) {
        // Non-fatal: log but do not surface to caller
        console.error("[dual-write] Failed to mirror to CMS tables:", dualWriteErr);
      }

      return { id };
    }),

  // ─── UPDATE ────────────────────────────────────────────────────────────────

  /**
   * Update an existing promoter assignment.
   * Mirrors changes to the CMS tables if a corresponding record exists.
   * Only the first party (companyId owner) or a platform admin can edit.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        locationAr: z.string().min(1).optional(),
        locationEn: z.string().min(1).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        contractReferenceNumber: z.string().optional(),
        issueDate: z.string().optional(),
        status: z.enum(["active", "inactive", "expired"]).optional(),
        civilId: z.string().max(50).optional(),
        passportNumber: z.string().max(50).optional(),
        passportExpiry: z.string().optional(),
        nationality: z.string().max(100).optional(),
        jobTitleEn: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select({
          id: promoterAssignments.id,
          companyId: promoterAssignments.companyId,
        })
        .from(promoterAssignments)
        .where(eq(promoterAssignments.id, input.id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        // Only first party can edit
        if (existing.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can edit this assignment" });
        }
        await requireCanManagePromoterAssignments(ctx.user, activeId);
      }

      // Build partial update for legacy table
      const legacyUpdates: Record<string, unknown> = {};
      if (input.locationAr !== undefined) legacyUpdates.locationAr = input.locationAr;
      if (input.locationEn !== undefined) legacyUpdates.locationEn = input.locationEn;
      if (input.startDate !== undefined) legacyUpdates.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) legacyUpdates.endDate = new Date(input.endDate);
      if (input.contractReferenceNumber !== undefined)
        legacyUpdates.contractReferenceNumber = input.contractReferenceNumber?.trim() || null;
      if (input.issueDate !== undefined)
        legacyUpdates.issueDate = input.issueDate ? new Date(input.issueDate) : null;
      if (input.status !== undefined) legacyUpdates.status = input.status;

      if (Object.keys(legacyUpdates).length > 0) {
        await db
          .update(promoterAssignments)
          .set(legacyUpdates)
          .where(eq(promoterAssignments.id, input.id));
      }

      // Mirror updates to CMS tables (non-fatal)
      try {
        const cmsExists = await outsourcingContractExistsForId(db, input.id);
        if (cmsExists) {
          const contractUpdates: Record<string, unknown> = {};
          if (input.contractReferenceNumber !== undefined)
            contractUpdates.contractNumber = input.contractReferenceNumber?.trim() || null;
          if (input.issueDate !== undefined)
            contractUpdates.issueDate = input.issueDate ? new Date(input.issueDate) : null;
          if (input.startDate !== undefined)
            contractUpdates.effectiveDate = new Date(input.startDate);
          if (input.endDate !== undefined)
            contractUpdates.expiryDate = new Date(input.endDate);
          if (input.status !== undefined)
            contractUpdates.status = input.status === "active" ? "active" : "draft";

          const locationUpdates: Record<string, unknown> = {};
          if (input.locationEn !== undefined) locationUpdates.locationEn = input.locationEn;
          if (input.locationAr !== undefined) locationUpdates.locationAr = input.locationAr;

          const promoterUpdates: Record<string, unknown> = {};
          if (input.civilId !== undefined) promoterUpdates.civilId = input.civilId?.trim() || null;
          if (input.passportNumber !== undefined)
            promoterUpdates.passportNumber = input.passportNumber?.trim() || null;
          if (input.passportExpiry !== undefined)
            promoterUpdates.passportExpiry = input.passportExpiry ? new Date(input.passportExpiry) : null;
          if (input.nationality !== undefined)
            promoterUpdates.nationality = input.nationality?.trim() || null;
          if (input.jobTitleEn !== undefined)
            promoterUpdates.jobTitleEn = input.jobTitleEn?.trim() || null;

          await updateOutsourcingContract(
            db,
            input.id,
            contractUpdates as Parameters<typeof updateOutsourcingContract>[2],
            locationUpdates as Parameters<typeof updateOutsourcingContract>[3],
            promoterUpdates as Parameters<typeof updateOutsourcingContract>[4]
          );

          await appendContractEvent(db, {
            contractId: input.id,
            action: "edited",
            actorId: ctx.user.id,
            actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
            details: {
              source: "promoterAssignments.update",
              updatedFields: Object.keys({ ...contractUpdates, ...locationUpdates, ...promoterUpdates }),
            },
          });
        }
      } catch (mirrorErr) {
        console.error("[update-mirror] Failed to mirror to CMS tables:", mirrorErr);
      }

      return { ok: true as const };
    }),
});
