import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
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

/**
 * Single key for matching Civil / National ID across DB and Excel.
 * Handles Excel number cells ("124689485.0"), JSON numbers, and leading zeros vs stored text.
 */
function canonicalCivilIdKey(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  let s = String(raw).trim();
  if (!s) return undefined;
  s = s.toLowerCase();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  const compact = s.replace(/\s+/g, "");
  if (/^[\d.-]+$/.test(compact)) {
    const digits = compact.replace(/\D/g, "");
    if (digits.length >= 6) return digits.replace(/^0+/, "") || "0";
  }
  return compact;
}

function canonicalPassportKey(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return undefined;
  return s;
}

/** Match MOL work permit numbers when Civil ID was not stored on first import but permit no. was */
function canonicalWorkPermitKey(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  let s = String(raw).trim();
  if (!s) return undefined;
  s = s.toLowerCase();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  const compact = s.replace(/\s+/g, "");
  if (/^[\d.-]+$/.test(compact)) {
    const digits = compact.replace(/\D/g, "");
    if (digits.length >= 4) return digits.replace(/^0+/, "") || "0";
  }
  return compact;
}

function nonEmptyTrimmed(raw: string | undefined | null): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const t = String(raw).trim();
  return t === "" ? undefined : t;
}

/** Coerce JSON numbers / Excel quirks to trimmed strings for bulk import rows */
const optionalTrimmedString = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}, z.string().optional());

// ─── Bulk import row schema ───────────────────────────────────────────────────

const importRowSchema = z.object({
  // Required
  name: z.string().min(1, "Employee name is required"),
  // Optional — mapped from Excel columns
  civilNumber: optionalTrimmedString,
  passportNumber: optionalTrimmedString,
  visaNumber: optionalTrimmedString,
  occupationCode: z.string().optional(),
  occupationName: z.string().optional(),
  workPermitNumber: optionalTrimmedString,
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
        /** If true, skip rows where civil number already exists in the company (only for brand-new inserts) */
        skipDuplicates: z.boolean().default(true),
        /**
         * If true, rows whose Civil ID or Passport match an existing employee are **updated** from the file
         * (HR + work permit fields) instead of skipped. Use this to re-import MOL / Excel after a first import
         * that missed permit data — no need to delete staff or start over.
         */
        updateExisting: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await requireMembership(ctx.user as User, input.companyId);
      requireNotAuditor(membership.role, "External Auditors cannot import staff.");

      const companyId = membership.companyId;
      /** Explicit false only — treats undefined as true (safe re-import / older clients) */
      const shouldUpdateExisting = input.updateExisting !== false;

      const existing = await getEmployees(companyId, {});
      const existingCivilIds = new Set<string>();
      const existingPassports = new Set<string>();
      const civilToEmployeeId = new Map<string, number>();
      const passportToEmployeeId = new Map<string, number>();
      for (const e of existing) {
        const ck = canonicalCivilIdKey(e.nationalId);
        if (ck) {
          existingCivilIds.add(ck);
          civilToEmployeeId.set(ck, e.id);
        }
        const pk = canonicalPassportKey(e.passportNumber);
        if (pk) {
          existingPassports.add(pk);
          passportToEmployeeId.set(pk, e.id);
        }
      }

      const dbConn = await getDb();
      if (!dbConn) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }

      const existingWorkPermitKeys = new Set<string>();
      const workPermitToEmployeeId = new Map<string, number>();
      const registerWorkPermitKey = (raw: unknown, empId: number) => {
        const wk = canonicalWorkPermitKey(raw);
        if (!wk) return;
        existingWorkPermitKeys.add(wk);
        if (!workPermitToEmployeeId.has(wk)) workPermitToEmployeeId.set(wk, empId);
      };
      for (const e of existing) {
        registerWorkPermitKey(e.workPermitNumber, e.id);
      }
      const permitRows = await dbConn
        .select({ employeeId: workPermits.employeeId, workPermitNumber: workPermits.workPermitNumber })
        .from(workPermits)
        .where(eq(workPermits.companyId, companyId));
      for (const p of permitRows) {
        registerWorkPermitKey(p.workPermitNumber, p.employeeId);
      }

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const errors: Array<{ row: number; name: string; reason: string }> = [];

      const upsertWorkPermitForRow = async (
        dbConn: NonNullable<Awaited<ReturnType<typeof getDb>>>,
        employeeId: number,
        row: z.infer<typeof importRowSchema>,
        wpIssue: Date | undefined,
        wpExpiry: Date | undefined,
      ) => {
        if (!row.workPermitNumber?.trim()) return;
        const permitStatus =
          wpExpiry && wpExpiry.getTime() < Date.now() ? ("expired" as const) : ("active" as const);
        const payload = {
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
        };
        const byNumberRows = await dbConn
          .select({ id: workPermits.id })
          .from(workPermits)
          .where(and(eq(workPermits.companyId, companyId), eq(workPermits.workPermitNumber, row.workPermitNumber.trim())))
          .limit(1);
        const byPermitNumber = byNumberRows[0];
        if (byPermitNumber?.id) {
          await dbConn
            .update(workPermits)
            .set({ ...payload, updatedAt: new Date() })
            .where(eq(workPermits.id, byPermitNumber.id));
          return;
        }
        const byEmpRows = await dbConn
          .select({ id: workPermits.id })
          .from(workPermits)
          .where(and(eq(workPermits.companyId, companyId), eq(workPermits.employeeId, employeeId)))
          .orderBy(desc(workPermits.expiryDate))
          .limit(1);
        const byEmployee = byEmpRows[0];
        if (byEmployee?.id) {
          await dbConn
            .update(workPermits)
            .set({ ...payload, updatedAt: new Date() })
            .where(eq(workPermits.id, byEmployee.id));
          return;
        }
        await dbConn.insert(workPermits).values(payload).catch(() => {
          /* duplicate permit number globally */
        });
      };

      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        const rowNum = i + 1;

        try {
          const civilKey = canonicalCivilIdKey(row.civilNumber);
          const passportKey = canonicalPassportKey(row.passportNumber);
          const wpKey = canonicalWorkPermitKey(row.workPermitNumber);

          const nameParts = row.name.trim().split(/\s+/);
          const firstName = row.firstName || nameParts[0] || row.name;
          const lastName = row.lastName || nameParts.slice(1).join(" ") || firstName;

          const status = mapMolPermitStatusToEmployeeStatus(row.workPermitStatus);

          const hireDateParsed = parseDateField(row.hireDate) ?? parseDateField(row.dateOfIssue);
          const wpIssue = parseDateField(row.dateOfIssue);
          const wpExpiry = parseDateField(row.dateOfExpiry);
          const visaExpiryParsed = parseDateField(row.visaExpiryDate);

          const rawEmpType = (row.employmentType ?? "").toLowerCase().replace(/[\s-]/g, "_");
          const empTypeMap: Record<string, string> = {
            full_time: "full_time", fulltime: "full_time",
            part_time: "part_time", parttime: "part_time",
            contract: "contract", intern: "intern",
          };
          const employmentType = (empTypeMap[rawEmpType] ?? "full_time") as "full_time" | "part_time" | "contract" | "intern";

          let existingEmployeeId: number | null = null;
          if (shouldUpdateExisting) {
            if (civilKey && civilToEmployeeId.has(civilKey)) existingEmployeeId = civilToEmployeeId.get(civilKey)!;
            else if (passportKey && passportToEmployeeId.has(passportKey)) existingEmployeeId = passportToEmployeeId.get(passportKey)!;
            else if (wpKey && workPermitToEmployeeId.has(wpKey)) existingEmployeeId = workPermitToEmployeeId.get(wpKey)!;
          }

          if (existingEmployeeId != null) {
            const pos = nonEmptyTrimmed(row.position) ?? nonEmptyTrimmed(row.occupationName);
            const prof = nonEmptyTrimmed(row.occupationName);
            const updatePayload: Record<string, unknown> = {
              firstName,
              lastName,
              employmentType,
              status,
              workPermitExpiryDate: toMysqlDateString(wpExpiry),
              visaExpiryDate: toMysqlDateString(visaExpiryParsed),
              updatedAt: new Date(),
            };
            const civ = nonEmptyTrimmed(row.civilNumber);
            const ppt = nonEmptyTrimmed(row.passportNumber);
            if (civ !== undefined) updatePayload.nationalId = civ;
            if (ppt !== undefined) updatePayload.passportNumber = ppt;
            if (pos !== undefined) updatePayload.position = pos;
            if (prof !== undefined) updatePayload.profession = prof;
            if (hireDateParsed !== undefined) updatePayload.hireDate = hireDateParsed;
            const fnAr = nonEmptyTrimmed(row.firstNameAr);
            const lnAr = nonEmptyTrimmed(row.lastNameAr);
            if (fnAr !== undefined) updatePayload.firstNameAr = fnAr;
            if (lnAr !== undefined) updatePayload.lastNameAr = lnAr;
            const em = nonEmptyTrimmed(row.email);
            const ph = nonEmptyTrimmed(row.phone);
            const nat = nonEmptyTrimmed(row.nationality);
            const dept = nonEmptyTrimmed(row.department);
            const sal = nonEmptyTrimmed(row.salary);
            const eno = nonEmptyTrimmed(row.employeeNumber);
            const wpn = nonEmptyTrimmed(row.workPermitNumber);
            const vis = nonEmptyTrimmed(row.visaNumber);
            if (em !== undefined) updatePayload.email = em;
            if (ph !== undefined) updatePayload.phone = ph;
            if (nat !== undefined) updatePayload.nationality = nat;
            if (dept !== undefined) updatePayload.department = dept;
            if (sal !== undefined) {
              updatePayload.salary = String(Number(sal));
              updatePayload.currency = row.currency || "OMR";
            }
            if (eno !== undefined) updatePayload.employeeNumber = eno;
            if (wpn !== undefined) updatePayload.workPermitNumber = wpn;
            if (vis !== undefined) updatePayload.visaNumber = vis;
            await dbConn.update(employees).set(updatePayload as any).where(eq(employees.id, existingEmployeeId));

            await upsertWorkPermitForRow(dbConn, existingEmployeeId, row, wpIssue, wpExpiry);
            updated++;
            continue;
          }

          if (input.skipDuplicates) {
            if (civilKey && existingCivilIds.has(civilKey)) {
              skipped++;
              continue;
            }
            if (passportKey && existingPassports.has(passportKey)) {
              skipped++;
              continue;
            }
            if (wpKey && existingWorkPermitKeys.has(wpKey)) {
              skipped++;
              continue;
            }
          }

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

          if (employeeId) {
            await upsertWorkPermitForRow(dbConn, employeeId, row, wpIssue, wpExpiry);
          }

          if (civilKey) existingCivilIds.add(civilKey);
          if (passportKey) existingPassports.add(passportKey);
          if (employeeId && civilKey) civilToEmployeeId.set(civilKey, employeeId);
          if (employeeId && passportKey) passportToEmployeeId.set(passportKey, employeeId);
          if (employeeId && wpKey) {
            existingWorkPermitKeys.add(wpKey);
            workPermitToEmployeeId.set(wpKey, employeeId);
          }

          imported++;
        } catch (err) {
          errors.push({
            row: rowNum,
            name: row.name,
            reason: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }

      return { imported, updated, skipped, errors, total: input.rows.length };
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
