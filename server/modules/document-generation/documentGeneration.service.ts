import { eq } from "drizzle-orm";
import { auditEvents, generatedDocuments } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { storagePut } from "../../storage";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  findTemplateByKeyForCompany,
  insertDocumentGenerationAuditLog,
  insertGeneratedDocument,
  listPlaceholdersForTemplate,
  seedDocumentGenerationBootstrap,
} from "./documentGeneration.repository";
import { buildPromoterAssignmentDocumentContext } from "./promoterAssignmentContext";
import { buildOutsourcingContractDocumentContext } from "../contractManagement/outsourcingContractContext";
import { resolvePlaceholders, type PlaceholderDefinitionRow } from "./placeholderResolver";
import {
  assertOutputFormatAllowed,
  assertRequiredPlaceholdersResolved,
  assertTemplateActive,
} from "./templateValidation";
import {
  DocumentGenerationError,
  type GenerateDocumentInput,
  type GenerateDocumentResult,
} from "./documentGeneration.types";
import type { GoogleDocsClientDeps } from "./googleDocs.client";
import { createLiveGoogleDocsClient } from "./googleDocs.client";

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const DOCUMENT_GENERATION_ROLES = ["company_admin", "hr_admin"] as const;

export function canGenerateDocuments(membershipRole: string): boolean {
  return (DOCUMENT_GENERATION_ROLES as readonly string[]).includes(membershipRole);
}

/** Stable positive int for audit_events.entityId when the domain entity uses a UUID string. */
export function hashUuidToAuditEntityId(uuid: string): number {
  let h = 0;
  for (let i = 0; i < uuid.length; i++) {
    h = (Math.imul(31, h) + uuid.charCodeAt(i)) | 0;
  }
  const n = Math.abs(h);
  return n === 0 ? 1 : n;
}

/**
 * Registry of entity-type → context builder functions.
 * Add new contract types here without touching the generation engine.
 * Each builder receives (db, entityId, activeCompanyId, isPlatformAdmin, user)
 * and returns a plain Record used as the placeholder resolution root.
 */
type ContextBuilderFn = (
  db: AppDb,
  entityId: string,
  activeCompanyId: number,
  isPlatformAdmin: boolean,
  user: GenerateDocumentInput["user"]
) => Promise<Record<string, unknown>>;

const entityContextBuilders: Record<string, ContextBuilderFn> = {
  // Legacy builder — kept for backward compatibility with existing generated_documents rows
  promoter_assignment: async (db, entityId, activeCompanyId, _isPlatformAdmin, user) => {
    const ctx = await buildPromoterAssignmentDocumentContext(db, entityId, activeCompanyId, user);
    return ctx as unknown as Record<string, unknown>;
  },
  // New normalized contract system (Phase 2+)
  outsourcing_contract: async (db, entityId, activeCompanyId, isPlatformAdmin) => {
    const ctx = await buildOutsourcingContractDocumentContext(db, entityId, activeCompanyId, isPlatformAdmin);
    return ctx as unknown as Record<string, unknown>;
  },
};

async function buildEntityContext(
  db: AppDb,
  entityType: string,
  entityId: string,
  activeCompanyId: number,
  user: GenerateDocumentInput["user"]
): Promise<Record<string, unknown>> {
  const isPlatformAdmin = canAccessGlobalAdminProcedures(user);
  const builder = entityContextBuilders[entityType];
  if (!builder) {
    throw new DocumentGenerationError(
      "VALIDATION_ERROR",
      `No context builder registered for entity type "${entityType}"`
    );
  }
  return builder(db, entityId, activeCompanyId, isPlatformAdmin, user);
}

export type GenerateDocumentDeps = {
  google: GoogleDocsClientDeps;
};

const defaultDeps: GenerateDocumentDeps = {
  google: createLiveGoogleDocsClient(),
};

export async function generateDocument(
  input: GenerateDocumentInput,
  deps: GenerateDocumentDeps = defaultDeps
): Promise<GenerateDocumentResult> {
  const db = await getDb();
  if (!db) {
    throw new DocumentGenerationError("INTERNAL_ERROR", "Database unavailable");
  }

  if (!canGenerateDocuments(input.membershipRole)) {
    throw new DocumentGenerationError(
      "FORBIDDEN",
      "You do not have permission to generate this document."
    );
  }

  await seedDocumentGenerationBootstrap(db);

  const template = await findTemplateByKeyForCompany(db, input.templateKey, input.activeCompanyId);
  if (!template) {
    throw new DocumentGenerationError("NOT_FOUND", `Document template "${input.templateKey}" not found`);
  }

  assertTemplateActive(template);
  assertOutputFormatAllowed(template, input.outputFormat);

  const placeholderRows = await listPlaceholdersForTemplate(db, template.id);
  const defs: PlaceholderDefinitionRow[] = placeholderRows.map((p) => ({
    placeholder: p.placeholder,
    sourcePath: p.sourcePath,
    dataType: p.dataType,
    required: p.required,
    defaultValue: p.defaultValue,
  }));

  const contextRoot = await buildEntityContext(
    db,
    template.entityType,
    input.entityId,
    input.activeCompanyId,
    input.user
  );

  const { values, missing } = resolvePlaceholders(defs, contextRoot);
  assertRequiredPlaceholdersResolved(missing);

  const documentId = crypto.randomUUID();
  const sourceDocId = template.googleDocId;
  if (!sourceDocId) {
    throw new DocumentGenerationError("INTERNAL_ERROR", "Template has no google_doc_id configured");
  }

  const auditBase = {
    templateKey: input.templateKey,
    entityId: input.entityId,
    entityType: template.entityType,
    tenantId: input.activeCompanyId,
    outputFormat: input.outputFormat,
    sourceGoogleDocId: sourceDocId,
  };

  await insertGeneratedDocument(db, {
    id: documentId,
    templateId: template.id,
    entityType: template.entityType,
    entityId: input.entityId,
    outputFormat: input.outputFormat,
    sourceGoogleDocId: sourceDocId,
    generatedGoogleDocId: null,
    fileUrl: null,
    filePath: null,
    status: "pending",
    generatedBy: input.actorUserId,
    companyId: input.activeCompanyId,
    metadata: {
      templateKey: input.templateKey,
      templateName: template.name,
    },
  });

  await insertDocumentGenerationAuditLog(db, {
    id: crypto.randomUUID(),
    generatedDocumentId: documentId,
    action: "generation_requested",
    actorId: input.actorUserId,
    details: auditBase,
  });

  let generatedGoogleDocId = "";
  let pdfBuffer: Buffer;

  try {
    // Try copy-based flow first; fall back to in-place edit+revert if Drive quota is 0
    let usedInPlace = false;
    try {
      generatedGoogleDocId = await deps.google.copyTemplate(
        sourceDocId,
        `${template.name} — ${input.entityId}`
      );
      await deps.google.replacePlaceholders(generatedGoogleDocId, values);
      pdfBuffer = await deps.google.exportAsPdf(generatedGoogleDocId);
      await deps.google.deleteFile(generatedGoogleDocId);
    } catch (copyErr) {
      const isQuota = copyErr instanceof Error && /quota/i.test(copyErr.message);
      if (!isQuota) throw copyErr;

      // Drive quota exceeded — edit template in place, export, then revert
      if (generatedGoogleDocId) {
        await deps.google.deleteFile(generatedGoogleDocId).catch(() => {});
        generatedGoogleDocId = "";
      }
      pdfBuffer = await deps.google.fillExportRevert(sourceDocId, values);
      usedInPlace = true;
    }
    if (usedInPlace) generatedGoogleDocId = sourceDocId;
  } catch (e) {
    if (generatedGoogleDocId && generatedGoogleDocId !== sourceDocId) {
      await deps.google.deleteFile(generatedGoogleDocId).catch(() => {});
    }
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof DocumentGenerationError ? e.code : "INTERNAL_ERROR";
    await insertDocumentGenerationAuditLog(db, {
      id: crypto.randomUUID(),
      generatedDocumentId: documentId,
      action: "generation_failed",
      actorId: input.actorUserId,
      details: { ...auditBase, error: msg, code },
    });
    await db
      .update(generatedDocuments)
      .set({ status: "failed", metadata: { templateKey: input.templateKey, error: msg } })
      .where(eq(generatedDocuments.id, documentId));
    throw e;
  }

  const day = new Date().toISOString().slice(0, 10);
  const storageKey = `generated-docs/${input.activeCompanyId}/${template.key}/${input.entityId}/${day}/${documentId}.pdf`;
  const { url: fileUrl, key: filePath } = await storagePut(storageKey, pdfBuffer, "application/pdf");

  await db
    .update(generatedDocuments)
    .set({
      generatedGoogleDocId,
      fileUrl,
      filePath,
      status: "generated",
      metadata: {
        templateKey: input.templateKey,
        templateName: template.name,
      },
    })
    .where(eq(generatedDocuments.id, documentId));

  await insertDocumentGenerationAuditLog(db, {
    id: crypto.randomUUID(),
    generatedDocumentId: documentId,
    action: "generation_completed",
    actorId: input.actorUserId,
    details: {
      ...auditBase,
      generatedGoogleDocId,
      fileUrl,
      filePath,
      documentId,
    },
  });

  await db.insert(auditEvents).values({
    companyId: input.activeCompanyId,
    actorUserId: input.actorUserId,
    entityType: "generated_document",
    entityId: hashUuidToAuditEntityId(documentId),
    action: "document_generated",
    metadata: {
      templateKey: input.templateKey,
      entityType: template.entityType,
      entityId: input.entityId,
      documentId,
      filePath,
      outputFormat: input.outputFormat,
    },
  });

  return {
    documentId,
    fileUrl,
    filePath,
    generatedGoogleDocId,
    missingFields: [],
  };
}
