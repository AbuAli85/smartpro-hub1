import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
} from "../db";
import { getDb } from "../db";
import { employees, workPermits } from "../../drizzle/schema";
import { requireNotAuditor, requireWorkspaceMembership } from "../_core/membership";
import { assertRowBelongsToActiveCompany } from "../_core/tenant";
import type { User } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Workspace-scoped company id — multi-company users must pass `companyId` (selected workspace). */
async function requireCompanyId(user: User, companyId?: number | null): Promise<number> {
  const m = await requireWorkspaceMembership(user, companyId);
  return m.companyId;
}

async function requireMembership(user: User, companyId?: number | null) {
  return requireWorkspaceMembership(user, companyId);
}

/** Parse DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD into a Date object, or return undefined */
function parseDateField(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  // DD-MM-YYYY or DD/MM/YYYY (common in Oman / MOL exports)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    const year = dmy[3];
    const d = new Date(`${year}-${month}-${day}`);
    return isNaN(d.getTime()) ? undefined : d;
  }
  // YYYY-MM-DD or ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function toMysqlDateString(d: Date | undefined): string | null {
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** MOL-style status text e.g. "Non Trans Active", "Non Trans Cancelled" */
function mapMolPermitStatusToEmployeeStatus(raw: string | undefined): "active" | "terminated" | "resigned" {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("cancelled") || s.includes("canceled") || s.includes("expired")) return "terminated";
  if (s.includes("deserted")) return "resigned";
  if (s.includes("active") || s.includes("valid")) return "active";
  return "active";
}

// ─── Bulk import row schema ───────────────────────────────────────────────────

const importRowSchema = z.object({
  // Required
  name: z.string().min(1, "Employee name is required"),
  // Optional — mapped from Excel columns
  civilNumber: z.string().optional(),
  passportNumber: z.string().optional(),
  visaNumber: z.string().optional(),
  occupationCode: z.string().optional(),
  occupationName: z.string().optional(),
  workPermitNumber: z.string().optional(),
  workPermitStatus: z.string().optional(),
  dateOfIssue: z.string().optional(),
  dateOfExpiry: z.string().optional(),
  transferred: z.string().optional(),
  // Full employee master data fields
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  firstNameAr: z.string().optional(),
  lastNameAr: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  nationality: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  employmentType: z.string().optional(),
  salary: z.string().optional(),
  currency: z.string().optional(),
  hireDate: z.string().optional(),
  employeeNumber: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  maritalStatus: z.string().optional(),
  profession: z.string().optional(),
  visaExpiryDate: z.string().optional(),
  workPermitExpiryDate: z.string().optional(),
  pasiNumber: z.string().optional(),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
});

// ─── router ──────────────────────────────────────────────────────────────────

export const teamRouter = router({
  /** List all staff for the caller's company, with optional search + filters */
  listMembers: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        search: z.string().optional(),
        status: z.enum(["active", "on_leave", "terminated", "resigned"]).optional(),
        department: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const companyId = await requireCompanyId(ctx.user as User, input.companyId);
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
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const emp = await getEmployeeById(input.id);
      if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      await assertRowBelongsToActiveCompany(ctx.user, emp.companyId, "Staff member", input.companyId);
      return emp;
    }),

  /** Add a new staff member */
  addMember: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
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
        workPermitNumber: z.string().optional(),
        visaNumber: z.string().optional(),
        occupationCode: z.string().optional(),
        occupationName: z.string().optional(),
        workPermitExpiry: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user as User, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot add staff.");
      const companyId = membership.companyId;
      const {
        companyId: _cid,
        occupationCode,
        occupationName,
        workPermitExpiry,
        workPermitNumber,
        visaNumber,
        ...core
      } = input;

      const emp = await createEmployee({
        ...core,
        email: core.email || undefined,
        companyId,
        salary: core.salary != null ? String(core.salary) : undefined,
        hireDate: core.hireDate ? new Date(core.hireDate) : undefined,
        workPermitNumber: workPermitNumber || undefined,
        visaNumber: visaNumber || undefined,
        workPermitExpiryDate: workPermitExpiry ? (parseDateField(workPermitExpiry) as any) : undefined,
      } as any);

      // Mirror hr.createEmployee: formal permit row drives Compliance / Work Permits UI
      if (workPermitNumber) {
        const db = await getDb();
        if (db && emp) {
          const employeeId = Number((emp as { insertId?: number }).insertId ?? 0);
          if (employeeId) {
            await db
              .insert(workPermits)
              .values({
                companyId,
                employeeId,
                workPermitNumber,
                labourAuthorisationNumber: visaNumber ?? null,
                occupationCode: occupationCode ?? null,
                occupationTitleEn: occupationName ?? null,
                issueDate: null,
                expiryDate: workPermitExpiry ? parseDateField(workPermitExpiry) ?? null : null,
                permitStatus: "active",
              })
              .catch(() => {
                /* duplicate permit number or DB constraint */
              });
          }
        }
      }

      return { success: true };
    }),

  /** Update staff member details */
  updateMember: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        companyId: z.number().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        firstNameAr: z.string().optional(),
        lastNameAr: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional(),
        department: z.string().optional(),
        position: z.string().optional(),
        status: z.enum(["active", "on_leave", "terminated", "resigned"]).optional(),
        salary: z.number().positive().optional(),
        currency: z.string().optional(),
        employmentType: z
          .enum(["full_time", "part_time", "contract", "intern"])
          .optional(),
        nationality: z.string().optional(),
        passportNumber: z.string().optional(),
        nationalId: z.string().optional(),
        hireDate: z.string().optional(),
        employeeNumber: z.string().optional(),
        workPermitNumber: z.string().optional(),
        visaNumber: z.string().optional(),
        occupationCode: z.string().optional(),
        occupationName: z.string().optional(),
        workPermitExpiry: z.string().optional(),
        // Extended HR fields
        dateOfBirth: z.string().optional(),
        gender: z.enum(["male", "female"]).optional(),
        maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
        profession: z.string().optional(),
        visaExpiryDate: z.string().optional(),
        workPermitExpiryDate: z.string().optional(),
        pasiNumber: z.string().optional(),
        bankName: z.string().optional(),
        bankAccountNumber: z.string().optional(),
        emergencyContactName: z.string().optional(),
        emergencyContactPhone: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user as User, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot update staff.");
      const {
        id,
        companyId: _cid,
        hireDate,
        dateOfBirth,
        visaExpiryDate,
        workPermitExpiryDate,
        workPermitNumber,
        visaNumber,
        occupationCode,
        occupationName,
        workPermitExpiry,
        ...data
      } = input;
      const existing = await getEmployeeById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "Staff member", input.companyId);
      const updateData: Record<string, unknown> = { ...data };
      if (data.salary != null) updateData.salary = String(data.salary);
      if ("email" in data && data.email === "") updateData.email = null;
      // timestamp columns require Date objects
      if (hireDate !== undefined) updateData.hireDate = hireDate ? new Date(hireDate) : null;
      // date columns accept string values (YYYY-MM-DD)
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth || null;
      if (visaExpiryDate !== undefined) updateData.visaExpiryDate = visaExpiryDate || null;
      if (workPermitExpiryDate !== undefined) updateData.workPermitExpiryDate = workPermitExpiryDate || null;
      if (workPermitExpiry !== undefined) {
        updateData.workPermitExpiryDate = workPermitExpiry ? parseDateField(workPermitExpiry) ?? workPermitExpiry : null;
      }
      await updateEmployee(id, updateData as any);

      // Keep work_permits in sync (same behaviour as hr.updateEmployee)
      if (
        workPermitNumber !== undefined ||
        visaNumber !== undefined ||
        workPermitExpiry !== undefined ||
        occupationCode !== undefined ||
        occupationName !== undefined
      ) {
        const db = await getDb();
        if (db) {
          const existingPermits = await db
            .select({ id: workPermits.id })
            .from(workPermits)
            .where(eq(workPermits.employeeId, id))
            .limit(1);
          const permitUpdate: Record<string, unknown> = {};
          if (workPermitNumber !== undefined) permitUpdate.workPermitNumber = workPermitNumber;
          if (visaNumber !== undefined) permitUpdate.labourAuthorisationNumber = visaNumber;
          if (occupationCode !== undefined) permitUpdate.occupationCode = occupationCode;
          if (occupationName !== undefined) permitUpdate.occupationTitleEn = occupationName;
          if (workPermitExpiry !== undefined) {
            permitUpdate.expiryDate = workPermitExpiry ? parseDateField(workPermitExpiry) ?? null : null;
          }
          if (existingPermits.length > 0) {
            await db.update(workPermits).set(permitUpdate).where(eq(workPermits.id, existingPermits[0].id));
          } else if (workPermitNumber) {
            await db
              .insert(workPermits)
              .values({
                companyId: existing.companyId,
                employeeId: id,
                workPermitNumber,
                labourAuthorisationNumber: visaNumber ?? null,
                occupationCode: occupationCode ?? null,
                occupationTitleEn: occupationName ?? null,
                expiryDate: workPermitExpiry ? parseDateField(workPermitExpiry) ?? null : null,
                permitStatus: "active",
              })
              .catch(() => {
                /* ignore */
              });
          }
        }
      }

      return { success: true };
    }),

  /** Soft-delete / offboard a staff member (sets status to terminated) */
  removeMember: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user as User, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot remove staff.");
      const existing = await getEmployeeById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Staff member not found." });
      await assertRowBelongsToActiveCompany(ctx.user, existing.companyId, "Staff member", input.companyId);
      await updateEmployee(input.id, {
        status: "terminated",
        terminationDate: new Date(),
      } as any);
      return { success: true };
    }),

  /** Team statistics: headcount, status breakdown, department breakdown, recent hires */
  getTeamStats: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const companyId = await requireCompanyId(ctx.user as User, input?.companyId);
      const all = await getEmployees(companyId, {});

      const byStatus: Record<string, number> = {};
      const byDept: Record<string, number> = {};
      const recentHires: typeof all = [];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const warnCutoff = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days ahead
      let expiryWarnings = 0;

      for (const e of all) {
        byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
        const dept = e.department || "Unassigned";
        byDept[dept] = (byDept[dept] ?? 0) + 1;
        if (e.hireDate && new Date(e.hireDate) >= thirtyDaysAgo) {
          recentHires.push(e);
        }
        // Count active employees with expired or expiring-soon docs
        if (e.status === "active") {
          const checkExpiry = (d: Date | string | null | undefined) => {
            if (!d) return false;
            const dt = new Date(d as string);
            return !isNaN(dt.getTime()) && dt <= warnCutoff;
          };
          if (
            checkExpiry((e as any).visaExpiryDate) ||
            checkExpiry((e as any).workPermitExpiryDate) ||
            checkExpiry((e as any).passportExpiry)
          ) {
            expiryWarnings++;
          }
        }
      }

      return {
        total: all.length,
        active: byStatus["active"] ?? 0,
        onLeave: byStatus["on_leave"] ?? 0,
        terminated: byStatus["terminated"] ?? 0,
        resigned: byStatus["resigned"] ?? 0,
        expiryWarnings,
        byStatus,
        byDepartment: Object.entries(byDept)
          .map(([dept, count]) => ({ dept, count }))
          .sort((a, b) => b.count - a.count),
        recentHires: recentHires.slice(0, 5),
      };
    }),

  /**
   * Bulk import employees from a parsed Excel/CSV payload.
   * The frontend parses the file client-side and sends the rows as JSON.
   * Returns { imported, skipped, errors } summary.
   */
  bulkImport: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        rows: z.array(importRowSchema),
        /** If true, skip rows where civil number already exists in the company */
        skipDuplicates: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user as User, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot import staff.");

      const companyId = membership.companyId;

      // Fetch existing civil IDs and passport numbers to detect duplicates
      const existing = await getEmployees(companyId, {});
      const existingCivilIds = new Set(
        existing.map((e) => e.nationalId?.toLowerCase()).filter(Boolean)
      );
      const existingPassports = new Set(
        existing.map((e) => e.passportNumber?.toLowerCase()).filter(Boolean)
      );

      let imported = 0;
      let skipped = 0;
      const errors: Array<{ row: number; name: string; reason: string }> = [];

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        const rowNum = i + 1;

        try {
          // Duplicate check
          if (input.skipDuplicates) {
            const civilKey = row.civilNumber?.toLowerCase();
            const passportKey = row.passportNumber?.toLowerCase();
            if (civilKey && existingCivilIds.has(civilKey)) {
              skipped++;
              continue;
            }
            if (passportKey && existingPassports.has(passportKey)) {
              skipped++;
              continue;
            }
          }

          // Split full name into first/last (use explicit columns if provided)
          const nameParts = row.name.trim().split(/\s+/);
          const firstName = row.firstName || nameParts[0] || row.name;
          const lastName = row.lastName || nameParts.slice(1).join(" ") || firstName;

          // Map MOL / Excel permit status (e.g. "Non Trans Active") → employee status
          const status = mapMolPermitStatusToEmployeeStatus(row.workPermitStatus);

          const hireDateParsed = parseDateField(row.hireDate) ?? parseDateField(row.dateOfIssue);
          const wpIssue = parseDateField(row.dateOfIssue);
          const wpExpiry = parseDateField(row.dateOfExpiry);
          const visaExpiryParsed = parseDateField(row.visaExpiryDate);

          // Determine employment type
          const rawEmpType = (row.employmentType ?? "").toLowerCase().replace(/[\s-]/g, "_");
          const empTypeMap: Record<string, string> = {
            full_time: "full_time", fulltime: "full_time",
            part_time: "part_time", parttime: "part_time",
            contract: "contract", intern: "intern",
          };
          const employmentType = (empTypeMap[rawEmpType] ?? "full_time") as "full_time" | "part_time" | "contract" | "intern";

          const dbConn = await getDb();
          if (!dbConn) throw new Error("Database unavailable");

          const empResult = await dbConn.insert(employees).values({
            companyId,
            firstName,
            lastName,
            firstNameAr: row.firstNameAr ?? null,
            lastNameAr: row.lastNameAr ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            nationality: row.nationality ?? null,
            nationalId: row.civilNumber?.trim() || null,
            passportNumber: row.passportNumber?.trim() || null,
            department: row.department ?? null,
            position: row.position?.trim() || row.occupationName?.trim() || null,
            profession: row.occupationName?.trim() || null,
            employmentType,
            status,
            salary: row.salary ? String(Number(row.salary)) : null,
            currency: row.currency || "OMR",
            hireDate: hireDateParsed ?? null,
            employeeNumber: row.employeeNumber?.trim() || null,
            workPermitNumber: row.workPermitNumber?.trim() || null,
            visaNumber: row.visaNumber?.trim() || null,
            workPermitExpiryDate: toMysqlDateString(wpExpiry),
            visaExpiryDate: toMysqlDateString(visaExpiryParsed),
          } as any);

          const employeeId = Number((empResult[0] as { insertId?: number }).insertId ?? 0);

          if (employeeId && row.workPermitNumber?.trim()) {
            const permitStatus =
              wpExpiry && wpExpiry.getTime() < Date.now() ? ("expired" as const) : ("active" as const);
            await dbConn
              .insert(workPermits)
              .values({
                companyId,
                employeeId,
                workPermitNumber: row.workPermitNumber.trim(),
                labourAuthorisationNumber: row.visaNumber?.trim() ?? null,
                occupationCode: row.occupationCode?.trim() ?? null,
                occupationTitleEn: row.occupationName?.trim() ?? null,
                issueDate: wpIssue ?? null,
                expiryDate: wpExpiry ?? null,
                permitStatus,
                governmentSnapshot: { source: "bulk_import" } as Record<string, unknown>,
                lastSyncedAt: new Date(),
              })
              .catch(() => {
                /* duplicate work permit number across tenants, etc. */
              });
          }

          // Update duplicate tracking sets
          if (row.civilNumber) existingCivilIds.add(row.civilNumber.toLowerCase());
          if (row.passportNumber) existingPassports.add(row.passportNumber.toLowerCase());

          imported++;
        } catch (err) {
          errors.push({
            row: rowNum,
            name: row.name,
            reason: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return { imported, skipped, errors, total: input.rows.length };
    }),

  /** Clear all employees for the active company (admin only) */
  clearAllEmployees: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await requireMembership(ctx.user as User, input.companyId);
      if (membership.role !== "company_admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only company admins can clear employee data" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { eq } = await import("drizzle-orm");
      const result = await db.delete(employees).where(eq(employees.companyId, membership.companyId));
      return { deleted: (result as any).affectedRows ?? 0 };
    }),
});
