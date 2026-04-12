import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router, t } from "../_core/trpc";
import { NOT_ADMIN_ERR_MSG } from "@shared/const";
import { canAccessSurveyAdmin } from "@shared/rbac";
import { getDb } from "../db";
import {
  surveys,
  surveySections,
  surveyQuestions,
  surveyOptions,
  surveyResponses,
  surveyAnswers,
  surveyTags,
  surveyResponseTags,
} from "../../drizzle/schema";
import {
  getBySlugInput,
  startResponseInput,
  resumeResponseInput,
  submitSectionInput,
  completeResponseInput,
  listResponsesInput,
  getResponseDetailInput,
} from "../modules/survey/types";
import { computeSurveyScores, collectResponseTags } from "../modules/survey/scoring";
import { sendSurveyResumeEmail } from "../email";
import { resolvePublicAppBaseUrl } from "../_core/publicAppUrl";
import crypto from "crypto";

const surveyAdminProcedure = protectedProcedure.use(
  t.middleware(({ ctx, next }) => {
    if (!ctx.user || !canAccessSurveyAdmin(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const surveyRouter = router({
  // ─── Public Procedures ────────────────────────────────────────────────────

  getBySlug: publicProcedure.input(getBySlugInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [survey] = await db
      .select()
      .from(surveys)
      .where(and(eq(surveys.slug, input.slug), eq(surveys.status, "active")))
      .limit(1);

    if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });

    const sections = await db
      .select()
      .from(surveySections)
      .where(eq(surveySections.surveyId, survey.id))
      .orderBy(surveySections.sortOrder);

    const sectionIds = sections.map((s) => s.id);
    let questions: (typeof surveyQuestions.$inferSelect)[] = [];
    let options: (typeof surveyOptions.$inferSelect)[] = [];

    if (sectionIds.length > 0) {
      questions = await db
        .select()
        .from(surveyQuestions)
        .where(sql`${surveyQuestions.sectionId} IN (${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)})`)
        .orderBy(surveyQuestions.sortOrder);

      const questionIds = questions.map((q) => q.id);
      if (questionIds.length > 0) {
        options = await db
          .select()
          .from(surveyOptions)
          .where(sql`${surveyOptions.questionId} IN (${sql.join(questionIds.map(id => sql`${id}`), sql`, `)})`)
          .orderBy(surveyOptions.sortOrder);
      }
    }

    return { survey, sections, questions, options };
  }),

  startResponse: publicProcedure.input(startResponseInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [survey] = await db
      .select()
      .from(surveys)
      .where(and(eq(surveys.id, input.surveyId), eq(surveys.status, "active")))
      .limit(1);

    if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found or not active" });

    const resumeToken = crypto.randomBytes(24).toString("hex");

    const sections = await db
      .select()
      .from(surveySections)
      .where(eq(surveySections.surveyId, survey.id))
      .orderBy(surveySections.sortOrder)
      .limit(1);

    const [result] = await db.insert(surveyResponses).values({
      surveyId: input.surveyId,
      resumeToken,
      language: input.language,
      status: "in_progress",
      currentSectionId: sections[0]?.id ?? null,
      respondentName: input.respondentName ?? null,
      respondentEmail: input.respondentEmail ?? null,
      respondentPhone: input.respondentPhone ?? null,
    });

    const responseId = Number((result as any).insertId);

    return { responseId, resumeToken };
  }),

  resumeResponse: publicProcedure.input(resumeResponseInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [response] = await db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.resumeToken, input.resumeToken))
      .limit(1);

    if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });

    const existingAnswers = await db
      .select()
      .from(surveyAnswers)
      .where(eq(surveyAnswers.responseId, response.id));

    return { response, existingAnswers };
  }),

  submitSection: publicProcedure.input(submitSectionInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [response] = await db
      .select()
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.id, input.responseId),
          eq(surveyResponses.resumeToken, input.resumeToken),
        ),
      )
      .limit(1);

    if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });
    if (response.status === "completed") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Response already completed" });
    }

    for (const answer of input.answers) {
      await db
        .insert(surveyAnswers)
        .values({
          responseId: input.responseId,
          questionId: answer.questionId,
          answerValue: answer.answerValue ?? null,
          selectedOptions: answer.selectedOptions ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            answerValue: answer.answerValue ?? null,
            selectedOptions: answer.selectedOptions ?? null,
          },
        });
    }

    const sections = await db
      .select()
      .from(surveySections)
      .where(eq(surveySections.surveyId, response.surveyId))
      .orderBy(surveySections.sortOrder);

    const currentIdx = sections.findIndex((s) => s.id === input.sectionId);
    const nextSection = sections[currentIdx + 1] ?? null;

    await db
      .update(surveyResponses)
      .set({ currentSectionId: nextSection?.id ?? input.sectionId })
      .where(eq(surveyResponses.id, input.responseId));

    return {
      nextSectionId: nextSection?.id ?? null,
      isLastSection: nextSection === null,
    };
  }),

  completeResponse: publicProcedure.input(completeResponseInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [response] = await db
      .select()
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.id, input.responseId),
          eq(surveyResponses.resumeToken, input.resumeToken),
        ),
      )
      .limit(1);

    if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });

    const answers = await db
      .select()
      .from(surveyAnswers)
      .where(eq(surveyAnswers.responseId, response.id));

    const sections = await db
      .select()
      .from(surveySections)
      .where(eq(surveySections.surveyId, response.surveyId));

    const sectionIds = sections.map((s) => s.id);
    let allQuestions: (typeof surveyQuestions.$inferSelect)[] = [];
    let allOptions: (typeof surveyOptions.$inferSelect)[] = [];

    if (sectionIds.length > 0) {
      allQuestions = await db
        .select()
        .from(surveyQuestions)
        .where(sql`${surveyQuestions.sectionId} IN (${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)})`);

      const qIds = allQuestions.map((q) => q.id);
      if (qIds.length > 0) {
        allOptions = await db
          .select()
          .from(surveyOptions)
          .where(sql`${surveyOptions.questionId} IN (${sql.join(qIds.map(id => sql`${id}`), sql`, `)})`);
      }
    }

    const scores = computeSurveyScores(
      answers.map((a) => ({
        questionId: a.questionId,
        answerValue: a.answerValue,
        selectedOptions: a.selectedOptions,
      })),
      allQuestions.map((q) => ({
        id: q.id,
        scoringRule: q.scoringRule,
      })),
      allOptions.map((o) => ({
        id: o.id,
        questionId: o.questionId,
        value: o.value,
        score: o.score,
        tags: o.tags,
      })),
    );

    const tagSlugs = collectResponseTags(
      answers.map((a) => ({
        questionId: a.questionId,
        answerValue: a.answerValue,
        selectedOptions: a.selectedOptions,
      })),
      allOptions.map((o) => ({
        id: o.id,
        questionId: o.questionId,
        value: o.value,
        score: o.score,
        tags: o.tags,
      })),
    );

    const qByKey = new Map(allQuestions.map((q) => [q.questionKey, q]));
    const answerMap = new Map(answers.map((a) => [a.questionId, a]));
    const optMap = new Map(allOptions.map((o) => [o.id, o]));

    function resolveField(key: string): string | null {
      const q = qByKey.get(key);
      if (!q) return null;
      const a = answerMap.get(q.id);
      if (!a) return null;
      if (a.selectedOptions?.length) {
        const opt = optMap.get(a.selectedOptions[0]);
        if (opt) return opt.labelEn;
      }
      return a.answerValue?.trim() || null;
    }

    await db
      .update(surveyResponses)
      .set({
        status: "completed",
        completedAt: new Date(),
        scores,
        companyName: input.companyName ?? resolveField("cp_company_name") ?? response.companyName,
        companySector: input.companySector ?? resolveField("cp_sector") ?? response.companySector,
        companySize: input.companySize ?? resolveField("cp_size") ?? response.companySize,
        companyGovernorate: input.companyGovernorate ?? resolveField("cp_governorate") ?? response.companyGovernorate,
      })
      .where(eq(surveyResponses.id, response.id));

    if (tagSlugs.length > 0) {
      const allTags = await db.select().from(surveyTags);
      const tagMap = new Map(allTags.map((t) => [t.slug, t.id]));

      for (const slug of tagSlugs) {
        const tagId = tagMap.get(slug);
        if (tagId) {
          await db
            .insert(surveyResponseTags)
            .values({ responseId: response.id, tagId })
            .onDuplicateKeyUpdate({ set: { tagId } });
        }
      }
    }

    return { scores };
  }),

  // ─── Admin Procedures ─────────────────────────────────────────────────────

  adminListResponses: surveyAdminProcedure
    .input(listResponsesInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const conditions: ReturnType<typeof eq>[] = [];
      if (input.status) conditions.push(eq(surveyResponses.status, input.status));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(surveyResponses)
        .where(whereClause);

      const total = countResult?.count ?? 0;
      const offset = (input.page - 1) * input.limit;

      const rows = await db
        .select()
        .from(surveyResponses)
        .where(whereClause)
        .orderBy(desc(surveyResponses.startedAt))
        .limit(input.limit)
        .offset(offset);

      return { rows, total, page: input.page, limit: input.limit };
    }),

  adminGetResponseDetail: surveyAdminProcedure
    .input(getResponseDetailInput)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [response] = await db
        .select()
        .from(surveyResponses)
        .where(eq(surveyResponses.id, input.responseId))
        .limit(1);

      if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "Response not found" });

      const answers = await db
        .select()
        .from(surveyAnswers)
        .where(eq(surveyAnswers.responseId, response.id));

      const sections = await db
        .select()
        .from(surveySections)
        .where(eq(surveySections.surveyId, response.surveyId))
        .orderBy(surveySections.sortOrder);

      const sectionIds = sections.map((s) => s.id);
      let questions: (typeof surveyQuestions.$inferSelect)[] = [];
      let options: (typeof surveyOptions.$inferSelect)[] = [];

      if (sectionIds.length > 0) {
        questions = await db
          .select()
          .from(surveyQuestions)
          .where(sql`${surveyQuestions.sectionId} IN (${sql.join(sectionIds.map(id => sql`${id}`), sql`, `)})`)
          .orderBy(surveyQuestions.sortOrder);

        const qIds = questions.map((q) => q.id);
        if (qIds.length > 0) {
          options = await db
            .select()
            .from(surveyOptions)
            .where(sql`${surveyOptions.questionId} IN (${sql.join(qIds.map(id => sql`${id}`), sql`, `)})`);
        }
      }

      const tags = await db
        .select({ tag: surveyTags })
        .from(surveyResponseTags)
        .innerJoin(surveyTags, eq(surveyTags.id, surveyResponseTags.tagId))
        .where(eq(surveyResponseTags.responseId, response.id));

      return {
        response,
        answers,
        sections,
        questions,
        options,
        tags: tags.map((t) => t.tag),
      };
    }),

  adminGetAnalytics: surveyAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const [totalResp] = await db
      .select({ count: sql<number>`count(*)` })
      .from(surveyResponses);

    const [completedResp] = await db
      .select({ count: sql<number>`count(*)` })
      .from(surveyResponses)
      .where(eq(surveyResponses.status, "completed"));

    const [inProgressResp] = await db
      .select({ count: sql<number>`count(*)` })
      .from(surveyResponses)
      .where(eq(surveyResponses.status, "in_progress"));

    const completedRows = await db
      .select({ scores: surveyResponses.scores })
      .from(surveyResponses)
      .where(eq(surveyResponses.status, "completed"));

    const avgScores: Record<string, number> = {};
    if (completedRows.length > 0) {
      const scoreKeys = ["smartpro_fit", "digital_maturity", "compliance_burden", "staffing_pressure", "adoption_readiness"];
      for (const key of scoreKeys) {
        const sum = completedRows.reduce((acc, r) => {
          const s = (r.scores as Record<string, number> | null)?.[key] ?? 0;
          return acc + s;
        }, 0);
        avgScores[key] = Math.round(sum / completedRows.length);
      }
    }

    const sectorBreakdown = await db
      .select({
        sector: surveyResponses.companySector,
        count: sql<number>`count(*)`,
      })
      .from(surveyResponses)
      .where(eq(surveyResponses.status, "completed"))
      .groupBy(surveyResponses.companySector);

    const sizeBreakdown = await db
      .select({
        size: surveyResponses.companySize,
        count: sql<number>`count(*)`,
      })
      .from(surveyResponses)
      .where(eq(surveyResponses.status, "completed"))
      .groupBy(surveyResponses.companySize);

    const governorateBreakdown = await db
      .select({
        governorate: surveyResponses.companyGovernorate,
        count: sql<number>`count(*)`,
      })
      .from(surveyResponses)
      .where(eq(surveyResponses.status, "completed"))
      .groupBy(surveyResponses.companyGovernorate);

    const topTags = await db
      .select({
        tagSlug: surveyTags.slug,
        tagLabel: surveyTags.labelEn,
        count: sql<number>`count(*)`,
      })
      .from(surveyResponseTags)
      .innerJoin(surveyTags, eq(surveyTags.id, surveyResponseTags.tagId))
      .groupBy(surveyTags.slug, surveyTags.labelEn)
      .orderBy(desc(sql`count(*)`))
      .limit(15);

    return {
      totalResponses: totalResp?.count ?? 0,
      completedResponses: completedResp?.count ?? 0,
      inProgressResponses: inProgressResp?.count ?? 0,
      completionRate:
        (totalResp?.count ?? 0) > 0
          ? Math.round(((completedResp?.count ?? 0) / (totalResp?.count ?? 1)) * 100)
          : 0,
      avgScores,
      sectorBreakdown: sectorBreakdown.filter((s) => s.sector),
      sizeBreakdown: sizeBreakdown.filter((s) => s.size),
      governorateBreakdown: governorateBreakdown.filter((s) => s.governorate),
      topTags,
    };
  }),

  // ── Send resume link via email ─────────────────────────────────────────────
  sendResumeEmail: publicProcedure
    .input(
      z.object({
        resumeToken: z.string().min(1),
        email: z.string().email(),
        origin: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Look up the response by token
      const [response] = await db
        .select()
        .from(surveyResponses)
        .where(eq(surveyResponses.resumeToken, input.resumeToken))
        .limit(1);
      if (!response) throw new TRPCError({ code: "NOT_FOUND", message: "Response not found. Please check your resume token." });
      if (response.status === "completed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This survey response is already completed." });
      }

      // Get survey info
      const [survey] = await db
        .select()
        .from(surveys)
        .where(eq(surveys.id, response.surveyId))
        .limit(1);
      if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });

      // Count sections for progress display
      const sections = await db
        .select({ id: surveySections.id })
        .from(surveySections)
        .where(eq(surveySections.surveyId, survey.id))
        .orderBy(surveySections.sortOrder);
      const totalSections = sections.length;

      // Estimate completed sections based on currentSectionId
      const currentIdx = response.currentSectionId
        ? sections.findIndex((s) => s.id === response.currentSectionId)
        : 0;
      const sectionsCompleted = Math.max(0, currentIdx);

      // Build resume URL
      const baseUrl = input.origin ?? resolvePublicAppBaseUrl();
      const resumeUrl = `${baseUrl}/survey/${survey.slug}?resume=${input.resumeToken}`;

      const result = await sendSurveyResumeEmail({
        to: input.email,
        respondentName: response.respondentName ?? undefined,
        surveyTitle: survey.titleEn,
        resumeUrl,
        resumeToken: input.resumeToken,
        sectionsCompleted,
        totalSections,
      });

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to send email. Please try again.",
        });
      }

      return { sent: true };
    }),
});
