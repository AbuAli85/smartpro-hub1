/**
 * Replaces `survey_options` rows for question `cp_sector` on the Oman Business Sector
 * survey with the current list from `oman-survey-sector-options.ts`.
 *
 * The public survey UI reads options from the database — editing the seed file alone
 * does not change an already-seeded database. Run this after updating sector options.
 *
 *   npx tsx scripts/sync-oman-survey-sector-options.ts
 *
 * Requires DATABASE_URL (same as the main app).
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import { surveys, surveySections, surveyQuestions, surveyOptions } from "../drizzle/schema";
import { CP_SECTOR_OPTIONS } from "./oman-survey-sector-options";

const SURVEY_SLUG = "oman-business-sector-2026";
const QUESTION_KEY = "cp_sector";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const db = drizzle(url);

  const [row] = await db
    .select({ id: surveyQuestions.id })
    .from(surveyQuestions)
    .innerJoin(surveySections, eq(surveyQuestions.sectionId, surveySections.id))
    .innerJoin(surveys, eq(surveySections.surveyId, surveys.id))
    .where(and(eq(surveys.slug, SURVEY_SLUG), eq(surveyQuestions.questionKey, QUESTION_KEY)))
    .limit(1);

  if (!row) {
    console.error(
      `[sync] No question "${QUESTION_KEY}" found for survey "${SURVEY_SLUG}". Run seed-oman-survey.ts first.`,
    );
    process.exit(1);
  }

  const questionId = row.id;
  console.log(`[sync] Updating sector options for question id=${questionId}...`);

  await db.delete(surveyOptions).where(eq(surveyOptions.questionId, questionId));

  for (let oi = 0; oi < CP_SECTOR_OPTIONS.length; oi++) {
    const opt = CP_SECTOR_OPTIONS[oi];
    await db.insert(surveyOptions).values({
      questionId,
      value: opt.value,
      labelEn: opt.labelEn,
      labelAr: opt.labelAr,
      score: opt.score,
      sortOrder: oi,
      tags: opt.tags ?? null,
    });
  }

  console.log(`[sync] Inserted ${CP_SECTOR_OPTIONS.length} sector options.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[sync] Error:", err);
  process.exit(1);
});
