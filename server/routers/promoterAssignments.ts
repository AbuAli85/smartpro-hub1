/**
 * Promoter assignments router — operational bridge (legacy table + optional CMS dual-write).
 *
 * Dual-write: create / transitions may mirror into outsourcing_contracts when active and dated.
 * ADR-001: list visibility where active company is first_party OR second_party.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  ASSIGNMENT_STATUSES,
  assignmentStatusToContractStatus,
  canTransitionAssignmentStatus,
  isAssignmentTerminal,
  migrateLegacyAssignmentStatus,
  normalizeAssignmentDates,
  requiresEndDateForTerminalTransition,
  requiresSuspensionReason,
  requiresTerminationReason,
  type AssignmentStatus,
} from "../../shared/promoterAssignmentLifecycle";
import type { User } from "../../drizzle/schema";
import { getCompanies, getDb, getUserCompanies } from "../db";
import {
  attendanceSites,
  companies,
  companyMembers,
  employees,
  promoterAssignments,
  users,
  type InsertPromoterAssignment,
} from "../../drizzle/schema";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { optionalActiveWorkspace } from "../_core/workspaceInput";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createOutsourcingContractFull,
  outsourcingContractExistsForId,
  updateOutsourcingContract,
  appendContractEvent,
} from "../modules/contractManagement/contractManagement.repository";
import {
  emitPromoterAssignmentAudit,
  hasOverlappingActiveAssignment,
} from "../repositories/promoterAssignment.repository";

const ASSIGNMENT_ROLES = ["company_admin", "hr_admin"] as const;

const listAssignmentsInput = optionalActiveWorkspace.merge(
  z.object({
    assignmentStatus: z.enum(ASSIGNMENT_STATUSES).optional(),
    firstPartyCompanyId: z.number().int().positive().optional(),
    secondPartyCompanyId: z.number().int().positive().optional(),
    clientSiteId: z.number().int().positive().optional(),
    promoterEmployeeId: z.number().int().positive().optional(),
    activeOnly: z.boolean().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    search: z.string().optional(),
  }),
);

async function requireCanManagePromoterAssignments(
  user: { id: number; role?: string | null; platformRole?: string | null },
  companyId: number
): Promise<void> {
  const m = await requireWorkspaceMembership(user as User, companyId);
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

function visibilityOr(activeId: number) {
  return or(
    eq(promoterAssignments.companyId, activeId),
    eq(promoterAssignments.secondPartyCompanyId, activeId)
  );
}

async function assertSupervisorInEmployerCompany(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  employerCompanyId: number,
  supervisorUserId: number | null | undefined
): Promise<void> {
  if (supervisorUserId == null) return;
  const [m] = await db
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.companyId, employerCompanyId),
        eq(companyMembers.userId, supervisorUserId),
        eq(companyMembers.isActive, true)
      )
    )
    .limit(1);
  if (!m) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Supervisor must be an active member of the employer (second party) company.",
    });
  }
}

function legacyPickerStatusToAssignment(
  s?: "active" | "inactive" | "expired"
): AssignmentStatus {
  if (s === undefined) return "draft";
  return migrateLegacyAssignmentStatus(s);
}

export const promoterAssignmentsRouter = router({
  companiesForPartyPickers: protectedProcedure
    .input(
      z
        .object({ clientCompanyId: z.number().int().positive().optional() })
        .merge(optionalActiveWorkspace)
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
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

  listClientWorkLocations: protectedProcedure
    .input(z.object({ clientCompanyId: z.number().int().positive() }).merge(optionalActiveWorkspace))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
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

  listEmployerEmployees: protectedProcedure
    .input(
      z
        .object({
          employerCompanyId: z.number().int().positive(),
          clientCompanyId: z.number().int().positive().optional(),
          forEmployerPerspective: z.boolean().optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);

      if (isPlatform && input.clientCompanyId == null && !input.forEmployerPerspective) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select the client company before loading employer employees",
        });
      }
      if (!isPlatform) {
        if (input.forEmployerPerspective) {
          await requireCanManagePromoterAssignments(ctx.user, input.employerCompanyId);
          if (activeId !== input.employerCompanyId) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Employer perspective requires your active company to be the employer",
            });
          }
        } else {
          const clientId = input.clientCompanyId ?? activeId;
          await requireCanManagePromoterAssignments(ctx.user, clientId);
        }
      }
      if (
        input.clientCompanyId != null &&
        input.employerCompanyId === input.clientCompanyId
      ) {
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

  list: protectedProcedure.input(listAssignmentsInput.optional()).query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    await requireCanManagePromoterAssignments(ctx.user, activeId);
    const db = await getDb();
    if (!db) return [];

    const fpAlias = alias(companies, "pa_fp");
    const spAlias = alias(companies, "pa_sp");
    const siteAlias = alias(attendanceSites, "pa_site");
    const supAlias = alias(users, "pa_sup");

    const conditions = [];

    if (!canAccessGlobalAdminProcedures(ctx.user)) {
      conditions.push(visibilityOr(activeId));
    }

    if (input?.assignmentStatus) {
      conditions.push(eq(promoterAssignments.assignmentStatus, input.assignmentStatus));
    }
    if (input?.firstPartyCompanyId) {
      conditions.push(eq(promoterAssignments.firstPartyCompanyId, input.firstPartyCompanyId));
    }
    if (input?.secondPartyCompanyId) {
      conditions.push(eq(promoterAssignments.secondPartyCompanyId, input.secondPartyCompanyId));
    }
    if (input?.clientSiteId) {
      conditions.push(eq(promoterAssignments.clientSiteId, input.clientSiteId));
    }
    if (input?.promoterEmployeeId) {
      conditions.push(eq(promoterAssignments.promoterEmployeeId, input.promoterEmployeeId));
    }
    if (input?.activeOnly) {
      conditions.push(eq(promoterAssignments.assignmentStatus, "active"));
    }
    if (input?.dateFrom?.trim()) {
      conditions.push(
        sql`${promoterAssignments.endDate} IS NULL OR ${promoterAssignments.endDate} >= ${input.dateFrom.trim().slice(0, 10)}`
      );
    }
    if (input?.dateTo?.trim()) {
      conditions.push(
        sql`${promoterAssignments.startDate} <= ${input.dateTo.trim().slice(0, 10)}`
      );
    }
    if (input?.search?.trim()) {
      const q = `%${input.search.trim()}%`;
      conditions.push(
        or(
          like(employees.firstName, q),
          like(employees.lastName, q),
          like(fpAlias.name, q),
          like(spAlias.name, q)
        )!
      );
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const base = db
      .select({
        id: promoterAssignments.id,
        companyId: promoterAssignments.companyId,
        firstPartyCompanyId: promoterAssignments.firstPartyCompanyId,
        secondPartyCompanyId: promoterAssignments.secondPartyCompanyId,
        clientSiteId: promoterAssignments.clientSiteId,
        promoterEmployeeId: promoterAssignments.promoterEmployeeId,
        assignmentStatus: promoterAssignments.assignmentStatus,
        locationAr: promoterAssignments.locationAr,
        locationEn: promoterAssignments.locationEn,
        startDate: promoterAssignments.startDate,
        endDate: promoterAssignments.endDate,
        expectedMonthlyHours: promoterAssignments.expectedMonthlyHours,
        shiftType: promoterAssignments.shiftType,
        supervisorUserId: promoterAssignments.supervisorUserId,
        suspensionReason: promoterAssignments.suspensionReason,
        terminationReason: promoterAssignments.terminationReason,
        notes: promoterAssignments.notes,
        billingModel: promoterAssignments.billingModel,
        billingRate: promoterAssignments.billingRate,
        currencyCode: promoterAssignments.currencyCode,
        rateSource: promoterAssignments.rateSource,
        contractReferenceNumber: promoterAssignments.contractReferenceNumber,
        issueDate: promoterAssignments.issueDate,
        createdAt: promoterAssignments.createdAt,
        updatedAt: promoterAssignments.updatedAt,
        firstPartyName: fpAlias.name,
        secondPartyName: spAlias.name,
        siteName: siteAlias.name,
        supervisorDisplayName: supAlias.displayName,
        supervisorName: supAlias.name,
        promoterFirstName: employees.firstName,
        promoterLastName: employees.lastName,
        promoterNationalId: employees.nationalId,
        promoterPassportNumber: employees.passportNumber,
        promoterNationality: employees.nationality,
      })
      .from(promoterAssignments)
      .leftJoin(fpAlias, eq(fpAlias.id, promoterAssignments.firstPartyCompanyId))
      .leftJoin(spAlias, eq(spAlias.id, promoterAssignments.secondPartyCompanyId))
      .leftJoin(employees, eq(employees.id, promoterAssignments.promoterEmployeeId))
      .leftJoin(siteAlias, eq(siteAlias.id, promoterAssignments.clientSiteId))
      .leftJoin(supAlias, eq(supAlias.id, promoterAssignments.supervisorUserId))
      .where(whereClause ?? sql`1=1`)
      .orderBy(desc(promoterAssignments.createdAt));

    const rows = await base;

    return rows.map((r) => {
      const promoterName =
        `${r.promoterFirstName ?? ""} ${r.promoterLastName ?? ""}`.trim() ||
        `Employee #${r.promoterEmployeeId}`;
      const activeCompanyRole =
        r.companyId === activeId
          ? "first_party"
          : r.secondPartyCompanyId === activeId
            ? "second_party"
            : "observer";
      return {
        id: r.id,
        companyId: r.companyId,
        firstPartyCompanyId: r.firstPartyCompanyId,
        secondPartyCompanyId: r.secondPartyCompanyId,
        clientSiteId: r.clientSiteId,
        promoterEmployeeId: r.promoterEmployeeId,
        assignmentStatus: r.assignmentStatus,
        /** @deprecated use assignmentStatus — mapped for older UI */
        status: r.assignmentStatus,
        locationAr: r.locationAr,
        locationEn: r.locationEn,
        startDate: r.startDate,
        endDate: r.endDate,
        expectedMonthlyHours: r.expectedMonthlyHours,
        shiftType: r.shiftType,
        supervisorUserId: r.supervisorUserId,
        supervisorLabel: r.supervisorDisplayName ?? r.supervisorName ?? null,
        suspensionReason: r.suspensionReason,
        terminationReason: r.terminationReason,
        notes: r.notes,
        billingModel: r.billingModel,
        billingRate: r.billingRate,
        currencyCode: r.currencyCode,
        rateSource: r.rateSource,
        contractReferenceNumber: r.contractReferenceNumber,
        issueDate: r.issueDate,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        firstPartyName: r.firstPartyName ?? "Unknown company",
        secondPartyName: r.secondPartyName ?? "Unknown company",
        siteName: r.siteName ?? null,
        promoterName,
        promoterNationalId: r.promoterNationalId ?? null,
        promoterPassportNumber: r.promoterPassportNumber ?? null,
        promoterNationality: r.promoterNationality ?? null,
        activeCompanyRole,
      };
    });
  }),

  summary: protectedProcedure.input(optionalActiveWorkspace.optional()).query(async ({ ctx, input }) => {
    const activeId = await requireActiveCompanyId(ctx.user.id, input?.companyId, ctx.user);
    await requireCanManagePromoterAssignments(ctx.user, activeId);
    const db = await getDb();
    if (!db) {
      return {
        total: 0,
        byStatus: {
          draft: 0,
          active: 0,
          suspended: 0,
          completed: 0,
          terminated: 0,
        } satisfies Record<AssignmentStatus, number>,
        activeHeadcountByBrand: [] as { firstPartyCompanyId: number; brandName: string; count: number }[],
        activeHeadcountBySite: [] as { clientSiteId: number | null; siteName: string | null; count: number }[],
      };
    }

    const vis = canAccessGlobalAdminProcedures(ctx.user) ? undefined : visibilityOr(activeId);

    const statusRows = await db
      .select({
        assignmentStatus: promoterAssignments.assignmentStatus,
        c: count(),
      })
      .from(promoterAssignments)
      .where(vis ? vis : sql`1=1`)
      .groupBy(promoterAssignments.assignmentStatus);

    const byStatus = {
      draft: 0,
      active: 0,
      suspended: 0,
      completed: 0,
      terminated: 0,
    } as Record<AssignmentStatus, number>;
    let total = 0;
    for (const row of statusRows) {
      const n = Number(row.c);
      byStatus[row.assignmentStatus as AssignmentStatus] = n;
      total += n;
    }

    const fpAlias = alias(companies, "sum_fp");
    const siteAlias = alias(attendanceSites, "sum_site");

    const activeBrandWhere = vis
      ? and(vis, eq(promoterAssignments.assignmentStatus, "active"))
      : eq(promoterAssignments.assignmentStatus, "active");

    const brandRows = await db
      .select({
        firstPartyCompanyId: promoterAssignments.firstPartyCompanyId,
        brandName: fpAlias.name,
        c: count(),
      })
      .from(promoterAssignments)
      .leftJoin(fpAlias, eq(fpAlias.id, promoterAssignments.firstPartyCompanyId))
      .where(activeBrandWhere)
      .groupBy(promoterAssignments.firstPartyCompanyId, fpAlias.name);

    const siteRows = await db
      .select({
        clientSiteId: promoterAssignments.clientSiteId,
        siteName: siteAlias.name,
        c: count(),
      })
      .from(promoterAssignments)
      .leftJoin(siteAlias, eq(siteAlias.id, promoterAssignments.clientSiteId))
      .where(activeBrandWhere)
      .groupBy(promoterAssignments.clientSiteId, siteAlias.name);

    return {
      total,
      byStatus,
      activeHeadcountByBrand: brandRows.map((r) => ({
        firstPartyCompanyId: r.firstPartyCompanyId,
        brandName: r.brandName ?? `Company #${r.firstPartyCompanyId}`,
        count: Number(r.c),
      })),
      activeHeadcountBySite: siteRows.map((r) => ({
        clientSiteId: r.clientSiteId,
        siteName: r.siteName,
        count: Number(r.c),
      })),
    };
  }),

  updateDetails: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          locationAr: z.string().min(1).optional(),
          locationEn: z.string().min(1).optional(),
          startDate: z.string().optional(),
          endDate: z.string().nullable().optional(),
          expectedMonthlyHours: z.number().int().min(0).nullable().optional(),
          shiftType: z.string().max(32).nullable().optional(),
          supervisorUserId: z.number().int().positive().nullable().optional(),
          notes: z.string().max(8000).nullable().optional(),
          billingModel: z.enum(["per_month", "per_day", "per_hour", "fixed_term"]).nullable().optional(),
          billingRate: z.string().nullable().optional(),
          currencyCode: z.string().length(3).optional(),
          rateSource: z.enum(["assignment_override", "contract_default", "client_default"]).optional(),
          contractReferenceNumber: z.string().max(100).nullable().optional(),
          issueDate: z.string().nullable().optional(),
          civilId: z.string().max(50).optional(),
          passportNumber: z.string().max(50).optional(),
          passportExpiry: z.string().optional(),
          nationality: z.string().max(100).optional(),
          jobTitleEn: z.string().max(255).optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select()
        .from(promoterAssignments)
        .where(eq(promoterAssignments.id, input.id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
        if (existing.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can edit this assignment" });
        }
        await requireCanManagePromoterAssignments(ctx.user, activeId);
      }

      if (isAssignmentTerminal(existing.assignmentStatus as AssignmentStatus)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit details of a completed or terminated assignment",
        });
      }

      await assertSupervisorInEmployerCompany(db, existing.secondPartyCompanyId, input.supervisorUserId);

      let startD = existing.startDate;
      let endD = existing.endDate;
      if (input.startDate !== undefined || input.endDate !== undefined) {
        try {
          const n = normalizeAssignmentDates(
            input.startDate ?? existing.startDate,
            input.endDate !== undefined ? input.endDate : existing.endDate
          );
          startD = n.startDate;
          endD = n.endDate;
        } catch (e) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: e instanceof Error ? e.message : "Invalid dates",
          });
        }
      }

      if (input.billingRate !== undefined && input.billingRate != null) {
        const br = Number(input.billingRate);
        if (Number.isNaN(br) || br < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Billing rate cannot be negative" });
        }
      }

      const updates: Record<string, unknown> = {};
      if (input.locationAr !== undefined) updates.locationAr = input.locationAr;
      if (input.locationEn !== undefined) updates.locationEn = input.locationEn;
      if (input.startDate !== undefined || input.endDate !== undefined) {
        updates.startDate = startD;
        updates.endDate = endD;
      }
      if (input.expectedMonthlyHours !== undefined) updates.expectedMonthlyHours = input.expectedMonthlyHours;
      if (input.shiftType !== undefined) updates.shiftType = input.shiftType;
      if (input.supervisorUserId !== undefined) updates.supervisorUserId = input.supervisorUserId;
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.billingModel !== undefined) updates.billingModel = input.billingModel;
      if (input.billingRate !== undefined)
        updates.billingRate = input.billingRate == null ? null : String(Number(input.billingRate));
      if (input.currencyCode !== undefined) updates.currencyCode = input.currencyCode;
      if (input.rateSource !== undefined) updates.rateSource = input.rateSource;
      if (input.contractReferenceNumber !== undefined)
        updates.contractReferenceNumber = input.contractReferenceNumber?.trim() || null;
      if (input.issueDate !== undefined)
        updates.issueDate = input.issueDate ? new Date(input.issueDate) : null;

      if (Object.keys(updates).length > 0) {
        await db.update(promoterAssignments).set(updates).where(eq(promoterAssignments.id, input.id));
      }

      const rateChanged =
        input.billingRate !== undefined || input.billingModel !== undefined || input.rateSource !== undefined;
      const supChanged = input.supervisorUserId !== undefined;

      if (rateChanged) {
        await emitPromoterAssignmentAudit({
          companyId: existing.companyId,
          userId: ctx.user.id,
          action: "assignment_rate_changed",
          assignmentId: input.id,
          metadata: {
            previousBillingRate: existing.billingRate,
            newBillingRate: updates.billingRate ?? existing.billingRate,
            billingModel: updates.billingModel ?? existing.billingModel,
            rateSource: updates.rateSource ?? existing.rateSource,
          },
        });
      }
      if (supChanged) {
        await emitPromoterAssignmentAudit({
          companyId: existing.companyId,
          userId: ctx.user.id,
          action: "assignment_supervisor_changed",
          assignmentId: input.id,
          metadata: {
            previousSupervisorUserId: existing.supervisorUserId,
            newSupervisorUserId: input.supervisorUserId ?? null,
          },
        });
      }

      await emitPromoterAssignmentAudit({
        companyId: existing.companyId,
        userId: ctx.user.id,
        action: "assignment_updated",
        assignmentId: input.id,
        metadata: { fields: Object.keys(updates) },
      });

      // Mirror to CMS (non-fatal)
      try {
        const cmsExists = await outsourcingContractExistsForId(db, input.id);
        if (cmsExists) {
          const contractUpdates: Record<string, unknown> = {};
          if (input.contractReferenceNumber !== undefined)
            contractUpdates.contractNumber = input.contractReferenceNumber?.trim() || null;
          if (input.issueDate !== undefined)
            contractUpdates.issueDate = input.issueDate ? new Date(input.issueDate) : null;
          if (input.startDate !== undefined || input.endDate !== undefined) {
            contractUpdates.effectiveDate = startD;
            if (endD) contractUpdates.expiryDate = endD;
          }
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

          if (Object.keys({ ...contractUpdates, ...locationUpdates, ...promoterUpdates }).length > 0) {
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
              details: { source: "promoterAssignments.updateDetails" },
            });
          }
        }
      } catch (e) {
        console.error("[updateDetails-mirror]", e);
      }

      return { ok: true as const };
    }),

  transitionAssignmentStatus: protectedProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          to: z.enum(ASSIGNMENT_STATUSES),
          endDate: z.string().optional(),
          suspensionReason: z.string().max(4000).optional(),
          terminationReason: z.string().max(4000).optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [row] = await db.select().from(promoterAssignments).where(eq(promoterAssignments.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
        if (row.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can change assignment status" });
        }
        await requireCanManagePromoterAssignments(ctx.user, activeId);
      }

      const from = row.assignmentStatus as AssignmentStatus;
      const to = input.to;
      if (!canTransitionAssignmentStatus(from, to)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid transition from "${from}" to "${to}"`,
        });
      }

      if (requiresSuspensionReason(to) && !input.suspensionReason?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Suspension reason is required" });
      }
      if (requiresTerminationReason(to) && !input.terminationReason?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Termination reason is required" });
      }

      let endDate = row.endDate;
      if (requiresEndDateForTerminalTransition(to)) {
        const endStr = input.endDate?.trim() || row.endDate?.toISOString().slice(0, 10);
        if (!endStr) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "End date is required to complete or terminate this assignment",
          });
        }
        endDate = new Date(endStr);
      } else if (input.endDate?.trim()) {
        endDate = new Date(input.endDate.trim().slice(0, 10));
      }

      if (to === "active") {
        if (!row.endDate && !input.endDate?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Set an end date before activating (required for contract mirror and operations).",
          });
        }
        const overlap = await hasOverlappingActiveAssignment(db, {
          firstPartyCompanyId: row.firstPartyCompanyId,
          promoterEmployeeId: row.promoterEmployeeId,
          clientSiteId: row.clientSiteId,
          startDate: row.startDate,
          endDate: row.endDate ?? (input.endDate ? new Date(input.endDate) : null),
          excludeAssignmentId: row.id,
        });
        if (overlap) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Another active assignment already exists for this employee, client brand, and site with overlapping dates.",
          });
        }
      }

      await db
        .update(promoterAssignments)
        .set({
          assignmentStatus: to,
          endDate: endDate ?? null,
          suspensionReason: to === "suspended" ? input.suspensionReason?.trim() ?? null : row.suspensionReason,
          terminationReason:
            to === "terminated" ? input.terminationReason?.trim() ?? null : row.terminationReason,
          updatedAt: new Date(),
        })
        .where(eq(promoterAssignments.id, input.id));

      await emitPromoterAssignmentAudit({
        companyId: row.companyId,
        userId: ctx.user.id,
        action: "assignment_status_changed",
        assignmentId: input.id,
        metadata: {
          oldStatus: from,
          newStatus: to,
          promoterEmployeeId: row.promoterEmployeeId,
          clientSiteId: row.clientSiteId,
          firstPartyCompanyId: row.firstPartyCompanyId,
          secondPartyCompanyId: row.secondPartyCompanyId,
        },
      });

      try {
        const cmsExists = await outsourcingContractExistsForId(db, input.id);
        const cmsStatus = assignmentStatusToContractStatus(to);
        if (cmsExists) {
          await updateOutsourcingContract(
            db,
            input.id,
            {
              status: cmsStatus,
              ...(endDate ? { expiryDate: endDate } : {}),
              effectiveDate: row.startDate,
            },
            {},
            {}
          );
          await appendContractEvent(db, {
            contractId: input.id,
            action: "edited",
            actorId: ctx.user.id,
            actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
            details: { from, to, source: "promoterAssignments.transition" },
          });
        } else if (to === "active" && row.endDate) {
          const [emp] = await db
            .select()
            .from(employees)
            .where(eq(employees.id, row.promoterEmployeeId))
            .limit(1);
          const coIds = [row.firstPartyCompanyId, row.secondPartyCompanyId];
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
          const clientCo = coMap.get(row.firstPartyCompanyId);
          const employerCo = coMap.get(row.secondPartyCompanyId);
          if (emp && clientCo && employerCo) {
            const fullNameEn = `${emp.firstName} ${emp.lastName}`.trim();
            const fullNameAr =
              `${emp.firstNameAr ?? ""} ${emp.lastNameAr ?? ""}`.trim() || fullNameEn;
            await createOutsourcingContractFull(db, {
              contractId: row.id,
              companyId: row.firstPartyCompanyId,
              contractTypeId: "promoter_assignment",
              contractNumber: row.contractReferenceNumber ?? null,
              status: "active",
              issueDate: row.issueDate,
              effectiveDate: row.startDate,
              expiryDate: row.endDate!,
              createdBy: ctx.user.id,
              firstParty: {
                companyId: clientCo.id,
                partyId: null,
                nameEn: clientCo.name,
                nameAr: clientCo.nameAr ?? null,
                regNumber: clientCo.crNumber ?? clientCo.registrationNumber ?? null,
              },
              secondParty: {
                companyId: employerCo.id,
                partyId: null,
                nameEn: employerCo.name,
                nameAr: employerCo.nameAr ?? null,
                regNumber: employerCo.crNumber ?? employerCo.registrationNumber ?? null,
              },
              location: {
                locationEn: row.locationEn?.trim() ?? "",
                locationAr: row.locationAr?.trim() ?? "",
                clientSiteId: row.clientSiteId,
              },
              promoter: {
                employeeId: emp.id,
                employerCompanyId: row.secondPartyCompanyId,
                fullNameEn,
                fullNameAr,
                civilId: emp.nationalId?.trim() ?? null,
                passportNumber: emp.passportNumber?.trim() ?? null,
                passportExpiry: null,
                nationality: emp.nationality?.trim() ?? null,
                jobTitleEn: emp.position?.trim() ?? emp.profession?.trim() ?? null,
                jobTitleAr: null,
              },
              actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
            });
          }
        }
      } catch (e) {
        console.error("[transition-mirror]", e);
      }

      return { ok: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }).merge(optionalActiveWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
      const [row] = await db
        .select({ id: promoterAssignments.id, companyId: promoterAssignments.companyId })
        .from(promoterAssignments)
        .where(eq(promoterAssignments.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      if (!canAccessGlobalAdminProcedures(ctx.user)) {
        await requireCanManagePromoterAssignments(ctx.user, activeId);
        if (row.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can delete this assignment" });
        }
      }

      await db.delete(promoterAssignments).where(eq(promoterAssignments.id, input.id));
      return { ok: true as const };
    }),

  create: protectedProcedure
    .input(
      z
        .object({
          clientCompanyId: z.number().int().positive(),
          employerCompanyId: z.number().int().positive(),
          promoterEmployeeId: z.number().int().positive(),
          locationAr: z.string().min(1),
          locationEn: z.string().min(1),
          startDate: z.string(),
          endDate: z.string().optional().nullable(),
          contractReferenceNumber: z.string().optional(),
          issueDate: z.string().optional(),
          clientSiteId: z.number().int().positive().optional(),
          status: z.enum(["active", "inactive", "expired"]).optional(),
          assignmentStatus: z.enum(ASSIGNMENT_STATUSES).optional(),
          expectedMonthlyHours: z.number().int().min(0).optional(),
          shiftType: z.string().max(32).optional(),
          supervisorUserId: z.number().int().positive().nullable().optional(),
          notes: z.string().max(8000).optional(),
          billingModel: z.enum(["per_month", "per_day", "per_hour", "fixed_term"]).optional(),
          billingRate: z.string().optional(),
          currencyCode: z.string().length(3).optional(),
          rateSource: z.enum(["assignment_override", "contract_default", "client_default"]).optional(),
          civilId: z.string().max(50).optional(),
          passportNumber: z.string().max(50).optional(),
          passportExpiry: z.string().optional(),
          nationality: z.string().max(100).optional(),
          jobTitleEn: z.string().max(255).optional(),
        })
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
        await requireCanManagePromoterAssignments(ctx.user, input.clientCompanyId);
      }

      if (input.clientCompanyId === input.employerCompanyId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Client and employer must be different companies" });
      }

      const assignmentStatus: AssignmentStatus =
        input.assignmentStatus ?? legacyPickerStatusToAssignment(input.status);

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

      await assertSupervisorInEmployerCompany(db, input.employerCompanyId, input.supervisorUserId);

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

      let normalized;
      try {
        normalized = normalizeAssignmentDates(input.startDate, input.endDate ?? null);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "Invalid dates",
        });
      }

      if (assignmentStatus === "active") {
        if (!normalized.endDate) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "End date is required for an active assignment",
          });
        }
        const overlap = await hasOverlappingActiveAssignment(db, {
          firstPartyCompanyId: input.clientCompanyId,
          promoterEmployeeId: input.promoterEmployeeId,
          clientSiteId,
          startDate: normalized.startDate,
          endDate: normalized.endDate,
        });
        if (overlap) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Another active assignment already exists for this employee, client brand, and site with overlapping dates.",
          });
        }
      }

      if (input.billingRate != null) {
        const br = Number(input.billingRate);
        if (Number.isNaN(br) || br < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Billing rate cannot be negative" });
        }
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
        assignmentStatus,
        locationAr: input.locationAr,
        locationEn: input.locationEn,
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        expectedMonthlyHours: input.expectedMonthlyHours ?? null,
        shiftType: input.shiftType ?? null,
        supervisorUserId: input.supervisorUserId ?? null,
        notes: input.notes ?? null,
        billingModel: input.billingModel ?? null,
        billingRate: input.billingRate != null ? String(Number(input.billingRate)) : null,
        currencyCode: input.currencyCode ?? "OMR",
        rateSource: input.rateSource ?? "assignment_override",
        contractReferenceNumber: input.contractReferenceNumber?.trim() || null,
        issueDate: issue ? new Date(issue) : null,
      };

      await db.insert(promoterAssignments).values(row);

      await emitPromoterAssignmentAudit({
        companyId: input.clientCompanyId,
        userId: ctx.user.id,
        action: "assignment_created",
        assignmentId: id,
        metadata: {
          assignmentStatus,
          promoterEmployeeId: input.promoterEmployeeId,
          firstPartyCompanyId: input.clientCompanyId,
          secondPartyCompanyId: input.employerCompanyId,
          clientSiteId,
        },
      });

      const shouldMirrorCms =
        assignmentStatus !== "draft" && normalized.endDate != null;

      try {
        if (shouldMirrorCms) {
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

              const cmsStatus = assignmentStatusToContractStatus(assignmentStatus);

              await createOutsourcingContractFull(db, {
                contractId: id,
                companyId: input.clientCompanyId,
                contractTypeId: "promoter_assignment",
                contractNumber: input.contractReferenceNumber?.trim() || null,
                status: cmsStatus,
                issueDate: issue ? new Date(issue) : null,
                effectiveDate: normalized.startDate,
                expiryDate: normalized.endDate!,
                createdBy: ctx.user.id,
                firstParty: {
                  companyId: clientCo.id,
                  partyId: null,
                  nameEn: clientCo.name,
                  nameAr: clientCo.nameAr ?? null,
                  regNumber: clientCo.crNumber ?? clientCo.registrationNumber ?? null,
                },
                secondParty: {
                  companyId: employerCo.id,
                  partyId: null,
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
        }
      } catch (dualWriteErr) {
        console.error("[dual-write] Failed to mirror to CMS tables:", dualWriteErr);
      }

      return { id };
    }),

  update: protectedProcedure
    .input(
      z
        .object({
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
        .merge(optionalActiveWorkspace),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [existing] = await db
        .select({
          id: promoterAssignments.id,
          companyId: promoterAssignments.companyId,
          assignmentStatus: promoterAssignments.assignmentStatus,
        })
        .from(promoterAssignments)
        .where(eq(promoterAssignments.id, input.id))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id, input.companyId, ctx.user);
        if (existing.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can edit this assignment" });
        }
        await requireCanManagePromoterAssignments(ctx.user, activeId);
      }

      const legacyUpdates: Record<string, unknown> = {};
      if (input.locationAr !== undefined) legacyUpdates.locationAr = input.locationAr;
      if (input.locationEn !== undefined) legacyUpdates.locationEn = input.locationEn;
      if (input.startDate !== undefined) legacyUpdates.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) legacyUpdates.endDate = new Date(input.endDate);
      if (input.contractReferenceNumber !== undefined)
        legacyUpdates.contractReferenceNumber = input.contractReferenceNumber?.trim() || null;
      if (input.issueDate !== undefined)
        legacyUpdates.issueDate = input.issueDate ? new Date(input.issueDate) : null;
      if (input.status !== undefined) {
        legacyUpdates.assignmentStatus = migrateLegacyAssignmentStatus(input.status);
      }

      if (Object.keys(legacyUpdates).length > 0) {
        await db
          .update(promoterAssignments)
          .set(legacyUpdates)
          .where(eq(promoterAssignments.id, input.id));
      }

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
          if (input.status !== undefined) {
            const as = migrateLegacyAssignmentStatus(input.status);
            contractUpdates.status = assignmentStatusToContractStatus(as);
          }

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

          if (Object.keys({ ...contractUpdates, ...locationUpdates, ...promoterUpdates }).length > 0) {
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
        }
      } catch (mirrorErr) {
        console.error("[update-mirror] Failed to mirror to CMS tables:", mirrorErr);
      }

      return { ok: true as const };
    }),
});
