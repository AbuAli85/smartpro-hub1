import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import type { DocumentTemplate } from "../../../drizzle/schema";
import {
  documentGenerationAuditLogs,
  documentTemplatePlaceholders,
  documentTemplates,
  generatedDocuments,
} from "../../../drizzle/schema";
import type { getDb } from "../../db";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Shallow merge for `generated_documents.metadata` — never replace the whole JSON object. */
export function mergeGeneratedDocumentMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  return { ...base, ...patch };
}

/**
 * Template resolution: prefer **active** company-specific, then **active** platform (company_id = 0).
 * Draft or inactive company rows must not shadow an active platform template.
 */
export function pickResolvedTemplate(
  rows: DocumentTemplate[],
  activeCompanyId: number
): DocumentTemplate | null {
  const companyActive = rows.find((r) => r.companyId === activeCompanyId && r.status === "active");
  if (companyActive) return companyActive;
  const platformActive = rows.find((r) => r.companyId === 0 && r.status === "active");
  return platformActive ?? null;
}

export async function findTemplateByKeyForCompany(db: AppDb, key: string, activeCompanyId: number) {
  const rows = await db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.key, key),
        or(eq(documentTemplates.companyId, activeCompanyId), eq(documentTemplates.companyId, 0))
      )
    );

  return pickResolvedTemplate(rows, activeCompanyId);
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

export type GenerationFingerprint = {
  companyId: number;
  templateId: string;
  entityType: string;
  entityId: string;
  outputFormat: string;
};

const IN_FLIGHT_STATUSES = ["pending", "processing"] as const;

export async function findLatestGenerationByFingerprint(db: AppDb, p: GenerationFingerprint) {
  const [row] = await db
    .select()
    .from(generatedDocuments)
    .where(
      and(
        eq(generatedDocuments.companyId, p.companyId),
        eq(generatedDocuments.templateId, p.templateId),
        eq(generatedDocuments.entityType, p.entityType),
        eq(generatedDocuments.entityId, p.entityId),
        eq(generatedDocuments.outputFormat, p.outputFormat)
      )
    )
    .orderBy(desc(generatedDocuments.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listInFlightGenerationsForFingerprint(db: AppDb, p: GenerationFingerprint) {
  return db
    .select()
    .from(generatedDocuments)
    .where(
      and(
        eq(generatedDocuments.companyId, p.companyId),
        eq(generatedDocuments.templateId, p.templateId),
        eq(generatedDocuments.entityType, p.entityType),
        eq(generatedDocuments.entityId, p.entityId),
        eq(generatedDocuments.outputFormat, p.outputFormat),
        inArray(generatedDocuments.status, [...IN_FLIGHT_STATUSES])
      )
    )
    .orderBy(asc(generatedDocuments.createdAt));
}

/** Mark old pending/processing rows as abandoned so a new generation can proceed. */
export async function abandonStaleInFlightGenerations(
  db: AppDb,
  p: GenerationFingerprint,
  olderThan: Date
): Promise<void> {
  const stale = await db
    .select()
    .from(generatedDocuments)
    .where(
      and(
        eq(generatedDocuments.companyId, p.companyId),
        eq(generatedDocuments.templateId, p.templateId),
        eq(generatedDocuments.entityType, p.entityType),
        eq(generatedDocuments.entityId, p.entityId),
        eq(generatedDocuments.outputFormat, p.outputFormat),
        inArray(generatedDocuments.status, [...IN_FLIGHT_STATUSES]),
        lt(generatedDocuments.createdAt, olderThan)
      )
    );

  const nowIso = new Date().toISOString();
  for (const r of stale) {
    await db
      .update(generatedDocuments)
      .set({
        status: "abandoned",
        metadata: mergeGeneratedDocumentMetadata(r.metadata as Record<string, unknown> | null, {
          abandonedAt: nowIso,
          abandonedReason: "stale_in_flight_timeout",
        }),
      })
      .where(eq(generatedDocuments.id, r.id));

    await insertDocumentGenerationAuditLog(db, {
      id: crypto.randomUUID(),
      generatedDocumentId: r.id,
      action: "generation_abandoned_stale",
      actorId: null,
      details: {
        reason: "stale_in_flight_timeout",
        fingerprint: p,
      },
    });
  }
}

export async function loadGeneratedDocumentMetadata(
  db: AppDb,
  id: string
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ metadata: generatedDocuments.metadata })
    .from(generatedDocuments)
    .where(eq(generatedDocuments.id, id))
    .limit(1);
  const m = row?.metadata;
  if (m && typeof m === "object" && !Array.isArray(m)) return { ...(m as Record<string, unknown>) };
  return {};
}

export async function updateGeneratedDocumentMergedMetadata(
  db: AppDb,
  id: string,
  patch: Record<string, unknown>,
  columnPatch?: Partial<{
    status: string;
    generatedGoogleDocId: string | null;
    fileUrl: string | null;
    filePath: string | null;
    sourceGoogleDocId: string | null;
  }>
): Promise<void> {
  const current = await loadGeneratedDocumentMetadata(db, id);
  await db
    .update(generatedDocuments)
    .set({
      ...columnPatch,
      metadata: mergeGeneratedDocumentMetadata(current, patch),
    })
    .where(eq(generatedDocuments.id, id));
}

export async function finalizeGeneratedDocumentSuccess(
  db: AppDb,
  id: string,
  params: {
    generatedGoogleDocId: string;
    fileUrl: string;
    filePath: string;
    completionMeta: Record<string, unknown>;
  }
): Promise<void> {
  const current = await loadGeneratedDocumentMetadata(db, id);
  await db
    .update(generatedDocuments)
    .set({
      status: "generated",
      generatedGoogleDocId: params.generatedGoogleDocId,
      fileUrl: params.fileUrl,
      filePath: params.filePath,
      metadata: mergeGeneratedDocumentMetadata(current, {
        ...params.completionMeta,
        stage: "completed",
        completedAt: new Date().toISOString(),
      }),
    })
    .where(eq(generatedDocuments.id, id));
}

// ─── TEMPLATE DEFINITIONS ─────────────────────────────────────────────────────

/**
 * Google Doc ID for the bilingual promoter assignment contract template.
 * Override via PROMOTER_TEMPLATE_GOOGLE_DOC_ID environment variable.
 * The fallback value is only used for local seeding / development.
 */
const PROMOTER_TEMPLATE_GOOGLE_DOC_ID =
  process.env.PROMOTER_TEMPLATE_GOOGLE_DOC_ID ?? "1dG719K4jYFrEh8O9VChyMYWblflxW2tdFp2n4gpVhs0";

type PlaceholderDef = {
  placeholder: string;
  label: string;
  sourcePath: string;
  dataType: string;
  required: boolean;
};

const CORE_PROMOTER_PLACEHOLDERS: PlaceholderDef[] = [
  { placeholder: "first_party_name_ar", label: "First party (AR)", sourcePath: "first_party.company_name_ar", dataType: "string", required: true },
  { placeholder: "first_party_name_en", label: "First party (EN)", sourcePath: "first_party.company_name_en", dataType: "string", required: true },
  { placeholder: "first_party_crn", label: "First party CR", sourcePath: "first_party.cr_number", dataType: "string", required: true },
  { placeholder: "second_party_name_ar", label: "Second party (AR)", sourcePath: "second_party.company_name_ar", dataType: "string", required: true },
  { placeholder: "second_party_name_en", label: "Second party (EN)", sourcePath: "second_party.company_name_en", dataType: "string", required: true },
  { placeholder: "second_party_crn", label: "Second party CR", sourcePath: "second_party.cr_number", dataType: "string", required: true },
  { placeholder: "location_ar", label: "Location AR", sourcePath: "assignment.location_ar", dataType: "string", required: true },
  { placeholder: "location_en", label: "Location EN", sourcePath: "assignment.location_en", dataType: "string", required: true },
  { placeholder: "promoter_name_ar", label: "Promoter name AR", sourcePath: "promoter.full_name_ar", dataType: "string", required: true },
  { placeholder: "promoter_name_en", label: "Promoter name EN", sourcePath: "promoter.full_name_en", dataType: "string", required: true },
  { placeholder: "id_card_number", label: "ID card / Civil ID", sourcePath: "promoter.id_card_number", dataType: "string", required: true },
  { placeholder: "contract_start_date", label: "Start date", sourcePath: "assignment.start_date", dataType: "date", required: true },
  { placeholder: "contract_end_date", label: "End date", sourcePath: "assignment.end_date", dataType: "date", required: true },
];

const EXTENDED_IDENTITY_PLACEHOLDERS: PlaceholderDef[] = [
  { placeholder: "passport_number", label: "Passport number", sourcePath: "promoter.passport_number", dataType: "string", required: false },
  { placeholder: "passport_expiry", label: "Passport expiry", sourcePath: "promoter.passport_expiry", dataType: "date", required: false },
  { placeholder: "nationality", label: "Nationality", sourcePath: "promoter.nationality", dataType: "string", required: false },
  { placeholder: "job_title_en", label: "Job title (EN)", sourcePath: "promoter.job_title_en", dataType: "string", required: false },
  { placeholder: "contract_ref_no", label: "Contract ref. no.", sourcePath: "assignment.contract_reference_number", dataType: "string", required: false },
  { placeholder: "issue_date", label: "Issue date", sourcePath: "assignment.issue_date", dataType: "date", required: false },
];

async function insertPlaceholders(db: AppDb, templateId: string, defs: PlaceholderDef[]): Promise<void> {
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

// ─── SEED (explicit script / admin only — not called from request-time generation) ─────────

/**
 * Idempotent bootstrap for dev/prod installs. Run via `npx tsx scripts/seed-document-templates.ts`.
 * Seeds platform templates only (company_id = 0).
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

  await insertPlaceholders(db, templateId, [...CORE_PROMOTER_PLACEHOLDERS, ...EXTENDED_IDENTITY_PLACEHOLDERS]);
}
