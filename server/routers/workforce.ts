import { TRPCError } from "@trpc/server";
import { ENV } from "../_core/env";
import { and, asc, desc, eq, gte, ilike, isNotNull, like, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { z } from "zod";
import { createNotification, getDb, getUserCompany } from "../db";
import {
  auditEvents,
  caseTasks,
  companies,
  companyBranches,
  companyGovernmentAccess,
  companyMembers,
  employeeDocuments,
  employeeGovernmentProfiles,
  employees,
  governmentServiceCases,
  governmentSyncJobs,
  profileChangeRequests,
  users,
  workPermits,
} from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";
import {
  PROFILE_CHANGE_REQUEST_AUDIT_ACTION,
  PROFILE_CHANGE_REQUEST_AUDIT_ENTITY_TYPE,
  reclassifyFieldKeyIsNoOp,
} from "@shared/profileChangeRequestReclassification";
import { PROFILE_FIELD_KEY_FILTER_VALUES, PROFILE_FIELD_KEYS } from "@shared/profileChangeRequestFieldKey";
import { isCompanyProvisioningAdmin, canAccessGlobalAdminProcedures } from "@shared/rbac";
import { escapeLike } from "@shared/objectUtils";
import {
  canReadHrPerformanceAuditSensitiveRows,
  HR_AUDIT_SENSITIVE_ENTITY_TYPES,
  isHrPerformanceSensitiveEntityType,
} from "../hrPerformanceAuditReadPolicy";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { requireActiveCompanyId } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { fileUrlMatchesConfiguredStorage, storagePut } from "../storage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Onboarding-only: first active membership row, or auto-provision for provisioning admins.
 * Do not use for normal tenant authorization — use {@link requireActiveCompanyId} / {@link requireWorkspaceMembership}.
 */
async function getMemberCompanyId(user: Pick<User, "id" | "name" | "email" | "role" | "platformRole">): Promise<number | null> {
  const existing = await getUserCompany(user.id);
  if (existing?.company?.id) return existing.company.id;

  const db = await getDb();
  if (!db) return null;

  // Auto-provision for admin / company_admin users who haven't completed onboarding
  if (!isCompanyProvisioningAdmin(user)) return null;

  // Create a default company for this admin
  const slug = `company-${user.id}-${Date.now()}`;
  const companyName = user.name ? `${user.name}'s Company` : "My Company";
  const insertResult = await db.insert(companies).values({
    name: companyName,
    slug,
    country: "OM",
    status: "active",
  });
  const companyId = Number(insertResult[0].insertId);

  // Create company_members row for this admin
  await db.insert(companyMembers).values({
    companyId,
    userId: user.id,
    role: "company_admin",
    isActive: true,
  });

  return companyId;
}

/**
 * Resolves tenant for workforce reads: explicit workspace via {@link requireActiveCompanyId}
 * (multi-company users must pass `companyId`). If the user has no membership yet, delegates to
 * {@link getMemberCompanyId} once so provisioning admins can still auto-create a default company.
 */
async function resolveWorkforceCompanyId(
  user: User,
  inputCompanyId?: number | null,
): Promise<number> {
  try {
    return await requireActiveCompanyId(user.id, inputCompanyId, user);
  } catch (e) {
    if (e instanceof TRPCError && e.code === "FORBIDDEN" && e.message === "No company membership") {
      const provisioned = await getMemberCompanyId(user);
      if (!provisioned) throw e;
      return await requireActiveCompanyId(user.id, inputCompanyId, user);
    }
    throw e;
  }
}

/**
 * Checks whether a user has a specific granular permission for their company.
 * Platform admins and company_admin role bypass all permission checks.
 * For company_member/reviewer roles, the permission must be explicitly listed
 * in the companyMembers.permissions JSON array.
 *
 * Built-in permission strings:
 *   employees.read, employees.write, employees.delete
 *   work_permits.read, work_permits.renew, work_permits.upload
 *   government_cases.read, government_cases.submit, government_cases.manage
 *   documents.read, documents.upload
 *   sync.trigger
 *   hr.performance.read, hr.performance.manage
 *   hr.training.manage, hr.self_reviews.read, hr.self_reviews.review
 */
async function hasPermission(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number,
  permission: string
): Promise<boolean> {
  // Platform-level admins bypass all permission checks
  if (canAccessGlobalAdminProcedures(user)) return true;

  const db = await getDb();
  if (!db) return false;

  const [member] = await db
    .select({ role: companyMembers.role, permissions: companyMembers.permissions })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, user.id), eq(companyMembers.companyId, companyId), eq(companyMembers.isActive, true)))
    .limit(1);

  if (!member) return false;

  // company_admin has all permissions within their company
  if (member.role === "company_admin") return true;

  // For other roles, check explicit permission list
  const perms: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  return perms.includes(permission) || perms.includes("*");
}

/** HR / company admins may resolve employee profile change requests (employees.write or admin roles). */
async function canManageEmployeeProfileRequests(
  user: Pick<User, "id" | "role" | "platformRole">,
  companyId: number,
): Promise<boolean> {
  if (canAccessGlobalAdminProcedures(user)) return true;
  if (await hasPermission(user, companyId, "employees.write")) return true;
  const db = await getDb();
  if (!db) return false;
  const [member] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(
      and(
        eq(companyMembers.userId, user.id),
        eq(companyMembers.companyId, companyId),
        eq(companyMembers.isActive, true),
      ),
    )
    .limit(1);
  if (!member) return false;
  return member.role === "company_admin" || member.role === "hr_admin";
}

function normalizePermitStatus(raw?: string | null): "active" | "expiring_soon" | "expired" | "in_grace" | "cancelled" | "transferred" | "pending_update" | "unknown" {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  if (s === "active") return "active";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "transferred") return "transferred";
  if (s === "expired") return "expired";
  if (s.includes("grace")) return "in_grace";
  if (s.includes("pending")) return "pending_update";
  return "unknown";
}

function computeDaysToExpiry(expiryDate?: Date | null): number | null {
  if (!expiryDate) return null;
  const now = new Date();
  const diff = expiryDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** When work_permits row is missing or status is unknown, derive lifecycle from expiry (incl. HR-only My Team data). */
function inferPermitStatusFromExpiry(expiryDate?: Date | string | null): "active" | "expiring_soon" | "expired" | "unknown" {
  if (!expiryDate) return "unknown";
  const d = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (Number.isNaN(d.getTime())) return "unknown";
  const days = computeDaysToExpiry(d);
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "active";
}

type WorkPermitRow = typeof workPermits.$inferSelect;

function pickBestPermitRow(rows: WorkPermitRow[]): WorkPermitRow | null {
  if (rows.length === 0) return null;
  const active = rows.find((p) => p.permitStatus === "active");
  if (active) return active;
  const sorted = [...rows].sort(
    (a, b) => (b.expiryDate?.getTime() ?? 0) - (a.expiryDate?.getTime() ?? 0),
  );
  return sorted[0] ?? null;
}

function displayPermitStatus(row: WorkPermitRow | null, fallbackExpiry?: Date | string | null): string | null {
  if (row?.permitStatus && row.permitStatus !== "unknown") return row.permitStatus;
  const ex = row?.expiryDate ?? fallbackExpiry;
  if (!ex) return row?.permitStatus ?? null;
  return inferPermitStatusFromExpiry(ex);
}

function autoTasksForCaseType(caseType: string): Array<{ taskType: string; title: string; sortOrder: number }> {
  const taskMap: Record<string, Array<{ taskType: string; title: string; sortOrder: number }>> = {
    renewal: [
      { taskType: "collect_passport", title: "Collect valid passport copy", sortOrder: 1 },
      { taskType: "collect_medical", title: "Obtain medical fitness certificate", sortOrder: 2 },
      { taskType: "collect_contract", title: "Prepare updated employment contract", sortOrder: 3 },
      { taskType: "submit_mol", title: "Submit renewal application on MOL portal", sortOrder: 4 },
      { taskType: "follow_up", title: "Follow up on government approval", sortOrder: 5 },
    ],
    new_permit: [
      { taskType: "collect_passport", title: "Collect passport and entry visa", sortOrder: 1 },
      { taskType: "collect_medical", title: "Obtain medical fitness certificate", sortOrder: 2 },
      { taskType: "collect_contract", title: "Prepare signed employment contract", sortOrder: 3 },
      { taskType: "verify_cr", title: "Verify CR number and establishment details", sortOrder: 4 },
      { taskType: "submit_mol", title: "Submit new permit application on MOL portal", sortOrder: 5 },
    ],
    cancellation: [
      { taskType: "collect_clearance", title: "Obtain employee clearance letter", sortOrder: 1 },
      { taskType: "return_documents", title: "Collect original documents from employee", sortOrder: 2 },
      { taskType: "submit_mol", title: "Submit cancellation request on MOL portal", sortOrder: 3 },
    ],
    amendment: [
      { taskType: "prepare_amendment", title: "Prepare amendment documentation", sortOrder: 1 },
      { taskType: "submit_mol", title: "Submit amendment on MOL portal", sortOrder: 2 },
    ],
    transfer: [
      { taskType: "collect_noc", title: "Obtain No Objection Certificate from current employer", sortOrder: 1 },
      { taskType: "collect_passport", title: "Collect valid passport copy", sortOrder: 2 },
      { taskType: "submit_mol", title: "Submit transfer request on MOL portal", sortOrder: 3 },
    ],
  };
  return taskMap[caseType] ?? [{ taskType: "review", title: "Review case requirements", sortOrder: 1 }];
}

// ─── Workforce Router ─────────────────────────────────────────────────────────

export const workforceRouter = router({

  // ── Branches ──────────────────────────────────────────────────────────────
  branches: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const companyId = await getMemberCompanyId(ctx.user);
      if (!companyId) return [];
      const db = await getDb();
      if (!db) return [];
      return db.select().from(companyBranches).where(eq(companyBranches.companyId, companyId)).orderBy(asc(companyBranches.branchNameEn));
    }),

    create: protectedProcedure
      .input(z.object({
        branchNameEn: z.string().min(1),
        branchNameAr: z.string().optional(),
        governorate: z.string().optional(),
        wilayat: z.string().optional(),
        locality: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        governmentBranchCode: z.string().optional(),
        isHeadquarters: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "No company access" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await db.insert(companyBranches).values({ companyId, ...input });
        return { id: Number(result[0].insertId) };
      }),
  }),

  // ── Government Access ─────────────────────────────────────────────────────
  govAccess: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const companyId = await getMemberCompanyId(ctx.user);
      if (!companyId) return [];
      const db = await getDb();
      if (!db) return [];
      return db.select().from(companyGovernmentAccess).where(eq(companyGovernmentAccess.companyId, companyId));
    }),

    upsert: protectedProcedure
      .input(z.object({
        provider: z.string().default("mol"),
        accessMode: z.enum(["api", "rpa", "manual"]).default("manual"),
        authorizedSignatoryName: z.string().optional(),
        authorizedSignatoryCivilId: z.string().optional(),
        establishmentNumber: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const existing = await db.select({ id: companyGovernmentAccess.id })
          .from(companyGovernmentAccess)
          .where(and(eq(companyGovernmentAccess.companyId, companyId), eq(companyGovernmentAccess.provider, input.provider)))
          .limit(1);
        if (existing[0]) {
          await db.update(companyGovernmentAccess).set({ ...input, updatedAt: new Date() }).where(eq(companyGovernmentAccess.id, existing[0].id));
          return { id: existing[0].id };
        }
        const result = await db.insert(companyGovernmentAccess).values({ companyId, ...input });
        return { id: Number(result[0].insertId) };
      }),
  }),

  // ── Employees (MOL-enhanced) ───────────────────────────────────────────────
  employees: router({
    list: protectedProcedure
      .input(z.object({
        branchId: z.number().optional(),
        query: z.string().optional(),
        status: z.enum(["active", "on_leave", "terminated", "resigned"]).optional(),
        permitStatus: z.enum(["active", "expiring_soon", "expired", "in_grace", "cancelled", "transferred", "pending_update", "unknown"]).optional(),
        expiringWithinDays: z.number().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
        companyId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const companyId = input.companyId ?? await getMemberCompanyId(ctx.user);
        if (!companyId) return { items: [], total: 0 };
        // Permission check: employees.read
        if (!(await hasPermission(ctx.user, companyId, "employees.read"))) {
          return { items: [], total: 0 }; // Return empty rather than error for read operations
        }
        const db = await getDb();
        if (!db) return { items: [], total: 0 };

        const conditions = [eq(employees.companyId, companyId)];
        if (input.status) conditions.push(eq(employees.status, input.status));
        if (input.branchId) conditions.push(eq(employees.companyId, input.branchId)); // branch filter via join in real impl

        const empRows = await db
          .select()
          .from(employees)
          .where(and(...conditions))
          .orderBy(asc(employees.firstName))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);

        // Enrich with work permit projection (MOL rows + HR/My Team fields when no permit table row)
        const enriched = await Promise.all(empRows.map(async (emp) => {
          const permitRows = await db.select().from(workPermits).where(eq(workPermits.employeeId, emp.id));

          const govProfile = await db
            .select({ civilId: employeeGovernmentProfiles.civilId, visaExpiryDate: employeeGovernmentProfiles.visaExpiryDate })
            .from(employeeGovernmentProfiles)
            .where(eq(employeeGovernmentProfiles.employeeId, emp.id))
            .limit(1);

          const best = pickBestPermitRow(permitRows);
          const hrHasPermit = Boolean(emp.workPermitNumber || emp.workPermitExpiryDate);
          const activePermitNumber = best?.workPermitNumber ?? emp.workPermitNumber ?? null;
          const permitExpiryDate = best?.expiryDate ?? emp.workPermitExpiryDate ?? null;
          const permitStatus = best
            ? displayPermitStatus(best, null)
            : hrHasPermit
              ? inferPermitStatusFromExpiry(emp.workPermitExpiryDate)
              : null;
          const occupationTitle = best?.occupationTitleEn ?? emp.profession ?? emp.position ?? null;
          const daysToExpiry = computeDaysToExpiry(permitExpiryDate);

          return {
            ...emp,
            civilId: govProfile[0]?.civilId ?? emp.nationalId ?? null,
            activePermitNumber,
            permitStatus,
            permitExpiryDate,
            daysToExpiry,
            occupationTitle,
          };
        }));

        // Filter by permit status / expiry if requested
        let filtered = enriched;
        if (input.permitStatus) filtered = filtered.filter(e => e.permitStatus === input.permitStatus);
        if (input.expiringWithinDays != null) filtered = filtered.filter(e => e.daysToExpiry != null && e.daysToExpiry <= input.expiringWithinDays! && e.daysToExpiry >= 0);
        if (input.query) {
          const q = input.query.toLowerCase();
          filtered = filtered.filter(e =>
            `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
            (e.civilId ?? "").toLowerCase().includes(q) ||
            (e.passportNumber ?? "").toLowerCase().includes(q) ||
            (e.activePermitNumber ?? "").toLowerCase().includes(q)
          );
        }

        return { items: filtered, total: filtered.length };
      }),

    getById: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await hasPermission(ctx.user, companyId, "employees.read"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view employees" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [emp] = await db.select().from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
          .limit(1);
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });

        const [govProfile] = await db.select().from(employeeGovernmentProfiles)
          .where(eq(employeeGovernmentProfiles.employeeId, emp.id)).limit(1);

        const permits = await db.select().from(workPermits)
          .where(and(eq(workPermits.employeeId, emp.id), eq(workPermits.companyId, companyId)))
          .orderBy(desc(workPermits.expiryDate));

        const docs = await db.select().from(employeeDocuments)
          .where(and(eq(employeeDocuments.employeeId, emp.id), eq(employeeDocuments.companyId, companyId)))
          .orderBy(desc(employeeDocuments.createdAt));

        const cases = await db.select().from(governmentServiceCases)
          .where(and(eq(governmentServiceCases.employeeId, emp.id), eq(governmentServiceCases.companyId, companyId)))
          .orderBy(desc(governmentServiceCases.createdAt))
          .limit(10);

        const best = pickBestPermitRow(permits);
        const hrHasPermit = Boolean(emp.workPermitNumber || emp.workPermitExpiryDate);
        const effectiveExpiry = best?.expiryDate ?? emp.workPermitExpiryDate ?? null;
        const effectiveStatus = best
          ? (displayPermitStatus(best, null) ?? "unknown")
          : hrHasPermit
            ? inferPermitStatusFromExpiry(emp.workPermitExpiryDate)
            : "unknown";

        let activePermit: WorkPermitRow | null = best;
        if (!activePermit && hrHasPermit) {
          activePermit = {
            id: 0,
            companyId,
            employeeId: emp.id,
            branchId: null,
            provider: "mol",
            workPermitNumber: emp.workPermitNumber ?? `HR-${emp.id}`,
            labourAuthorisationNumber: emp.visaNumber ?? null,
            issueDate: null,
            expiryDate: emp.workPermitExpiryDate,
            graceDate: null,
            statusDate: null,
            durationMonths: null,
            permitStatus: inferPermitStatusFromExpiry(emp.workPermitExpiryDate),
            transferStatus: null,
            skillLevel: null,
            occupationCode: null,
            occupationTitleEn: emp.profession ?? emp.position,
            occupationTitleAr: null,
            occupationClass: null,
            activityCode: null,
            activityNameEn: null,
            activityNameAr: null,
            workLocationGovernorate: null,
            workLocationWilayat: null,
            workLocationArea: null,
            governmentSnapshot: null,
            lastSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as WorkPermitRow;
        }

        const allPermitsForUi = permits.length > 0 ? permits : activePermit && activePermit.id === 0 ? [activePermit] : permits;

        return {
          employee: emp,
          governmentProfile: govProfile ?? null,
          activePermit,
          allPermits: allPermitsForUi,
          documents: docs,
          recentCases: cases,
          permitHealth: {
            daysToExpiry: computeDaysToExpiry(effectiveExpiry),
            status: effectiveStatus,
            expiryDate: effectiveExpiry,
          },
        };
      }),
  }),

  // ── Profile change requests (employee self-service → HR queue) ────────────
  profileChangeRequests: router({
    listForEmployee: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await hasPermission(ctx.user, companyId, "employees.read"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view employees" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [emp] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
          .limit(1);
        if (!emp) throw new TRPCError({ code: "NOT_FOUND" });

        const submitter = alias(users, "pcr_submitter");
        const resolver = alias(users, "pcr_resolver");

        return db
          .select({
            id: profileChangeRequests.id,
            companyId: profileChangeRequests.companyId,
            employeeId: profileChangeRequests.employeeId,
            submittedByUserId: profileChangeRequests.submittedByUserId,
            fieldLabel: profileChangeRequests.fieldLabel,
            fieldKey: profileChangeRequests.fieldKey,
            requestedValue: profileChangeRequests.requestedValue,
            notes: profileChangeRequests.notes,
            status: profileChangeRequests.status,
            submittedAt: profileChangeRequests.submittedAt,
            resolvedAt: profileChangeRequests.resolvedAt,
            resolvedByUserId: profileChangeRequests.resolvedByUserId,
            resolutionNote: profileChangeRequests.resolutionNote,
            submitterName: submitter.name,
            submitterEmail: submitter.email,
            resolverName: resolver.name,
          })
          .from(profileChangeRequests)
          .leftJoin(submitter, eq(submitter.id, profileChangeRequests.submittedByUserId))
          .leftJoin(resolver, eq(resolver.id, profileChangeRequests.resolvedByUserId))
          .where(
            and(
              eq(profileChangeRequests.companyId, companyId),
              eq(profileChangeRequests.employeeId, input.employeeId),
            ),
          )
          .orderBy(desc(profileChangeRequests.submittedAt));
      }),

    /** Company-wide queue for HR — pending first, then by recency. */
    listCompany: protectedProcedure
      .input(
        z.object({
          companyId: z.number().optional(),
          status: z.enum(["all", "pending", "resolved", "rejected"]).default("pending"),
          /** Search employee name, field label, or requested value (substring) */
          query: z.string().max(120).optional(),
          /** Submitted-at window (server-side; uses DB `now()`). */
          ageBucket: z.enum(["any", "lt_24h", "d1_7", "gt_7d"]).default("any"),
          fieldKey: z
            .enum(PROFILE_FIELD_KEY_FILTER_VALUES as unknown as [string, ...string[]])
            .default("all"),
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(30),
        }),
      )
      .query(async ({ ctx, input }) => {
        const companyId = input.companyId ?? (await getMemberCompanyId(ctx.user));
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await hasPermission(ctx.user, companyId, "employees.read"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view profile change requests" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const submitter = alias(users, "pcr_submitter_co");
        const resolver = alias(users, "pcr_resolver_co");

        const conditions = [
          eq(profileChangeRequests.companyId, companyId),
          eq(employees.companyId, companyId),
        ];
        if (input.status !== "all") {
          conditions.push(eq(profileChangeRequests.status, input.status));
        }
        if (input.fieldKey !== "all") {
          conditions.push(eq(profileChangeRequests.fieldKey, input.fieldKey));
        }
        const q = input.query?.trim();
        if (q) {
          const clean = q.trim();
          if (clean.length > 0) {
            const p = `%${escapeLike(clean)}%`;
            conditions.push(
              or(
                like(employees.firstName, p),
                like(employees.lastName, p),
                like(profileChangeRequests.fieldLabel, p),
                like(profileChangeRequests.fieldKey, p),
                like(profileChangeRequests.requestedValue, p),
              )!,
            );
          }
        }
        if (input.ageBucket === "lt_24h") {
          conditions.push(sql`${profileChangeRequests.submittedAt} >= now() - interval '24 hours'`);
        } else if (input.ageBucket === "d1_7") {
          conditions.push(sql`${profileChangeRequests.submittedAt} < now() - interval '24 hours'`);
          conditions.push(sql`${profileChangeRequests.submittedAt} >= now() - interval '7 days'`);
        } else if (input.ageBucket === "gt_7d") {
          conditions.push(sql`${profileChangeRequests.submittedAt} < now() - interval '7 days'`);
        }

        const whereClause = and(...conditions);

        const [countRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(profileChangeRequests)
          .innerJoin(employees, eq(employees.id, profileChangeRequests.employeeId))
          .where(whereClause);

        const total = Number(countRow?.count ?? 0);
        const offset = (input.page - 1) * input.pageSize;

        const rows = await db
          .select({
            id: profileChangeRequests.id,
            companyId: profileChangeRequests.companyId,
            employeeId: profileChangeRequests.employeeId,
            submittedByUserId: profileChangeRequests.submittedByUserId,
            fieldLabel: profileChangeRequests.fieldLabel,
            fieldKey: profileChangeRequests.fieldKey,
            requestedValue: profileChangeRequests.requestedValue,
            notes: profileChangeRequests.notes,
            status: profileChangeRequests.status,
            submittedAt: profileChangeRequests.submittedAt,
            resolvedAt: profileChangeRequests.resolvedAt,
            resolvedByUserId: profileChangeRequests.resolvedByUserId,
            resolutionNote: profileChangeRequests.resolutionNote,
            submitterName: submitter.name,
            submitterEmail: submitter.email,
            resolverName: resolver.name,
            employeeFirstName: employees.firstName,
            employeeLastName: employees.lastName,
            employeeDepartment: employees.department,
            employeePosition: employees.position,
          })
          .from(profileChangeRequests)
          .innerJoin(employees, eq(employees.id, profileChangeRequests.employeeId))
          .leftJoin(submitter, eq(submitter.id, profileChangeRequests.submittedByUserId))
          .leftJoin(resolver, eq(resolver.id, profileChangeRequests.resolvedByUserId))
          .where(whereClause)
          .orderBy(
            desc(sql`(CASE WHEN ${profileChangeRequests.status} = ${"pending"} THEN 1 ELSE 0 END)`),
            desc(profileChangeRequests.submittedAt),
          )
          .limit(input.pageSize)
          .offset(offset);

        return { items: rows, total, page: input.page, pageSize: input.pageSize };
      }),

    /**
     * Pending-queue operational metrics grouped by `fieldKey` (not raw labels).
     * Future reclassification would UPDATE `fieldKey` only; `fieldLabel` stays immutable for audit.
     */
    queueKpis: protectedProcedure
      .input(z.object({ companyId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => {
      const companyId = await resolveWorkforceCompanyId(ctx.user, input?.companyId);
      if (!(await hasPermission(ctx.user, companyId, "employees.read"))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to view profile change request metrics",
        });
      }
      const db = await getDb();
      if (!db) return null;

      const pendingExpr = and(
        eq(profileChangeRequests.companyId, companyId),
        eq(profileChangeRequests.status, "pending"),
      );

      const byKeyRows = await db
        .select({
          fieldKey: profileChangeRequests.fieldKey,
          count: sql<number>`count(*)`,
        })
        .from(profileChangeRequests)
        .where(pendingExpr)
        .groupBy(profileChangeRequests.fieldKey);

      const [totalRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(profileChangeRequests)
        .where(pendingExpr);

      const [oldestRow] = await db
        .select({ oldest: sql<Date | null>`min(${profileChangeRequests.submittedAt})` })
        .from(profileChangeRequests)
        .where(pendingExpr);

      const pendingByFieldKey = byKeyRows.map((r) => ({
        fieldKey: String(r.fieldKey),
        count: Number(r.count ?? 0),
      }));

      const pendingOther = pendingByFieldKey.find((r) => r.fieldKey === "other")?.count ?? 0;

      return {
        pendingTotal: Number(totalRow?.count ?? 0),
        pendingOther,
        pendingByFieldKey,
        oldestPendingSubmittedAt: oldestRow?.oldest ?? null,
      };
    }),

    reclassifyFieldKey: protectedProcedure
      .input(
        z.object({
          requestId: z.number(),
          newFieldKey: z.enum(PROFILE_FIELD_KEYS as unknown as [string, ...string[]]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await canManageEmployeeProfileRequests(ctx.user, companyId))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to reclassify profile change requests",
          });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [row] = await db
          .select()
          .from(profileChangeRequests)
          .where(
            and(
              eq(profileChangeRequests.id, input.requestId),
              eq(profileChangeRequests.companyId, companyId),
            ),
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only open requests can be reclassified" });
        }

        const fromKey = String(row.fieldKey);
        if (reclassifyFieldKeyIsNoOp(fromKey, input.newFieldKey)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Category is already set to this value",
          });
        }

        await db
          .update(profileChangeRequests)
          .set({ fieldKey: input.newFieldKey })
          .where(eq(profileChangeRequests.id, row.id));

        await db.insert(auditEvents).values({
          companyId,
          actorUserId: ctx.user.id,
          entityType: PROFILE_CHANGE_REQUEST_AUDIT_ENTITY_TYPE,
          entityId: row.id,
          action: PROFILE_CHANGE_REQUEST_AUDIT_ACTION,
          beforeState: { fieldKey: fromKey, fieldLabel: row.fieldLabel },
          afterState: { fieldKey: input.newFieldKey },
          metadata: {
            requestId: row.id,
            employeeId: row.employeeId,
            fromFieldKey: fromKey,
            toFieldKey: input.newFieldKey,
          },
        });

        return { success: true as const, fieldKey: input.newFieldKey };
      }),

    resolve: protectedProcedure
      .input(
        z.object({
          requestId: z.number(),
          resolutionNote: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await canManageEmployeeProfileRequests(ctx.user, companyId))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to resolve profile change requests",
          });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [row] = await db
          .select()
          .from(profileChangeRequests)
          .where(
            and(
              eq(profileChangeRequests.id, input.requestId),
              eq(profileChangeRequests.companyId, companyId),
            ),
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Request is already closed" });
        }

        await db
          .update(profileChangeRequests)
          .set({
            status: "resolved",
            resolvedAt: new Date(),
            resolvedByUserId: ctx.user.id,
            resolutionNote: input.resolutionNote?.trim() || null,
          })
          .where(eq(profileChangeRequests.id, row.id));

        const [emp] = await db
          .select({ userId: employees.userId })
          .from(employees)
          .where(eq(employees.id, row.employeeId))
          .limit(1);
        if (emp?.userId) {
          await createNotification(
            {
              userId: emp.userId,
              companyId,
              type: "profile_change_resolved",
              title: "Profile update request handled",
              message: `Your request to update "${row.fieldLabel}" was marked resolved by HR.`,
              link: "/my-portal?tab=profile",
              isRead: false,
            },
            { actorUserId: ctx.user.id },
          );
        }

        return { success: true };
      }),

    reject: protectedProcedure
      .input(
        z.object({
          requestId: z.number(),
          resolutionNote: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await canManageEmployeeProfileRequests(ctx.user, companyId))) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have permission to reject profile change requests",
          });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [row] = await db
          .select()
          .from(profileChangeRequests)
          .where(
            and(
              eq(profileChangeRequests.id, input.requestId),
              eq(profileChangeRequests.companyId, companyId),
            ),
          )
          .limit(1);
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        if (row.status !== "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Request is already closed" });
        }

        await db
          .update(profileChangeRequests)
          .set({
            status: "rejected",
            resolvedAt: new Date(),
            resolvedByUserId: ctx.user.id,
            resolutionNote: input.resolutionNote?.trim() || null,
          })
          .where(eq(profileChangeRequests.id, row.id));

        const [emp] = await db
          .select({ userId: employees.userId })
          .from(employees)
          .where(eq(employees.id, row.employeeId))
          .limit(1);
        if (emp?.userId) {
          const note = input.resolutionNote?.trim();
          await createNotification(
            {
              userId: emp.userId,
              companyId,
              type: "profile_change_rejected",
              title: "Profile update request closed",
              message: note
                ? `Your request to update "${row.fieldLabel}" was closed. Note from HR: ${note}`
                : `Your request to update "${row.fieldLabel}" was closed. Contact HR if you need more help.`,
              link: "/my-portal?tab=profile",
              isRead: false,
            },
            { actorUserId: ctx.user.id },
          );
        }

        return { success: true };
      }),
  }),

  /**
   * Register/update a work permit from Compliance → Work Permits (no PDF).
   * Exposed at top level (`workforce.registerWorkPermitManual`) so proxies that do not expose deeply nested paths still resolve the procedure.
   */
  registerWorkPermitManual: protectedProcedure
    .input(
      z.object({
        /** Selected workspace (required when user belongs to multiple companies) — must match People → My Team */
        companyId: z.number().optional(),
        employeeId: z.number(),
        workPermitNumber: z.string().min(1),
        labourAuthorisationNumber: z.string().optional(),
        occupationCode: z.string().optional(),
        occupationTitleEn: z.string().optional(),
        issueDate: z.string().optional(),
        expiryDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMembership(ctx.user as User, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot register work permits.");
      const companyId = membership.companyId;
      if (!(await hasPermission(ctx.user, companyId, "work_permits.upload"))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to register work permits" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [emp] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
        .limit(1);
      if (!emp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found in your company" });
      }

      const issueDate = input.issueDate ? new Date(input.issueDate) : undefined;
      const expiryDate = input.expiryDate ? new Date(input.expiryDate) : undefined;
      const permitStatus = expiryDate
        ? (inferPermitStatusFromExpiry(expiryDate) as WorkPermitRow["permitStatus"])
        : "unknown";

      let durationMonths: number | null = null;
      if (
        issueDate &&
        expiryDate &&
        !Number.isNaN(issueDate.getTime()) &&
        !Number.isNaN(expiryDate.getTime())
      ) {
        let m =
          (expiryDate.getFullYear() - issueDate.getFullYear()) * 12 +
          (expiryDate.getMonth() - issueDate.getMonth());
        if (expiryDate.getDate() < issueDate.getDate()) m -= 1;
        durationMonths = m >= 0 ? m : null;
      }

      const governmentSnapshot: Record<string, unknown> = {
        source: "manual_register",
        enteredBy: ctx.user.id,
      };
      if (emp.nationality?.trim()) governmentSnapshot.nationality = emp.nationality.trim();
      if (emp.salary != null && String(emp.salary).trim() !== "") {
        governmentSnapshot.salary = String(emp.salary);
        governmentSnapshot.currency = emp.currency ?? "OMR";
      }

      const permitData = {
        companyId,
        employeeId: emp.id,
        provider: "mol",
        workPermitNumber: input.workPermitNumber,
        labourAuthorisationNumber: input.labourAuthorisationNumber ?? null,
        issueDate: issueDate && !Number.isNaN(issueDate.getTime()) ? issueDate : undefined,
        expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : undefined,
        durationMonths,
        permitStatus,
        occupationCode: input.occupationCode ?? null,
        occupationTitleEn: input.occupationTitleEn ?? emp.profession ?? emp.position ?? null,
        governmentSnapshot,
        lastSyncedAt: new Date(),
      };

      const existingPermit = await db
        .select({ id: workPermits.id })
        .from(workPermits)
        .where(and(eq(workPermits.workPermitNumber, input.workPermitNumber), eq(workPermits.companyId, companyId)))
        .limit(1);

      let workPermitId: number;
      if (existingPermit[0]) {
        workPermitId = existingPermit[0].id;
        await db.update(workPermits).set({ ...permitData, updatedAt: new Date() }).where(eq(workPermits.id, workPermitId));
      } else {
        const wpResult = await db.insert(workPermits).values(permitData);
        workPermitId = Number((wpResult[0] as { insertId: number }).insertId);
      }

      await db
        .update(employees)
        .set({
          workPermitNumber: input.workPermitNumber,
          workPermitExpiryDate:
            expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null,
          visaNumber: input.labourAuthorisationNumber ?? emp.visaNumber,
          updatedAt: new Date(),
        })
        .where(eq(employees.id, emp.id));

      if (emp.nationalId) {
        const existingGov = await db
          .select({ id: employeeGovernmentProfiles.id })
          .from(employeeGovernmentProfiles)
          .where(and(eq(employeeGovernmentProfiles.employeeId, emp.id), eq(employeeGovernmentProfiles.provider, "mol")))
          .limit(1);
        const govData = {
          civilId: emp.nationalId,
          lastSyncedAt: new Date(),
        };
        if (existingGov[0]) {
          await db.update(employeeGovernmentProfiles).set({ ...govData, updatedAt: new Date() }).where(eq(employeeGovernmentProfiles.id, existingGov[0].id));
        } else {
          await db.insert(employeeGovernmentProfiles).values({ employeeId: emp.id, provider: "mol", ...govData });
        }
      }

      await db.insert(auditEvents).values({
        companyId,
        actorUserId: ctx.user.id,
        entityType: "work_permit",
        entityId: workPermitId,
        action: "permit_manual_register",
        afterState: { employeeId: emp.id, workPermitNumber: input.workPermitNumber } as Record<string, unknown>,
      });

      return { success: true as const, employeeId: emp.id, workPermitId };
    }),

  // ── Work Permits ──────────────────────────────────────────────────────────
  workPermits: router({
    list: protectedProcedure
      .input(z.object({
        companyId: z.number().optional(),
        branchId: z.number().optional(),
        permitStatus: z.enum(["active", "expiring_soon", "expired", "in_grace", "cancelled", "transferred", "pending_update", "unknown"]).optional(),
        expiringWithinDays: z.number().optional(),
        occupationCode: z.string().optional(),
        query: z.string().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      }))
      .query(async ({ ctx, input }) => {
        const membership = await requireWorkspaceMembership(ctx.user, input.companyId);
        const companyId = membership.companyId;
        // Permission check: work_permits.read
        if (!(await hasPermission(ctx.user, companyId, "work_permits.read"))) {
          return { items: [], total: 0 };
        }
        const db = await getDb();
        if (!db) return { items: [], total: 0 };

        const conditions = [eq(workPermits.companyId, companyId)];
        if (input.occupationCode) conditions.push(eq(workPermits.occupationCode, input.occupationCode));

        const permitRows = await db
          .select()
          .from(workPermits)
          .where(and(...conditions))
          .limit(2000);

        const coveredEmpIds = new Set(permitRows.map((p) => p.employeeId));

        const hrWithPermitFields = await db
          .select()
          .from(employees)
          .where(
            and(
              eq(employees.companyId, companyId),
              or(isNotNull(employees.workPermitNumber), isNotNull(employees.workPermitExpiryDate)),
            ),
          )
          .limit(2000);

        const syntheticFromHr: WorkPermitRow[] = [];
        for (const e of hrWithPermitFields) {
          if (coveredEmpIds.has(e.id)) continue;
          syntheticFromHr.push({
            id: -e.id,
            companyId,
            employeeId: e.id,
            branchId: null,
            provider: "mol",
            workPermitNumber: e.workPermitNumber ?? `HR-${e.id}`,
            labourAuthorisationNumber: e.visaNumber ?? null,
            issueDate: null,
            expiryDate: e.workPermitExpiryDate,
            graceDate: null,
            statusDate: null,
            durationMonths: null,
            permitStatus: inferPermitStatusFromExpiry(e.workPermitExpiryDate) as WorkPermitRow["permitStatus"],
            transferStatus: null,
            skillLevel: null,
            occupationCode: null,
            occupationTitleEn: e.profession ?? e.position,
            occupationTitleAr: null,
            occupationClass: null,
            activityCode: null,
            activityNameEn: null,
            activityNameAr: null,
            workLocationGovernorate: null,
            workLocationWilayat: null,
            workLocationArea: null,
            governmentSnapshot: null,
            lastSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as WorkPermitRow);
        }

        const combined = [...permitRows, ...syntheticFromHr];

        const effectiveListStatus = (wp: WorkPermitRow) =>
          (displayPermitStatus(wp, wp.expiryDate) ?? wp.permitStatus ?? "unknown") as string;

        let merged = combined.filter((wp) => {
          if (input.permitStatus && effectiveListStatus(wp) !== input.permitStatus) return false;
          if (input.expiringWithinDays != null) {
            const days = computeDaysToExpiry(wp.expiryDate);
            if (days == null || days < 0 || days > input.expiringWithinDays) return false;
          }
          return true;
        });

        merged.sort((a, b) => {
          const ta = a.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          const tb = b.expiryDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
          return ta - tb;
        });

        const enrichedAll = await Promise.all(
          merged.map(async (wp) => {
            const [emp] = await db
              .select({ firstName: employees.firstName, lastName: employees.lastName, nationality: employees.nationality })
              .from(employees)
              .where(eq(employees.id, wp.employeeId))
              .limit(1);
            return {
              ...wp,
              employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
              nationality: emp?.nationality ?? null,
              daysToExpiry: computeDaysToExpiry(wp.expiryDate),
              /** True when this row is only from HR / My Team (no MOL row yet). */
              fromHrProfileOnly: wp.id < 0,
            };
          }),
        );

        let filtered = enrichedAll;
        if (input.query) {
          const q = input.query.toLowerCase();
          filtered = filtered.filter(
            (w) =>
              w.workPermitNumber.toLowerCase().includes(q) ||
              w.employeeName.toLowerCase().includes(q) ||
              (w.occupationTitleEn ?? "").toLowerCase().includes(q),
          );
        }

        const total = filtered.length;
        const start = (input.page - 1) * input.pageSize;
        const pageItems = filtered.slice(start, start + input.pageSize);

        return { items: pageItems, total };
      }),

    getById: protectedProcedure
      .input(
        z.object({
          workPermitId: z.number(),
          companyId: z.number().optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const membership = await requireWorkspaceMembership(ctx.user, input.companyId);
        const companyId = membership.companyId;
        if (!(await hasPermission(ctx.user, companyId, "work_permits.read"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view work permits" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [wp] = await db
          .select()
          .from(workPermits)
          .where(and(eq(workPermits.id, input.workPermitId), eq(workPermits.companyId, companyId)))
          .limit(1);
        if (!wp) throw new TRPCError({ code: "NOT_FOUND", message: "Work permit not found" });

        const [emp] = await db
          .select()
          .from(employees)
          .where(and(eq(employees.id, wp.employeeId), eq(employees.companyId, companyId)))
          .limit(1);
        const docs = await db
          .select()
          .from(employeeDocuments)
          .where(and(eq(employeeDocuments.workPermitId, wp.id), eq(employeeDocuments.companyId, companyId)))
          .orderBy(desc(employeeDocuments.createdAt));
        const cases = await db
          .select()
          .from(governmentServiceCases)
          .where(
            and(
              eq(governmentServiceCases.workPermitId, wp.id),
              eq(governmentServiceCases.companyId, companyId),
            ),
          )
          .orderBy(desc(governmentServiceCases.createdAt));

        const [employerCompany] = await db
          .select({
            id: companies.id,
            name: companies.name,
            nameAr: companies.nameAr,
            country: companies.country,
            city: companies.city,
            address: companies.address,
            crNumber: companies.crNumber,
            registrationNumber: companies.registrationNumber,
            pasiNumber: companies.pasiNumber,
            laborCardNumber: companies.laborCardNumber,
            phone: companies.phone,
            email: companies.email,
          })
          .from(companies)
          .where(eq(companies.id, companyId))
          .limit(1);

        return {
          permit: { ...wp, daysToExpiry: computeDaysToExpiry(wp.expiryDate) },
          employee: emp ?? null,
          documents: docs,
          caseHistory: cases,
          employerCompany: employerCompany ?? null,
        };
      }),

    // Transactional upsert from MOL certificate (the core ingestion flow)
    createFromCertificate: protectedProcedure
      .input(z.object({
        fileUrl: z.string().url(),
        fileKey: z.string(),
        parsed: z.object({
          civilId: z.string(),
          fullNameEn: z.string(),
          nationality: z.string().optional(),
          passportNumber: z.string().optional(),
          passportIssueCountry: z.string().optional(),
          passportIssueDate: z.string().optional(),
          passportExpiryDate: z.string().optional(),
          birthDate: z.string().optional(),
          gender: z.string().optional(),
          arrivalDate: z.string().optional(),
          visaNumber: z.string().optional(),
          visaIssueDate: z.string().optional(),
          visaExpiryDate: z.string().optional(),
          residentCardExpiryDate: z.string().optional(),
          crNumber: z.string().optional(),
          companyNameEn: z.string().optional(),
          labourAuthorisationNumber: z.string().optional(),
          workPermitNumber: z.string(),
          issueDate: z.string().optional(),
          expiryDate: z.string().optional(),
          durationMonths: z.number().optional(),
          status: z.string().optional(),
          skillLevel: z.string().optional(),
          occupationCode: z.string().optional(),
          occupationTitleEn: z.string().optional(),
          activityCode: z.string().optional(),
          activityNameEn: z.string().optional(),
          workLocationGovernorate: z.string().optional(),
          workLocationWilayat: z.string().optional(),
          workLocationArea: z.string().optional(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        // Permission check: work_permits.upload
        if (!(await hasPermission(ctx.user, companyId, "work_permits.upload"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to upload work permits" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const p = input.parsed;

        // Validate required fields
        if (!p.workPermitNumber) throw new TRPCError({ code: "BAD_REQUEST", message: "workPermitNumber is required" });
        if (!p.civilId) throw new TRPCError({ code: "BAD_REQUEST", message: "civilId is required" });

        const expectedKeyPrefix = `company/${companyId}/`;
        if (!input.fileKey.startsWith(expectedKeyPrefix)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Certificate must be uploaded to your company storage path before ingestion",
          });
        }
        if (!fileUrlMatchesConfiguredStorage(input.fileUrl, ENV.forgeApiUrl)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "fileUrl must use the configured storage host (same origin as BUILT_IN_FORGE_API_URL)",
          });
        }

        // Upsert employee
        const nameParts = p.fullNameEn.trim().split(" ");
        const firstName = nameParts[0] ?? p.fullNameEn;
        const lastName = nameParts.slice(1).join(" ") || firstName;

        const existingEmp = await db.select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.companyId, companyId), eq(employees.nationalId, p.civilId)))
          .limit(1);

        let employeeId: number;
        if (existingEmp[0]) {
          employeeId = existingEmp[0].id;
          await db.update(employees).set({
            firstName, lastName,
            nationality: p.nationality ?? undefined,
            passportNumber: p.passportNumber ?? undefined,
            updatedAt: new Date(),
          }).where(eq(employees.id, employeeId));
        } else {
          const empResult = await db.insert(employees).values({
            companyId,
            firstName,
            lastName,
            nationalId: p.civilId,
            nationality: p.nationality,
            passportNumber: p.passportNumber,
            status: "active",
          });
          employeeId = Number(empResult[0].insertId);
        }

        // Upsert government profile
        const existingGov = await db.select({ id: employeeGovernmentProfiles.id })
          .from(employeeGovernmentProfiles)
          .where(and(eq(employeeGovernmentProfiles.employeeId, employeeId), eq(employeeGovernmentProfiles.provider, "mol")))
          .limit(1);

        const govData = {
          civilId: p.civilId,
          visaNumber: p.visaNumber,
          visaIssueDate: p.visaIssueDate ? new Date(p.visaIssueDate) : undefined,
          visaExpiryDate: p.visaExpiryDate ? new Date(p.visaExpiryDate) : undefined,
          residentCardExpiryDate: p.residentCardExpiryDate ? new Date(p.residentCardExpiryDate) : undefined,
          rawPayload: input.parsed as Record<string, unknown>,
          lastSyncedAt: new Date(),
        };

        if (existingGov[0]) {
          await db.update(employeeGovernmentProfiles).set({ ...govData, updatedAt: new Date() }).where(eq(employeeGovernmentProfiles.id, existingGov[0].id));
        } else {
          await db.insert(employeeGovernmentProfiles).values({ employeeId, provider: "mol", ...govData });
        }

        // Upsert work permit
        const permitStatus = normalizePermitStatus(p.status);
        const permitData = {
          companyId,
          employeeId,
          provider: "mol",
          workPermitNumber: p.workPermitNumber,
          labourAuthorisationNumber: p.labourAuthorisationNumber,
          issueDate: p.issueDate ? new Date(p.issueDate) : undefined,
          expiryDate: p.expiryDate ? new Date(p.expiryDate) : undefined,
          durationMonths: p.durationMonths,
          permitStatus,
          skillLevel: p.skillLevel,
          occupationCode: p.occupationCode,
          occupationTitleEn: p.occupationTitleEn,
          activityCode: p.activityCode,
          activityNameEn: p.activityNameEn,
          workLocationGovernorate: p.workLocationGovernorate,
          workLocationWilayat: p.workLocationWilayat,
          workLocationArea: p.workLocationArea,
          governmentSnapshot: input.parsed as Record<string, unknown>,
          lastSyncedAt: new Date(),
        };

        const existingPermit = await db
          .select({ id: workPermits.id })
          .from(workPermits)
          .where(and(eq(workPermits.workPermitNumber, p.workPermitNumber), eq(workPermits.companyId, companyId)))
          .limit(1);

        let workPermitId: number;
        if (existingPermit[0]) {
          workPermitId = existingPermit[0].id;
          await db.update(workPermits).set({ ...permitData, updatedAt: new Date() }).where(eq(workPermits.id, workPermitId));
        } else {
          const wpResult = await db.insert(workPermits).values(permitData);
          workPermitId = Number(wpResult[0].insertId);
        }

        // Create document record
        await db.insert(employeeDocuments).values({
          companyId,
          employeeId,
          workPermitId,
          documentType: "mol_work_permit_certificate",
          fileUrl: input.fileUrl,
          fileKey: input.fileKey,
          fileName: "MOL Work Permit Certificate.pdf",
          mimeType: "application/pdf",
          verificationStatus: "verified",
          source: "government",
          createdBy: ctx.user.id,
        });

        // Create audit event
        await db.insert(auditEvents).values({
          companyId,
          actorUserId: ctx.user.id,
          entityType: "work_permit",
          entityId: workPermitId,
          action: "certificate_ingested",
          afterState: input.parsed as Record<string, unknown>,
        });

        return { employeeId, workPermitId, permitStatus };
      }),

    // AI-powered certificate parsing from uploaded document text
    parseCertificate: protectedProcedure
      .input(z.object({ rawText: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert at parsing Oman Ministry of Labour (MOL) work permit certificates. 
Extract all fields from the provided certificate text and return structured JSON. 
Normalize dates to ISO format (YYYY-MM-DD). Uppercase passport numbers. 
Map status strings: Active→active, Cancelled→cancelled, Expired→expired.
Return ONLY valid JSON matching the schema, no extra text.`,
            },
            {
              role: "user",
              content: `Parse this MOL certificate:\n\n${input.rawText}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "mol_certificate",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  civilId: { type: "string" },
                  fullNameEn: { type: "string" },
                  nationality: { type: "string" },
                  passportNumber: { type: "string" },
                  passportExpiryDate: { type: "string" },
                  visaNumber: { type: "string" },
                  visaExpiryDate: { type: "string" },
                  residentCardExpiryDate: { type: "string" },
                  crNumber: { type: "string" },
                  companyNameEn: { type: "string" },
                  workPermitNumber: { type: "string" },
                  labourAuthorisationNumber: { type: "string" },
                  issueDate: { type: "string" },
                  expiryDate: { type: "string" },
                  durationMonths: { type: "number" },
                  status: { type: "string" },
                  skillLevel: { type: "string" },
                  occupationCode: { type: "string" },
                  occupationTitleEn: { type: "string" },
                  activityCode: { type: "string" },
                  activityNameEn: { type: "string" },
                  workLocationGovernorate: { type: "string" },
                  workLocationWilayat: { type: "string" },
                  workLocationArea: { type: "string" },
                },
                required: ["civilId", "fullNameEn", "workPermitNumber"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "LLM returned no content" });
        try {
          return JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse LLM response" });
        }
      }),
  }),

  // ── Government Cases ──────────────────────────────────────────────────────
  cases: router({
    list: protectedProcedure
      .input(z.object({
        employeeId: z.number().optional(),
        workPermitId: z.number().optional(),
        caseStatus: z.enum(["draft", "awaiting_documents", "ready_for_submission", "submitted", "in_review", "action_required", "approved", "rejected", "completed", "cancelled"]).optional(),
        caseType: z.enum(["renewal", "amendment", "cancellation", "contract_registration", "employee_update", "document_update", "new_permit", "transfer"]).optional(),
        page: z.number().default(1),
        pageSize: z.number().default(20),
      }))
      .query(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) return { items: [], total: 0 };
        if (!(await hasPermission(ctx.user, companyId, "government_cases.read"))) {
          return { items: [], total: 0 };
        }
        const db = await getDb();
        if (!db) return { items: [], total: 0 };

        const conditions = [eq(governmentServiceCases.companyId, companyId)];
        if (input.employeeId) conditions.push(eq(governmentServiceCases.employeeId, input.employeeId));
        if (input.workPermitId) conditions.push(eq(governmentServiceCases.workPermitId, input.workPermitId));
        if (input.caseStatus) conditions.push(eq(governmentServiceCases.caseStatus, input.caseStatus));
        if (input.caseType) conditions.push(eq(governmentServiceCases.caseType, input.caseType));

        const rows = await db.select().from(governmentServiceCases)
          .where(and(...conditions))
          .orderBy(desc(governmentServiceCases.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);

        const enriched = await Promise.all(rows.map(async (c) => {
          const tasks = await db.select().from(caseTasks).where(eq(caseTasks.caseId, c.id)).orderBy(asc(caseTasks.sortOrder));
          const emp = c.employeeId
            ? (
                await db
                  .select({ firstName: employees.firstName, lastName: employees.lastName })
                  .from(employees)
                  .where(and(eq(employees.id, c.employeeId), eq(employees.companyId, companyId)))
                  .limit(1)
              )[0]
            : null;
          return { ...c, tasks, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null };
        }));

        return { items: enriched, total: enriched.length };
      }),

    getById: protectedProcedure
      .input(z.object({ caseId: z.number() }))
      .query(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await hasPermission(ctx.user, companyId, "government_cases.read"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to view government cases" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [c] = await db.select().from(governmentServiceCases)
          .where(and(eq(governmentServiceCases.id, input.caseId), eq(governmentServiceCases.companyId, companyId)))
          .limit(1);
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });

        const tasks = await db.select().from(caseTasks).where(eq(caseTasks.caseId, c.id)).orderBy(asc(caseTasks.sortOrder));
        const emp = c.employeeId
          ? (
              await db
                .select()
                .from(employees)
                .where(and(eq(employees.id, c.employeeId), eq(employees.companyId, companyId)))
                .limit(1)
            )[0]
          : null;
        const permit = c.workPermitId
          ? (
              await db
                .select()
                .from(workPermits)
                .where(and(eq(workPermits.id, c.workPermitId), eq(workPermits.companyId, companyId)))
                .limit(1)
            )[0]
          : null;

        return { case: c, tasks, employee: emp ?? null, permit: permit ?? null };
      }),

    create: protectedProcedure
      .input(z.object({
        employeeId: z.number().optional(),
        workPermitId: z.number().optional(),
        branchId: z.number().optional(),
        caseType: z.enum(["renewal", "amendment", "cancellation", "contract_registration", "employee_update", "document_update", "new_permit", "transfer"]),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        // Permission check: government_cases.submit
        if (!(await hasPermission(ctx.user, companyId, "government_cases.submit"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to create government cases" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        if (input.employeeId != null) {
          const [e] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
            .limit(1);
          if (!e) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        }
        if (input.workPermitId != null) {
          const [wp] = await db
            .select({ id: workPermits.id })
            .from(workPermits)
            .where(and(eq(workPermits.id, input.workPermitId), eq(workPermits.companyId, companyId)))
            .limit(1);
          if (!wp) throw new TRPCError({ code: "NOT_FOUND", message: "Work permit not found" });
        }

        const caseResult = await db.insert(governmentServiceCases).values({
          companyId,
          employeeId: input.employeeId,
          workPermitId: input.workPermitId,
          branchId: input.branchId,
          caseType: input.caseType,
          priority: input.priority,
          notes: input.notes,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          requestedBy: ctx.user.id,
          caseStatus: "draft",
        });
        const caseId = Number(caseResult[0].insertId);

        // Auto-generate tasks
        const tasks = autoTasksForCaseType(input.caseType);
        for (const task of tasks) {
          await db.insert(caseTasks).values({ caseId, ...task, taskStatus: "pending" });
        }

        // Audit
        await db.insert(auditEvents).values({
          companyId,
          actorUserId: ctx.user.id,
          entityType: "government_case",
          entityId: caseId,
          action: "created",
          afterState: { caseType: input.caseType, priority: input.priority } as Record<string, unknown>,
        });

        return { caseId };
      }),

    submit: protectedProcedure
      .input(z.object({ caseId: z.number(), governmentReference: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        // Permission check: government_cases.submit
        if (!(await hasPermission(ctx.user, companyId, "government_cases.submit"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to submit government cases" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [c] = await db.select().from(governmentServiceCases)
          .where(and(eq(governmentServiceCases.id, input.caseId), eq(governmentServiceCases.companyId, companyId)))
          .limit(1);
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });

        // Validation: must be in ready_for_submission state
        if (!["draft", "awaiting_documents", "ready_for_submission", "action_required"].includes(c.caseStatus)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot submit case in status: ${c.caseStatus}` });
        }

        // Check required documents are attached
        if (c.employeeId) {
          const docs = await db.select({ id: employeeDocuments.id })
            .from(employeeDocuments)
            .where(
              and(
                eq(employeeDocuments.employeeId, c.employeeId),
                eq(employeeDocuments.companyId, companyId),
                eq(employeeDocuments.verificationStatus, "verified"),
              ),
            )
            .limit(1);
          if (docs.length === 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "At least one verified document is required before submission" });
          }
        }

        await db.update(governmentServiceCases).set({
          caseStatus: "submitted",
          submittedAt: new Date(),
          governmentReference: input.governmentReference,
          updatedAt: new Date(),
        }).where(eq(governmentServiceCases.id, input.caseId));

        await db.insert(auditEvents).values({
          companyId,
          actorUserId: ctx.user.id,
          entityType: "government_case",
          entityId: input.caseId,
          action: "submitted",
          afterState: { governmentReference: input.governmentReference } as Record<string, unknown>,
        });

        return { success: true };
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        caseId: z.number(),
        caseStatus: z.enum(["draft", "awaiting_documents", "ready_for_submission", "submitted", "in_review", "action_required", "approved", "rejected", "completed", "cancelled"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        // Permission check: government_cases.manage (required to update case status)
        if (!(await hasPermission(ctx.user, companyId, "government_cases.manage"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage government cases" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [c] = await db.select({ id: governmentServiceCases.id, caseStatus: governmentServiceCases.caseStatus })
          .from(governmentServiceCases)
          .where(and(eq(governmentServiceCases.id, input.caseId), eq(governmentServiceCases.companyId, companyId)))
          .limit(1);
        if (!c) throw new TRPCError({ code: "NOT_FOUND" });

        const updates: Record<string, unknown> = { caseStatus: input.caseStatus, updatedAt: new Date() };
        if (input.notes) updates.notes = input.notes;
        if (input.caseStatus === "completed") updates.completedAt = new Date();

        await db.update(governmentServiceCases).set({
          caseStatus: input.caseStatus,
          notes: input.notes,
          completedAt: input.caseStatus === "completed" ? new Date() : undefined,
          updatedAt: new Date(),
        }).where(eq(governmentServiceCases.id, input.caseId));

        await db.insert(auditEvents).values({
          companyId,
          actorUserId: ctx.user.id,
          entityType: "government_case",
          entityId: input.caseId,
          action: "status_updated",
          beforeState: { caseStatus: c.caseStatus } as Record<string, unknown>,
          afterState: { caseStatus: input.caseStatus } as Record<string, unknown>,
        });

        return { success: true };
      }),

    updateTask: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        taskStatus: z.enum(["pending", "in_progress", "completed", "skipped", "blocked"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await hasPermission(ctx.user, companyId, "government_cases.manage"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to update case tasks" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [taskRow] = await db
          .select({ taskId: caseTasks.id })
          .from(caseTasks)
          .innerJoin(governmentServiceCases, eq(caseTasks.caseId, governmentServiceCases.id))
          .where(and(eq(caseTasks.id, input.taskId), eq(governmentServiceCases.companyId, companyId)))
          .limit(1);
        if (!taskRow) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

        await db.update(caseTasks).set({
          taskStatus: input.taskStatus,
          completedAt: input.taskStatus === "completed" ? new Date() : undefined,
          updatedAt: new Date(),
        }).where(eq(caseTasks.id, input.taskId));
        return { success: true };
      }),
  }),

  // ── Employee Documents ─────────────────────────────────────────────────────
  documents: router({
    list: protectedProcedure
      .input(z.object({
        employeeId: z.number().optional(),
        workPermitId: z.number().optional(),
        documentType: z.string().optional(),
        expiringWithinDays: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) return [];
        if (!(await hasPermission(ctx.user, companyId, "documents.read"))) {
          return [];
        }
        const db = await getDb();
        if (!db) return [];

        const conditions = [eq(employeeDocuments.companyId, companyId)];
        if (input.employeeId) conditions.push(eq(employeeDocuments.employeeId, input.employeeId));
        if (input.workPermitId) conditions.push(eq(employeeDocuments.workPermitId, input.workPermitId));
        if (input.documentType) conditions.push(sql`${employeeDocuments.documentType} = ${input.documentType}`);
        if (input.expiringWithinDays != null) {
          const cutoff = new Date(Date.now() + input.expiringWithinDays * 86400000);
          conditions.push(lte(employeeDocuments.expiresAt, cutoff));
          conditions.push(gte(employeeDocuments.expiresAt, new Date()));
        }

        const docs = await db.select().from(employeeDocuments)
          .where(and(...conditions))
          .orderBy(desc(employeeDocuments.createdAt));

        return docs.map(d => ({ ...d, daysToExpiry: computeDaysToExpiry(d.expiresAt) }));
      }),

    upload: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        workPermitId: z.number().optional(),
        documentType: z.enum(["mol_work_permit_certificate", "passport", "visa", "resident_card", "labour_card", "employment_contract", "civil_id", "medical_certificate", "photo", "other"]),
        fileDataBase64: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("application/pdf"),
        issuedAt: z.string().optional(),
        expiresAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await hasPermission(ctx.user, companyId, "documents.upload"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to upload documents" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [empRow] = await db
          .select({ id: employees.id })
          .from(employees)
          .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, companyId)))
          .limit(1);
        if (!empRow) throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
        if (input.workPermitId != null) {
          const [wpRow] = await db
            .select({ id: workPermits.id })
            .from(workPermits)
            .where(
              and(
                eq(workPermits.id, input.workPermitId),
                eq(workPermits.companyId, companyId),
                eq(workPermits.employeeId, input.employeeId),
              ),
            )
            .limit(1);
          if (!wpRow) throw new TRPCError({ code: "NOT_FOUND", message: "Work permit not found" });
        }

        const buffer = Buffer.from(input.fileDataBase64, "base64");
        const fileKey = `company/${companyId}/employees/${input.employeeId}/${input.documentType}/${Date.now()}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        const result = await db.insert(employeeDocuments).values({
          companyId,
          employeeId: input.employeeId,
          workPermitId: input.workPermitId,
          documentType: input.documentType,
          fileUrl: url,
          fileKey,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileSizeBytes: buffer.length,
          issuedAt: input.issuedAt ? new Date(input.issuedAt) : undefined,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
          verificationStatus: "pending",
          source: "uploaded",
          createdBy: ctx.user.id,
        });

        await db.insert(auditEvents).values({
          companyId,
          actorUserId: ctx.user.id,
          entityType: "employee_document",
          entityId: Number(result[0].insertId),
          action: "uploaded",
          afterState: { documentType: input.documentType, fileName: input.fileName } as Record<string, unknown>,
        });

        return { id: Number(result[0].insertId), fileUrl: url };
      }),

    verify: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        verificationStatus: z.enum(["verified", "rejected", "pending"]),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await hasPermission(ctx.user, companyId, "documents.upload"))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to verify documents" });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await db.update(employeeDocuments)
          .set({ verificationStatus: input.verificationStatus, updatedAt: new Date() })
          .where(and(eq(employeeDocuments.id, input.documentId), eq(employeeDocuments.companyId, companyId)));

        await db.insert(auditEvents).values({
          companyId,
          actorUserId: ctx.user.id,
          entityType: "employee_document",
          entityId: input.documentId,
          action: `document_${input.verificationStatus}`,
          afterState: { verificationStatus: input.verificationStatus } as Record<string, unknown>,
        });

        return { success: true };
      }),
  }),

  // ── Sync Jobs ─────────────────────────────────────────────────────────────
  sync: router({
    list: protectedProcedure
      .input(z.object({ page: z.number().default(1), pageSize: z.number().default(20) }))
      .query(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) return { items: [], total: 0 };
        const db = await getDb();
        if (!db) return { items: [], total: 0 };

        const rows = await db.select().from(governmentSyncJobs)
          .where(eq(governmentSyncJobs.companyId, companyId))
          .orderBy(desc(governmentSyncJobs.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize);

        return { items: rows, total: rows.length };
      }),

    trigger: protectedProcedure
      .input(z.object({
        provider: z.string().default("mol"),
        mode: z.enum(["full", "delta", "single"]).default("delta"),
        jobType: z.enum(["full_sync", "delta_sync", "single_permit", "employee_sync"]).default("delta_sync"),
        employeeId: z.number().optional(),
        workPermitNumber: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // Create sync job record
        const result = await db.insert(governmentSyncJobs).values({
          companyId,
          provider: input.provider,
          jobType: input.jobType,
          mode: input.mode,
          syncStatus: "pending",
          triggeredBy: ctx.user.id,
          startedAt: new Date(),
          metadata: { employeeId: input.employeeId, workPermitNumber: input.workPermitNumber } as Record<string, unknown>,
        });
        const jobId = Number(result[0].insertId);

        // Simulate sync completion (in production this would be a background job)
        setTimeout(async () => {
          const dbLate = await getDb();
          if (!dbLate) return;
          await dbLate.update(governmentSyncJobs).set({
            syncStatus: "success",
            finishedAt: new Date(),
            recordsFetched: Math.floor(Math.random() * 50) + 1,
            recordsChanged: Math.floor(Math.random() * 10),
          }).where(eq(governmentSyncJobs.id, jobId));
        }, 3000);

        return { jobId, syncStatus: "pending" };
      }),

    // Alias: syncWorkPermits — triggers a work-permit-focused sync job
    syncWorkPermits: protectedProcedure
      .input(z.object({
        provider: z.string().default("mol"),
        mode: z.enum(["full", "delta", "single"]).default("delta"),
        employeeId: z.number().optional(),
        workPermitNumber: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) throw new TRPCError({ code: "FORBIDDEN" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const result = await db.insert(governmentSyncJobs).values({
          companyId,
          provider: input.provider,
          jobType: input.employeeId ? "single_permit" : "delta_sync",
          mode: input.mode,
          syncStatus: "pending",
          triggeredBy: ctx.user.id,
          startedAt: new Date(),
          metadata: { employeeId: input.employeeId, workPermitNumber: input.workPermitNumber, source: "syncWorkPermits" } as Record<string, unknown>,
        });
        const jobId = Number(result[0].insertId);
        // Simulate async completion
        setTimeout(async () => {
          const dbLate = await getDb();
          if (!dbLate) return;
          await dbLate.update(governmentSyncJobs).set({
            syncStatus: "success",
            finishedAt: new Date(),
            recordsFetched: Math.floor(Math.random() * 30) + 1,
            recordsChanged: Math.floor(Math.random() * 8),
          }).where(eq(governmentSyncJobs.id, jobId));
        }, 2500);
        return { jobId, syncStatus: "pending" as const };
      }),

    // Query job status by ID
    getJobStatus: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const companyId = await getMemberCompanyId(ctx.user);
        if (!companyId) return null;
        const db = await getDb();
        if (!db) return null;
        const [job] = await db.select().from(governmentSyncJobs)
          .where(and(eq(governmentSyncJobs.id, input.jobId), eq(governmentSyncJobs.companyId, companyId)))
          .limit(1);
        return job ?? null;
      }),
  }),
  // ── Audit Eventss ──────────────────────────────────────────────────────────
  auditLog: protectedProcedure
    .input(z.object({
      entityType: z.string().optional(),
      entityId: z.number().optional(),
      action: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      const companyId = await getMemberCompanyId(ctx.user);
      if (!companyId) return { items: [], total: 0 };
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const canReadHrAudit = await canReadHrPerformanceAuditSensitiveRows(ctx.user, companyId);
      if (input.entityType && isHrPerformanceSensitiveEntityType(input.entityType) && !canReadHrAudit) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have permission to view HR performance audit records for this entity type.",
        });
      }

      const conditions = [eq(auditEvents.companyId, companyId)];
      if (input.entityType) conditions.push(eq(auditEvents.entityType, input.entityType));
      if (input.entityId) conditions.push(eq(auditEvents.entityId, input.entityId));
      if (input.action) conditions.push(eq(auditEvents.action, input.action));
      if (!canReadHrAudit) {
        conditions.push(notInArray(auditEvents.entityType, [...HR_AUDIT_SENSITIVE_ENTITY_TYPES]));
      }

      const rows = await db.select().from(auditEvents)
        .where(and(...conditions))
        .orderBy(desc(auditEvents.createdAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      return { items: rows, total: rows.length };
    }),

  // ── Dashboard Stats ───────────────────────────────────────────────────────
  dashboardStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const companyId = await resolveWorkforceCompanyId(ctx.user, input?.companyId);
    const db = await getDb();
    if (!db) return null;

    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 86400000);
    const ninetyDays = new Date(now.getTime() + 90 * 86400000);

    const [totalEmployees] = await db.select({ count: sql<number>`COUNT(*)` }).from(employees).where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));
    const [activePermits] = await db.select({ count: sql<number>`COUNT(*)` }).from(workPermits).where(and(eq(workPermits.companyId, companyId), eq(workPermits.permitStatus, "active")));
    const [expiring30] = await db.select({ count: sql<number>`COUNT(*)` }).from(workPermits).where(and(eq(workPermits.companyId, companyId), gte(workPermits.expiryDate, now), lte(workPermits.expiryDate, thirtyDays)));
    const [expiring90] = await db.select({ count: sql<number>`COUNT(*)` }).from(workPermits).where(and(eq(workPermits.companyId, companyId), gte(workPermits.expiryDate, now), lte(workPermits.expiryDate, ninetyDays)));
    const [openCases] = await db.select({ count: sql<number>`COUNT(*)` }).from(governmentServiceCases).where(and(eq(governmentServiceCases.companyId, companyId), sql`caseStatus NOT IN ('completed','cancelled')`));
    const [pendingDocs] = await db.select({ count: sql<number>`COUNT(*)` }).from(employeeDocuments).where(and(eq(employeeDocuments.companyId, companyId), eq(employeeDocuments.verificationStatus, "pending")));
    const [pendingProfileChanges] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(profileChangeRequests)
      .where(and(eq(profileChangeRequests.companyId, companyId), eq(profileChangeRequests.status, "pending")));

    return {
      totalActiveEmployees: Number(totalEmployees?.count ?? 0),
      activePermits: Number(activePermits?.count ?? 0),
      permitsExpiring30Days: Number(expiring30?.count ?? 0),
      permitsExpiring90Days: Number(expiring90?.count ?? 0),
      openGovernmentCases: Number(openCases?.count ?? 0),
      pendingDocumentVerifications: Number(pendingDocs?.count ?? 0),
      pendingProfileChangeRequests: Number(pendingProfileChanges?.count ?? 0),
    };
  }),
});
