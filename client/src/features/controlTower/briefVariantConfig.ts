import type { OperatingBriefVariant } from "./briefVariants";

export interface BriefVariantConfig {
  label: string;

  includeOutcome: boolean;
  includeTrend: boolean;

  maxKeyPressures: number;
  maxLeadershipFocus: number;
  maxCheckpoints: number;
  maxReviewFocus: number;

  situationStyle: "operational" | "summary";

  emphasis: {
    priorities: boolean;
    commitments: boolean;
    review: boolean;
    /** Executive decisions (intervention prompts) */
    decisions: boolean;
  };
}

export const BRIEF_VARIANT_CONFIG: Record<OperatingBriefVariant, BriefVariantConfig> = {
  daily: {
    label: "Daily",
    includeOutcome: true,
    includeTrend: false,
    maxKeyPressures: 2,
    maxLeadershipFocus: 2,
    maxCheckpoints: 2,
    maxReviewFocus: 2,
    situationStyle: "operational",
    emphasis: { priorities: true, commitments: true, review: false, decisions: false },
  },
  weekly: {
    label: "Weekly",
    includeOutcome: true,
    includeTrend: true,
    maxKeyPressures: 3,
    maxLeadershipFocus: 3,
    maxCheckpoints: 3,
    maxReviewFocus: 3,
    situationStyle: "summary",
    emphasis: { priorities: false, commitments: true, review: true, decisions: false },
  },
  leadership: {
    label: "Leadership",
    includeOutcome: true,
    includeTrend: true,
    maxKeyPressures: 3,
    maxLeadershipFocus: 3,
    maxCheckpoints: 3,
    maxReviewFocus: 3,
    situationStyle: "operational",
    emphasis: { priorities: false, commitments: true, review: false, decisions: true },
  },
  board: {
    label: "Board",
    includeOutcome: true,
    includeTrend: true,
    maxKeyPressures: 1,
    maxLeadershipFocus: 2,
    maxCheckpoints: 1,
    maxReviewFocus: 1,
    situationStyle: "summary",
    emphasis: { priorities: false, commitments: false, review: false, decisions: false },
  },
};

export function getBriefVariantConfig(variant: OperatingBriefVariant): BriefVariantConfig {
  return BRIEF_VARIANT_CONFIG[variant];
}

/** Plain-text export title for `formatOperatingBriefText`. */
export function getBriefExportTitle(variant: OperatingBriefVariant): string {
  switch (variant) {
    case "daily":
      return "Daily Operating Brief";
    case "weekly":
      return "Weekly Leadership Brief";
    case "leadership":
      return "Leadership Operating Brief";
    case "board":
      return "Board Brief";
    default:
      return "Operating Brief";
  }
}
