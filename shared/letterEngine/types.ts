export const OFFICIAL_LETTER_TYPES = [
  "salary_certificate",
  "employment_verification",
  "noc",
  "experience_letter",
  "promotion_letter",
  "salary_transfer_letter",
  "leave_approval_letter",
  "warning_letter",
] as const;

export type OfficialLetterType = (typeof OFFICIAL_LETTER_TYPES)[number];

export type LetterLanguageMode = "en" | "ar" | "both";

/** User-editable fields per letter (all optional at type level; validation enforces per template). */
export type LetterFieldPayload = {
  issueDate?: string;
  effectiveDate?: string;
  bankName?: string;
  destination?: string;
  /** NOC: institution or authority (e.g. Embassy of …). */
  destinationInstitution?: string;
  /** NOC: concrete purpose (visa processing, bank submission, etc.) — not the letter type name. */
  purposeOfIssuance?: string;
  validityUntil?: string;
  previousTitle?: string;
  newTitle?: string;
  promotionEffectiveDate?: string;
  approvalReference?: string;
  leaveType?: string;
  leaveStart?: string;
  leaveEnd?: string;
  returnDate?: string;
  incidentDate?: string;
  policyCategory?: string;
  factualSummary?: string;
  correctiveExpectation?: string;
  employmentEndDate?: string;
  currentlyEmployed?: boolean | string;
  tone?: "positive" | "neutral";
  includeSalary?: boolean | string;
  recipientPreset?: "twimc" | "bank" | "embassy" | "ministry" | "custom";
};

export const TEMPLATE_VERSION = "v1" as const;
