import type { OfficialLetterType } from "./types";

export type LetterTemplateMeta = {
  code: OfficialLetterType;
  nameEn: string;
  nameAr: string;
  description: string;
  supportsEn: boolean;
  supportsAr: boolean;
  supportsBilingual: boolean;
  isSensitive: boolean;
  requiresSignatory: boolean;
  requiresRecipient: boolean;
};

export const LETTER_TEMPLATE_META: Record<OfficialLetterType, LetterTemplateMeta> = {
  salary_certificate: {
    code: "salary_certificate",
    nameEn: "Salary Certificate",
    nameAr: "شهادة راتب",
    description: "Official salary confirmation for banks and authorities",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: false,
    requiresSignatory: true,
    requiresRecipient: false,
  },
  employment_verification: {
    code: "employment_verification",
    nameEn: "Employment Verification",
    nameAr: "خطاب التحقق من التوظيف",
    description: "Confirms current employment status",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: false,
    requiresSignatory: true,
    requiresRecipient: false,
  },
  noc: {
    code: "noc",
    nameEn: "No Objection Certificate (NOC)",
    nameAr: "شهادة عدم ممانعة",
    description: "Employer consent for a stated purpose",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: true,
    requiresSignatory: true,
    requiresRecipient: true,
  },
  experience_letter: {
    code: "experience_letter",
    nameEn: "Experience Letter",
    nameAr: "خطاب خبرة",
    description: "Service period and role confirmation",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: false,
    requiresSignatory: true,
    requiresRecipient: false,
  },
  promotion_letter: {
    code: "promotion_letter",
    nameEn: "Promotion Letter",
    nameAr: "خطاب ترقية",
    description: "Official promotion notification",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: false,
    requiresSignatory: true,
    requiresRecipient: false,
  },
  salary_transfer_letter: {
    code: "salary_transfer_letter",
    nameEn: "Salary Transfer Letter",
    nameAr: "خطاب تحويل راتب",
    description: "Bank salary transfer authorisation",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: false,
    requiresSignatory: true,
    requiresRecipient: true,
  },
  leave_approval_letter: {
    code: "leave_approval_letter",
    nameEn: "Leave Approval Letter",
    nameAr: "خطاب الموافقة على الإجازة",
    description: "Approved leave dates and return",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: false,
    requiresSignatory: true,
    requiresRecipient: false,
  },
  warning_letter: {
    code: "warning_letter",
    nameEn: "Warning Letter",
    nameAr: "خطاب إنذار",
    description: "Formal disciplinary warning",
    supportsEn: true,
    supportsAr: true,
    supportsBilingual: true,
    isSensitive: true,
    requiresSignatory: true,
    requiresRecipient: false,
  },
};

export function isSensitiveLetter(type: OfficialLetterType): boolean {
  return LETTER_TEMPLATE_META[type].isSensitive;
}
