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

// ─── TEMPLATE DEFINITIONS ─────────────────────────────────────────────────────

/** Shared Google Doc ID for the bilingual promoter assignment contract template. */
const PROMOTER_TEMPLATE_GOOGLE_DOC_ID = "1dG719K4jYFrEh8O9VChyMYWblflxW2tdFp2n4gpVhs0";

type PlaceholderDef = {
  placeholder: string;
  label: string;
  sourcePath: string;
  dataType: string;
  required: boolean;
};

/** Core placeholders present in both the legacy and CMS template. */
const CORE_PROMOTER_PLACEHOLDERS: PlaceholderDef[] = [
  { placeholder: "first_party_name_ar",   label: "First party (AR)",    sourcePath: "first_party.company_name_ar",  dataType: "string", required: true },
  { placeholder: "first_party_name_en",   label: "First party (EN)",    sourcePath: "first_party.company_name_en",  dataType: "string", required: true },
  { placeholder: "first_party_crn",       label: "First party CR",      sourcePath: "first_party.cr_number",        dataType: "string", required: true },
  { placeholder: "second_party_name_ar",  label: "Second party (AR)",   sourcePath: "second_party.company_name_ar", dataType: "string", required: true },
  { placeholder: "second_party_name_en",  label: "Second party (EN)",   sourcePath: "second_party.company_name_en", dataType: "string", required: true },
  { placeholder: "second_party_crn",      label: "Second party CR",     sourcePath: "second_party.cr_number",       dataType: "string", required: true },
  { placeholder: "location_ar",           label: "Location AR",         sourcePath: "assignment.location_ar",       dataType: "string", required: true },
  { placeholder: "location_en",           label: "Location EN",         sourcePath: "assignment.location_en",       dataType: "string", required: true },
  { placeholder: "promoter_name_ar",      label: "Promoter name AR",    sourcePath: "promoter.full_name_ar",        dataType: "string", required: true },
  { placeholder: "promoter_name_en",      label: "Promoter name EN",    sourcePath: "promoter.full_name_en",        dataType: "string", required: true },
  { placeholder: "id_card_number",        label: "ID card / Civil ID",  sourcePath: "promoter.id_card_number",      dataType: "string", required: true },
  { placeholder: "contract_start_date",   label: "Start date",          sourcePath: "assignment.start_date",        dataType: "date",   required: true },
  { placeholder: "contract_end_date",     label: "End date",            sourcePath: "assignment.end_date",          dataType: "date",   required: true },
];

/**
 * Extended identity placeholders — used by the CMS template (outsourcing_contract).
 * These are optional so that contracts without passport data still generate.
 */
const EXTENDED_IDENTITY_PLACEHOLDERS: PlaceholderDef[] = [
  { placeholder: "passport_number",   label: "Passport number",   sourcePath: "promoter.passport_number",  dataType: "string", required: false },
  { placeholder: "passport_expiry",   label: "Passport expiry",   sourcePath: "promoter.passport_expiry",  dataType: "date",   required: false },
  { placeholder: "nationality",       label: "Nationality",        sourcePath: "promoter.nationality",     dataType: "string", required: false },
  { placeholder: "job_title_en",      label: "Job title (EN)",     sourcePath: "promoter.job_title_en",    dataType: "string", required: false },
  { placeholder: "contract_ref_no",   label: "Contract ref. no.",  sourcePath: "assignment.contract_reference_number", dataType: "string", required: false },
  { placeholder: "issue_date",        label: "Issue date",         sourcePath: "assignment.issue_date",    dataType: "date",   required: false },
];

async function insertPlaceholders(
  db: AppDb,
  templateId: string,
  defs: PlaceholderDef[]
): Promise<void> {
  const rows = defs.map((d) => ({
    id: crypto.randomUUID(),
    templateId,
    placeholder: d.placeholder,
    label: d.label,
    sourcePath: d.sourcePath,
    dataType: d.dataType,
    required: d.required,
    defaultValue: null as string | null,
  }));
  await db.insert(documentTemplatePlaceholders).values(rows);
}

// ─── SEED ──────────────────────────────────────────────────────────────────────

/**
 * Idempotent bootstrap.
 *
 * Seeds two templates on first run:
 *   1. "promoter_assignment_contract_bilingual" — legacy entity type "promoter_assignment"
 *      (existing behaviour, core placeholders only).
 *   2. "outsourcing_contract_promoter_bilingual" — new entity type "outsourcing_contract"
 *      (core + extended identity placeholders — passport, nationality, job title).
 *
 * Both share the same Google Doc template ID for now. When a custom CMS template
 * is created, update the googleDocId for key #2 without touching key #1.
 */
export async function seedDocumentGenerationBootstrap(db: AppDb): Promise<void> {
  await seedLegacyPromoterTemplate(db);
  await seedCmsPromoterTemplate(db);
}

async function seedLegacyPromoterTemplate(db: AppDb): Promise<void> {
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
    name: "Promoter Assignment Contract — Bilingual",
    category: "contract",
    entityType: "promoter_assignment",
    documentSource: "google_docs",
    googleDocId: PROMOTER_TEMPLATE_GOOGLE_DOC_ID,
    language: "ar-en",
    version: 1,
    status: "active",
    outputFormats: ["pdf"],
  });

  await insertPlaceholders(db, templateId, CORE_PROMOTER_PLACEHOLDERS);
}

async function seedCmsPromoterTemplate(db: AppDb): Promise<void> {
  const key = "outsourcing_contract_promoter_bilingual";
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
    name: "Outsourcing Contract — Promoter Assignment (Bilingual)",
    category: "contract",
    entityType: "outsourcing_contract",
    documentSource: "google_docs",
    googleDocId: PROMOTER_TEMPLATE_GOOGLE_DOC_ID,
    language: "ar-en",
    version: 1,
    status: "active",
    outputFormats: ["pdf"],
  });

  await insertPlaceholders(db, templateId, [
    ...CORE_PROMOTER_PLACEHOLDERS,
    ...EXTENDED_IDENTITY_PLACEHOLDERS,
  ]);
}
