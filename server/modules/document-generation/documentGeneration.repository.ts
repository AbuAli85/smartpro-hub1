import { and, eq, or } from "drizzle-orm";
import {
  documentGenerationAuditLogs,
  documentTemplatePlaceholders,
  documentTemplates,
  generatedDocuments,
} from "../../../drizzle/schema";
import type { getDb } from "../../db";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function findTemplateByKeyForCompany(
  db: AppDb,
  key: string,
  activeCompanyId: number
) {
  const rows = await db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.key, key),
        or(eq(documentTemplates.companyId, activeCompanyId), eq(documentTemplates.companyId, 0))
      )
    );

  const companySpecific = rows.find((r) => r.companyId === activeCompanyId);
  if (companySpecific) return companySpecific;
  return rows.find((r) => r.companyId === 0) ?? null;
}

export async function listPlaceholdersForTemplate(db: AppDb, templateId: string) {
  return db
    .select()
    .from(documentTemplatePlaceholders)
    .where(eq(documentTemplatePlaceholders.templateId, templateId));
}

export async function insertGeneratedDocument(
  db: AppDb,
  row: typeof generatedDocuments.$inferInsert
) {
  await db.insert(generatedDocuments).values(row);
}

export async function insertDocumentGenerationAuditLog(
  db: AppDb,
  row: typeof documentGenerationAuditLogs.$inferInsert
) {
  await db.insert(documentGenerationAuditLogs).values(row);
}

/** Idempotent bootstrap: inserts platform template + placeholders if key missing. */
export async function seedDocumentGenerationBootstrap(db: AppDb): Promise<void> {
  const key = "promoter_assignment_contract_bilingual";
  const existing = await db
    .select({ id: documentTemplates.id })
    .from(documentTemplates)
    .where(and(eq(documentTemplates.key, key), eq(documentTemplates.companyId, 0)))
    .limit(1);

  if (existing.length > 0) return;

  const templateId = crypto.randomUUID();
  await db.insert(documentTemplates).values({
    id: templateId,
    companyId: 0,
    key,
    name: "Promoter Assignment Contract - Bilingual",
    category: "contract",
    entityType: "promoter_assignment",
    documentSource: "google_docs",
    googleDocId: "1dG719K4jYFrEh8O9VChyMYWblflxW2tdFp2n4gpVhs0",
    language: "ar-en",
    version: 1,
    status: "active",
    outputFormats: ["pdf"],
  });

  const ph = (
    placeholder: string,
    label: string,
    sourcePath: string,
    dataType: string
  ) => ({
    id: crypto.randomUUID(),
    templateId,
    placeholder,
    label,
    sourcePath,
    dataType,
    required: true as const,
    defaultValue: null as string | null,
  });

  await db.insert(documentTemplatePlaceholders).values([
    ph("first_party_name_ar", "First party (AR)", "first_party.company_name_ar", "string"),
    ph("first_party_name_en", "First party (EN)", "first_party.company_name_en", "string"),
    ph("first_party_crn", "First party CR", "first_party.cr_number", "string"),
    ph("second_party_name_ar", "Second party (AR)", "second_party.company_name_ar", "string"),
    ph("second_party_name_en", "Second party (EN)", "second_party.company_name_en", "string"),
    ph("second_party_crn", "Second party CR", "second_party.cr_number", "string"),
    ph("location_ar", "Location AR", "assignment.location_ar", "string"),
    ph("location_en", "Location EN", "assignment.location_en", "string"),
    ph("promoter_name_ar", "Promoter name AR", "promoter.full_name_ar", "string"),
    ph("promoter_name_en", "Promoter name EN", "promoter.full_name_en", "string"),
    ph("id_card_number", "ID card", "promoter.id_card_number", "string"),
    ph("contract_start_date", "Start date", "assignment.start_date", "date"),
    ph("contract_end_date", "End date", "assignment.end_date", "date"),
  ]);
}
