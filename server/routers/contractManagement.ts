/**
 * Contract Management System — tRPC router.
 *
 * Namespace: contractManagement.*
 * Covers: promoter_assignment contracts (Phase 1). Extensible to more types.
 *
 * ADR-001: company role (first_party / second_party) is per-contract.
 * Tenant visibility: a company sees contracts where it is either party.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb, getCompanies, getUserCompanies } from "../db";
import { outsourcingContracts } from "../../drizzle/schema";
import { attendanceSites, companies, employees } from "../../drizzle/schema";
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";
import {
  ALLOWED_TRANSITIONS,
  ContractTransitionError,
  appendContractEvent,
  createOutsourcingContractFull,
  deleteContractDocument,
  deleteOutsourcingContract,
  getContractDocumentById,
  getContractKpis,
  getOutsourcingContractById,
  lazyExpireContract,
  listOutsourcingContracts,
  outsourcingContractExistsForId,
  recordContractDocument,
  recordGeneratedPdf,
  recordSignedPdf,
  transitionContractStatus,
  updateOutsourcingContract,
} from "../modules/contractManagement/contractManagement.repository";
import {
  CONTRACT_STATUSES,
  DOCUMENT_KIND_META,
  UPLOADABLE_DOCUMENT_KINDS,
  type ContractStatus,
  type UploadableDocumentKind,
} from "../modules/contractManagement/contractManagement.types";
import { storagePut, fileUrlMatchesConfiguredStorage } from "../storage";
import { ENV } from "../_core/env";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Wrap transition calls so ContractTransitionError surfaces as a BAD_REQUEST */
async function doTransition(
  db: Parameters<typeof transitionContractStatus>[0],
  contractId: string,
  toStatus: ContractStatus,
  actor: { id: number; name: string }
) {
  try {
    return await transitionContractStatus(db, contractId, toStatus, actor);
  } catch (err) {
    if (err instanceof ContractTransitionError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
    throw err;
  }
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────

const MANAGE_ROLES = ["company_admin", "hr_admin"] as const;

async function requireCanManageContracts(
  user: { id: number; role?: string | null; platformRole?: string | null },
  companyId: number
): Promise<void> {
  const m = await getActiveCompanyMembership(user.id, companyId);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
  requireNotAuditor(m.role);
  if (
    !canAccessGlobalAdminProcedures(user) &&
    !(MANAGE_ROLES as readonly string[]).includes(m.role)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only company administrators and HR admins can manage contracts.",
    });
  }
}

// ─── ZOD SCHEMAS ──────────────────────────────────────────────────────────────

const contractStatusEnum = z.enum(CONTRACT_STATUSES);

const createPromoterAssignmentInput = z.object({
  clientCompanyId: z.number().int().positive(),
  employerCompanyId: z.number().int().positive(),
  promoterEmployeeId: z.number().int().positive(),
  locationEn: z.string().min(1, "Work location (English) is required"),
  locationAr: z.string().min(1, "Work location (Arabic) is required"),
  clientSiteId: z.number().int().positive().optional(),
  effectiveDate: z.string().min(1, "Effective (start) date is required"),
  expiryDate: z.string().min(1, "Expiry (end) date is required"),
  contractNumber: z.string().max(100).optional(),
  issueDate: z.string().optional(),
  status: contractStatusEnum.optional().default("draft"),
  // Identity fields — strongly encouraged for production
  civilId: z.string().max(50).optional(),
  passportNumber: z.string().max(50).optional(),
  passportExpiry: z.string().optional(),
  nationality: z.string().max(100).optional(),
  jobTitleEn: z.string().max(255).optional(),
  jobTitleAr: z.string().max(255).optional(),
});

const updatePromoterAssignmentInput = z.object({
  id: z.string().uuid(),
  locationEn: z.string().min(1).optional(),
  locationAr: z.string().min(1).optional(),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().optional(),
  contractNumber: z.string().max(100).optional(),
  issueDate: z.string().optional(),
  status: contractStatusEnum.optional(),
  civilId: z.string().max(50).optional(),
  passportNumber: z.string().max(50).optional(),
  passportExpiry: z.string().optional(),
  nationality: z.string().max(100).optional(),
  jobTitleEn: z.string().max(255).optional(),
  jobTitleAr: z.string().max(255).optional(),
});

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export const contractManagementRouter = router({

  // ─── LOOKUPS (shared with promoterAssignments router) ───────────────────────

  /**
   * Companies available for first_party (client) and second_party (employer) pickers.
   * For non-platform users: client options = companies the user belongs to;
   * employer options = other active companies.
   */
  companiesForPartyPickers: protectedProcedure
    .input(z.object({ clientCompanyId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id);
      await requireCanManageContracts(ctx.user, activeId);
      const db = await getDb();
      if (!db) return { clientOptions: [], employerOptions: [] };

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

  /** Attendance sites belonging to the first_party (client) company — for work location picker. */
  listClientWorkLocations: protectedProcedure
    .input(z.object({ clientCompanyId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        await requireActiveCompanyId(ctx.user.id);
        await requireCanManageContracts(ctx.user, input.clientCompanyId);
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
        );
    }),

  /** Active and on-leave employees of the employer (second_party) company — promoter candidates. */
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
        await requireCanManageContracts(ctx.user, clientId);
      }
      if (input.employerCompanyId === clientId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Employer (second party) must be a different company from the client (first party)",
        });
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

  // ─── CONTRACT CRUD ──────────────────────────────────────────────────────────

  /**
   * Aggregate KPIs for the contracts visible to the active company.
   *
   * Returns status totals, promoters deployed, contracts-per-company breakdown,
   * and two risk lists (expiring soon + missing required documents).
   *
   * Access: same role requirement as `list` — company_admin or hr_admin
   * (enforced by requireCanManageContracts). Platform admins bypass.
   *
   * Suitable for a dashboard stats bar — intentionally read-only and fast.
   * See repository ADR comment for the performance migration plan.
   */
  kpis: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
    const activeId = isPlatform ? 0 : await requireActiveCompanyId(ctx.user.id);

    // Apply the same RBAC gate as the list query: only managers/admins, not auditors
    if (!isPlatform) {
      await requireCanManageContracts(ctx.user, activeId);
    }

    return getContractKpis(db, activeId, isPlatform);
  }),

  /** List contracts where the active company is first_party OR second_party. */
  list: protectedProcedure
    .input(
      z.object({
        status: contractStatusEnum.optional(),
        contractTypeId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const activeId = await requireActiveCompanyId(ctx.user.id);
      await requireCanManageContracts(ctx.user, activeId);
      const db = await getDb();
      if (!db) return [];

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      return listOutsourcingContracts(
        db,
        isPlatform ? 0 : activeId,
        isPlatform,
        {
          status: input?.status,
          contractTypeId: input?.contractTypeId,
        }
      );
    }),

  /**
   * Get a single contract with all related sub-records.
   *
   * Lazy expiry: if the contract is "active" and the expiry date is in the past,
   * it is automatically transitioned to "expired" before the response is returned.
   * This means the caller always sees an accurate status without needing a cron job.
   *
   * The response also includes `allowedTransitions` — the list of statuses
   * the contract can move to from its current state — so the UI can show only
   * the action buttons that are actually valid.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await getOutsourcingContractById(db, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        const partyCompanyIds = new Set(
          result.parties.map((p) => p.companyId).filter(Boolean)
        );
        partyCompanyIds.add(result.contract.companyId);
        if (result.promoterDetail) {
          partyCompanyIds.add(result.promoterDetail.employerCompanyId);
        }
        if (!partyCompanyIds.has(activeId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Contract not in your company scope" });
        }
      }

      // Lazy expiry — transitions active → expired if past expiry date
      const wasExpired = await lazyExpireContract(
        db,
        input.id,
        result.contract.expiryDate,
        result.contract.status as ContractStatus
      );

      // Re-fetch if the status just changed so we return the updated record + events
      const finalResult = wasExpired
        ? (await getOutsourcingContractById(db, input.id)) ?? result
        : result;

      const currentStatus = finalResult.contract.status as ContractStatus;
      const allowedTransitions: ContractStatus[] = [...(ALLOWED_TRANSITIONS[currentStatus] ?? [])];

      return {
        ...finalResult,
        allowedTransitions,
      };
    }),

  /** Create a promoter assignment contract with full normalized structure. */
  createPromoterAssignment: protectedProcedure
    .input(createPromoterAssignmentInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        await requireActiveCompanyId(ctx.user.id);
        await requireCanManageContracts(ctx.user, input.clientCompanyId);
      }

      if (input.clientCompanyId === input.employerCompanyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "First party (client) and second party (employer) must be different companies",
        });
      }

      // Validate dates
      const effectiveDate = new Date(input.effectiveDate);
      const expiryDate = new Date(input.expiryDate);
      if (isNaN(effectiveDate.getTime()) || isNaN(expiryDate.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date format for effective or expiry date" });
      }
      if (expiryDate <= effectiveDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Expiry date must be after the effective date" });
      }

      // Validate promoter belongs to the employer
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

      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Promoter employee not found" });
      if (emp.companyId !== input.employerCompanyId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Promoter must be an employee of the second party (employer) company",
        });
      }

      // Validate optional client site belongs to the client
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
            message: "Work location must be an active site belonging to the first party (client)",
          });
        }
        clientSiteId = site.id;
      }

      // Load company snapshots for party records
      const companyIds = [input.clientCompanyId, input.employerCompanyId];
      const coRows = await db
        .select({
          id: companies.id,
          name: companies.name,
          nameAr: companies.nameAr,
          crNumber: companies.crNumber,
          registrationNumber: companies.registrationNumber,
        })
        .from(companies)
        .where(inArray(companies.id, companyIds));

      const coMap = new Map(coRows.map((c) => [c.id, c]));
      const clientCo = coMap.get(input.clientCompanyId);
      const employerCo = coMap.get(input.employerCompanyId);

      if (!clientCo || !employerCo) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both companies not found" });
      }

      const contractId = crypto.randomUUID();
      const fullNameEn = `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() || `Employee #${emp.id}`;
      const fullNameAr =
        `${emp.firstNameAr ?? ""} ${emp.lastNameAr ?? ""}`.trim() || fullNameEn;

      await createOutsourcingContractFull(db, {
        contractId,
        companyId: input.clientCompanyId,
        contractTypeId: "promoter_assignment",
        contractNumber: input.contractNumber?.trim() || null,
        status: input.status ?? "draft",
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
        effectiveDate,
        expiryDate,
        createdBy: ctx.user.id,
        firstParty: {
          companyId: input.clientCompanyId,
          nameEn: clientCo.name,
          nameAr: clientCo.nameAr ?? null,
          regNumber: clientCo.crNumber ?? clientCo.registrationNumber ?? null,
        },
        secondParty: {
          companyId: input.employerCompanyId,
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
          nationality: input.nationality?.trim() || null,
          jobTitleEn: input.jobTitleEn?.trim() || emp.position?.trim() || emp.profession?.trim() || null,
          jobTitleAr: input.jobTitleAr?.trim() || null,
        },
        actorName: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
      });

      return { id: contractId };
    }),

  /**
   * Update mutable (non-lifecycle) fields on an existing contract.
   *
   * Status changes are intentionally excluded here — use the dedicated
   * `activate`, `terminate`, or `renew` mutations instead.
   * If `status` is passed it will be routed through `transitionContractStatus`
   * so the transition rules are always enforced.
   */
  update: protectedProcedure
    .input(updatePromoterAssignmentInput)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await getOutsourcingContractById(db, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        if (result.contract.companyId !== activeId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the first party (client) company can edit this contract",
          });
        }
        await requireCanManageContracts(ctx.user, activeId);
      }

      const actor = {
        id: ctx.user.id,
        name: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
      };

      // If status is changing, route through the transition system
      if (input.status !== undefined && input.status !== result.contract.status) {
        await doTransition(db, input.id, input.status as ContractStatus, actor);
      }

      // Remaining editable fields (excluding status — already handled above)
      const contractUpdates: Record<string, unknown> = {};
      if (input.contractNumber !== undefined) contractUpdates.contractNumber = input.contractNumber?.trim() || null;
      if (input.issueDate !== undefined) contractUpdates.issueDate = input.issueDate ? new Date(input.issueDate) : null;
      if (input.effectiveDate !== undefined) contractUpdates.effectiveDate = new Date(input.effectiveDate);
      if (input.expiryDate !== undefined) contractUpdates.expiryDate = new Date(input.expiryDate);

      const locationUpdates: Record<string, unknown> = {};
      if (input.locationEn !== undefined) locationUpdates.locationEn = input.locationEn.trim();
      if (input.locationAr !== undefined) locationUpdates.locationAr = input.locationAr.trim();

      const promoterUpdates: Record<string, unknown> = {};
      if (input.civilId !== undefined) promoterUpdates.civilId = input.civilId?.trim() || null;
      if (input.passportNumber !== undefined) promoterUpdates.passportNumber = input.passportNumber?.trim() || null;
      if (input.passportExpiry !== undefined) promoterUpdates.passportExpiry = input.passportExpiry ? new Date(input.passportExpiry) : null;
      if (input.nationality !== undefined) promoterUpdates.nationality = input.nationality?.trim() || null;
      if (input.jobTitleEn !== undefined) promoterUpdates.jobTitleEn = input.jobTitleEn?.trim() || null;
      if (input.jobTitleAr !== undefined) promoterUpdates.jobTitleAr = input.jobTitleAr?.trim() || null;

      const hasFieldUpdates = [contractUpdates, locationUpdates, promoterUpdates].some(
        (o) => Object.keys(o).length > 0
      );

      if (hasFieldUpdates) {
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
          actorId: actor.id,
          actorName: actor.name,
          details: {
            updatedFields: Object.keys({ ...contractUpdates, ...locationUpdates, ...promoterUpdates }),
          },
        });
      }

      return { ok: true as const };
    }),

  /**
   * Activate a draft contract — transition: draft → active.
   *
   * This is the "confirmation step" before a contract takes effect.
   * The caller is expected to show a confirmation dialog on the frontend
   * before calling this mutation.
   *
   * Only the first party (client company) can activate.
   */
  activate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        /** Optional note recorded in the audit event */
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await getOutsourcingContractById(db, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        if (result.contract.companyId !== activeId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the first party (client) company can activate this contract",
          });
        }
        await requireCanManageContracts(ctx.user, activeId);
      }

      const actor = {
        id: ctx.user.id,
        name: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
      };

      const { previousStatus } = await doTransition(db, input.id, "active", actor);

      // Append a second, richer audit event if a note was provided
      if (input.note?.trim()) {
        await appendContractEvent(db, {
          contractId: input.id,
          action: "activated",
          actorId: actor.id,
          actorName: actor.name,
          details: { note: input.note.trim(), previousStatus },
        });
      }

      return { ok: true as const, previousStatus };
    }),

  /**
   * Renew a contract.
   * Creates a new contract (starts as "draft") with the same parties, location,
   * and promoter. The original contract is marked as "renewed" via
   * transitionContractStatus (validated: only active/expired → renewed is allowed).
   */
  renew: protectedProcedure
    .input(
      z.object({
        originalContractId: z.string().uuid(),
        newEffectiveDate: z.string().min(1),
        newExpiryDate: z.string().min(1),
        newContractNumber: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const original = await getOutsourcingContractById(db, input.originalContractId);
      if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Original contract not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        if (original.contract.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can renew this contract" });
        }
        await requireCanManageContracts(ctx.user, activeId);
      }

      const effectiveDate = new Date(input.newEffectiveDate);
      const expiryDate = new Date(input.newExpiryDate);
      if (isNaN(effectiveDate.getTime()) || isNaN(expiryDate.getTime())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date format" });
      }
      if (expiryDate <= effectiveDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Expiry date must be after effective date" });
      }

      const firstParty = original.parties.find((p) => p.partyRole === "first_party");
      const secondParty = original.parties.find((p) => p.partyRole === "second_party");
      const location = original.locations[0];
      const promoterDetail = original.promoterDetail;

      if (!firstParty || !secondParty || !location || !promoterDetail) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Original contract data incomplete" });
      }

      const actor = {
        id: ctx.user.id,
        name: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
      };

      const newContractId = crypto.randomUUID();

      await createOutsourcingContractFull(db, {
        contractId: newContractId,
        companyId: original.contract.companyId,
        contractTypeId: original.contract.contractTypeId,
        contractNumber: input.newContractNumber?.trim() || null,
        status: "draft",
        issueDate: null,
        effectiveDate,
        expiryDate,
        createdBy: ctx.user.id,
        firstParty: {
          companyId: firstParty.companyId!,
          nameEn: firstParty.displayNameEn,
          nameAr: firstParty.displayNameAr ?? null,
          regNumber: firstParty.registrationNumber ?? null,
        },
        secondParty: {
          companyId: secondParty.companyId!,
          nameEn: secondParty.displayNameEn,
          nameAr: secondParty.displayNameAr ?? null,
          regNumber: secondParty.registrationNumber ?? null,
        },
        location: {
          locationEn: location.locationEn ?? "",
          locationAr: location.locationAr ?? "",
          clientSiteId: location.clientSiteId ?? null,
        },
        promoter: {
          employeeId: promoterDetail.promoterEmployeeId,
          employerCompanyId: promoterDetail.employerCompanyId,
          fullNameEn: promoterDetail.fullNameEn,
          fullNameAr: promoterDetail.fullNameAr ?? null,
          civilId: promoterDetail.civilId ?? null,
          passportNumber: promoterDetail.passportNumber ?? null,
          passportExpiry: promoterDetail.passportExpiry ? new Date(promoterDetail.passportExpiry) : null,
          nationality: promoterDetail.nationality ?? null,
          jobTitleEn: promoterDetail.jobTitleEn ?? null,
          jobTitleAr: promoterDetail.jobTitleAr ?? null,
        },
        actorName: actor.name,
      });

      // Link the renewal on the new contract
      await db
        .update(outsourcingContracts)
        .set({ renewalOfContractId: input.originalContractId })
        .where(eq(outsourcingContracts.id, newContractId));

      // Mark the original as "renewed" via validated transition
      await doTransition(db, input.originalContractId, "renewed", actor);

      // Extra audit event on the original with the new contract reference
      await appendContractEvent(db, {
        contractId: input.originalContractId,
        action: "renewed",
        actorId: actor.id,
        actorName: actor.name,
        details: { newContractId },
      });

      return { id: newContractId };
    }),

  /**
   * Terminate a contract.
   * Valid from: draft, active, suspended.
   * The transition is validated by `transitionContractStatus`.
   */
  terminate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await getOutsourcingContractById(db, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        if (result.contract.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can terminate this contract" });
        }
        await requireCanManageContracts(ctx.user, activeId);
      }

      const actor = {
        id: ctx.user.id,
        name: ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`,
      };

      await doTransition(db, input.id, "terminated", actor);

      // Append extra event with optional reason
      if (input.reason?.trim()) {
        await appendContractEvent(db, {
          contractId: input.id,
          action: "terminated",
          actorId: actor.id,
          actorName: actor.name,
          details: { reason: input.reason.trim() },
        });
      }

      return { ok: true as const };
    }),

  // ─── DOCUMENT UPLOAD ────────────────────────────────────────────────────────

  /**
   * Upload a file and attach it to a contract.
   *
   * Input:  base64-encoded file bytes (same pattern as documents.uploadCompanyDoc).
   * Output: { documentId, fileUrl }
   *
   * Access:
   *   - Both parties (first_party and second_party) may upload.
   *   - Auditors are blocked.
   *   - Platform admins bypass tenant check.
   *
   * File size limit: enforced per-kind (from DOCUMENT_KIND_META).
   * The decoded buffer is uploaded to the Forge storage proxy via storagePut.
   * The resulting URL + key are stored in outsourcing_contract_documents and
   * an audit event is appended.
   */
  uploadDocument: protectedProcedure
    .input(
      z.object({
        contractId: z.string().uuid(),
        documentKind: z.enum(UPLOADABLE_DOCUMENT_KINDS),
        fileBase64: z.string().min(1, "File data is required"),
        fileName: z.string().min(1).max(500),
        mimeType: z.string().min(1).max(200),
        /** Declared file size in bytes — used for server-side validation */
        fileSize: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // ── Tenant / RBAC ──────────────────────────────────────────────────────
      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      let uploaderCompanyId: number;

      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        uploaderCompanyId = activeId;
        await requireCanManageContracts(ctx.user, activeId);

        // Confirm the active company is involved in this contract
        const result = await getOutsourcingContractById(db, input.contractId);
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

        const partyCompanyIds = new Set(
          result.parties.map((p) => p.companyId).filter(Boolean)
        );
        partyCompanyIds.add(result.contract.companyId);
        if (result.promoterDetail) {
          partyCompanyIds.add(result.promoterDetail.employerCompanyId);
        }
        if (!partyCompanyIds.has(activeId)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Your company is not a party to this contract",
          });
        }
      } else {
        const activeId = await requireActiveCompanyId(ctx.user.id).catch(() => 0);
        uploaderCompanyId = activeId;
      }

      // ── File validation ────────────────────────────────────────────────────
      const kindMeta = DOCUMENT_KIND_META[input.documentKind as UploadableDocumentKind];
      const maxBytes = kindMeta.maxSizeMb * 1024 * 1024;

      if (input.fileSize > maxBytes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File too large. Maximum size for ${kindMeta.label} is ${kindMeta.maxSizeMb} MB. ` +
            `Received: ${(input.fileSize / 1024 / 1024).toFixed(1)} MB.`,
        });
      }

      if (!kindMeta.acceptMime.includes(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File type "${input.mimeType}" is not accepted for ${kindMeta.label}. ` +
            `Accepted types: ${kindMeta.acceptAttr}.`,
        });
      }

      // ── Upload to storage ──────────────────────────────────────────────────
      const buffer = Buffer.from(input.fileBase64, "base64");

      // Validate decoded size matches declared size (within 5% tolerance for base64 padding)
      const decodedTolerance = Math.ceil(input.fileSize * 1.05);
      if (buffer.length > decodedTolerance) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Decoded file size does not match declared size",
        });
      }

      const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
      const timestamp = Date.now();
      const storageKey =
        `contract-docs/${uploaderCompanyId}/${input.contractId}/${input.documentKind}/${timestamp}-${safeFileName}`;

      const { key: filePath, url: fileUrl } = await storagePut(
        storageKey,
        buffer,
        input.mimeType
      );

      // ── Persist ───────────────────────────────────────────────────────────
      const actorName = ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`;

      const documentId = await recordContractDocument(db, {
        contractId: input.contractId,
        documentKind: input.documentKind,
        fileUrl,
        filePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
        uploadedBy: ctx.user.id,
        uploadedByName: actorName,
        metadata: { fileSize: input.fileSize },
      });

      return { documentId, fileUrl };
    }),

  /**
   * Delete a contract document.
   *
   * Access: first_party or platform admin only.
   * System-generated PDFs (documentKind = "generated_pdf") cannot be deleted.
   */
  deleteDocument: protectedProcedure
    .input(z.object({ documentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const doc = await getContractDocumentById(db, input.documentId);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });

      if (doc.documentKind === "generated_pdf") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "System-generated PDFs cannot be deleted. Generate a new one to replace it.",
        });
      }

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        await requireCanManageContracts(ctx.user, activeId);

        // Only first party (companyId owner) can delete
        const contract = await getOutsourcingContractById(db, doc.contractId);
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });
        if (contract.contract.companyId !== activeId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the first party (client) can delete contract documents",
          });
        }
      }

      const actorName = ctx.user.name ?? ctx.user.email ?? `User #${ctx.user.id}`;
      await deleteContractDocument(db, input.documentId, doc.contractId, ctx.user.id, actorName);

      return { ok: true as const };
    }),

  /** Delete a contract (first_party or platform admin only). */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await getOutsourcingContractById(db, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        if (result.contract.companyId !== activeId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only the first party can delete this contract" });
        }
        await requireCanManageContracts(ctx.user, activeId);
      }

      await deleteOutsourcingContract(db, input.id);
      return { ok: true as const };
    }),

  /** Get the audit event timeline for a contract. */
  getTimeline: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await getOutsourcingContractById(db, input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Contract not found" });

      const isPlatform = canAccessGlobalAdminProcedures(ctx.user);
      if (!isPlatform) {
        const activeId = await requireActiveCompanyId(ctx.user.id);
        const partyIds = new Set(result.parties.map((p) => p.companyId).filter(Boolean));
        partyIds.add(result.contract.companyId);
        if (result.promoterDetail) partyIds.add(result.promoterDetail.employerCompanyId);
        if (!partyIds.has(activeId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not in your scope" });
        }
      }

      return result.events;
    }),
});
