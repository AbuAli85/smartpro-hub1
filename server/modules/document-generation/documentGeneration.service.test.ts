import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvents, documentGenerationAuditLogs, generatedDocuments } from "../../../drizzle/schema";
import type { User } from "../../../drizzle/schema";
import * as repo from "./documentGeneration.repository";
import * as contextMod from "./promoterAssignmentContext";
import { DocumentGenerationError } from "./documentGeneration.types";
import { generateDocument, type GenerateDocumentDeps } from "./documentGeneration.service";

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storagePut: vi.fn(),
}));

import { getDb } from "../../db";
import { storagePut } from "../../storage";

const user = {
  id: 1,
  openId: "o1",
  email: "a@b.c",
  name: "U",
  loginMethod: "manus",
  role: "user" as const,
  platformRole: "company_admin" as const,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
} satisfies User;

const assignmentId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const templateRow = {
  id: "tpl-uuid",
  companyId: 0,
  key: "promoter_assignment_contract_bilingual",
  name: "T",
  category: "contract",
  entityType: "promoter_assignment",
  documentSource: "google_docs",
  googleDocId: "source-doc",
  language: "ar-en",
  version: 1,
  status: "active",
  outputFormats: ["pdf"] as string[],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const placeholderRowsFull = [
  { placeholder: "location_en", sourcePath: "assignment.location_en", dataType: "string", required: true, defaultValue: null },
];

const contextRoot = {
  first_party: { company_name_ar: "أ", company_name_en: "A", cr_number: "1" },
  second_party: { company_name_ar: "ب", company_name_en: "B", cr_number: "2" },
  promoter: { full_name_ar: "ج", full_name_en: "J D", id_card_number: "99" },
  assignment: { location_ar: "L1", location_en: "L2", start_date: "2026-01-01", end_date: "2026-06-30" },
};

function setupRepoSpiesForHappyPath() {
  vi.spyOn(repo, "abandonStaleInFlightGenerations").mockResolvedValue();
  vi.spyOn(repo, "findLatestGenerationByFingerprint").mockResolvedValue(null);
  vi.spyOn(repo, "listInFlightGenerationsForFingerprint").mockResolvedValue([]);
  vi.spyOn(repo, "updateGeneratedDocumentMergedMetadata").mockResolvedValue();
  vi.spyOn(repo, "finalizeGeneratedDocumentSuccess").mockResolvedValue();
}

describe("generateDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(repo, "seedDocumentGenerationBootstrap").mockResolvedValue();
    vi.mocked(storagePut).mockResolvedValue({ key: "k", url: "https://u" });
    vi.spyOn(repo, "findTemplateByKeyForCompany").mockResolvedValue(templateRow as never);
    vi.spyOn(repo, "listPlaceholdersForTemplate").mockResolvedValue(placeholderRowsFull as never);
    vi.spyOn(contextMod, "buildPromoterAssignmentDocumentContext").mockResolvedValue(
      contextRoot as never
    );
    setupRepoSpiesForHappyPath();
  });

  it("happy path with mocked Google and storage (no runtime bootstrap)", async () => {
    const insertRecords: { table: unknown; values: Record<string, unknown> }[] = [];
    const db = {
      insert: vi.fn((table: object) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertRecords.push({ table, values });
          return Promise.resolve();
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ status: "processing" }])),
          })),
        })),
      })),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn().mockResolvedValue("new-doc-id"),
      replacePlaceholders: vi.fn().mockResolvedValue(),
      exportAsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF")),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      fillExportRevert: vi.fn().mockResolvedValue(Buffer.from("%PDF")),
    };

    const res = await generateDocument(
      {
        templateKey: "promoter_assignment_contract_bilingual",
        entityId: assignmentId,
        outputFormat: "pdf",
        actorUserId: 1,
        user,
        activeCompanyId: 1,
        membershipRole: "hr_admin",
      },
      { google }
    );

    expect(res.fileUrl).toBe("https://u");
    expect(res.generatedGoogleDocId).toBe("new-doc-id");
    expect(res.fromCache).toBe(false);
    expect(google.copyTemplate).toHaveBeenCalled();
    expect(storagePut).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledWith(auditEvents);
    expect(insertRecords.some((r) => r.table === auditEvents)).toBe(true);

    const gdInsert = insertRecords.find((r) => r.table === generatedDocuments);
    expect(gdInsert).toBeDefined();
    const meta = gdInsert?.values.metadata as Record<string, unknown>;
    expect(meta.templateKey).toBe("promoter_assignment_contract_bilingual");
    expect(meta.templateVersion).toBe(1);
    expect(meta.membershipRole).toBe("hr_admin");
    expect(meta.resolvedPlaceholders).toBeDefined();
    expect(repo.seedDocumentGenerationBootstrap).not.toHaveBeenCalled();
  });

  it("does not call runtime bootstrap", async () => {
    vi.spyOn(repo, "seedDocumentGenerationBootstrap");
    const db = {
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([{ status: "processing" }])) })),
        })),
      })),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);
    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn().mockResolvedValue("x"),
      replacePlaceholders: vi.fn().mockResolvedValue(),
      exportAsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF")),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      fillExportRevert: vi.fn().mockResolvedValue(Buffer.from("%PDF")),
    };
    await generateDocument(
      {
        templateKey: "promoter_assignment_contract_bilingual",
        entityId: assignmentId,
        outputFormat: "pdf",
        actorUserId: 1,
        user,
        activeCompanyId: 1,
        membershipRole: "hr_admin",
      },
      { google }
    );
    expect(repo.seedDocumentGenerationBootstrap).not.toHaveBeenCalled();
  });

  it("returns cached PDF when a recent generated row exists and regenerate is false", async () => {
    vi.spyOn(repo, "findLatestGenerationByFingerprint").mockResolvedValue({
      id: "cached-id",
      status: "generated",
      fileUrl: "https://cached",
      filePath: "cached-key",
      generatedGoogleDocId: "gdoc",
      createdAt: new Date(),
    } as never);

    const db = {
      insert: vi.fn(),
      update: vi.fn(),
      select: vi.fn(),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn(),
      replacePlaceholders: vi.fn(),
      exportAsPdf: vi.fn(),
      deleteFile: vi.fn(),
      fillExportRevert: vi.fn(),
    };

    const res = await generateDocument(
      {
        templateKey: "promoter_assignment_contract_bilingual",
        entityId: assignmentId,
        outputFormat: "pdf",
        actorUserId: 1,
        user,
        activeCompanyId: 1,
        membershipRole: "hr_admin",
        regenerate: false,
      },
      { google }
    );

    expect(res.fromCache).toBe(true);
    expect(res.documentId).toBe("cached-id");
    expect(res.fileUrl).toBe("https://cached");
    expect(google.copyTemplate).not.toHaveBeenCalled();
  });

  it("throws CONFLICT when an in-flight generation exists", async () => {
    vi.spyOn(repo, "findLatestGenerationByFingerprint").mockResolvedValue({
      id: "inflight",
      status: "processing",
      createdAt: new Date(),
    } as never);

    const db = { insert: vi.fn(), update: vi.fn(), select: vi.fn() };
    vi.mocked(getDb).mockResolvedValue(db as never);

    await expect(
      generateDocument(
        {
          templateKey: "promoter_assignment_contract_bilingual",
          entityId: assignmentId,
          outputFormat: "pdf",
          actorUserId: 1,
          user,
          activeCompanyId: 1,
          membershipRole: "hr_admin",
        },
        { google: {} as GenerateDocumentDeps["google"] }
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("fails when placeholder data missing", async () => {
    vi.spyOn(repo, "listPlaceholdersForTemplate").mockResolvedValue([
      {
        placeholder: "x",
        sourcePath: "nope.missing",
        dataType: "string",
        required: true,
        defaultValue: null,
      },
    ] as never);

    const db = {
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn(),
      replacePlaceholders: vi.fn(),
      exportAsPdf: vi.fn(),
      deleteFile: vi.fn(),
      fillExportRevert: vi.fn(),
    };

    await expect(
      generateDocument(
        {
          templateKey: "promoter_assignment_contract_bilingual",
          entityId: assignmentId,
          outputFormat: "pdf",
          actorUserId: 1,
          user,
          activeCompanyId: 1,
          membershipRole: "company_admin",
        },
        { google }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(google.copyTemplate).not.toHaveBeenCalled();
  });

  it("fails when entity not in tenant scope", async () => {
    vi.spyOn(contextMod, "buildPromoterAssignmentDocumentContext").mockRejectedValue(
      new DocumentGenerationError("NOT_FOUND", "Promoter assignment not found")
    );

    const db = {
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve()) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn(),
      replacePlaceholders: vi.fn(),
      exportAsPdf: vi.fn(),
      deleteFile: vi.fn(),
      fillExportRevert: vi.fn(),
    };

    await expect(
      generateDocument(
        {
          templateKey: "promoter_assignment_contract_bilingual",
          entityId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          outputFormat: "pdf",
          actorUserId: 1,
          user,
          activeCompanyId: 1,
          membershipRole: "company_admin",
        },
        { google }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("falls back to fillExportRevert when copy fails with quota error", async () => {
    const insertRecords: { table: unknown; values: Record<string, unknown> }[] = [];
    const db = {
      insert: vi.fn((table: object) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertRecords.push({ table, values });
          return Promise.resolve();
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ status: "processing" }])),
          })),
        })),
      })),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn().mockRejectedValue(new Error("Drive storage quota has been exceeded")),
      replacePlaceholders: vi.fn(),
      exportAsPdf: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      fillExportRevert: vi.fn().mockResolvedValue(Buffer.from("%PDF-fallback")),
    };

    const res = await generateDocument(
      {
        templateKey: "promoter_assignment_contract_bilingual",
        entityId: assignmentId,
        outputFormat: "pdf",
        actorUserId: 1,
        user,
        activeCompanyId: 1,
        membershipRole: "hr_admin",
      },
      { google }
    );

    expect(res.fileUrl).toBe("https://u");
    expect(google.fillExportRevert).toHaveBeenCalled();
    expect(google.replacePlaceholders).not.toHaveBeenCalled();
    expect(storagePut).toHaveBeenCalled();
  });

  it("records generation_failed with failedStage when Google throws", async () => {
    const insertRecords: { table: unknown; values: Record<string, unknown> }[] = [];
    const mergeSpy = vi.spyOn(repo, "updateGeneratedDocumentMergedMetadata").mockResolvedValue();
    const db = {
      insert: vi.fn((table: object) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertRecords.push({ table, values });
          return Promise.resolve();
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ status: "processing" }])),
          })),
        })),
      })),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn().mockRejectedValue(new Error("API down")),
      replacePlaceholders: vi.fn(),
      exportAsPdf: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      fillExportRevert: vi.fn(),
    };

    await expect(
      generateDocument(
        {
          templateKey: "promoter_assignment_contract_bilingual",
          entityId: assignmentId,
          outputFormat: "pdf",
          actorUserId: 1,
          user,
          activeCompanyId: 1,
          membershipRole: "hr_admin",
        },
        { google }
      )
    ).rejects.toThrow();

    const failed = insertRecords.find(
      (r) => r.table === documentGenerationAuditLogs && r.values.action === "generation_failed"
    );
    expect(failed).toBeDefined();
    expect((failed?.values.details as Record<string, unknown>)?.failedStage).toBe("copy_template");

    const failedMerge = mergeSpy.mock.calls.find((c) => (c[2] as Record<string, unknown>)?.stage === "failed");
    expect(failedMerge).toBeDefined();
  });

  it("records storage failure with upload_storage stage", async () => {
    const insertRecords: { table: unknown; values: Record<string, unknown> }[] = [];
    vi.mocked(storagePut).mockRejectedValue(new Error("upload failed"));
    const mergeSpy = vi.spyOn(repo, "updateGeneratedDocumentMergedMetadata").mockResolvedValue();

    const db = {
      insert: vi.fn((table: object) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          insertRecords.push({ table, values });
          return Promise.resolve();
        }),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ status: "processing" }])),
          })),
        })),
      })),
    };
    vi.mocked(getDb).mockResolvedValue(db as never);

    const google: GenerateDocumentDeps["google"] = {
      copyTemplate: vi.fn().mockResolvedValue("new-doc-id"),
      replacePlaceholders: vi.fn().mockResolvedValue(),
      exportAsPdf: vi.fn().mockResolvedValue(Buffer.from("%PDF")),
      deleteFile: vi.fn().mockResolvedValue(undefined),
      fillExportRevert: vi.fn(),
    };

    await expect(
      generateDocument(
        {
          templateKey: "promoter_assignment_contract_bilingual",
          entityId: assignmentId,
          outputFormat: "pdf",
          actorUserId: 1,
          user,
          activeCompanyId: 1,
          membershipRole: "hr_admin",
        },
        { google }
      )
    ).rejects.toThrow();

    const failed = insertRecords.find(
      (r) => r.table === documentGenerationAuditLogs && r.values.action === "generation_failed"
    );
    expect((failed?.values.details as Record<string, unknown>)?.failedStage).toBe("upload_storage");

    expect(mergeSpy.mock.calls.some((c) => (c[2] as Record<string, unknown>)?.failedStage === "upload_storage")).toBe(
      true
    );
  });
});
