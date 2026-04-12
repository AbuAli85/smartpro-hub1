import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { hrLetters, companySignatories } from "../../drizzle/schema";
import { getDb, getEmployeeById, getCompanyById, getUserCompanyById } from "../db";
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";
import { protectedProcedure, router } from "../_core/trpc";
import { sendHRLetterEmail } from "../email";
import { sanitizeLetterHtml } from "../_core/sanitizeLetterHtml";
import { resolvePublicAppBaseUrl } from "../_core/publicAppUrl";
import { signHRLetterViewToken } from "../hrLetterViewToken";
import { HR_LETTERS, memberHasHrLetterPermission } from "@shared/hrLetterPermissions";
import {
  buildLetterRenderContext,
  validateLetterReadiness,
  renderOfficialLetter,
  applyLanguageMode,
  canIssueSensitiveLetter,
  LETTER_TEMPLATE_META,
  TEMPLATE_VERSION,
  OFFICIAL_LETTER_TYPES,
  type LetterFieldPayload,
  type OfficialLetterType,
} from "@shared/letterEngine";
import type { CompanyMember, CompanySignatory } from "../../drizzle/schema";

const refSuffix = customAlphabet("0123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 10);

async function companyMember(userId: number, companyId: number): Promise<CompanyMember | null> {
  const row = await getUserCompanyById(userId, companyId);
  return row?.member ?? null;
}

function withSanitizedBodies<T extends { bodyEn: string | null; bodyAr: string | null }>(row: T): T {
  return {
    ...row,
    bodyEn: sanitizeLetterHtml(row.bodyEn),
    bodyAr: sanitizeLetterHtml(row.bodyAr),
  };
}

function generateRefNumber(companyId: number, letterType: string): string {
  const prefix = letterType.toUpperCase().replace(/_/g, "-").slice(0, 6);
  const year = new Date().getFullYear();
  return `HRL-${prefix}-${year}-${companyId}-${refSuffix()}`;
}

function parseFieldPayload(raw: unknown): LetterFieldPayload {
  if (!raw || typeof raw !== "object") return {};
  const o = { ...(raw as Record<string, unknown>) };
  if (o.currentlyEmployed === "true") o.currentlyEmployed = true;
  if (o.includeSalary === "true") o.includeSalary = true;
  return o as LetterFieldPayload;
}

const letterTypeEnum = z.enum([
  "salary_certificate",
  "employment_verification",
  "noc",
  "experience_letter",
  "promotion_letter",
  "salary_transfer_letter",
  "leave_approval_letter",
  "warning_letter",
]);

const generateInputBase = z.object({
  employeeId: z.number(),
  letterType: letterTypeEnum,
  language: z.enum(["en", "ar", "both"]).default("en"),
  signatoryId: z.number(),
  issuedTo: z.string().optional(),
  purpose: z.string().optional(),
  additionalNotes: z.string().optional(),
  fieldPayload: z.record(z.string(), z.unknown()).optional(),
  recipientPreset: z.enum(["twimc", "bank", "embassy", "ministry", "custom"]).optional(),
  companyId: z.number().optional(),
});

export const hrLettersRouter = router({
  letterTemplateMeta: protectedProcedure.query(() => {
    return OFFICIAL_LETTER_TYPES.map((code) => ({
      ...LETTER_TEMPLATE_META[code],
    }));
  }),

  listSignatories: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const m = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!m) return [];
      const mem = await companyMember(ctx.user.id, m.companyId);
      if (!mem || !memberHasHrLetterPermission(mem, HR_LETTERS.READ)) return [];
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(companySignatories)
        .where(and(eq(companySignatories.companyId, m.companyId), eq(companySignatories.isActive, true)))
        .orderBy(desc(companySignatories.isDefault));
    }),

  createSignatory: protectedProcedure
    .input(
      z.object({
        companyId: z.number().optional(),
        nameEn: z.string().min(1),
        nameAr: z.string().optional(),
        titleEn: z.string().min(1),
        titleAr: z.string().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      requireNotAuditor(membership.role);
      const mem = await companyMember(ctx.user.id, membership.companyId);
      if (!mem || !memberHasHrLetterPermission(mem, HR_LETTERS.SIGNATORIES_MANAGE)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have permission to manage signatories." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.isDefault) {
        await db.update(companySignatories).set({ isDefault: false }).where(eq(companySignatories.companyId, membership.companyId));
      }
      await db.insert(companySignatories).values({
        companyId: membership.companyId,
        nameEn: input.nameEn,
        nameAr: input.nameAr ?? null,
        titleEn: input.titleEn,
        titleAr: input.titleAr ?? null,
        isDefault: input.isDefault ?? false,
        isActive: true,
      });
      return { success: true };
    }),

  validateReadiness: protectedProcedure
    .input(
      generateInputBase.extend({
        forOfficialIssue: z.boolean().default(true),
      })
    )
    .query(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!membership) return { ok: false, missing: ["No company membership"] };
      const employee = await getEmployeeById(input.employeeId);
      const company = await getCompanyById(membership.companyId);
      if (!employee || !company || employee.companyId !== membership.companyId) {
        return { ok: false, missing: ["Employee or company not found"] };
      }
      const db = await getDb();
      let signatoryRow: CompanySignatory | null = null;
      if (db) {
        const [s] = await db
          .select()
          .from(companySignatories)
          .where(and(eq(companySignatories.id, input.signatoryId), eq(companySignatories.companyId, membership.companyId)))
          .limit(1);
        signatoryRow = s ?? null;
      }
      const fields = parseFieldPayload(input.fieldPayload);
      if (input.recipientPreset) fields.recipientPreset = input.recipientPreset;
      let issuedTo = input.issuedTo?.trim() ?? "";
      if (input.recipientPreset === "twimc") issuedTo = "To Whom It May Concern";
      const issueDate = fields.issueDate?.trim() ? new Date(fields.issueDate) : new Date();
      if (Number.isNaN(issueDate.getTime())) {
        return { ok: false, missing: ["Invalid issue date"] };
      }
      const signatory = signatoryRow
        ? {
            nameEn: signatoryRow.nameEn,
            nameAr: signatoryRow.nameAr,
            titleEn: signatoryRow.titleEn,
            titleAr: signatoryRow.titleAr,
          }
        : null;
      const vr = validateLetterReadiness({
        letterType: input.letterType as OfficialLetterType,
        language: input.language,
        fields,
        issuedTo,
        purpose: input.purpose ?? "",
        company: {
          name: company.name,
          nameAr: company.nameAr,
          crNumber: company.crNumber,
          address: company.address,
          city: company.city,
        },
        employee: {
          firstName: employee.firstName,
          lastName: employee.lastName,
          firstNameAr: employee.firstNameAr,
          lastNameAr: employee.lastNameAr,
          position: employee.position,
          department: employee.department,
          salary: employee.salary != null ? String(employee.salary) : null,
          hireDate: employee.hireDate ?? null,
          status: employee.status,
          nationalId: employee.nationalId,
          passportNumber: employee.passportNumber,
        },
        signatory,
        forOfficialIssue: input.forOfficialIssue,
      });
      return { ok: vr.ok, missing: vr.missing };
    }),

  previewLetter: protectedProcedure
    .input(generateInputBase)
    .query(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const mem = await companyMember(ctx.user.id, membership.companyId);
      if (!mem || !memberHasHrLetterPermission(mem, HR_LETTERS.READ)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No permission to preview letters." });
      }
      const employee = await getEmployeeById(input.employeeId);
      const company = await getCompanyById(membership.companyId);
      if (!employee || !company || employee.companyId !== membership.companyId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [signatoryRow] = await db
        .select()
        .from(companySignatories)
        .where(and(eq(companySignatories.id, input.signatoryId), eq(companySignatories.companyId, membership.companyId)))
        .limit(1);
      const fields = parseFieldPayload(input.fieldPayload);
      if (input.recipientPreset) fields.recipientPreset = input.recipientPreset;
      let issuedTo = input.issuedTo?.trim() ?? "";
      if (input.recipientPreset === "twimc") issuedTo = "To Whom It May Concern";
      const issueDate = fields.issueDate?.trim() ? new Date(fields.issueDate) : new Date();
      const refNo = generateRefNumber(membership.companyId, input.letterType);
      const signatory = signatoryRow
        ? {
            nameEn: signatoryRow.nameEn,
            nameAr: signatoryRow.nameAr,
            titleEn: signatoryRow.titleEn,
            titleAr: signatoryRow.titleAr,
          }
        : null;
      const vr = validateLetterReadiness({
        letterType: input.letterType as OfficialLetterType,
        language: input.language,
        fields,
        issuedTo,
        purpose: input.purpose ?? "",
        company: {
          name: company.name,
          nameAr: company.nameAr,
          crNumber: company.crNumber,
          address: company.address,
          city: company.city,
        },
        employee: {
          firstName: employee.firstName,
          lastName: employee.lastName,
          firstNameAr: employee.firstNameAr,
          lastNameAr: employee.lastNameAr,
          position: employee.position,
          department: employee.department,
          salary: employee.salary != null ? String(employee.salary) : null,
          hireDate: employee.hireDate ?? null,
          status: employee.status,
          nationalId: employee.nationalId,
          passportNumber: employee.passportNumber,
        },
        signatory,
        forOfficialIssue: true,
      });
      if (!vr.ok) return { ok: false as const, missing: vr.missing, preview: null };
      const ctxRender = buildLetterRenderContext({
        letterType: input.letterType as OfficialLetterType,
        language: input.language,
        refNo,
        issueDate,
        company,
        employee,
        signatory,
        issuedTo,
        purpose: input.purpose ?? "",
        additionalNotes: input.additionalNotes ?? "",
        fields,
      });
      const rendered = renderOfficialLetter(ctxRender);
      const bodies = applyLanguageMode(input.language, rendered.bodyEn, rendered.bodyAr);
      return {
        ok: true as const,
        missing: [] as string[],
        preview: {
          subject: rendered.subject,
          referenceNumber: refNo,
          bodyEn: bodies.bodyEn ? sanitizeLetterHtml(bodies.bodyEn) : null,
          bodyAr: bodies.bodyAr ? sanitizeLetterHtml(bodies.bodyAr) : null,
          language: input.language,
        },
      };
    }),

  listLetters: protectedProcedure
    .input(z.object({ employeeId: z.number().optional(), letterType: z.string().optional(), companyId: z.number().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input?.companyId);
      if (!membership) return [];
      const mem = await companyMember(ctx.user.id, membership.companyId);
      if (!mem || !memberHasHrLetterPermission(mem, HR_LETTERS.READ)) return [];
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(hrLetters)
        .where(and(eq(hrLetters.companyId, membership.companyId), eq(hrLetters.isDeleted, false)))
        .orderBy(desc(hrLetters.createdAt));
      return rows.map((r) => withSanitizedBodies(r));
    }),

  getLetter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(hrLetters)
        .where(and(eq(hrLetters.id, input.id), eq(hrLetters.companyId, membership.companyId)))
        .limit(1);
      const letter = rows[0];
      if (!letter || letter.isDeleted) throw new TRPCError({ code: "NOT_FOUND" });
      return withSanitizedBodies(letter);
    }),

  generateLetter: protectedProcedure.input(generateInputBase).mutation(async ({ input, ctx }) => {
    const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
    if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
    requireNotAuditor(membership.role, "External Auditors cannot generate letters.");
    const fullMember = await getUserCompanyById(ctx.user.id, membership.companyId);
    if (!fullMember?.member || !memberHasHrLetterPermission(fullMember.member, HR_LETTERS.ISSUE)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No permission to issue official letters." });
    }
    if (!canIssueSensitiveLetter(fullMember.member, input.letterType as OfficialLetterType)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No permission to issue this sensitive letter type." });
    }

    const employee = await getEmployeeById(input.employeeId);
    if (!employee || employee.companyId !== membership.companyId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
    }
    const company = await getCompanyById(membership.companyId);
    if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [signatoryRow] = await db
      .select()
      .from(companySignatories)
      .where(and(eq(companySignatories.id, input.signatoryId), eq(companySignatories.companyId, membership.companyId)))
      .limit(1);
    if (!signatoryRow) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Select a valid signatory for this company." });
    }

    const fields = parseFieldPayload(input.fieldPayload);
    if (input.recipientPreset) fields.recipientPreset = input.recipientPreset;
    let issuedTo = input.issuedTo?.trim() ?? "";
    if (input.recipientPreset === "twimc") issuedTo = "To Whom It May Concern";
    const issueDate = fields.issueDate?.trim() ? new Date(fields.issueDate) : new Date();
    if (Number.isNaN(issueDate.getTime())) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid issue date" });
    }

    const signatory = {
      nameEn: signatoryRow.nameEn,
      nameAr: signatoryRow.nameAr,
      titleEn: signatoryRow.titleEn,
      titleAr: signatoryRow.titleAr,
    };

    const vr = validateLetterReadiness({
      letterType: input.letterType as OfficialLetterType,
      language: input.language,
      fields,
      issuedTo,
      purpose: input.purpose ?? "",
      company: {
        name: company.name,
        nameAr: company.nameAr,
        crNumber: company.crNumber,
        address: company.address,
        city: company.city,
      },
      employee: {
        firstName: employee.firstName,
        lastName: employee.lastName,
        firstNameAr: employee.firstNameAr,
        lastNameAr: employee.lastNameAr,
        position: employee.position,
        department: employee.department,
        salary: employee.salary != null ? String(employee.salary) : null,
        hireDate: employee.hireDate ?? null,
        status: employee.status,
        nationalId: employee.nationalId,
        passportNumber: employee.passportNumber,
      },
      signatory,
      forOfficialIssue: true,
    });
    if (!vr.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot issue: ${vr.missing.join("; ")}`,
      });
    }

    const refNo = generateRefNumber(membership.companyId, input.letterType);
    const ctxRender = buildLetterRenderContext({
      letterType: input.letterType as OfficialLetterType,
      language: input.language,
      refNo,
      issueDate,
      company,
      employee,
      signatory,
      issuedTo,
      purpose: input.purpose ?? "",
      additionalNotes: input.additionalNotes ?? "",
      fields,
    });
    const rendered = renderOfficialLetter(ctxRender);
    const bodies = applyLanguageMode(input.language, rendered.bodyEn, rendered.bodyAr);
    const bodyEn = sanitizeLetterHtml(bodies.bodyEn);
    const bodyAr = sanitizeLetterHtml(bodies.bodyAr);

    const dataSnapshot = {
      templateVersion: TEMPLATE_VERSION,
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        position: employee.position,
        department: employee.department,
      },
      company: { id: company.id, name: company.name },
      signatory: { id: signatoryRow.id, nameEn: signatoryRow.nameEn },
      fieldPayload: fields,
      issuedAt: issueDate.toISOString(),
    };

    const insertResult = await db.insert(hrLetters).values({
      companyId: membership.companyId,
      employeeId: input.employeeId,
      letterType: input.letterType,
      language: input.language,
      letterStatus: "issued",
      templateVersion: TEMPLATE_VERSION,
      referenceNumber: refNo,
      subject: rendered.subject,
      bodyEn,
      bodyAr,
      issuedTo: issuedTo || null,
      purpose: input.purpose ?? null,
      additionalNotes: input.additionalNotes ?? null,
      fieldPayload: fields as unknown as Record<string, unknown>,
      dataSnapshot: dataSnapshot as unknown as Record<string, unknown>,
      issuedAt: new Date(),
      issuedByUserId: ctx.user.id,
      signatoryId: signatoryRow.id,
      exportCount: 0,
      isDeleted: false,
      createdBy: ctx.user.id,
    });

    const insertId = (insertResult[0] as { insertId?: number })?.insertId ?? null;
    const savedRows = insertId ? await db.select().from(hrLetters).where(eq(hrLetters.id, insertId)).limit(1) : [];

    const out = savedRows[0] ?? {
      id: insertId!,
      companyId: membership.companyId,
      employeeId: input.employeeId,
      letterType: input.letterType,
      language: input.language,
      letterStatus: "issued" as const,
      templateVersion: TEMPLATE_VERSION,
      referenceNumber: refNo,
      subject: rendered.subject,
      bodyEn,
      bodyAr,
      issuedTo: issuedTo || null,
      purpose: input.purpose ?? null,
      additionalNotes: input.additionalNotes ?? null,
      fieldPayload: fields as unknown as Record<string, unknown>,
      dataSnapshot: dataSnapshot as unknown as Record<string, unknown>,
      issuedAt: new Date(),
      issuedByUserId: ctx.user.id,
      signatoryId: signatoryRow.id,
      exportCount: 0,
      emailSentAt: null,
      isDeleted: false,
      createdBy: ctx.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return withSanitizedBodies(out as any);
  }),

  recordLetterExport: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select({ exportCount: hrLetters.exportCount })
        .from(hrLetters)
        .where(and(eq(hrLetters.id, input.id), eq(hrLetters.companyId, membership.companyId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(hrLetters)
        .set({ exportCount: (row.exportCount ?? 0) + 1 })
        .where(and(eq(hrLetters.id, input.id), eq(hrLetters.companyId, membership.companyId)));
      return { success: true };
    }),

  sendLetterByEmail: protectedProcedure
    .input(z.object({
      id: z.number(),
      employeeEmail: z.string().email(),
      cc: z.array(z.string().email()).max(5).optional(),
      pdfUrl: z.string().url().optional(),
      companyId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      requireNotAuditor(membership.role, "External Auditors cannot send letters.");
      const memSend = await companyMember(ctx.user.id, membership.companyId);
      if (!memSend || !memberHasHrLetterPermission(memSend, HR_LETTERS.ISSUE)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [letter] = await db
        .select()
        .from(hrLetters)
        .where(and(eq(hrLetters.id, input.id), eq(hrLetters.companyId, membership.companyId)))
        .limit(1);
      if (!letter) throw new TRPCError({ code: "NOT_FOUND", message: "Letter not found" });
      // Resend cooldown guard — prevent accidental spam (60s minimum between sends)
      if (letter.emailSentAt) {
        const secondsSinceLast = (Date.now() - new Date(letter.emailSentAt).getTime()) / 1000;
        if (secondsSinceLast < 60) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Please wait ${Math.ceil(60 - secondsSinceLast)} seconds before resending.`,
          });
        }
      }
      const employee = await getEmployeeById(letter.employeeId);
      const company = await getCompanyById(membership.companyId);
      const baseUrl = resolvePublicAppBaseUrl(ctx.req);
      const viewToken = await signHRLetterViewToken(letter.id);
      const signedViewUrl =
        !input.pdfUrl && baseUrl && viewToken ? `${baseUrl}/api/hr-letters/view?token=${encodeURIComponent(viewToken)}` : undefined;
      const result = await sendHRLetterEmail({
        to: input.employeeEmail,
        cc: input.cc,
        employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : "Employee",
        letterType: letter.letterType,
        companyName: company?.name ?? "SmartPRO",
        issuedBy: ctx.user.name ?? ctx.user.email ?? "HR Team",
        pdfUrl: input.pdfUrl ?? signedViewUrl,
        appBaseUrl: baseUrl || undefined,
      });
      if (!result.success) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error ?? "Failed to send email" });
      }
      await db.update(hrLetters).set({
        emailSentAt: new Date(),
        emailSendCount: (letter.emailSendCount ?? 0) + 1,
        emailLastSentTo: input.employeeEmail,
      }).where(eq(hrLetters.id, letter.id));
      return { success: true, sendCount: (letter.emailSendCount ?? 0) + 1 };
    }),

  getEmailStatus: protectedProcedure
    .input(z.object({ id: z.number(), companyId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select({
          emailSentAt: hrLetters.emailSentAt,
          emailSendCount: hrLetters.emailSendCount,
          emailLastSentTo: hrLetters.emailLastSentTo,
        })
        .from(hrLetters)
        .where(and(eq(hrLetters.id, input.id), eq(hrLetters.companyId, membership.companyId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  deleteLetter: protectedProcedure.input(z.object({ id: z.number(), companyId: z.number().optional() })).mutation(async ({ input, ctx }) => {
    const membership = await getActiveCompanyMembership(ctx.user.id, input.companyId);
    if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
    requireNotAuditor(membership.role, "External Auditors cannot delete letters.");
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db
      .update(hrLetters)
      .set({ isDeleted: true })
      .where(and(eq(hrLetters.id, input.id), eq(hrLetters.companyId, membership.companyId)));
    return { success: true };
  }),
});
