import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, isNull, gte, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { companyDocuments, employeeDocuments, employees } from "../../drizzle/schema";
import { storagePut } from "../storage";
import {
  getActiveCompanyMembership,
  requireNotAuditor,
} from "../_core/membership";
import { protectedProcedure, router } from "../_core/trpc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}

function computeExpiryStatus(
  expiryDate: string | Date | null | undefined
): "valid" | "expiring_soon" | "expired" | "no_expiry" {
  if (!expiryDate) return "no_expiry";
  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysLeft = Math.floor(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 90) return "expiring_soon";
  return "valid";
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const documentsRouter = router({
  // ── Company: list all documents ───────────────────────────────────────────
  listCompanyDocs: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getActiveCompanyMembership(ctx.user.id);
    if (!membership)
      throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
    const db = await getDb();
    if (!db) return [];
    const docs = await db
      .select()
      .from(companyDocuments)
      .where(
        and(
          eq(companyDocuments.companyId, membership.companyId),
          eq(companyDocuments.isDeleted, false)
        )
      )
      .orderBy(desc(companyDocuments.createdAt));

    return docs.map((d) => ({
      ...d,
      expiryStatus: computeExpiryStatus(d.expiryDate),
    }));
  }),

  // ── Company: upload / create document ────────────────────────────────────
  uploadCompanyDoc: protectedProcedure
    .input(
      z.object({
        docType: z.string().min(1),
        title: z.string().min(1),
        docNumber: z.string().optional(),
        issuingAuthority: z.string().optional(),
        issueDate: z.string().optional(),
        expiryDate: z.string().optional(),
        notes: z.string().optional(),
        fileBase64: z.string().optional(),
        fileName: z.string().optional(),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
      requireNotAuditor(membership.role);

      let fileUrl: string | undefined;
      let fileKey: string | undefined;

      if (input.fileBase64 && input.fileName) {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const ext = input.fileName.split(".").pop() ?? "pdf";
        const key = `company-docs/${membership.companyId}/${input.docType}-${randomSuffix()}.${ext}`;
        const result = await storagePut(
          key,
          buffer,
          input.mimeType ?? "application/pdf"
        );
        fileUrl = result.url;
        fileKey = result.key;
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const insertRow: typeof companyDocuments.$inferInsert = {
        companyId: membership.companyId,
        docType: input.docType,
        title: input.title,
        docNumber: input.docNumber ?? null,
        issuingAuthority: input.issuingAuthority ?? null,
        issueDate: input.issueDate ? new Date(input.issueDate) : null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        fileUrl: fileUrl ?? null,
        fileKey: fileKey ?? null,
        mimeType: input.mimeType ?? null,
        fileSize: input.fileSize ?? null,
        notes: input.notes ?? null,
        uploadedBy: ctx.user.id,
      };
      const [inserted] = await db.insert(companyDocuments).values(insertRow);

      return { success: true, id: (inserted as any).insertId };
    }),

  // ── Company: update document metadata ────────────────────────────────────
  updateCompanyDoc: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).optional(),
        docNumber: z.string().optional(),
        issuingAuthority: z.string().optional(),
        issueDate: z.string().optional(),
        expiryDate: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
      requireNotAuditor(membership.role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [existing] = await db
        .select()
        .from(companyDocuments)
        .where(
          and(
            eq(companyDocuments.id, input.id),
            eq(companyDocuments.companyId, membership.companyId),
            eq(companyDocuments.isDeleted, false)
          )
        )
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.docNumber !== undefined) updateData.docNumber = input.docNumber;
      if (input.issuingAuthority !== undefined)
        updateData.issuingAuthority = input.issuingAuthority;
      if (input.issueDate !== undefined)
        updateData.issueDate = input.issueDate ? new Date(input.issueDate) : null;
      if (input.expiryDate !== undefined)
        updateData.expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;
      if (input.notes !== undefined) updateData.notes = input.notes;

      await db
        .update(companyDocuments)
        .set(updateData)
        .where(eq(companyDocuments.id, input.id));

      return { success: true };
    }),

  // ── Company: delete document ──────────────────────────────────────────────
  deleteCompanyDoc: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
      requireNotAuditor(membership.role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .update(companyDocuments)
        .set({ isDeleted: true })
        .where(
          and(
            eq(companyDocuments.id, input.id),
            eq(companyDocuments.companyId, membership.companyId)
          )
        );

      return { success: true };
    }),

  // ── Company: get stats ────────────────────────────────────────────────────
  getCompanyDocStats: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getActiveCompanyMembership(ctx.user.id);
    if (!membership)
      return { total: 0, valid: 0, expiringSoon: 0, expired: 0, noExpiry: 0 };

    const db = await getDb();
    if (!db) return { total: 0, valid: 0, expiringSoon: 0, expired: 0, noExpiry: 0 };
    const docs = await db
      .select()
      .from(companyDocuments)
      .where(
        and(
          eq(companyDocuments.companyId, membership.companyId),
          eq(companyDocuments.isDeleted, false)
        )
      );

    const stats = {
      total: docs.length,
      valid: 0,
      expiringSoon: 0,
      expired: 0,
      noExpiry: 0,
    };
    for (const d of docs) {
      const status = computeExpiryStatus(d.expiryDate);
      if (status === "valid") stats.valid++;
      else if (status === "expiring_soon") stats.expiringSoon++;
      else if (status === "expired") stats.expired++;
      else stats.noExpiry++;
    }
    return stats;
  }),

  // ── Employee: list documents for an employee ──────────────────────────────
  listEmployeeDocs: protectedProcedure
    .input(z.object({ employeeId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });

      const db = await getDb();
      if (!db) return [];
      const docs = await db
        .select()
        .from(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.employeeId, input.employeeId),
            eq(employeeDocuments.companyId, membership.companyId)
          )
        )
        .orderBy(desc(employeeDocuments.createdAt));

      return docs.map((d) => ({
        ...d,
        expiryStatus: computeExpiryStatus(d.expiresAt),
      }));
    }),

  // ── Employee: upload document ─────────────────────────────────────────────
  uploadEmployeeDoc: protectedProcedure
    .input(
      z.object({
        employeeId: z.number().int().positive(),
        documentType: z.enum([
          "mol_work_permit_certificate",
          "passport",
          "visa",
          "resident_card",
          "labour_card",
          "employment_contract",
          "civil_id",
          "medical_certificate",
          "photo",
          "other",
        ]),
        fileName: z.string().min(1),
        issuedAt: z.string().optional(),
        expiresAt: z.string().optional(),
        fileBase64: z.string().min(1),
        mimeType: z.string().default("application/octet-stream"),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
      requireNotAuditor(membership.role);

      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop() ?? "pdf";
      const key = `employee-docs/${membership.companyId}/${input.employeeId}/${input.documentType}-${randomSuffix()}.${ext}`;
      const result = await storagePut(key, buffer, input.mimeType);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [inserted] = await db.insert(employeeDocuments).values({
        companyId: membership.companyId,
        employeeId: input.employeeId,
        documentType: input.documentType,
        fileUrl: result.url,
        fileKey: result.key,
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSize ?? null,
        issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: ctx.user.id,
        source: "uploaded",
        verificationStatus: "pending",
      });

      return { success: true, id: (inserted as any).insertId, url: result.url };
    }),

  // ── Employee: update document metadata ───────────────────────────────────
  updateEmployeeDoc: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        issuedAt: z.string().optional(),
        expiresAt: z.string().optional(),
        verificationStatus: z
          .enum(["pending", "verified", "rejected", "expired"])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
      requireNotAuditor(membership.role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const updateData: Record<string, unknown> = {};
      if (input.issuedAt !== undefined)
        updateData.issuedAt = input.issuedAt ? new Date(input.issuedAt) : null;
      if (input.expiresAt !== undefined)
        updateData.expiresAt = input.expiresAt
          ? new Date(input.expiresAt)
          : null;
      if (input.verificationStatus !== undefined)
        updateData.verificationStatus = input.verificationStatus;

      await db
        .update(employeeDocuments)
        .set(updateData)
        .where(
          and(
            eq(employeeDocuments.id, input.id),
            eq(employeeDocuments.companyId, membership.companyId)
          )
        );

      return { success: true };
    }),

  // ── Dashboard: aggregate all documents for HR overview ──────────────────
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    const membership = await getActiveCompanyMembership(ctx.user.id);
    if (!membership)
      throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });

    const db = await getDb();
    if (!db) return {
      companyDocStats: { total: 0, valid: 0, expiringSoon: 0, expired: 0, noExpiry: 0 },
      employeeDocStats: { total: 0, valid: 0, expiringSoon: 0, expired: 0, noExpiry: 0 },
      employeesWithMissingDocs: [],
      expiringIn90Days: [],
      recentlyUploaded: [],
      totalEmployees: 0,
      employeesWithAnyDoc: 0,
    };

    const companyId = membership.companyId;
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // ── Company docs ─────────────────────────────────────────────────────────
    const cDocs = await db
      .select()
      .from(companyDocuments)
      .where(and(eq(companyDocuments.companyId, companyId), eq(companyDocuments.isDeleted, false)))
      .orderBy(desc(companyDocuments.createdAt));

    const companyDocStats = { total: 0, valid: 0, expiringSoon: 0, expired: 0, noExpiry: 0 };
    for (const d of cDocs) {
      companyDocStats.total++;
      const s = computeExpiryStatus(d.expiryDate);
      if (s === "valid") companyDocStats.valid++;
      else if (s === "expiring_soon") companyDocStats.expiringSoon++;
      else if (s === "expired") companyDocStats.expired++;
      else companyDocStats.noExpiry++;
    }

    // ── Employee docs ─────────────────────────────────────────────────────────
    const eDocs = await db
      .select({
        doc: employeeDocuments,
        empFirstName: employees.firstName,
        empLastName: employees.lastName,
        empDepartment: employees.department,
        empPosition: employees.position,
        empStatus: employees.status,
      })
      .from(employeeDocuments)
      .leftJoin(employees, eq(employeeDocuments.employeeId, employees.id))
      .where(eq(employeeDocuments.companyId, companyId))
      .orderBy(desc(employeeDocuments.createdAt));

    const employeeDocStats = { total: 0, valid: 0, expiringSoon: 0, expired: 0, noExpiry: 0 };
    const expiringIn90Days: Array<{
      id: number; employeeId: number; employeeName: string; department: string | null;
      documentType: string; fileName: string; expiresAt: Date | null;
      daysLeft: number; severity: "expired" | "critical" | "warning";
      fileUrl: string;
    }> = [];
    const recentlyUploaded: Array<{
      id: number; employeeId: number; employeeName: string;
      documentType: string; fileName: string; createdAt: Date; fileUrl: string;
    }> = [];

    for (const row of eDocs) {
      const d = row.doc;
      employeeDocStats.total++;
      const s = computeExpiryStatus(d.expiresAt);
      if (s === "valid") employeeDocStats.valid++;
      else if (s === "expiring_soon") employeeDocStats.expiringSoon++;
      else if (s === "expired") employeeDocStats.expired++;
      else employeeDocStats.noExpiry++;

      const empName = `${row.empFirstName ?? ""} ${row.empLastName ?? ""}`.trim();

      // Expiring within 90 days
      if (d.expiresAt) {
        const daysLeft = Math.floor((new Date(d.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 90) {
          expiringIn90Days.push({
            id: d.id,
            employeeId: d.employeeId,
            employeeName: empName,
            department: row.empDepartment,
            documentType: d.documentType,
            fileName: d.fileName,
            expiresAt: d.expiresAt,
            daysLeft,
            severity: daysLeft < 0 ? "expired" : daysLeft <= 30 ? "critical" : "warning",
            fileUrl: d.fileUrl,
          });
        }
      }

      // Recently uploaded (last 30 days)
      const uploadedDaysAgo = Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      if (uploadedDaysAgo <= 30) {
        recentlyUploaded.push({
          id: d.id,
          employeeId: d.employeeId,
          employeeName: empName,
          documentType: d.documentType,
          fileName: d.fileName,
          createdAt: d.createdAt,
          fileUrl: d.fileUrl,
        });
      }
    }

    // Sort expiring by days left ascending
    expiringIn90Days.sort((a, b) => a.daysLeft - b.daysLeft);
    // Sort recent by newest first
    recentlyUploaded.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // ── Employees with missing critical docs ──────────────────────────────────
    const allEmployees = await db
      .select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName, department: employees.department, position: employees.position, status: employees.status })
      .from(employees)
      .where(and(eq(employees.companyId, companyId), eq(employees.status, "active")));

    const docsByEmployee = new Map<number, Set<string>>();
    for (const row of eDocs) {
      const empId = row.doc.employeeId;
      if (!docsByEmployee.has(empId)) docsByEmployee.set(empId, new Set());
      docsByEmployee.get(empId)!.add(row.doc.documentType);
    }

    const CRITICAL_DOC_TYPES = ["mol_work_permit_certificate", "passport", "visa"];
    const employeesWithMissingDocs = allEmployees
      .map((emp) => {
        const empDocs = docsByEmployee.get(emp.id) ?? new Set<string>();
        const missing = CRITICAL_DOC_TYPES.filter((t) => !empDocs.has(t));
        return { ...emp, missingDocTypes: missing, uploadedDocTypes: Array.from(empDocs) };
      })
      .filter((emp) => emp.missingDocTypes.length > 0);

    return {
      companyDocStats,
      employeeDocStats,
      employeesWithMissingDocs,
      expiringIn90Days: expiringIn90Days.slice(0, 50),
      recentlyUploaded: recentlyUploaded.slice(0, 20),
      totalEmployees: allEmployees.length,
      employeesWithAnyDoc: docsByEmployee.size,
    };
  }),

  // ── All employee docs across all employees (for the full table view) ───────
  getAllEmployeeDocs: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      docType: z.string().optional(),
      status: z.enum(["valid", "expiring_soon", "expired", "no_expiry", "all"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });

      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          doc: employeeDocuments,
          empFirstName: employees.firstName,
          empLastName: employees.lastName,
          empDepartment: employees.department,
          empPosition: employees.position,
          empStatus: employees.status,
        })
        .from(employeeDocuments)
        .leftJoin(employees, eq(employeeDocuments.employeeId, employees.id))
        .where(eq(employeeDocuments.companyId, membership.companyId))
        .orderBy(desc(employeeDocuments.createdAt));

      const now = new Date();
      let results = rows.map((row) => {
        const d = row.doc;
        const daysLeft = d.expiresAt
          ? Math.floor((new Date(d.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const expiryStatus = computeExpiryStatus(d.expiresAt);
        return {
          ...d,
          employeeName: `${row.empFirstName ?? ""} ${row.empLastName ?? ""}`.trim(),
          department: row.empDepartment,
          position: row.empPosition,
          employeeStatus: row.empStatus,
          expiryStatus,
          daysLeft,
        };
      });

      // Apply filters
      if (input.search) {
        const q = input.search.toLowerCase();
        results = results.filter(
          (r) =>
            r.employeeName.toLowerCase().includes(q) ||
            r.documentType.toLowerCase().includes(q) ||
            r.fileName.toLowerCase().includes(q)
        );
      }
      if (input.docType && input.docType !== "all") {
        results = results.filter((r) => r.documentType === input.docType);
      }
      if (input.status && input.status !== "all") {
        results = results.filter((r) => r.expiryStatus === input.status);
      }

      return results;
    }),

  // ── Employee: delete document ─────────────────────────────────────────────
  deleteEmployeeDoc: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership)
        throw new TRPCError({ code: "FORBIDDEN", message: "No active company" });
      requireNotAuditor(membership.role);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .delete(employeeDocuments)
        .where(
          and(
            eq(employeeDocuments.id, input.id),
            eq(employeeDocuments.companyId, membership.companyId)
          )
        );

      return { success: true };
    }),
});
