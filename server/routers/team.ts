import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
} from "../db";
import { getDb } from "../db";
import { employees } from "../../drizzle/schema";
import { getActiveCompanyMembership, requireActiveCompanyMembership } from "../_core/membership";
import { requireNotAuditor } from "../_core/membership";
import { assertRowBelongsToActiveCompany } from "../_core/tenant";
import { protectedProcedure, router } from "../_core/trpc";

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolves the company ID for the current user.
 * If companyId is provided, validates the user is a member of that company.
 * Otherwise falls back to the user's first active company membership.
 */
async function requireCompanyId(userId: number, companyId?: number | null): Promise<number> {
  const m = await getActiveCompanyMembership(userId, companyId);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
  return m.companyId;
}

async function requireMembership(userId: number, companyId?: number | null) {
  const m = await getActiveCompanyMembership(userId, companyId);
  if (!m) throw new TRPCError({ code: "FORBIDDEN", message: "No active company membership." });
  return m;
}

/** Parse a DD-MM-YYYY or YYYY-MM-DD date string into a Date object, or return undefined */
function parseDateField(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  // DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const d = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
    return isNaN(d.getTime()) ? undefined : d;
  }
  // YYYY-MM-DD or ISO
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
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
      const companyId = await requireCompanyId(ctx.user.id, input.companyId);
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
      const membership = await requireMembership(ctx.user.id, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot add staff.");
      const { companyId: _cid, ...rest } = input;
      await createEmployee({
        ...rest,
        email: rest.email || undefined,
        companyId: membership.companyId,
        salary: rest.salary != null ? String(rest.salary) : undefined,
        hireDate: rest.hireDate ? new Date(rest.hireDate) : undefined,
      });
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
      const membership = await requireMembership(ctx.user.id, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot update staff.");
      const { id, companyId: _cid, hireDate, dateOfBirth, visaExpiryDate, workPermitExpiryDate, ...data } = input;
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
      await updateEmployee(id, updateData as any);
      return { success: true };
    }),

  /** Soft-delete / offboard a staff member (sets status to terminated) */
  removeMember: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user.id, input.companyId);
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
      const companyId = await requireCompanyId(ctx.user.id, input?.companyId);
      const all = await getEmployees(companyId, {});

      const byStatus: Record<string, number> = {};
      const byDept: Record<string, number> = {};
      const recentHires: typeof all = [];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      for (const e of all) {
        byStatus[e.status] = (byStatus[e.status] ?? 0) + 1;
        const dept = e.department || "Unassigned";
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
      const membership = await requireMembership(ctx.user.id, input.companyId);
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

          // Map work permit status → employee status
          const rawStatus = (row.workPermitStatus ?? "").toLowerCase();
          let status: "active" | "terminated" | "resigned" = "active";
          if (rawStatus === "cancelled" || rawStatus === "expired") status = "terminated";
          else if (rawStatus === "deserted") status = "resigned";

          // Parse dates
          const hireDate = parseDateField(row.hireDate || row.dateOfIssue);

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
          await dbConn.insert(employees).values({
            companyId,
            firstName,
            lastName,
            firstNameAr: row.firstNameAr ?? null,
            lastNameAr: row.lastNameAr ?? null,
            email: row.email ?? null,
            phone: row.phone ?? null,
            nationality: row.nationality ?? null,
            nationalId: row.civilNumber ?? null,
            passportNumber: row.passportNumber ?? null,
            department: row.department ?? null,
            position: row.position || row.occupationName || null,
            employmentType,
            status,
            salary: row.salary ? String(Number(row.salary)) : null,
            currency: row.currency || "OMR",
            hireDate: hireDate ?? null,
            employeeNumber: row.employeeNumber ?? null,
          } as any);

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
      const membership = await requireMembership(ctx.user.id, input.companyId);
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
