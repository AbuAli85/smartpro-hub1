import { describe, expect, it } from "vitest";
import { DocumentGenerationError } from "./documentGeneration.types";
import {
  assertOutputFormatAllowed,
  assertRequiredPlaceholdersResolved,
  assertTemplateActive,
} from "./templateValidation";
import type { DocumentTemplate } from "../../../drizzle/schema";

function tpl(partial: Partial<DocumentTemplate>): DocumentTemplate {
  return {
    id: "t1",
    companyId: 0,
    key: "k",
    name: "n",
    category: "c",
    entityType: "promoter_assignment",
    documentSource: "google_docs",
    googleDocId: "gid",
    language: "en",
    version: 1,
    status: "active",
    outputFormats: ["pdf"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as DocumentTemplate;
}

describe("templateValidation", () => {
  it("assertTemplateActive throws for non-active", () => {
    expect(() => assertTemplateActive(tpl({ status: "draft" }))).toThrow(DocumentGenerationError);
    expect(() => assertTemplateActive(tpl({ status: "active" }))).not.toThrow();
  });

  it("assertOutputFormatAllowed checks json list", () => {
    expect(() => assertOutputFormatAllowed(tpl({ outputFormats: ["pdf"] }), "pdf")).not.toThrow();
    expect(() => assertOutputFormatAllowed(tpl({ outputFormats: ["pdf"] }), "docx")).toThrow(
      DocumentGenerationError
    );
  });

  it("assertRequiredPlaceholdersResolved lists missing", () => {
    expect(() => assertRequiredPlaceholdersResolved(["a", "b"])).toThrow(DocumentGenerationError);
    try {
      assertRequiredPlaceholdersResolved(["x"]);
    } catch (e) {
      expect(e).toBeInstanceOf(DocumentGenerationError);
      expect((e as DocumentGenerationError).missingPlaceholders).toEqual(["x"]);
    }
    expect(() => assertRequiredPlaceholdersResolved([])).not.toThrow();
  });
});
