import { z } from "zod";

// ─── tRPC Input Schemas ───────────────────────────────────────────────────────

export const getBySlugInput = z.object({
  slug: z.string().min(1).max(100),
});

export const startResponseInput = z.object({
  surveyId: z.number().int().positive(),
  language: z.enum(["en", "ar"]).default("en"),
  respondentName: z.string().max(255).optional(),
  respondentEmail: z.string().max(320).optional().transform((v) => {
    const trimmed = v?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }),
  respondentPhone: z.string().max(32).optional(),
  /** Requires a logged-in user who is a member of this Sanad office (same platform login). */
  sanadOfficeId: z.number().int().positive().optional(),
});

export const resumeResponseInput = z.object({
  resumeToken: z.string().min(1).max(64),
});

export const submitSectionInput = z.object({
  responseId: z.number().int().positive(),
  resumeToken: z.string().min(1).max(64),
  sectionId: z.number().int().positive(),
  answers: z.array(
    z.object({
      questionId: z.number().int().positive(),
      answerValue: z.string().nullable().optional(),
      selectedOptions: z.array(z.number().int()).nullable().optional(),
    }),
  ),
});

export const completeResponseInput = z.object({
  responseId: z.number().int().positive(),
  resumeToken: z.string().min(1).max(64),
  companyName: z.string().max(255).optional(),
  companySector: z.string().max(128).optional(),
  companySize: z.string().max(64).optional(),
  companyGovernorate: z.string().max(128).optional(),
});

export const listResponsesInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  status: z.enum(["in_progress", "completed", "abandoned"]).optional(),
  search: z.string().max(255).optional(),
});

export const getResponseDetailInput = z.object({
  responseId: z.number().int().positive(),
});

// ─── Scoring Types ────────────────────────────────────────────────────────────

export type ScoreCategory =
  | "smartpro_fit"
  | "digital_maturity"
  | "compliance_burden"
  | "staffing_pressure"
  | "adoption_readiness";

export type SurveyScores = Record<ScoreCategory, number>;

export const SCORE_CATEGORIES: ScoreCategory[] = [
  "smartpro_fit",
  "digital_maturity",
  "compliance_burden",
  "staffing_pressure",
  "adoption_readiness",
];

export interface ScoringRule {
  category: ScoreCategory;
  weight: number;
  optionScores?: Record<string, number>;
}
