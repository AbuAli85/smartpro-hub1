import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { hrLetters } from "../../drizzle/schema";
import { getDb } from "../db";
import { getEmployeeById, getCompanyById } from "../db";
import { getActiveCompanyMembership, requireNotAuditor } from "../_core/membership";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// ─── Letter type metadata ──────────────────────────────────────────────────────
const LETTER_TYPES = {
  salary_certificate: {
    en: "Salary Certificate",
    ar: "شهادة راتب",
    description: "Official confirmation of employee salary for banks, embassies, or government authorities",
  },
  employment_verification: {
    en: "Employment Verification Letter",
    ar: "خطاب تحقق من التوظيف",
    description: "Confirms that the employee is currently employed at the company",
  },
  noc: {
    en: "No Objection Certificate (NOC)",
    ar: "شهادة عدم ممانعة",
    description: "States that the company has no objection to the employee's stated purpose",
  },
  experience_letter: {
    en: "Experience Letter",
    ar: "خطاب خبرة",
    description: "Confirms the employee's period of service and role",
  },
  promotion_letter: {
    en: "Promotion Letter",
    ar: "خطاب ترقية",
    description: "Official notification of employee promotion to a new position",
  },
  salary_transfer_letter: {
    en: "Salary Transfer Letter",
    ar: "خطاب تحويل الراتب",
    description: "Authorises the bank to receive the employee's salary transfer",
  },
  leave_approval_letter: {
    en: "Leave Approval Letter",
    ar: "خطاب الموافقة على الإجازة",
    description: "Official approval of the employee's leave request",
  },
  warning_letter: {
    en: "Warning Letter",
    ar: "خطاب إنذار",
    description: "Formal disciplinary warning issued to the employee",
  },
} as const;

type LetterType = keyof typeof LETTER_TYPES;

// ─── Reference number generator ───────────────────────────────────────────────
function generateRefNumber(companyId: number, letterType: string): string {
  const prefix = letterType.toUpperCase().replace(/_/g, "-").slice(0, 6);
  const year = new Date().getFullYear();
  const seq = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${year}-${companyId}-${seq}`;
}

// ─── LLM prompt builder ────────────────────────────────────────────────────────
function buildLetterPrompt(params: {
  letterType: LetterType;
  language: "en" | "ar" | "both";
  employee: {
    firstName: string; lastName: string;
    firstNameAr?: string | null; lastNameAr?: string | null;
    position?: string | null; department?: string | null;
    nationality?: string | null; employeeNumber?: string | null;
    salary?: string | null; hireDate?: Date | null;
    passportNumber?: string | null; civilId?: string | null;
  };
  company: {
    name: string; nameAr?: string | null;
    crNumber?: string | null; address?: string | null;
    city?: string | null; phone?: string | null; email?: string | null;
  };
  issuedTo?: string;
  purpose?: string;
  additionalNotes?: string;
  referenceNumber: string;
  dateStr: string;
}): string {
  const { letterType, language, employee, company, issuedTo, purpose, additionalNotes, referenceNumber, dateStr } = params;
  const meta = LETTER_TYPES[letterType];
  const empName = `${employee.firstName} ${employee.lastName}`;
  const empNameAr = employee.firstNameAr && employee.lastNameAr
    ? `${employee.firstNameAr} ${employee.lastNameAr}` : empName;
  const hireYear = employee.hireDate ? new Date(employee.hireDate).getFullYear() : null;
  const salaryFormatted = employee.salary ? `OMR ${parseFloat(employee.salary).toFixed(3)}` : null;

  const contextBlock = `
Employee Details:
- Full Name (EN): ${empName}
- Full Name (AR): ${empNameAr}
- Employee Number: ${employee.employeeNumber ?? "N/A"}
- Position / Job Title: ${employee.position ?? "N/A"}
- Department: ${employee.department ?? "N/A"}
- Nationality: ${employee.nationality ?? "N/A"}
- Passport Number: ${employee.passportNumber ?? "N/A"}
- Civil ID: ${employee.civilId ?? "N/A"}
- Monthly Salary: ${salaryFormatted ?? "N/A"}
- Hire Date / Year Joined: ${hireYear ?? "N/A"}

Company Details:
- Company Name (EN): ${company.name}
- Company Name (AR): ${company.nameAr ?? company.name}
- Commercial Registration (CR): ${company.crNumber ?? "N/A"}
- Address: ${company.address ?? company.city ?? "Muscat, Sultanate of Oman"}
- Phone: ${company.phone ?? "N/A"}
- Email: ${company.email ?? "N/A"}

Letter Metadata:
- Reference Number: ${referenceNumber}
- Date: ${dateStr}
- Letter Type: ${meta.en} / ${meta.ar}
- Addressed To: ${issuedTo ?? "Whom It May Concern"}
- Purpose: ${purpose ?? "As requested by the employee"}
- Additional Notes: ${additionalNotes ?? "None"}
`;

  if (language === "en") {
    return `You are an expert HR officer in Oman. Write a formal, professional ${meta.en} letter in English only.

${contextBlock}

Requirements:
- Follow Oman labour law standards and professional HR letter conventions
- Use formal British English
- Include: reference number, date, addressee line, subject line, body paragraphs, closing, signature block (HR Manager / Authorised Signatory)
- The letter must be complete and ready to print — no placeholders
- Return ONLY the letter body as clean HTML (use <p>, <strong>, <br> tags). No markdown, no code blocks.
- Start with the reference number and date at the top right, then addressee, then subject, then body.`;
  }

  if (language === "ar") {
    return `أنت مسؤول موارد بشرية خبير في سلطنة عُمان. اكتب ${meta.ar} رسمية واحترافية باللغة العربية فقط.

${contextBlock}

المتطلبات:
- اتبع معايير قانون العمل العُماني والأعراف المهنية لخطابات الموارد البشرية
- استخدم اللغة العربية الفصحى الرسمية
- تضمين: رقم المرجع، التاريخ، المرسل إليه، الموضوع، فقرات النص، الختام، كتلة التوقيع (مدير الموارد البشرية / المفوض بالتوقيع)
- يجب أن تكون الرسالة كاملة وجاهزة للطباعة — بدون عناصر نائبة
- أعد نص الرسالة فقط بصيغة HTML نظيفة (استخدم وسوم <p> و<strong> و<br>). لا markdown، لا كتل كود.
- ابدأ برقم المرجع والتاريخ في أعلى اليمين، ثم المرسل إليه، ثم الموضوع، ثم النص.
- اتجاه النص من اليمين إلى اليسار.`;
  }

  // both
  return `You are an expert HR officer in Oman. Write a formal bilingual HR letter: first the complete English version, then the complete Arabic version, for a ${meta.en} / ${meta.ar}.

${contextBlock}

Requirements:
- English section first, Arabic section second
- Each section must be complete and standalone
- Follow Oman labour law standards
- English: formal British English, left-to-right
- Arabic: formal Modern Standard Arabic (فصحى), right-to-left
- Return as clean HTML. Wrap the English section in <div class="letter-en"> and the Arabic section in <div class="letter-ar" dir="rtl">
- Each section includes: reference number, date, addressee, subject, body, closing, signature block
- No placeholders — all fields must be filled from the data provided`;
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const hrLettersRouter = router({
  // List all letters for the company
  listLetters: protectedProcedure
    .input(z.object({
      employeeId: z.number().optional(),
      letterType: z.string().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership) return [];
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(hrLetters)
        .where(
          and(
            eq(hrLetters.companyId, membership.companyId),
            eq(hrLetters.isDeleted, false),
          )
        )
        .orderBy(desc(hrLetters.createdAt));
      return rows;
    }),

  // Get a single letter by id
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
      return letter;
    }),

  // Generate a new letter using LLM
  generateLetter: protectedProcedure
    .input(z.object({
      employeeId: z.number(),
      letterType: z.enum([
        "salary_certificate", "employment_verification", "noc",
        "experience_letter", "promotion_letter", "salary_transfer_letter",
        "leave_approval_letter", "warning_letter",
      ]),
      language: z.enum(["en", "ar", "both"]).default("en"),
      issuedTo: z.string().optional(),
      purpose: z.string().optional(),
      additionalNotes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
      if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "No company membership" });
      requireNotAuditor(membership.role, "External Auditors cannot generate letters.");

      // Fetch employee and company data
      const employee = await getEmployeeById(input.employeeId);
      if (!employee || employee.companyId !== membership.companyId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
      }
      const company = await getCompanyById(membership.companyId);
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });

      const refNumber = generateRefNumber(membership.companyId, input.letterType);
      const dateStr = new Date().toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
      });

      const prompt = buildLetterPrompt({
        letterType: input.letterType as LetterType,
        language: input.language,
        employee: {
          firstName: employee.firstName,
          lastName: employee.lastName,
          firstNameAr: employee.firstNameAr,
          lastNameAr: employee.lastNameAr,
          position: employee.position,
          department: employee.department,
          nationality: employee.nationality,
          employeeNumber: employee.employeeNumber,
          salary: employee.salary,
          hireDate: employee.hireDate,
          passportNumber: (employee as any).passportNumber ?? null,
          civilId: (employee as any).civilId ?? null,
        },
        company: {
          name: company.name,
          nameAr: company.nameAr,
          crNumber: company.crNumber,
          address: company.address,
          city: company.city,
          phone: company.phone,
          email: company.email,
        },
        issuedTo: input.issuedTo,
        purpose: input.purpose,
        additionalNotes: input.additionalNotes,
        referenceNumber: refNumber,
        dateStr,
      });

      // Call LLM
      const llmResponse = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are an expert HR officer specialising in Omani labour law and official business correspondence. You produce complete, professional, print-ready HR letters in the exact format requested.",
          },
          { role: "user", content: prompt },
        ],
      });

      const rawContent = llmResponse?.choices?.[0]?.message?.content;
      const generatedContent: string = typeof rawContent === "string" ? rawContent : "";
      if (!generatedContent) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Letter generation failed" });
      }

      // Split bilingual content
      let bodyEn: string | null = null;
      let bodyAr: string | null = null;
      if (input.language === "both") {
        // Extract English and Arabic sections from the HTML
        const enMatch = generatedContent.match(/<div class="letter-en">([\s\S]*?)<\/div>/i);
        const arMatch = generatedContent.match(/<div class="letter-ar"[^>]*>([\s\S]*?)<\/div>/i);
        bodyEn = enMatch ? enMatch[1].trim() : generatedContent;
        bodyAr = arMatch ? arMatch[1].trim() : null;
      } else if (input.language === "ar") {
        bodyAr = generatedContent;
      } else {
        bodyEn = generatedContent;
      }

      const meta = LETTER_TYPES[input.letterType as LetterType];
      const subject = input.language === "ar" ? meta.ar : meta.en;

      // Save to database
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const insertResult = await db.insert(hrLetters).values({
        companyId: membership.companyId,
        employeeId: input.employeeId,
        letterType: input.letterType,
        language: input.language,
        referenceNumber: refNumber,
        subject,
        bodyEn,
        bodyAr,
        issuedTo: input.issuedTo ?? null,
        purpose: input.purpose ?? null,
        additionalNotes: input.additionalNotes ?? null,
        isDeleted: false,
        createdBy: ctx.user.id,
      });

      const insertId = (insertResult[0] as any)?.insertId ?? null;
      const savedRows = insertId
        ? await db.select().from(hrLetters).where(eq(hrLetters.id, insertId)).limit(1)
        : [];

      return savedRows[0] ?? {
        id: insertId,
        companyId: membership.companyId,
        employeeId: input.employeeId,
        letterType: input.letterType,
        language: input.language,
        referenceNumber: refNumber,
        subject,
        bodyEn,
        bodyAr,
        issuedTo: input.issuedTo ?? null,
        purpose: input.purpose ?? null,
        additionalNotes: input.additionalNotes ?? null,
        isDeleted: false,
        createdBy: ctx.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),

  // Delete (soft-delete) a letter
  deleteLetter: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const membership = await getActiveCompanyMembership(ctx.user.id);
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
