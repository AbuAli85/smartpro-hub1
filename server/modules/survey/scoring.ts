import type { SurveyScores, ScoreCategory, ScoringRule } from "./types";
import { SCORE_CATEGORIES } from "./types";

interface AnswerRow {
  questionId: number;
  answerValue: string | null;
  selectedOptions: number[] | null;
}

interface QuestionRow {
  id: number;
  scoringRule: Record<string, unknown> | null;
}

interface OptionRow {
  id: number;
  questionId: number;
  value: string;
  score: number;
  tags: string[] | null;
}

export function computeSurveyScores(
  answers: AnswerRow[],
  questions: QuestionRow[],
  options: OptionRow[],
): SurveyScores {
  const raw: Record<ScoreCategory, { total: number; weight: number }> = {} as any;
  for (const cat of SCORE_CATEGORIES) {
    raw[cat] = { total: 0, weight: 0 };
  }

  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const optionsByQuestion = new Map<number, OptionRow[]>();
  for (const opt of options) {
    const list = optionsByQuestion.get(opt.questionId) ?? [];
    list.push(opt);
    optionsByQuestion.set(opt.questionId, list);
  }

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question?.scoringRule) continue;

    const rule = question.scoringRule as unknown as ScoringRule;
    if (!rule.category || !rule.weight) continue;

    const cat = rule.category;
    if (!raw[cat]) continue;

    let score = 0;
    const qOptions = optionsByQuestion.get(answer.questionId) ?? [];

    if (answer.selectedOptions?.length) {
      for (const optId of answer.selectedOptions) {
        const opt = qOptions.find((o) => o.id === optId);
        if (opt) {
          if (rule.optionScores?.[opt.value] !== undefined) {
            score += rule.optionScores[opt.value];
          } else {
            score += opt.score;
          }
        }
      }
    } else if (answer.answerValue != null) {
      if (rule.optionScores?.[answer.answerValue] !== undefined) {
        score = rule.optionScores[answer.answerValue];
      } else {
        const matchOpt = qOptions.find((o) => o.value === answer.answerValue);
        if (matchOpt) score = matchOpt.score;
      }
    }

    raw[cat].total += score * rule.weight;
    raw[cat].weight += rule.weight;
  }

  const result: SurveyScores = {} as SurveyScores;
  for (const cat of SCORE_CATEGORIES) {
    const { total, weight } = raw[cat];
    result[cat] = weight > 0 ? Math.round(Math.min(100, Math.max(0, (total / weight) * 20))) : 0;
  }

  return result;
}

export function collectResponseTags(
  answers: AnswerRow[],
  options: OptionRow[],
): string[] {
  const tagSet = new Set<string>();

  const optionMap = new Map<number, OptionRow>();
  for (const opt of options) {
    optionMap.set(opt.id, opt);
  }

  for (const answer of answers) {
    if (answer.selectedOptions?.length) {
      for (const optId of answer.selectedOptions) {
        const opt = optionMap.get(optId);
        if (opt?.tags) {
          for (const tag of opt.tags) tagSet.add(tag);
        }
      }
    }
  }

  return Array.from(tagSet);
}
