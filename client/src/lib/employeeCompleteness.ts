/**
 * Weighted Employee Profile Completeness Scoring
 *
 * Scoring model (executive-grade, comparable across companies):
 *   Identity layer     30%  — KYC-level personal data
 *   Employment layer   20%  — Role, department, hire date
 *   Compliance layer   30%  — Visa, work permit, PASI, civil ID
 *   Financial layer    20%  — Salary, IBAN, bank
 *
 * Returns a score 0–100 and a breakdown per layer.
 */

export interface CompletenessLayer {
  name: string;
  weight: number;       // 0–1
  score: number;        // 0–1 (fraction of filled fields in this layer)
  filled: number;
  total: number;
  missingFields: string[];
}

export interface CompletenessResult {
  /** 0–100 weighted score */
  score: number;
  /** Tier label */
  tier: "complete" | "partial" | "needs_attention";
  layers: CompletenessLayer[];
  /** All missing field labels across all layers */
  allMissing: string[];
  /** Highest severity issue for the tooltip headline */
  headline: string;
}

type EmpLike = {
  firstName?: string | null;
  lastName?: string | null;
  firstNameAr?: string | null;
  lastNameAr?: string | null;
  email?: string | null;
  phone?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  nationalId?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: string | null;
  maritalStatus?: string | null;
  // Employment
  department?: string | null;
  position?: string | null;
  employmentType?: string | null;
  hireDate?: string | Date | null;
  employeeNumber?: string | null;
  // Compliance
  visaNumber?: string | null;
  visaExpiryDate?: string | Date | null;
  workPermitNumber?: string | null;
  workPermitExpiryDate?: string | Date | null;
  pasiNumber?: string | null;
  // Financial
  salary?: string | number | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
};

function has(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

export function computeCompleteness(emp: EmpLike): CompletenessResult {
  // ── Identity layer (weight 0.30) ─────────────────────────────────────────
  const identityFields: Array<[string, unknown]> = [
    ["First Name (EN)", emp.firstName],
    ["Last Name (EN)", emp.lastName],
    ["First Name (AR)", emp.firstNameAr],
    ["Last Name (AR)", emp.lastNameAr],
    ["Email", emp.email],
    ["Phone", emp.phone],
    ["Nationality", emp.nationality],
    ["Passport Number", emp.passportNumber],
    ["Civil ID / National ID", emp.nationalId],
    ["Date of Birth", emp.dateOfBirth],
    ["Gender", emp.gender],
    ["Marital Status", emp.maritalStatus],
  ];

  // ── Employment layer (weight 0.20) ────────────────────────────────────────
  const employmentFields: Array<[string, unknown]> = [
    ["Department", emp.department],
    ["Position / Job Title", emp.position],
    ["Employment Type", emp.employmentType],
    ["Hire Date", emp.hireDate],
    ["Employee Number", emp.employeeNumber],
  ];

  // ── Compliance layer (weight 0.30) ────────────────────────────────────────
  const complianceFields: Array<[string, unknown]> = [
    ["Visa Number", emp.visaNumber],
    ["Visa Expiry Date", emp.visaExpiryDate],
    ["Work Permit Number", emp.workPermitNumber],
    ["Work Permit Expiry", emp.workPermitExpiryDate],
    ["PASI Number", emp.pasiNumber],
  ];

  // ── Financial layer (weight 0.20) ─────────────────────────────────────────
  const financialFields: Array<[string, unknown]> = [
    ["Salary", emp.salary],
    ["Bank Name", emp.bankName],
    ["IBAN / Account Number", emp.bankAccountNumber],
  ];

  function buildLayer(
    name: string,
    weight: number,
    fields: Array<[string, unknown]>
  ): CompletenessLayer {
    const missing = fields.filter(([, v]) => !has(v)).map(([label]) => label);
    const filled = fields.length - missing.length;
    return {
      name,
      weight,
      score: fields.length === 0 ? 1 : filled / fields.length,
      filled,
      total: fields.length,
      missingFields: missing,
    };
  }

  const identity   = buildLayer("Identity",   0.30, identityFields);
  const employment = buildLayer("Employment", 0.20, employmentFields);
  const compliance = buildLayer("Compliance", 0.30, complianceFields);
  const financial  = buildLayer("Financial",  0.20, financialFields);

  const layers = [identity, employment, compliance, financial];

  const score = Math.round(
    layers.reduce((sum, l) => sum + l.score * l.weight * 100, 0)
  );

  const allMissing = layers.flatMap((l) => l.missingFields);

  const tier: CompletenessResult["tier"] =
    score >= 90 ? "complete" : score >= 60 ? "partial" : "needs_attention";

  // Headline: most critical missing item
  let headline = "";
  if (compliance.missingFields.length > 0) {
    headline = `Missing compliance data: ${compliance.missingFields[0]}`;
  } else if (identity.missingFields.length > 0) {
    headline = `Missing identity data: ${identity.missingFields[0]}`;
  } else if (employment.missingFields.length > 0) {
    headline = `Missing employment data: ${employment.missingFields[0]}`;
  } else if (financial.missingFields.length > 0) {
    headline = `Missing financial data: ${financial.missingFields[0]}`;
  } else {
    headline = "Profile is complete";
  }

  return { score, tier, layers, allMissing, headline };
}

/** Badge color classes by tier */
export const TIER_BADGE: Record<CompletenessResult["tier"], string> = {
  complete:       "bg-emerald-100 text-emerald-700 border border-emerald-200",
  partial:        "bg-amber-100 text-amber-700 border border-amber-200",
  needs_attention:"bg-red-100 text-red-700 border border-red-200",
};

/** Icon name by tier (Lucide) */
export const TIER_ICON: Record<CompletenessResult["tier"], string> = {
  complete:       "CheckCircle2",
  partial:        "AlertCircle",
  needs_attention:"XCircle",
};

/** Layer accent colors for the breakdown bar */
export const LAYER_COLORS: Record<string, string> = {
  Identity:   "bg-blue-500",
  Employment: "bg-purple-500",
  Compliance: "bg-orange-500",
  Financial:  "bg-emerald-500",
};
