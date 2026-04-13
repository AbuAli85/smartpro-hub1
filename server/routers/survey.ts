import { z } from "zod";
import { eq, and, desc, sql, isNotNull, asc } from "drizzle-orm";
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
  surveySanadOfficeOutreach,
  users,
  sanadOffices,
  sanadIntelCenters,
  sanadIntelCenterOperations,
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
import {
  sendSurveyResumeEmail,
  sendSurveyCompletionInviteEmail,
  sendSanadOfficeSurveyBridgeEmail,
} from "../email";
import type { Request } from "express";
import { resolvePublicAppBaseUrl } from "../_core/publicAppUrl";
import {
  isSurveyOfficeWhatsAppTemplateConfigured,
  sendSurveyOfficeInviteTemplateAr,
} from "../whatsappCloud";
import { toWhatsAppPhoneDigits } from "@shared/whatsappPhoneDigits";
import crypto from "crypto";
import { assertSanadOfficeAccess } from "../sanadAccess";

/** Canonical links for emails / outreach: `PUBLIC_APP_URL` first, else infer from the HTTP request (local dev). */
function resolveSanadSurveyBaseUrl(req?: Pick<Request, "get">): string {
  const fromEnv = (process.env.PUBLIC_APP_URL ?? "").replace(/\/+$/, "").trim();
  if (fromEnv) return fromEnv;
  return resolvePublicAppBaseUrl(req).replace(/\/+$/, "").trim();
}

async function userExistsWithEmail(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  email: string,
): Promise<boolean> {
  const n = email.trim().toLowerCase();
  if (!n) return false;
  const [r] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.email), sql`LOWER(TRIM(${users.email})) = ${n}`))
    .limit(1);
  return !!r;
}

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

  startResponse: publicProcedure.input(startResponseInput).mutation(async ({ input, ctx }) => {
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

    const emailFromSession = ctx.user?.email?.trim() || undefined;
    const respondentEmail = input.respondentEmail ?? emailFromSession ?? null;
    const userId = ctx.user?.id ?? null;

    let sanadOfficeId: number | null = null;
    if (input.sanadOfficeId != null) {
      if (!ctx.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Sign in with your SmartPRO account to link this survey to your Sanad office.",
        });
      }
      await assertSanadOfficeAccess(db as never, ctx.user.id, input.sanadOfficeId);
      sanadOfficeId = input.sanadOfficeId;
    }

    const [result] = await db.insert(surveyResponses).values({
      surveyId: input.surveyId,
      userId,
      sanadOfficeId,
      resumeToken,
      language: input.language,
      status: "in_progress",
      currentSectionId: sections[0]?.id ?? null,
      respondentName: input.respondentName ?? null,
      respondentEmail,
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

  completeResponse: publicProcedure.input(completeResponseInput).mutation(async ({ input, ctx }) => {
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
      if (Array.isArray(a.selectedOptions) && a.selectedOptions.length > 0) {
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

    // One-time thank-you + offer email when we can reach the respondent (logged-in user or email on file)
    const [surveyMeta] = await db
      .select({ titleEn: surveys.titleEn })
      .from(surveys)
      .where(eq(surveys.id, response.surveyId))
      .limit(1);

    let toEmail = (response.respondentEmail?.trim() ?? "") || "";

    if (!toEmail && response.userId) {
      const [urow] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, response.userId))
        .limit(1);
      toEmail = (urow?.email?.trim() ?? "") || "";
    }

    const emailMatchesExistingUser = toEmail.length > 0 ? await userExistsWithEmail(db, toEmail) : false;
    const isRegisteredUser = response.userId != null || emailMatchesExistingUser;

    const appBaseUrl = resolvePublicAppBaseUrl(ctx.req) || resolvePublicAppBaseUrl();
    if (
      toEmail.length > 0 &&
      !response.completionInviteEmailSentAt &&
      surveyMeta &&
      appBaseUrl.trim().length > 0
    ) {
      const inviteResult = await sendSurveyCompletionInviteEmail({
        to: toEmail,
        respondentName: response.respondentName?.trim() || undefined,
        surveyTitle: surveyMeta.titleEn,
        isRegisteredUser,
        appBaseUrl,
        resumeToken: !isRegisteredUser ? response.resumeToken : undefined,
      });
      if (inviteResult.success) {
        const now = new Date();
        const stopNurtureForExistingEmail =
          !response.userId && emailMatchesExistingUser;

        await db
          .update(surveyResponses)
          .set({
            completionInviteEmailSentAt: now,
            ...(stopNurtureForExistingEmail
              ? {
                  nurtureStoppedAt: now,
                  nurtureStoppedReason: "already_registered",
                }
              : {}),
          })
          .where(eq(surveyResponses.id, response.id));
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

      const joined = await db
        .select({
          response: surveyResponses,
          sanadOfficeName: sanadOffices.name,
        })
        .from(surveyResponses)
        .leftJoin(sanadOffices, eq(surveyResponses.sanadOfficeId, sanadOffices.id))
        .where(whereClause)
        .orderBy(desc(surveyResponses.startedAt))
        .limit(input.limit)
        .offset(offset);

      const rows = joined.map((j) => ({
        ...j.response,
        sanadOfficeName: j.sanadOfficeName ?? null,
      }));

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

      let sanadOffice: { id: number; name: string; nameAr: string | null } | null = null;
      if (response.sanadOfficeId) {
        const [o] = await db
          .select({
            id: sanadOffices.id,
            name: sanadOffices.name,
            nameAr: sanadOffices.nameAr,
          })
          .from(sanadOffices)
          .where(eq(sanadOffices.id, response.sanadOfficeId))
          .limit(1);
        sanadOffice = o ?? null;
      }

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
        sanadOffice,
        answers,
        sections,
        questions,
        options,
        tags: tags.map((t) => t.tag),
      };
    }),

  /**
   * All active Sanad offices with per-office survey URLs (for manual outreach when email is missing).
   */
  adminSanadOfficeSurveyLinks: surveyAdminProcedure
    .input(z.object({ surveySlug: z.string().min(1).max(100).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const slug = input?.surveySlug ?? "oman-business-sector-2026";
      const [survey] = await db.select().from(surveys).where(eq(surveys.slug, slug)).limit(1);
      if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });

      const baseUrl = resolveSanadSurveyBaseUrl(ctx.req);
      if (!baseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Could not build survey links. Set PUBLIC_APP_URL in production, or open the admin UI through the same host the API uses (e.g. localhost with matching port).",
        });
      }

      const offices = await db.select().from(sanadOffices).where(eq(sanadOffices.status, "active"));

      return {
        surveySlug: slug,
        surveyTitleEn: survey.titleEn,
        baseUrl,
        offices: offices.map((o) => ({
          id: o.id,
          name: o.name,
          nameAr: o.nameAr ?? null,
          phone: o.phone?.trim() || null,
          contactPerson: o.contactPerson?.trim() || null,
          email: o.email?.trim() || null,
          hasEmail: Boolean(o.email?.trim()),
          surveyUrl: `${baseUrl}/survey/${slug}?officeId=${o.id}`,
        })),
      };
    }),

  /**
   * Intel centre directory (`sanad_intel_centers`) with contact details; survey URL only when
   * `sanad_intel_center_operations.linked_sanad_office_id` points at an **active** platform office.
   */
  adminSanadIntelCenterSurveyLinks: surveyAdminProcedure
    .input(z.object({ surveySlug: z.string().min(1).max(100).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const slug = input?.surveySlug ?? "oman-business-sector-2026";
      const [survey] = await db.select().from(surveys).where(eq(surveys.slug, slug)).limit(1);
      if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });

      const baseUrl = resolveSanadSurveyBaseUrl(ctx.req);
      if (!baseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Could not build survey links. Set PUBLIC_APP_URL in production, or open the admin UI through the same host the API uses (e.g. localhost with matching port).",
        });
      }

      const joined = await db
        .select({
          center: sanadIntelCenters,
          linkedSanadOfficeId: sanadIntelCenterOperations.linkedSanadOfficeId,
          officeStatus: sanadOffices.status,
        })
        .from(sanadIntelCenters)
        .leftJoin(
          sanadIntelCenterOperations,
          eq(sanadIntelCenterOperations.centerId, sanadIntelCenters.id),
        )
        .leftJoin(sanadOffices, eq(sanadOffices.id, sanadIntelCenterOperations.linkedSanadOfficeId))
        .orderBy(asc(sanadIntelCenters.centerName));

      const rows = joined.map(({ center, linkedSanadOfficeId, officeStatus }) => {
        const linkedId = linkedSanadOfficeId ?? null;
        const active = officeStatus === "active";
        let surveyUrl: string | null = null;
        let surveyUnavailableReason: "not_linked" | "office_inactive" | null = null;
        if (linkedId != null && active) {
          surveyUrl = `${baseUrl}/survey/${slug}?officeId=${linkedId}`;
        } else if (linkedId == null) {
          surveyUnavailableReason = "not_linked";
        } else {
          surveyUnavailableReason = "office_inactive";
        }
        return {
          intelCenterId: center.id,
          centerName: center.centerName,
          responsiblePerson: center.responsiblePerson?.trim() || null,
          contactNumber: center.contactNumber?.trim() || null,
          governorateLabel: center.governorateLabelRaw,
          wilayat: center.wilayat?.trim() || null,
          linkedSanadOfficeId: linkedId,
          surveyUrl,
          surveyUnavailableReason,
        };
      });

      return {
        surveySlug: slug,
        surveyTitleEn: survey.titleEn,
        baseUrl,
        rows,
      };
    }),

  /**
   * Per-office follow-up: last bulk invite log (email / WhatsApp API) + latest survey response
   * for this survey when `sanad_office_id` is set (signed-in office-linked starts).
   */
  adminSanadSurveyOfficeFollowUp: surveyAdminProcedure
    .input(z.object({ surveySlug: z.string().min(1).max(100).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const slug = input?.surveySlug ?? "oman-business-sector-2026";
      const [survey] = await db.select().from(surveys).where(eq(surveys.slug, slug)).limit(1);
      if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });

      const baseUrl = resolveSanadSurveyBaseUrl(ctx.req);
      if (!baseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Could not build survey links. Set PUBLIC_APP_URL in production, or open the admin UI through the same host the API uses (e.g. localhost with matching port).",
        });
      }

      const offices = await db
        .select()
        .from(sanadOffices)
        .where(eq(sanadOffices.status, "active"))
        .orderBy(asc(sanadOffices.name));

      const outreachRows = await db
        .select()
        .from(surveySanadOfficeOutreach)
        .where(eq(surveySanadOfficeOutreach.surveyId, survey.id))
        .orderBy(desc(surveySanadOfficeOutreach.createdAt));

      const latestOutreachByOffice = new Map<
        number,
        {
          batchId: string;
          channel: string;
          outcome: string;
          detail: string | null;
          createdAt: Date;
        }
      >();
      for (const r of outreachRows) {
        if (!latestOutreachByOffice.has(r.sanadOfficeId)) {
          latestOutreachByOffice.set(r.sanadOfficeId, {
            batchId: r.batchId,
            channel: r.channel,
            outcome: r.outcome,
            detail: r.detail ?? null,
            createdAt: r.createdAt,
          });
        }
      }

      const responseRows = await db
        .select({
          id: surveyResponses.id,
          sanadOfficeId: surveyResponses.sanadOfficeId,
          status: surveyResponses.status,
          startedAt: surveyResponses.startedAt,
          completedAt: surveyResponses.completedAt,
        })
        .from(surveyResponses)
        .where(and(eq(surveyResponses.surveyId, survey.id), isNotNull(surveyResponses.sanadOfficeId)))
        .orderBy(desc(surveyResponses.startedAt));

      const latestResponseByOffice = new Map<
        number,
        { id: number; status: string; startedAt: Date; completedAt: Date | null }
      >();
      for (const r of responseRows) {
        if (r.sanadOfficeId != null && !latestResponseByOffice.has(r.sanadOfficeId)) {
          latestResponseByOffice.set(r.sanadOfficeId, {
            id: r.id,
            status: r.status,
            startedAt: r.startedAt,
            completedAt: r.completedAt ?? null,
          });
        }
      }

      return {
        surveySlug: slug,
        surveyTitleEn: survey.titleEn,
        baseUrl,
        offices: offices.map((o) => ({
          officeId: o.id,
          name: o.name,
          nameAr: o.nameAr ?? null,
          email: o.email?.trim() || null,
          phone: o.phone?.trim() || null,
          contactPerson: o.contactPerson?.trim() || null,
          surveyUrl: `${baseUrl}/survey/${slug}?officeId=${o.id}`,
          lastOutreach: latestOutreachByOffice.get(o.id) ?? null,
          linkedResponse: latestResponseByOffice.get(o.id) ?? null,
        })),
      };
    }),

  /** Email active Sanad offices that have an email; return copyable links for offices without email. */
  adminInviteSanadOffices: surveyAdminProcedure
    .input(z.object({ surveySlug: z.string().min(1).max(100).optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const slug = input?.surveySlug ?? "oman-business-sector-2026";
      const [survey] = await db.select().from(surveys).where(eq(surveys.slug, slug)).limit(1);
      if (!survey) throw new TRPCError({ code: "NOT_FOUND", message: "Survey not found" });

      const offices = await db.select().from(sanadOffices).where(eq(sanadOffices.status, "active"));

      const baseUrl = resolveSanadSurveyBaseUrl(ctx.req);
      if (!baseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Could not build survey links for emails. Set PUBLIC_APP_URL in production, or open the admin UI through the same host the API uses (e.g. localhost with matching port).",
        });
      }

      const manualOutreach: Array<{
        id: number;
        name: string;
        nameAr: string | null;
        phone: string | null;
        contactPerson: string | null;
        surveyUrl: string;
      }> = [];

      let sent = 0;
      let failed = 0;
      const waEnabled = isSurveyOfficeWhatsAppTemplateConfigured();
      let whatsappSent = 0;
      let whatsappFailed = 0;
      let whatsappSkippedNoPhone = 0;

      const batchId = crypto.randomUUID();
      const actorUserId = ctx.user.id;

      const logOutreach = async (p: {
        sanadOfficeId: number;
        channel: "email" | "whatsapp_api";
        outcome: "sent" | "failed" | "skipped_no_email" | "skipped_no_phone";
        detail?: string | null;
      }) => {
        try {
          await db.insert(surveySanadOfficeOutreach).values({
            surveyId: survey.id,
            sanadOfficeId: p.sanadOfficeId,
            batchId,
            channel: p.channel,
            outcome: p.outcome,
            detail: p.detail ? p.detail.slice(0, 500) : null,
            actorUserId,
          });
        } catch (err) {
          console.error("[survey] survey_sanad_office_outreach insert failed:", err);
        }
      };

      for (const o of offices) {
        const surveyUrl = `${baseUrl}/survey/${slug}?officeId=${o.id}`;

        if (waEnabled) {
          const digits = toWhatsAppPhoneDigits(o.phone);
          const officeLabelAr = (o.nameAr?.trim() || o.name).trim() || "مكتب";
          if (!digits) {
            whatsappSkippedNoPhone++;
            await logOutreach({
              sanadOfficeId: o.id,
              channel: "whatsapp_api",
              outcome: "skipped_no_phone",
            });
          } else {
            const waResult = await sendSurveyOfficeInviteTemplateAr({
              toDigits: digits,
              officeLabelAr,
              surveyUrl,
            });
            if (waResult.ok) {
              whatsappSent++;
              await logOutreach({ sanadOfficeId: o.id, channel: "whatsapp_api", outcome: "sent" });
            } else {
              whatsappFailed++;
              await logOutreach({
                sanadOfficeId: o.id,
                channel: "whatsapp_api",
                outcome: "failed",
                detail: !waResult.ok ? waResult.error : null,
              });
            }
          }
        }

        const email = o.email?.trim();
        if (!email) {
          manualOutreach.push({
            id: o.id,
            name: o.name,
            nameAr: o.nameAr ?? null,
            phone: o.phone?.trim() || null,
            contactPerson: o.contactPerson?.trim() || null,
            surveyUrl,
          });
          await logOutreach({ sanadOfficeId: o.id, channel: "email", outcome: "skipped_no_email" });
          continue;
        }
        const result = await sendSanadOfficeSurveyBridgeEmail({
          to: email,
          officeName: o.name,
          officeNameAr: o.nameAr ?? undefined,
          surveyUrl,
          contactPerson: o.contactPerson?.trim() || undefined,
        });
        if (result.success) {
          sent++;
          await logOutreach({ sanadOfficeId: o.id, channel: "email", outcome: "sent" });
        } else {
          failed++;
          await logOutreach({
            sanadOfficeId: o.id,
            channel: "email",
            outcome: "failed",
            detail: result.error ?? null,
          });
        }
      }

      const withEmailCount = offices.length - manualOutreach.length;

      return {
        sent,
        failed,
        totalActiveOffices: offices.length,
        withEmailCount,
        skippedNoEmail: manualOutreach.length,
        manualOutreach,
        whatsappAutoAttempted: waEnabled,
        whatsappSent,
        whatsappFailed,
        whatsappSkippedNoPhone,
        outreachBatchId: batchId,
      };
    }),

  adminGetAnalytics: surveyAdminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    // Self-heal: backfill completed responses that have null company fields
    const stale = await db
      .select({ id: surveyResponses.id, surveyId: surveyResponses.surveyId })
      .from(surveyResponses)
      .where(
        and(
          eq(surveyResponses.status, "completed"),
          sql`${surveyResponses.companySector} IS NULL`,
        ),
      );

    if (stale.length > 0) {
      const surveyId = stale[0].surveyId;
      const secs = await db.select().from(surveySections).where(eq(surveySections.surveyId, surveyId));
      const secIds = secs.map((s) => s.id);

      if (secIds.length > 0) {
        const qs = await db
          .select()
          .from(surveyQuestions)
          .where(sql`${surveyQuestions.sectionId} IN (${sql.join(secIds.map((id) => sql`${id}`), sql`, `)})`);
        const qIds = qs.map((q) => q.id);
        const opts =
          qIds.length > 0
            ? await db
                .select()
                .from(surveyOptions)
                .where(sql`${surveyOptions.questionId} IN (${sql.join(qIds.map((id) => sql`${id}`), sql`, `)})`)
            : [];

        const qByKey = new Map(qs.map((q) => [q.questionKey, q]));
        const optById = new Map(opts.map((o) => [o.id, o]));

        for (const resp of stale) {
          const ans = await db.select().from(surveyAnswers).where(eq(surveyAnswers.responseId, resp.id));
          const aMap = new Map(ans.map((a) => [a.questionId, a]));

          const resolve = (key: string): string | null => {
            const q = qByKey.get(key);
            if (!q) return null;
            const a = aMap.get(q.id);
            if (!a) return null;
            if (Array.isArray(a.selectedOptions) && a.selectedOptions.length > 0) {
              const opt = optById.get(a.selectedOptions[0]);
              if (opt) return opt.labelEn;
            }
            return a.answerValue?.trim() || null;
          };

          const sector = resolve("cp_sector");
          const size = resolve("cp_size");
          const gov = resolve("cp_governorate");
          const name = resolve("cp_company_name");

          if (sector || size || gov || name) {
            await db
              .update(surveyResponses)
              .set({
                ...(sector ? { companySector: sector } : {}),
                ...(size ? { companySize: size } : {}),
                ...(gov ? { companyGovernorate: gov } : {}),
                ...(name ? { companyName: name } : {}),
              })
              .where(eq(surveyResponses.id, resp.id));
          }
        }
      }
    }

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

      await db
        .update(surveyResponses)
        .set({ respondentEmail: input.email })
        .where(eq(surveyResponses.id, response.id));

      return { sent: true };
    }),

  /** Stop nurture reminder emails (same effect as GET /api/survey/nurture/unsubscribe). */
  optOutNurtureEmails: publicProcedure
    .input(z.object({ resumeToken: z.string().min(1).max(64) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [row] = await db
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(eq(surveyResponses.resumeToken, input.resumeToken))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Survey response not found." });
      }

      await db
        .update(surveyResponses)
        .set({
          nurtureStoppedAt: new Date(),
          nurtureStoppedReason: "unsubscribed",
        })
        .where(eq(surveyResponses.id, row.id));

      return { ok: true as const };
    }),
});
