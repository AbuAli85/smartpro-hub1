import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  jobPostings,
  jobApplications,
  interviewSchedules,
  offerLetters,
  employees,
} from "../../drizzle/schema";
import { eq, and, desc, asc, inArray, sql, count } from "drizzle-orm";
import { storagePut } from "../storage";
import { invokeLLM } from "../_core/llm";
import { publicProcedure } from "../_core/trpc";
import { requireActiveCompanyId } from "../_core/tenant";
import { requireHrOrAdmin } from "../_core/policy";
import type { User } from "../../drizzle/schema";

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const recruitmentWorkspace = z.object({ companyId: z.number().optional() });

/** Read-only workspace resolver — for queries accessible to all members. */
async function recruitmentCompanyId(user: User, explicit?: number | null) {
  return requireActiveCompanyId(user.id, explicit, user);
}

/** Mutation gate — requires hr_admin or company_admin. */
async function requireRecruitmentAdmin(user: User, explicit?: number | null) {
  return requireHrOrAdmin(user, explicit);
}

export const recruitmentRouter = router({
  // ── Job Postings ────────────────────────────────────────────────────────────
  listJobs: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "open", "closed", "on_hold", "all"])
            .default("all"),
        })
        .merge(recruitmentWorkspace)
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const companyId = await recruitmentCompanyId(
        ctx.user as User,
        input?.companyId
      );
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(jobPostings)
        .where(
          input?.status && input.status !== "all"
            ? and(
                eq(jobPostings.companyId, companyId),
                eq(jobPostings.status, input.status as any)
              )
            : eq(jobPostings.companyId, companyId)
        )
        .orderBy(desc(jobPostings.createdAt));
      // Attach application counts
      const ids = rows.map(r => r.id);
      if (!ids.length) return rows.map(r => ({ ...r, applicationCount: 0 }));
      const counts = await db
        .select({ jobId: jobApplications.jobId, cnt: count() })
        .from(jobApplications)
        .where(inArray(jobApplications.jobId, ids))
        .groupBy(jobApplications.jobId);
      const countMap = Object.fromEntries(counts.map(c => [c.jobId, c.cnt]));
      return rows.map(r => ({ ...r, applicationCount: countMap[r.id] ?? 0 }));
    }),

  createJob: protectedProcedure
    .input(
      z
        .object({
          title: z.string().min(2),
          department: z.string().optional(),
          location: z.string().optional(),
          type: z
            .enum(["full_time", "part_time", "contract", "intern"])
            .default("full_time"),
          description: z.string().optional(),
          requirements: z.string().optional(),
          salaryMin: z.number().optional(),
          salaryMax: z.number().optional(),
          applicationDeadline: z.string().optional(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const [result] = await db.insert(jobPostings).values({
        companyId,
        title: input.title,
        department: input.department,
        location: input.location,
        type: input.type,
        status: "draft",
        description: input.description,
        requirements: input.requirements,
        salaryMin: input.salaryMin ? String(input.salaryMin) : null,
        salaryMax: input.salaryMax ? String(input.salaryMax) : null,
        applicationDeadline: input.applicationDeadline
          ? new Date(input.applicationDeadline)
          : null,
        createdBy: ctx.user.id,
      });
      return { id: (result as any).insertId };
    }),

  updateJob: protectedProcedure
    .input(
      z
        .object({
          id: z.number(),
          title: z.string().optional(),
          department: z.string().optional(),
          location: z.string().optional(),
          type: z
            .enum(["full_time", "part_time", "contract", "intern"])
            .optional(),
          status: z.enum(["draft", "open", "closed", "on_hold"]).optional(),
          description: z.string().optional(),
          requirements: z.string().optional(),
          salaryMin: z.number().optional(),
          salaryMax: z.number().optional(),
          applicationDeadline: z.string().optional(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const { id, salaryMin, salaryMax, applicationDeadline, companyId: _workspace, ...rest } =
        input;
      await db
        .update(jobPostings)
        .set({
          ...rest,
          ...(salaryMin !== undefined && { salaryMin: String(salaryMin) }),
          ...(salaryMax !== undefined && { salaryMax: String(salaryMax) }),
          ...(applicationDeadline !== undefined && {
            applicationDeadline: new Date(applicationDeadline),
          }),
        })
        .where(
          and(eq(jobPostings.id, id), eq(jobPostings.companyId, companyId))
        );
      return { ok: true };
    }),

  deleteJob: protectedProcedure
    .input(z.object({ id: z.number() }).merge(recruitmentWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      await db
        .delete(jobPostings)
        .where(
          and(
            eq(jobPostings.id, input.id),
            eq(jobPostings.companyId, companyId)
          )
        );
      return { ok: true };
    }),

  // ── Applications ────────────────────────────────────────────────────────────
  listApplications: protectedProcedure
    .input(
      z
        .object({
          jobId: z.number().optional(),
          stage: z
            .enum([
              "applied",
              "screening",
              "interview",
              "assessment",
              "offer",
              "hired",
              "rejected",
              "all",
            ])
            .default("all"),
        })
        .merge(recruitmentWorkspace)
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const companyId = await recruitmentCompanyId(
        ctx.user as User,
        input?.companyId
      );
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(jobApplications.companyId, companyId)];
      if (input?.jobId) conditions.push(eq(jobApplications.jobId, input.jobId));
      if (input?.stage && input.stage !== "all")
        conditions.push(eq(jobApplications.stage, input.stage as any));
      const apps = await db
        .select({
          app: jobApplications,
          job: { title: jobPostings.title, department: jobPostings.department },
        })
        .from(jobApplications)
        .leftJoin(jobPostings, eq(jobApplications.jobId, jobPostings.id))
        .where(and(...conditions))
        .orderBy(desc(jobApplications.createdAt));
      return apps;
    }),

  getPipelineKanban: protectedProcedure
    .input(
      z
        .object({ jobId: z.number().optional() })
        .merge(recruitmentWorkspace)
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const companyId = await recruitmentCompanyId(
        ctx.user as User,
        input?.companyId
      );
      const db = await getDb();
      if (!db) return {};
      const conditions = [eq(jobApplications.companyId, companyId)];
      if (input?.jobId) conditions.push(eq(jobApplications.jobId, input.jobId));
      const apps = await db
        .select({
          app: jobApplications,
          job: { title: jobPostings.title },
        })
        .from(jobApplications)
        .leftJoin(jobPostings, eq(jobApplications.jobId, jobPostings.id))
        .where(and(...conditions))
        .orderBy(asc(jobApplications.createdAt));
      const stages = [
        "applied",
        "screening",
        "interview",
        "assessment",
        "offer",
        "hired",
        "rejected",
      ] as const;
      const kanban: Record<string, typeof apps> = {};
      for (const s of stages) kanban[s] = [];
      for (const row of apps) kanban[row.app.stage]?.push(row);
      return kanban;
    }),

  updateApplicationStage: protectedProcedure
    .input(
      z
        .object({
          id: z.number(),
          stage: z.enum([
            "applied",
            "screening",
            "interview",
            "assessment",
            "offer",
            "hired",
            "rejected",
          ]),
          notes: z.string().optional(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      await db
        .update(jobApplications)
        .set({ stage: input.stage, notes: input.notes })
        .where(
          and(
            eq(jobApplications.id, input.id),
            eq(jobApplications.companyId, companyId)
          )
        );
      return { ok: true };
    }),

  // ── Interview Scheduling ────────────────────────────────────────────────────
  listInterviews: protectedProcedure
    .input(
      z
        .object({ applicationId: z.number().optional() })
        .merge(recruitmentWorkspace)
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const companyId = await recruitmentCompanyId(
        ctx.user as User,
        input?.companyId
      );
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(interviewSchedules.companyId, companyId)];
      if (input?.applicationId)
        conditions.push(
          eq(interviewSchedules.applicationId, input.applicationId)
        );
      return db
        .select({
          interview: interviewSchedules,
          app: {
            applicantName: jobApplications.applicantName,
            applicantEmail: jobApplications.applicantEmail,
            stage: jobApplications.stage,
          },
          job: { title: jobPostings.title },
        })
        .from(interviewSchedules)
        .leftJoin(
          jobApplications,
          eq(interviewSchedules.applicationId, jobApplications.id)
        )
        .leftJoin(jobPostings, eq(jobApplications.jobId, jobPostings.id))
        .where(and(...conditions))
        .orderBy(asc(interviewSchedules.scheduledAt));
    }),

  scheduleInterview: protectedProcedure
    .input(
      z
        .object({
          applicationId: z.number(),
          interviewType: z
            .enum(["phone", "video", "in_person", "technical", "panel"])
            .default("video"),
          scheduledAt: z.string(),
          durationMinutes: z.number().default(60),
          location: z.string().optional(),
          meetingLink: z.string().optional(),
          interviewerNames: z.string().optional(),
          notes: z.string().optional(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const [appRow] = await db
        .select({ id: jobApplications.id, jobId: jobApplications.jobId })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.id, input.applicationId),
            eq(jobApplications.companyId, companyId)
          )
        )
        .limit(1);
      if (!appRow)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Application not found",
        });
      const [result] = await db.insert(interviewSchedules).values({
        applicationId: input.applicationId,
        companyId,
        interviewType: input.interviewType,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes,
        location: input.location,
        meetingLink: input.meetingLink,
        interviewerNames: input.interviewerNames,
        notes: input.notes,
        status: "scheduled",
      });
      // Auto-advance application stage to interview
      await db
        .update(jobApplications)
        .set({ stage: "interview" })
        .where(
          and(
            eq(jobApplications.id, input.applicationId),
            eq(jobApplications.companyId, companyId)
          )
        );
      return { id: (result as any).insertId };
    }),

  updateInterview: protectedProcedure
    .input(
      z
        .object({
          id: z.number(),
          status: z
            .enum(["scheduled", "completed", "cancelled", "no_show"])
            .optional(),
          feedback: z.string().optional(),
          rating: z.number().min(1).max(5).optional(),
          notes: z.string().optional(),
          scheduledAt: z.string().optional(),
          meetingLink: z.string().optional(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const { id, scheduledAt, companyId: _cw, ...rest } = input;
      await db
        .update(interviewSchedules)
        .set({
          ...rest,
          ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
        })
        .where(
          and(
            eq(interviewSchedules.id, id),
            eq(interviewSchedules.companyId, companyId)
          )
        );
      return { ok: true };
    }),

  // ── Offer Letters ───────────────────────────────────────────────────────────
  listOffers: protectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["draft", "sent", "accepted", "rejected", "expired", "all"])
            .default("all"),
        })
        .merge(recruitmentWorkspace)
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const companyId = await recruitmentCompanyId(
        ctx.user as User,
        input?.companyId
      );
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(offerLetters.companyId, companyId)];
      if (input?.status && input.status !== "all")
        conditions.push(eq(offerLetters.status, input.status as any));
      return db
        .select()
        .from(offerLetters)
        .where(and(...conditions))
        .orderBy(desc(offerLetters.createdAt));
    }),

  createOffer: protectedProcedure
    .input(
      z
        .object({
          applicationId: z.number(),
          jobId: z.number(),
          applicantName: z.string(),
          applicantEmail: z.string().email(),
          position: z.string(),
          department: z.string().optional(),
          startDate: z.string().optional(),
          basicSalary: z.number(),
          housingAllowance: z.number().default(0),
          transportAllowance: z.number().default(0),
          otherAllowances: z.number().default(0),
          probationMonths: z.number().default(3),
          annualLeave: z.number().default(21),
          additionalTerms: z.string().optional(),
          expiresAt: z.string().optional(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const [appRow] = await db
        .select({ id: jobApplications.id, jobId: jobApplications.jobId })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.id, input.applicationId),
            eq(jobApplications.companyId, companyId)
          )
        )
        .limit(1);
      if (!appRow)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Application not found",
        });
      if (appRow.jobId !== input.jobId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Job does not match application",
        });
      }
      const [jobRow] = await db
        .select({ id: jobPostings.id })
        .from(jobPostings)
        .where(
          and(
            eq(jobPostings.id, input.jobId),
            eq(jobPostings.companyId, companyId)
          )
        )
        .limit(1);
      if (!jobRow)
        throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      const totalPackage =
        input.basicSalary +
        input.housingAllowance +
        input.transportAllowance +
        input.otherAllowances;
      // Generate offer letter HTML and store in S3
      const html = generateOfferLetterHtml({
        ...input,
        totalPackage,
        companyId,
      });
      const key = `offer-letters/${companyId}/${input.applicationId}-${randomSuffix()}.html`;
      const { url } = await storagePut(key, html, "text/html");
      const [result] = await db.insert(offerLetters).values({
        applicationId: input.applicationId,
        companyId,
        jobId: input.jobId,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        position: input.position,
        department: input.department,
        startDate: input.startDate ? new Date(input.startDate) : null,
        basicSalary: String(input.basicSalary),
        housingAllowance: String(input.housingAllowance),
        transportAllowance: String(input.transportAllowance),
        otherAllowances: String(input.otherAllowances),
        totalPackage: String(totalPackage),
        probationMonths: input.probationMonths,
        annualLeave: input.annualLeave,
        additionalTerms: input.additionalTerms,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        letterUrl: url,
        letterKey: key,
        status: "draft",
      });
      // Advance application to offer stage
      await db
        .update(jobApplications)
        .set({ stage: "offer" })
        .where(
          and(
            eq(jobApplications.id, input.applicationId),
            eq(jobApplications.companyId, companyId)
          )
        );
      return { id: (result as any).insertId, url };
    }),

  sendOffer: protectedProcedure
    .input(z.object({ id: z.number() }).merge(recruitmentWorkspace))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      await db
        .update(offerLetters)
        .set({ status: "sent", sentAt: new Date() })
        .where(
          and(
            eq(offerLetters.id, input.id),
            eq(offerLetters.companyId, companyId)
          )
        );
      return { ok: true };
    }),

  updateOfferStatus: protectedProcedure
    .input(
      z
        .object({
          id: z.number(),
          status: z.enum(["draft", "sent", "accepted", "rejected", "expired"]),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const [offer] = await db
        .select()
        .from(offerLetters)
        .where(
          and(
            eq(offerLetters.id, input.id),
            eq(offerLetters.companyId, companyId)
          )
        )
        .limit(1);
      if (!offer) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(offerLetters)
        .set({ status: input.status, respondedAt: new Date() })
        .where(
          and(
            eq(offerLetters.id, input.id),
            eq(offerLetters.companyId, companyId)
          )
        );
      // If accepted, advance application to hired
      if (input.status === "accepted") {
        await db
          .update(jobApplications)
          .set({ stage: "hired" })
          .where(
            and(
              eq(jobApplications.id, offer.applicationId),
              eq(jobApplications.companyId, companyId)
            )
          );
      }
      return { ok: true };
    }),

  // ── Public Job Board ────────────────────────────────────────────────────────
  /** Public job listings — no auth required */
  listPublicJobs: publicProcedure
    .input(
      z
        .object({
          query: z.string().optional(),
          type: z
            .enum(["full_time", "part_time", "contract", "intern", "all"])
            .default("all"),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [sql`${jobPostings.status} = 'open'`];
      if (input?.type && input.type !== "all")
        conditions.push(eq(jobPostings.type, input.type as any));
      const rows = await db
        .select({
          id: jobPostings.id,
          title: jobPostings.title,
          department: jobPostings.department,
          location: jobPostings.location,
          type: jobPostings.type,
          description: jobPostings.description,
          requirements: jobPostings.requirements,
          salaryMin: jobPostings.salaryMin,
          salaryMax: jobPostings.salaryMax,
          applicationDeadline: jobPostings.applicationDeadline,
          createdAt: jobPostings.createdAt,
        })
        .from(jobPostings)
        .where(and(...conditions))
        .orderBy(desc(jobPostings.createdAt))
        .limit(50);
      // Filter by query client-side for simplicity
      if (input?.query) {
        const q = input.query.toLowerCase();
        return rows.filter(
          r =>
            r.title?.toLowerCase().includes(q) ||
            r.department?.toLowerCase().includes(q) ||
            r.location?.toLowerCase().includes(q)
        );
      }
      return rows;
    }),

  /** Submit a job application — public (no auth required) */
  applyForJob: publicProcedure
    .input(
      z.object({
        jobId: z.number(),
        applicantName: z.string().min(2),
        applicantEmail: z.string().email(),
        applicantPhone: z.string().optional(),
        coverLetter: z.string().optional(),
        cvUrl: z.string().url().optional(),
        currentCompany: z.string().optional(),
        yearsExperience: z.number().optional(),
        skills: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Verify job is open
      const [job] = await db
        .select({
          id: jobPostings.id,
          companyId: jobPostings.companyId,
          title: jobPostings.title,
        })
        .from(jobPostings)
        .where(
          and(
            eq(jobPostings.id, input.jobId),
            sql`${jobPostings.status} = 'open'`
          )
        );
      if (!job)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Job not found or no longer accepting applications",
        });
      // Check for duplicate application
      const [existing] = await db
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.jobId, input.jobId),
            eq(jobApplications.applicantEmail, input.applicantEmail)
          )
        );
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "You have already applied for this position",
        });
      const [result] = await db.insert(jobApplications).values({
        jobId: input.jobId,
        companyId: job!.companyId,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        applicantPhone: input.applicantPhone,
        coverLetter: input.coverLetter,
        resumeUrl: input.cvUrl,
        stage: "applied",
        notes:
          [
            input.currentCompany && `Current: ${input.currentCompany}`,
            input.yearsExperience && `${input.yearsExperience} yrs exp`,
            input.skills && `Skills: ${input.skills}`,
          ]
            .filter(Boolean)
            .join(" | ") || undefined,
      });
      return { id: (result as any).insertId, jobTitle: job!.title };
    }),

  /** AI-powered CV screening — score 0-100, extract skills, flag gaps */
  screenApplication: protectedProcedure
    .input(
      z
        .object({
          applicationId: z.number(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const [appRow] = await db
        .select({
          app: jobApplications,
          job: {
            title: jobPostings.title,
            requirements: jobPostings.requirements,
            description: jobPostings.description,
          },
        })
        .from(jobApplications)
        .leftJoin(jobPostings, eq(jobApplications.jobId, jobPostings.id))
        .where(
          and(
            eq(jobApplications.id, input.applicationId),
            eq(jobApplications.companyId, companyId)
          )
        );
      if (!appRow) throw new TRPCError({ code: "NOT_FOUND" });
      const { app, job } = appRow;
      const prompt = `You are an expert HR recruiter. Evaluate this job application and return a JSON screening report.

Job Title: ${job?.title ?? "Unknown"}
Job Requirements: ${job?.requirements ?? "Not specified"}
Job Description: ${job?.description ?? "Not specified"}

Applicant: ${app.applicantName}
Cover Letter: ${app.coverLetter ?? "Not provided"}
Application Notes: ${app.notes ?? "Not provided"}

Return a JSON object with:
- score: number 0-100 (overall fit score)
- recommendation: "strong_yes" | "yes" | "maybe" | "no"
- strengths: string[] (top 3 strengths)
- gaps: string[] (key gaps or concerns)
- summary: string (2-3 sentence summary)
- extractedSkills: string[] (skills identified from the application)`;
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content:
              "You are an expert HR recruiter. Always respond with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "screening_report",
            strict: true,
            schema: {
              type: "object",
              properties: {
                score: { type: "number" },
                recommendation: { type: "string" },
                strengths: { type: "array", items: { type: "string" } },
                gaps: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
                extractedSkills: { type: "array", items: { type: "string" } },
              },
              required: [
                "score",
                "recommendation",
                "strengths",
                "gaps",
                "summary",
                "extractedSkills",
              ],
              additionalProperties: false,
            },
          },
        },
      });
      const content = response.choices[0]?.message?.content ?? "{}";
      const report = JSON.parse(
        typeof content === "string" ? content : JSON.stringify(content)
      );
      // Save screening result to application
      // Store screening report in notes field (schema doesn't have dedicated AI fields)
      await db
        .update(jobApplications)
        .set({
          notes: `AI_SCREEN:${JSON.stringify(report)}`,
          stage: app.stage === "applied" ? "screening" : app.stage,
        })
        .where(
          and(
            eq(jobApplications.id, input.applicationId),
            eq(jobApplications.companyId, companyId)
          )
        );
      return report;
    }),

  /** Convert accepted application to employee record */
  convertToEmployee: protectedProcedure
    .input(
      z
        .object({
          applicationId: z.number(),
          startDate: z.string(),
          salary: z.number().optional(),
          jobTitle: z.string().optional(),
          department: z.string().optional(),
        })
        .merge(recruitmentWorkspace)
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { companyId } = await requireRecruitmentAdmin(
        ctx.user as User,
        input.companyId
      );
      const [appRow] = await db
        .select({
          app: jobApplications,
          job: { title: jobPostings.title, department: jobPostings.department },
        })
        .from(jobApplications)
        .leftJoin(jobPostings, eq(jobApplications.jobId, jobPostings.id))
        .where(
          and(
            eq(jobApplications.id, input.applicationId),
            eq(jobApplications.companyId, companyId)
          )
        );
      if (!appRow) throw new TRPCError({ code: "NOT_FOUND" });
      const { app, job } = appRow;
      if (app.stage !== "hired" && app.stage !== "offer") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Application must be in offer or hired stage",
        });
      }
      // Create employee record
      const nameParts = (app.applicantName ?? "").split(" ");
      const firstName = nameParts[0] ?? app.applicantName ?? "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const [empResult] = await db.insert(employees).values({
        companyId,
        firstName,
        lastName,
        email: app.applicantEmail ?? "",
        phone: app.applicantPhone,
        position: input.jobTitle ?? job?.title ?? "",
        department: input.department ?? job?.department ?? undefined,
        hireDate: new Date(input.startDate),
        salary: input.salary ? String(input.salary) : null,
        status: "active",
      });
      await db
        .update(jobApplications)
        .set({ stage: "hired" })
        .where(eq(jobApplications.id, input.applicationId));
      return {
        employeeId: (empResult as any).insertId,
        name: `${firstName} ${lastName}`,
      };
    }),

  // ── Pipeline Summary ────────────────────────────────────────────────────────
  getPipelineSummary: protectedProcedure
    .input(z.object({ companyId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const companyId = await recruitmentCompanyId(
        ctx.user as User,
        input?.companyId
      );
      const db = await getDb();
      if (!db) return null;
      const [openJobs] = await db
        .select({ cnt: count() })
        .from(jobPostings)
        .where(
          and(
            eq(jobPostings.companyId, companyId),
            eq(jobPostings.status, "open")
          )
        );
      const stageCounts = await db
        .select({ stage: jobApplications.stage, cnt: count() })
        .from(jobApplications)
        .where(eq(jobApplications.companyId, companyId))
        .groupBy(jobApplications.stage);
      const stageMap = Object.fromEntries(
        stageCounts.map(s => [s.stage, s.cnt])
      );
      const [pendingInterviews] = await db
        .select({ cnt: count() })
        .from(interviewSchedules)
        .where(
          and(
            eq(interviewSchedules.companyId, companyId),
            eq(interviewSchedules.status, "scheduled")
          )
        );
      const [pendingOffers] = await db
        .select({ cnt: count() })
        .from(offerLetters)
        .where(
          and(
            eq(offerLetters.companyId, companyId),
            eq(offerLetters.status, "sent")
          )
        );
      return {
        openJobs: openJobs?.cnt ?? 0,
        totalApplications: Object.values(stageMap).reduce((a, b) => a + b, 0),
        stageMap,
        pendingInterviews: pendingInterviews?.cnt ?? 0,
        pendingOffers: pendingOffers?.cnt ?? 0,
      };
    }),
});

// ── Offer Letter HTML Template ──────────────────────────────────────────────
function generateOfferLetterHtml(data: {
  applicantName: string;
  position: string;
  department?: string;
  startDate?: string;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  totalPackage: number;
  probationMonths: number;
  annualLeave: number;
  additionalTerms?: string;
  companyId: number;
}) {
  const fmt = (n: number) => `OMR ${n.toFixed(3)}`;
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Offer Letter — ${data.applicantName}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 40px; color: #1a1a1a; line-height: 1.6; }
  .header { text-align: center; border-bottom: 3px solid #1e40af; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { color: #1e40af; font-size: 28px; margin: 0; }
  .header p { color: #6b7280; margin: 4px 0; }
  .section { margin: 24px 0; }
  .section h2 { color: #1e40af; font-size: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  td { padding: 8px 12px; border: 1px solid #e5e7eb; }
  td:first-child { font-weight: 600; background: #f9fafb; width: 40%; }
  .total-row td { background: #eff6ff; font-weight: 700; color: #1e40af; }
  .footer { margin-top: 60px; display: flex; justify-content: space-between; }
  .sig-block { text-align: center; }
  .sig-line { border-top: 1px solid #374151; width: 200px; margin: 40px auto 8px; }
  .badge { display: inline-block; background: #1e40af; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; }
</style></head><body>
<div class="header">
  <h1>SmartPRO Business Services Hub</h1>
  <p>Offer of Employment</p>
  <p style="font-size:12px;color:#9ca3af">${today}</p>
</div>
<p>Dear <strong>${data.applicantName}</strong>,</p>
<p>We are pleased to offer you the position of <strong>${data.position}</strong>${data.department ? ` in the <strong>${data.department}</strong> department` : ""}. This letter confirms the terms and conditions of your employment.</p>
<div class="section">
  <h2>Position Details</h2>
  <table>
    <tr><td>Position</td><td>${data.position}</td></tr>
    ${data.department ? `<tr><td>Department</td><td>${data.department}</td></tr>` : ""}
    ${data.startDate ? `<tr><td>Start Date</td><td>${new Date(data.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</td></tr>` : ""}
    <tr><td>Probation Period</td><td>${data.probationMonths} months</td></tr>
    <tr><td>Annual Leave</td><td>${data.annualLeave} working days</td></tr>
  </table>
</div>
<div class="section">
  <h2>Compensation Package (Monthly)</h2>
  <table>
    <tr><td>Basic Salary</td><td>${fmt(data.basicSalary)}</td></tr>
    ${data.housingAllowance > 0 ? `<tr><td>Housing Allowance</td><td>${fmt(data.housingAllowance)}</td></tr>` : ""}
    ${data.transportAllowance > 0 ? `<tr><td>Transport Allowance</td><td>${fmt(data.transportAllowance)}</td></tr>` : ""}
    ${data.otherAllowances > 0 ? `<tr><td>Other Allowances</td><td>${fmt(data.otherAllowances)}</td></tr>` : ""}
    <tr class="total-row"><td>Total Monthly Package</td><td>${fmt(data.totalPackage)}</td></tr>
  </table>
</div>
${data.additionalTerms ? `<div class="section"><h2>Additional Terms</h2><p>${data.additionalTerms.replace(/\n/g, "<br>")}</p></div>` : ""}
<div class="section">
  <p>This offer is contingent upon successful completion of background verification and submission of required documents. Please sign and return this letter within <strong>7 business days</strong> to confirm your acceptance.</p>
</div>
<div class="footer">
  <div class="sig-block"><div class="sig-line"></div><p>Authorized Signatory<br><small>SmartPRO Business Services Hub</small></p></div>
  <div class="sig-block"><div class="sig-line"></div><p>Candidate Signature<br><small>${data.applicantName}</small></p></div>
</div>
</body></html>`;
}
