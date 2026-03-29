import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import { getDb } from "../db";
import {
  companies,
  complianceCertificates,
  officerCompanyAssignments,
  omaniProOfficers,
  sanadApplications,
  sanadOffices,
} from "../../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function enrichOfficer(officer: typeof omaniProOfficers.$inferSelect & { sanadOfficeName?: string | null }) {
  const db = await getDb();
  if (!db) return { ...officer, activeAssignments: 0, availableSlots: officer.maxCompanies, capacityPct: 0, sanadOfficeName: officer.sanadOfficeName ?? null };
  const [{ activeCount }] = await db
    .select({ activeCount: count() })
    .from(officerCompanyAssignments)
    .where(and(eq(officerCompanyAssignments.officerId, officer.id), eq(officerCompanyAssignments.status, "active")));
  const active = Number(activeCount);
  return {
    ...officer,
    monthlySalary: Number(officer.monthlySalary),
    activeAssignments: active,
    availableSlots: officer.maxCompanies - active,
    capacityPct: Math.round((active / officer.maxCompanies) * 100),
    sanadOfficeName: officer.sanadOfficeName ?? null,
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const officersRouter = router({
  // ── Platform stats ─────────────────────────────────────────────────────────
  stats: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const officerStats = await db
      .select({
        total: count(),
        active: sql<number>`SUM(CASE WHEN ${omaniProOfficers.status} = 'active' THEN 1 ELSE 0 END)`,
        trackA: sql<number>`SUM(CASE WHEN ${omaniProOfficers.employmentTrack} = 'platform' THEN 1 ELSE 0 END)`,
        trackB: sql<number>`SUM(CASE WHEN ${omaniProOfficers.employmentTrack} = 'sanad' THEN 1 ELSE 0 END)`,
        totalPayroll: sql<number>`SUM(${omaniProOfficers.monthlySalary})`,
      })
      .from(omaniProOfficers)
      .where(sql`${omaniProOfficers.status} != 'terminated'`);

    const assignStats = await db
      .select({
        totalAssignments: count(),
        totalRevenue: sql<number>`SUM(${officerCompanyAssignments.monthlyFee})`,
        companiesServed: sql<number>`COUNT(DISTINCT ${officerCompanyAssignments.companyId})`,
        officersWorking: sql<number>`COUNT(DISTINCT ${officerCompanyAssignments.officerId})`,
      })
      .from(officerCompanyAssignments)
      .where(eq(officerCompanyAssignments.status, "active"));

    const s = officerStats[0];
    const a = assignStats[0];
    const payroll = Number(s.totalPayroll ?? 0);
    const revenue = Number(a.totalRevenue ?? 0);

    return {
      totalOfficers: Number(s.total),
      activeOfficers: Number(s.active ?? 0),
      trackAOfficers: Number(s.trackA ?? 0),
      trackBOfficers: Number(s.trackB ?? 0),
      totalMonthlyPayroll: payroll,
      totalAssignments: Number(a.totalAssignments),
      totalMonthlyRevenue: revenue,
      companiesServed: Number(a.companiesServed ?? 0),
      officersWithAssignments: Number(a.officersWorking ?? 0),
      platformNetMonthly: revenue - payroll,
      omanisEmployed: Number(s.active ?? 0),
    };
  }),

  // ── List officers ──────────────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["active", "inactive", "on_leave", "terminated"]).optional(),
        track: z.enum(["platform", "sanad"]).optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input?.status) conditions.push(eq(omaniProOfficers.status, input.status));
      if (input?.track) conditions.push(eq(omaniProOfficers.employmentTrack, input.track));
      if (input?.search) {
        const q = `%${input.search}%`;
        conditions.push(
          or(
            like(omaniProOfficers.fullName, q),
            like(omaniProOfficers.email, q),
            like(omaniProOfficers.civilId, q)
          )
        );
      }

      const rows = await db
        .select({
          officer: omaniProOfficers,
          sanadOfficeName: sanadOffices.name,
        })
        .from(omaniProOfficers)
        .leftJoin(sanadOffices, eq(sanadOffices.id, omaniProOfficers.sanadOfficeId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(omaniProOfficers.createdAt));

      return Promise.all(
        rows.map((r) => enrichOfficer({ ...r.officer, sanadOfficeName: r.sanadOfficeName }))
      );
    }),

  // ── Get single officer ─────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await db
        .select({ officer: omaniProOfficers, sanadOfficeName: sanadOffices.name })
        .from(omaniProOfficers)
        .leftJoin(sanadOffices, eq(sanadOffices.id, omaniProOfficers.sanadOfficeId))
        .where(eq(omaniProOfficers.id, input.id))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Officer not found" });

      const enriched = await enrichOfficer({ ...row.officer, sanadOfficeName: row.sanadOfficeName });

      const assignments = await db
        .select({
          assignment: officerCompanyAssignments,
          companyName: companies.name,
          companyNameAr: companies.nameAr,
          companyIndustry: companies.industry,
          companyCity: companies.city,
        })
        .from(officerCompanyAssignments)
        .innerJoin(companies, eq(companies.id, officerCompanyAssignments.companyId))
        .where(eq(officerCompanyAssignments.officerId, input.id))
        .orderBy(desc(officerCompanyAssignments.assignedAt));

      return {
        ...enriched,
        assignments: assignments.map((a) => ({
          ...a.assignment,
          monthlyFee: Number(a.assignment.monthlyFee),
          companyName: a.companyName,
          companyNameAr: a.companyNameAr,
          companyIndustry: a.companyIndustry,
          companyCity: a.companyCity,
        })),
      };
    }),

  // ── Create officer ─────────────────────────────────────────────────────────
  create: adminProcedure
    .input(
      z.object({
        fullName: z.string().min(2),
        fullNameAr: z.string().optional(),
        civilId: z.string().optional(),
        pasiNumber: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        sanadOfficeId: z.number().optional(),
        employmentTrack: z.enum(["platform", "sanad"]).default("platform"),
        monthlySalary: z.number().min(0).default(500),
        maxCompanies: z.number().min(1).max(10).default(10),
        qualifications: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(omaniProOfficers).values({
        fullName: input.fullName,
        fullNameAr: input.fullNameAr ?? null,
        civilId: input.civilId ?? null,
        pasiNumber: input.pasiNumber ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        sanadOfficeId: input.sanadOfficeId ?? null,
        employmentTrack: input.employmentTrack,
        monthlySalary: String(input.monthlySalary),
        maxCompanies: input.maxCompanies,
        qualifications: input.qualifications ?? null,
        notes: input.notes ?? null,
      });

      const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
      const [row] = await db
        .select({ officer: omaniProOfficers, sanadOfficeName: sanadOffices.name })
        .from(omaniProOfficers)
        .leftJoin(sanadOffices, eq(sanadOffices.id, omaniProOfficers.sanadOfficeId))
        .where(eq(omaniProOfficers.id, insertId))
        .limit(1);

      return row ? enrichOfficer({ ...row.officer, sanadOfficeName: row.sanadOfficeName }) : null;
    }),

  // ── Update officer ─────────────────────────────────────────────────────────
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        fullName: z.string().min(2).optional(),
        fullNameAr: z.string().optional(),
        civilId: z.string().optional(),
        pasiNumber: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        sanadOfficeId: z.number().optional(),
        employmentTrack: z.enum(["platform", "sanad"]).optional(),
        monthlySalary: z.number().min(0).optional(),
        maxCompanies: z.number().min(1).max(10).optional(),
        status: z.enum(["active", "inactive", "on_leave", "terminated"]).optional(),
        qualifications: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, monthlySalary, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest };
      if (monthlySalary !== undefined) updateData.monthlySalary = String(monthlySalary);
      // Remove undefined fields
      Object.keys(updateData).forEach((k) => updateData[k] === undefined && delete updateData[k]);

      if (Object.keys(updateData).length > 0) {
        await db.update(omaniProOfficers).set(updateData as any).where(eq(omaniProOfficers.id, id));
      }

      const [row] = await db
        .select({ officer: omaniProOfficers, sanadOfficeName: sanadOffices.name })
        .from(omaniProOfficers)
        .leftJoin(sanadOffices, eq(sanadOffices.id, omaniProOfficers.sanadOfficeId))
        .where(eq(omaniProOfficers.id, id))
        .limit(1);

      return row ? enrichOfficer({ ...row.officer, sanadOfficeName: row.sanadOfficeName }) : null;
    }),

  // ── Assign company to officer ──────────────────────────────────────────────
  assignCompany: adminProcedure
    .input(
      z.object({
        officerId: z.number(),
        companyId: z.number(),
        monthlyFee: z.number().min(0).default(100),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Load officer and check capacity
      const [officerRow] = await db
        .select({ officer: omaniProOfficers })
        .from(omaniProOfficers)
        .where(eq(omaniProOfficers.id, input.officerId))
        .limit(1);

      if (!officerRow) throw new TRPCError({ code: "NOT_FOUND", message: "Officer not found" });
      const officer = officerRow.officer;

      if (officer.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Officer is not active" });
      }

      // Count active assignments
      const [{ activeCount }] = await db
        .select({ activeCount: count() })
        .from(officerCompanyAssignments)
        .where(and(eq(officerCompanyAssignments.officerId, input.officerId), eq(officerCompanyAssignments.status, "active")));

      if (Number(activeCount) >= officer.maxCompanies) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Officer has reached maximum capacity of ${officer.maxCompanies} companies`,
        });
      }

      // Check if already assigned
      const [existing] = await db
        .select()
        .from(officerCompanyAssignments)
        .where(and(eq(officerCompanyAssignments.officerId, input.officerId), eq(officerCompanyAssignments.companyId, input.companyId)))
        .limit(1);

      if (existing) {
        if (existing.status === "active") {
          throw new TRPCError({ code: "CONFLICT", message: "Company is already assigned to this officer" });
        }
        // Reactivate
        await db.update(officerCompanyAssignments)
          .set({ status: "active", monthlyFee: String(input.monthlyFee), notes: input.notes ?? null, terminatedAt: null, assignedAt: new Date() })
          .where(eq(officerCompanyAssignments.id, existing.id));
      } else {
        await db.insert(officerCompanyAssignments).values({
          officerId: input.officerId,
          companyId: input.companyId,
          monthlyFee: String(input.monthlyFee),
          notes: input.notes ?? null,
        });
      }

      return enrichOfficer({ ...officer, sanadOfficeName: null });
    }),

  // ── Remove company assignment ──────────────────────────────────────────────
  removeCompany: adminProcedure
    .input(z.object({ officerId: z.number(), companyId: z.number(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(officerCompanyAssignments)
        .set({ status: "terminated", terminatedAt: new Date(), notes: input.notes ?? null })
        .where(and(
          eq(officerCompanyAssignments.officerId, input.officerId),
          eq(officerCompanyAssignments.companyId, input.companyId),
          eq(officerCompanyAssignments.status, "active")
        ));

      const [row] = await db
        .select({ officer: omaniProOfficers, sanadOfficeName: sanadOffices.name })
        .from(omaniProOfficers)
        .leftJoin(sanadOffices, eq(sanadOffices.id, omaniProOfficers.sanadOfficeId))
        .where(eq(omaniProOfficers.id, input.officerId))
        .limit(1);

      return row ? enrichOfficer({ ...row.officer, sanadOfficeName: row.sanadOfficeName }) : null;
    }),

  // ── Get assignments for an officer ────────────────────────────────────────
  getAssignments: protectedProcedure
    .input(z.object({ officerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          assignment: officerCompanyAssignments,
          companyName: companies.name,
          companyNameAr: companies.nameAr,
          companyIndustry: companies.industry,
          companyCity: companies.city,
        })
        .from(officerCompanyAssignments)
        .innerJoin(companies, eq(companies.id, officerCompanyAssignments.companyId))
        .where(eq(officerCompanyAssignments.officerId, input.officerId))
        .orderBy(desc(officerCompanyAssignments.assignedAt));

      return rows.map((r) => ({
        ...r.assignment,
        monthlyFee: Number(r.assignment.monthlyFee),
        companyName: r.companyName,
        companyNameAr: r.companyNameAr,
        companyIndustry: r.companyIndustry,
        companyCity: r.companyCity,
      }));
    }),

  // ── Get companies available to assign to an officer ───────────────────────
  availableCompanies: adminProcedure
    .input(z.object({ officerId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // Get already-assigned company IDs
      const assigned = await db
        .select({ companyId: officerCompanyAssignments.companyId })
        .from(officerCompanyAssignments)
        .where(and(eq(officerCompanyAssignments.officerId, input.officerId), eq(officerCompanyAssignments.status, "active")));

      const assignedIds = assigned.map((a) => a.companyId);

      const allCompanies = await db
        .select({
          id: companies.id,
          name: companies.name,
          nameAr: companies.nameAr,
          industry: companies.industry,
          city: companies.city,
          registrationNumber: companies.registrationNumber,
        })
        .from(companies)
        .orderBy(companies.name);

      return allCompanies.filter((c) => !assignedIds.includes(c.id));
    }),

  // ── Generate compliance certificate ───────────────────────────────────────
  generateCertificate: protectedProcedure
    .input(z.object({ companyId: z.number(), month: z.number().min(1).max(12), year: z.number().min(2024) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Find active assignment
      const [row] = await db
        .select({
          assignment: officerCompanyAssignments,
          officer: omaniProOfficers,
          company: companies,
          sanadOfficeName: sanadOffices.name,
        })
        .from(officerCompanyAssignments)
        .innerJoin(omaniProOfficers, eq(omaniProOfficers.id, officerCompanyAssignments.officerId))
        .innerJoin(companies, eq(companies.id, officerCompanyAssignments.companyId))
        .leftJoin(sanadOffices, eq(sanadOffices.id, omaniProOfficers.sanadOfficeId))
        .where(and(eq(officerCompanyAssignments.companyId, input.companyId), eq(officerCompanyAssignments.status, "active")))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active Omani PRO officer assigned to this company" });
      }

      // Count work orders for this company/month
      const [{ woCount }] = await db
        .select({ woCount: count() })
        .from(sanadApplications)
        .where(
          and(
            eq(sanadApplications.companyId, input.companyId),
            sql`MONTH(${sanadApplications.createdAt}) = ${input.month}`,
            sql`YEAR(${sanadApplications.createdAt}) = ${input.year}`
          )
        );

      const certNumber = `SPRO-${input.year}${String(input.month).padStart(2, "0")}-${nanoid(8).toUpperCase()}`;
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

      // Build certificate HTML for S3 storage
      const monthName = monthNames[input.month - 1];
      const certHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>MoL Compliance Certificate ${certNumber}</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto}h1{color:#1a3c5e}table{width:100%;border-collapse:collapse}td{padding:8px 12px;border:1px solid #ddd}.header{text-align:center;border-bottom:3px solid #1a3c5e;padding-bottom:20px;margin-bottom:30px}.cert-number{font-size:14px;color:#666}.footer{margin-top:40px;font-size:12px;color:#888;text-align:center}</style></head><body><div class="header"><h1>SmartPRO Business Services Hub</h1><h2>Ministry of Labour Compliance Certificate</h2><p class="cert-number">Certificate No: ${certNumber}</p></div><table><tr><td><strong>Company Name</strong></td><td>${row.company.name}${row.company.nameAr ? ` / ${row.company.nameAr}` : ""}</td></tr><tr><td><strong>Commercial Registration</strong></td><td>${row.company.registrationNumber ?? "N/A"}</td></tr><tr><td><strong>Omani PRO Officer</strong></td><td>${row.officer.fullName}${row.officer.fullNameAr ? ` / ${row.officer.fullNameAr}` : ""}</td></tr><tr><td><strong>PASI Number</strong></td><td>${row.officer.pasiNumber ?? "N/A"}</td></tr><tr><td><strong>Employment Track</strong></td><td>${row.officer.employmentTrack === "sanad" ? "Track B — Sanad Centre" : "Track A — Independent"}</td></tr><tr><td><strong>Period</strong></td><td>${monthName} ${input.year}</td></tr><tr><td><strong>Work Orders Completed</strong></td><td>${Number(woCount)}</td></tr><tr><td><strong>Generated At</strong></td><td>${new Date().toISOString()}</td></tr></table><div class="footer"><p>This certificate is issued by SmartPRO Business Services Hub in compliance with Ministry of Labour regulations.</p></div></body></html>`;

      // Upload to S3
      let pdfUrl: string | undefined;
      try {
        const fileKey = `certificates/${input.year}/${String(input.month).padStart(2, "0")}/${certNumber}.html`;
        const { url } = await storagePut(fileKey, Buffer.from(certHtml, "utf-8"), "text/html");
        pdfUrl = url;
      } catch {
        // S3 upload failure is non-fatal — certificate record still saved
      }

      // Upsert certificate record
      await db.insert(complianceCertificates).values({
        companyId: input.companyId,
        officerId: row.officer.id,
        periodMonth: input.month,
        periodYear: input.year,
        certificateNumber: certNumber,
        workOrderCount: Number(woCount),
        pdfUrl: pdfUrl ?? null,
      });
      return {
        certificateNumber: certNumber,
        month: monthNames[input.month - 1],
        year: input.year,
        companyName: row.company.name,
        companyNameAr: row.company.nameAr,
        companyCR: row.company.registrationNumber,
        officerName: row.officer.fullName,
        officerNameAr: row.officer.fullNameAr,
        officerPASI: row.officer.pasiNumber,
        officerCivilId: row.officer.civilId,
        employmentTrack: row.officer.employmentTrack,
        sanadOfficeName: row.sanadOfficeName,
        workOrderCount: Number(woCount),
        generatedAt: new Date().toISOString(),
      };
    }),

  // ── Bulk generate monthly certificates for all active assignments ─────────
  generateMonthlyCertificates: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number().min(2024) }))
    .mutation(async ({ input, ctx }) => {
      if (!canAccessGlobalAdminProcedures(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

      // Get all active assignments with officer and company details
      const assignments = await db
        .select({
          assignment: officerCompanyAssignments,
          officer: omaniProOfficers,
          company: companies,
        })
        .from(officerCompanyAssignments)
        .innerJoin(omaniProOfficers, eq(omaniProOfficers.id, officerCompanyAssignments.officerId))
        .innerJoin(companies, eq(companies.id, officerCompanyAssignments.companyId))
        .where(eq(officerCompanyAssignments.status, "active"));

      let created = 0;
      let skipped = 0;
      const results: Array<{ companyName: string; certificateNumber: string }> = [];

      for (const { assignment, officer, company } of assignments) {
        // Skip if already generated for this period
        const [existing] = await db
          .select({ id: complianceCertificates.id })
          .from(complianceCertificates)
          .where(and(
            eq(complianceCertificates.companyId, assignment.companyId),
            eq(complianceCertificates.officerId, assignment.officerId),
            eq(complianceCertificates.periodMonth, input.month),
            eq(complianceCertificates.periodYear, input.year)
          ))
          .limit(1);

        if (existing) { skipped++; continue; }

        // Count work orders for this company/month
        const [{ woCount }] = await db
          .select({ woCount: count() })
          .from(sanadApplications)
          .where(and(
            eq(sanadApplications.companyId, assignment.companyId),
            sql`MONTH(${sanadApplications.createdAt}) = ${input.month}`,
            sql`YEAR(${sanadApplications.createdAt}) = ${input.year}`
          ));

        const certNumber = `SPRO-${input.year}${String(input.month).padStart(2, "0")}-${nanoid(8).toUpperCase()}`;

        await db.insert(complianceCertificates).values({
          companyId: assignment.companyId,
          officerId: assignment.officerId,
          periodMonth: input.month,
          periodYear: input.year,
          certificateNumber: certNumber,
          workOrderCount: Number(woCount),
        });

        results.push({ companyName: company.name, certificateNumber: certNumber });
        created++;
      }

      return {
        success: true,
        created,
        skipped,
        total: assignments.length,
        period: `${monthNames[input.month - 1]} ${input.year}`,
        certificates: results,
      };
    }),

  // ── List certificates ──────────────────────────────────────────────────────
  listCertificates: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = input?.companyId ? [eq(complianceCertificates.companyId, input.companyId)] : [];

      return db
        .select({
          cert: complianceCertificates,
          officerName: omaniProOfficers.fullName,
          companyName: companies.name,
        })
        .from(complianceCertificates)
        .innerJoin(omaniProOfficers, eq(omaniProOfficers.id, complianceCertificates.officerId))
        .innerJoin(companies, eq(companies.id, complianceCertificates.companyId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(complianceCertificates.generatedAt));
    }),
});
