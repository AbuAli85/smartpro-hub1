import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { sanadIntelLicenseRequirements } from "../../drizzle/schema.js";

/** Structured checklist aligned with SANAD service centre licensing themes (maintain in-code; refine against official PDF). */
export const SANAD_LICENSE_REQUIREMENT_SEED = [
  {
    code: "premises_min_area",
    category: "premises",
    onboardingStage: "premises" as const,
    titleAr: "مساحة مكان العمل المناسبة",
    titleEn: "Minimum workspace / premises suitability",
    description:
      "Centre must operate from a fixed commercial location meeting authority minimum area and safety expectations.",
    sortOrder: 10,
    requiredDocumentCodes: ["lease_or_title", "site_photos"],
  },
  {
    code: "trade_registration",
    category: "legal",
    onboardingStage: "documentation" as const,
    titleAr: "السجل التجاري ساري المفعول",
    titleEn: "Valid commercial registration (CR)",
    description: "Active CR covering relevant activities for government service facilitation.",
    sortOrder: 20,
    requiredDocumentCodes: ["cr_certificate"],
  },
  {
    code: "municipal_licence",
    category: "legal",
    onboardingStage: "documentation" as const,
    titleAr: "رخصة بلدية / ترخيص محلي",
    titleEn: "Municipal / local business licence",
    description: "Local municipality approvals where applicable for the operating address.",
    sortOrder: 30,
    requiredDocumentCodes: ["municipal_licence"],
  },
  {
    code: "owner_id",
    category: "identity",
    onboardingStage: "intake" as const,
    titleAr: "هوية مالك المركز",
    titleEn: "Owner / authorised signatory identification",
    description: "Civil ID or equivalent for the responsible owner or licensed manager.",
    sortOrder: 40,
    requiredDocumentCodes: ["owner_civil_id"],
  },
  {
    code: "staff_competency",
    category: "staffing",
    onboardingStage: "staffing" as const,
    titleAr: "كفاءة الموظفين والتدريب",
    titleEn: "Staff competency & training evidence",
    description: "Demonstrate trained staff for regulated services (typing, attestations, visa workflows as applicable).",
    sortOrder: 50,
    requiredDocumentCodes: ["training_records", "job_descriptions"],
  },
  {
    code: "sanad_authorisation",
    category: "licensing",
    onboardingStage: "licensing_review" as const,
    titleAr: "تصريح / ترخيص مركز خدمات ساناد",
    titleEn: "SANAD service centre authorisation",
    description: "Formal SANAD programme approval / licence reference and renewal schedule.",
    sortOrder: 60,
    requiredDocumentCodes: ["sanad_licence_copy"],
  },
  {
    code: "data_protection_commitment",
    category: "operations",
    onboardingStage: "go_live" as const,
    titleAr: "التزام حماية بيانات العملاء",
    titleEn: "Customer data handling & confidentiality controls",
    description: "Internal policy for PII, document retention, and secure handoff to government portals.",
    sortOrder: 70,
    requiredDocumentCodes: ["data_handling_policy"],
  },
] as const;

export async function seedSanadLicenseRequirementsIfEmpty(db: MySql2Database<Record<string, never>>) {
  const existing = await db.select({ id: sanadIntelLicenseRequirements.id }).from(sanadIntelLicenseRequirements).limit(1);
  if (existing.length > 0) return { inserted: 0, skipped: true as const };

  let inserted = 0;
  for (const row of SANAD_LICENSE_REQUIREMENT_SEED) {
    await db.insert(sanadIntelLicenseRequirements).values({
      code: row.code,
      category: row.category,
      onboardingStage: row.onboardingStage,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      description: row.description,
      sortOrder: row.sortOrder,
      requiredDocumentCodes: [...row.requiredDocumentCodes],
    });
    inserted++;
  }
  return { inserted, skipped: false as const };
}

export async function ensureLicenseRequirementCodes(db: MySql2Database<Record<string, never>>) {
  for (const row of SANAD_LICENSE_REQUIREMENT_SEED) {
    const found = await db
      .select({ id: sanadIntelLicenseRequirements.id })
      .from(sanadIntelLicenseRequirements)
      .where(eq(sanadIntelLicenseRequirements.code, row.code))
      .limit(1);
    if (found.length > 0) continue;
    await db.insert(sanadIntelLicenseRequirements).values({
      code: row.code,
      category: row.category,
      onboardingStage: row.onboardingStage,
      titleAr: row.titleAr,
      titleEn: row.titleEn,
      description: row.description,
      sortOrder: row.sortOrder,
      requiredDocumentCodes: [...row.requiredDocumentCodes],
    });
  }
}
