import { eq } from "drizzle-orm";
import { auditEvents, generatedDocuments } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { storagePut } from "../../storage";
import { canAccessGlobalAdminProcedures } from "@shared/rbac";
import {
  abandonStaleInFlightGenerations,
  findLatestGenerationByFingerprint,
  findTemplateByKeyForCompany,
  finalizeGeneratedDocumentSuccess,
  insertDocumentGenerationAuditLog,
  insertGeneratedDocument,
  listInFlightGenerationsForFingerprint,
  listPlaceholdersForTemplate,
  mergeGeneratedDocumentMetadata,
  updateGeneratedDocumentMergedMetadata,
  type GenerationFingerprint,
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

/** Rows stuck in pending/processing longer than this are abandoned before a new run. */
const STALE_IN_FLIGHT_MS = 20 * 60 * 1000;
/** Return existing successful PDF without calling Google when younger than this and `regenerate` is false. */
const CACHE_GENERATED_MAX_MS = 24 * 60 * 60 * 1000;

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

type ContextBuilderFn = (
  db: AppDb,
  entityId: string,
  activeCompanyId: number,
  isPlatformAdmin: boolean,
  user: GenerateDocumentInput["user"]
) => Promise<Record<string, unknown>>;

const entityContextBuilders: Record<string, ContextBuilderFn> = {
  promoter_assignment: async (db, entityId, activeCompanyId, _isPlatformAdmin, user) => {
    const ctx = await buildPromoterAssignmentDocumentContext(db, entityId, activeCompanyId, user);
    return ctx as unknown as Record<string, unknown>;
  },
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

/** Avoid duplicate `generation_failed` rows when an inner catch already persisted failure. */
const generationFailureAlreadyPersisted = new WeakSet<object>();

async function recordGenerationFailure(
  db: AppDb,
  params: {
    documentId: string;
    actorUserId: number;
    auditBase: Record<string, unknown>;
    failedStage: string;
    err: unknown;
    code: string;
  }
): Promise<void> {
  const msg = params.err instanceof Error ? params.err.message : String(params.err);
  await insertDocumentGenerationAuditLog(db, {
    id: crypto.randomUUID(),
    generatedDocumentId: params.documentId,
    action: "generation_failed",
    actorId: params.actorUserId,
    details: {
      ...params.auditBase,
      failedStage: params.failedStage,
      error: msg,
      code: params.code,
    },
  });
  await updateGeneratedDocumentMergedMetadata(
    db,
    params.documentId,
    {
      failedStage: params.failedStage,
      failedAt: new Date().toISOString(),
      lastError: msg,
      failureCode: params.code,
      stage: "failed",
    },
    { status: "failed" }
  );
  if (typeof params.err === "object" && params.err !== null) {
    generationFailureAlreadyPersisted.add(params.err as object);
  }
}

/** Resolve concurrent inserts: keep oldest in-flight row; abandon the rest. */
async function resolveConcurrentInFlightLosers(
  db: AppDb,
  fingerprint: GenerationFingerprint,
  documentId: string
): Promise<void> {
  const inflight = await listInFlightGenerationsForFingerprint(db, fingerprint);
  if (inflight.length <= 1) return;

  const sorted = [...inflight].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const winnerId = sorted[0]!.id;
  const nowIso = new Date().toISOString();

  for (const row of sorted) {
    if (row.id === winnerId) continue;
    await db
      .update(generatedDocuments)
      .set({
        status: "abandoned",
        metadata: mergeGeneratedDocumentMetadata(row.metadata as Record<string, unknown> | null, {
          abandonedAt: nowIso,
          abandonedReason: "concurrent_generation_lost_race",
        }),
      })
      .where(eq(generatedDocuments.id, row.id));

    await insertDocumentGenerationAuditLog(db, {
      id: crypto.randomUUID(),
      generatedDocumentId: row.id,
      action: "generation_abandoned_concurrent",
      actorId: null,
      details: { fingerprint, winnerId },
    });
  }

  if (documentId !== winnerId) {
    throw new DocumentGenerationError(
      "CONFLICT",
      "Another document generation was started for this entity. Wait for it to finish or enable regenerate."
    );
  }
}

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

  const template = await findTemplateByKeyForCompany(db, input.templateKey, input.activeCompanyId);
  if (!template) {
    throw new DocumentGenerationError("NOT_FOUND", `Document template "${input.templateKey}" not found`);
  }

  assertTemplateActive(template);
  assertOutputFormatAllowed(template, input.outputFormat);

  const fingerprint: GenerationFingerprint = {
    companyId: input.activeCompanyId,
    templateId: template.id,
    entityType: template.entityType,
    entityId: input.entityId,
    outputFormat: input.outputFormat,
  };

  await abandonStaleInFlightGenerations(db, fingerprint, new Date(Date.now() - STALE_IN_FLIGHT_MS));

  const latestAfterAbandon = await findLatestGenerationByFingerprint(db, fingerprint);
  if (
    latestAfterAbandon &&
    (latestAfterAbandon.status === "pending" || latestAfterAbandon.status === "processing")
  ) {
    const ageMs = Date.now() - new Date(latestAfterAbandon.createdAt).getTime();
    if (ageMs < STALE_IN_FLIGHT_MS) {
      throw new DocumentGenerationError(
        "CONFLICT",
        "Document generation is already in progress for this entity. Try again shortly, or use regenerate after it completes."
      );
    }
  }

  const regenerate = input.regenerate === true;
  if (
    latestAfterAbandon?.status === "generated" &&
    latestAfterAbandon.fileUrl &&
    !regenerate
  ) {
    const ageMs = Date.now() - new Date(latestAfterAbandon.createdAt).getTime();
    if (ageMs <= CACHE_GENERATED_MAX_MS) {
      return {
        documentId: latestAfterAbandon.id,
        fileUrl: latestAfterAbandon.fileUrl,
        filePath: latestAfterAbandon.filePath ?? "",
        generatedGoogleDocId: latestAfterAbandon.generatedGoogleDocId ?? "",
        missingFields: [],
        fromCache: true,
      };
    }
  }

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

  const sourceDocId = template.googleDocId;
  if (!sourceDocId) {
    throw new DocumentGenerationError("INTERNAL_ERROR", "Template has no google_doc_id configured");
  }

  const requestedAt = new Date().toISOString();
  const auditBase: Record<string, unknown> = {
    templateKey: input.templateKey,
    templateId: template.id,
    entityId: input.entityId,
    entityType: template.entityType,
    tenantId: input.activeCompanyId,
    outputFormat: input.outputFormat,
    sourceGoogleDocId: sourceDocId,
  };

  const provenanceSnapshot: Record<string, unknown> = {
    templateKey: input.templateKey,
    templateName: template.name,
    templateVersion: template.version,
    templateLanguage: template.language,
    sourceGoogleDocId: sourceDocId,
    entityType: template.entityType,
    entityId: input.entityId,
    actorUserId: input.actorUserId,
    membershipRole: input.membershipRole,
    generationRequestedAt: requestedAt,
    resolvedPlaceholders: values,
    stage: "requested",
  };

  const documentId = crypto.randomUUID();

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
    metadata: mergeGeneratedDocumentMetadata(null, provenanceSnapshot),
  });

  await insertDocumentGenerationAuditLog(db, {
    id: crypto.randomUUID(),
    generatedDocumentId: documentId,
    action: "generation_requested",
    actorId: input.actorUserId,
    details: { ...auditBase, generationRequestedAt: requestedAt },
  });

  await resolveConcurrentInFlightLosers(db, fingerprint, documentId);

  await updateGeneratedDocumentMergedMetadata(
    db,
    documentId,
    { stage: "copy_template", copyStartedAt: new Date().toISOString() },
    { status: "processing" }
  );

  let generatedGoogleDocId = "";
  let pdfBuffer: Buffer;
  let lastStage = "copy_template";

  try {
    let usedInPlace = false;
    try {
      lastStage = "copy_template";
      generatedGoogleDocId = await deps.google.copyTemplate(
        sourceDocId,
        `${template.name} — ${input.entityId}`
      );
      await updateGeneratedDocumentMergedMetadata(db, documentId, {
        stage: "replace_placeholders",
        generatedGoogleDocId,
      });

      lastStage = "replace_placeholders";
      await deps.google.replacePlaceholders(generatedGoogleDocId, values);

      await updateGeneratedDocumentMergedMetadata(db, documentId, { stage: "export_pdf" });
      lastStage = "export_pdf";
      pdfBuffer = await deps.google.exportAsPdf(generatedGoogleDocId);

      await deps.google.deleteFile(generatedGoogleDocId).catch(() => {});
    } catch (copyErr) {
      const isQuota = copyErr instanceof Error && /quota/i.test(copyErr.message);
      if (!isQuota) throw copyErr;

      if (generatedGoogleDocId) {
        await deps.google.deleteFile(generatedGoogleDocId).catch(() => {});
        generatedGoogleDocId = "";
      }
      await updateGeneratedDocumentMergedMetadata(db, documentId, {
        stage: "export_pdf_in_place_fallback",
        note: "drive_quota_copy_fallback",
      });
      lastStage = "export_pdf_in_place_fallback";
      pdfBuffer = await deps.google.fillExportRevert(sourceDocId, values);
      usedInPlace = true;
    }
    if (usedInPlace) generatedGoogleDocId = sourceDocId;

    await updateGeneratedDocumentMergedMetadata(db, documentId, {
      stage: "upload_storage",
      uploadStartedAt: new Date().toISOString(),
    });
    lastStage = "upload_storage";

    const day = new Date().toISOString().slice(0, 10);
    const storageKey = `generated-docs/${input.activeCompanyId}/${template.key}/${input.entityId}/${day}/${documentId}.pdf`;
    let fileUrl: string;
    let filePath: string;
    try {
      const put = await storagePut(storageKey, pdfBuffer, "application/pdf");
      fileUrl = put.url;
      filePath = put.key;
    } catch (uploadErr) {
      await recordGenerationFailure(db, {
        documentId,
        actorUserId: input.actorUserId,
        auditBase,
        failedStage: "upload_storage",
        err: uploadErr,
        code: "STORAGE_ERROR",
      });
      throw uploadErr instanceof Error ? uploadErr : new Error(String(uploadErr));
    }

    const completedAt = new Date().toISOString();
    await finalizeGeneratedDocumentSuccess(db, documentId, {
      generatedGoogleDocId,
      fileUrl,
      filePath,
      completionMeta: {
        ...provenanceSnapshot,
        fileUrl,
        filePath,
        usedInPlaceFallback: usedInPlace,
        completedAt,
      },
    });

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
        completedAt,
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
      fromCache: false,
    };
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      generationFailureAlreadyPersisted.has(e as object)
    ) {
      throw e;
    }

    if (generatedGoogleDocId && generatedGoogleDocId !== sourceDocId) {
      await deps.google.deleteFile(generatedGoogleDocId).catch(() => {});
    }
    const code = e instanceof DocumentGenerationError ? e.code : "INTERNAL_ERROR";

    const [rowState] = await db
      .select({ status: generatedDocuments.status })
      .from(generatedDocuments)
      .where(eq(generatedDocuments.id, documentId))
      .limit(1);
    if (rowState?.status !== "failed" && rowState?.status !== "abandoned") {
      await recordGenerationFailure(db, {
        documentId,
        actorUserId: input.actorUserId,
        auditBase,
        failedStage: lastStage,
        err: e,
        code,
      });
    }

    throw e;
  }
}
