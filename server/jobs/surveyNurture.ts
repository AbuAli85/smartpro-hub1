/**
 * Scheduled job: send follow-up emails to completed anonymous survey respondents
 * until they register (matching email in `users`) or max follow-ups / unsubscribe.
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { surveyResponses, surveys, users } from "../../drizzle/schema";
import { sendSurveyNurtureFollowupEmail } from "../email";
import { resolvePublicAppBaseUrl } from "../_core/publicAppUrl";

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Days between nurture emails (after the completion email). */
export function getSurveyNurtureGapDays(): number {
  return parsePositiveInt(process.env.SURVEY_NURTURE_GAP_DAYS, 7);
}

/** Max follow-up emails after the initial completion email. */
export function getSurveyNurtureMaxFollowups(): number {
  return parsePositiveInt(process.env.SURVEY_NURTURE_MAX_FOLLOWUPS, 8);
}

async function hasUserWithEmail(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.email), sql`LOWER(TRIM(${users.email})) = ${normalized}`))
    .limit(1);
  return !!row;
}

export async function runSurveyNurtureEmails(): Promise<{
  scanned: number;
  sent: number;
  stoppedConverted: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) return { scanned: 0, sent: 0, stoppedConverted: 0, errors: 0 };

  const gapDays = getSurveyNurtureGapDays();
  const maxFollowups = getSurveyNurtureMaxFollowups();
  const baseUrl = resolvePublicAppBaseUrl();

  const candidates = await db
    .select()
    .from(surveyResponses)
    .where(
      and(
        eq(surveyResponses.status, "completed"),
        isNull(surveyResponses.userId),
        isNotNull(surveyResponses.respondentEmail),
        isNotNull(surveyResponses.completionInviteEmailSentAt),
        isNull(surveyResponses.nurtureStoppedAt),
        sql`${surveyResponses.nurtureFollowupCount} < ${maxFollowups}`,
        sql`COALESCE(${surveyResponses.nurtureLastSentAt}, ${surveyResponses.completionInviteEmailSentAt}) <= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(gapDays))} DAY)`,
      ),
    )
    .limit(100);

  let sent = 0;
  let stoppedConverted = 0;
  let errors = 0;

  for (const row of candidates) {
    const email = row.respondentEmail?.trim() ?? "";
    if (!email) continue;

    try {
      if (await hasUserWithEmail(db, email)) {
        await db
          .update(surveyResponses)
          .set({
            nurtureStoppedAt: new Date(),
            nurtureStoppedReason: "converted",
          })
          .where(eq(surveyResponses.id, row.id));
        stoppedConverted++;
        continue;
      }

      const [surveyMeta] = await db
        .select({ titleEn: surveys.titleEn })
        .from(surveys)
        .where(eq(surveys.id, row.surveyId))
        .limit(1);
      if (!surveyMeta) continue;

      const prevCount = Number(row.nurtureFollowupCount ?? 0);
      const nextCount = prevCount + 1;
      const result = await sendSurveyNurtureFollowupEmail({
        to: email,
        respondentName: row.respondentName?.trim() || undefined,
        surveyTitle: surveyMeta.titleEn,
        followUpIndex: nextCount,
        resumeToken: row.resumeToken,
        appBaseUrl: baseUrl || "https://thesmartpro.io",
      });

      if (!result.success) {
        errors++;
        continue;
      }

      const now = new Date();
      const hitMax = nextCount >= maxFollowups;

      await db
        .update(surveyResponses)
        .set({
          nurtureFollowupCount: nextCount,
          nurtureLastSentAt: now,
          ...(hitMax
            ? {
                nurtureStoppedAt: now,
                nurtureStoppedReason: "max_reached" as const,
              }
            : {}),
        })
        .where(eq(surveyResponses.id, row.id));

      sent++;
    } catch (e) {
      console.error("[survey-nurture] row error:", row.id, e);
      errors++;
    }
  }

  return {
    scanned: candidates.length,
    sent,
    stoppedConverted,
    errors,
  };
}
