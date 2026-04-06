import { describe, expect, it } from "vitest";
import type { DocumentTemplate } from "../../../drizzle/schema";
import { mergeGeneratedDocumentMetadata, pickResolvedTemplate } from "./documentGeneration.repository";

function tpl(partial: Partial<DocumentTemplate> & { id: string; companyId: number; status: string }): DocumentTemplate {
  return {
    key: "k",
    name: "N",
    category: "contract",
    entityType: "outsourcing_contract",
    documentSource: "google_docs",
    googleDocId: "g",
    language: "ar-en",
    version: 1,
    outputFormats: ["pdf"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as DocumentTemplate;
}

describe("pickResolvedTemplate", () => {
  it("prefers active company-specific over active platform", () => {
    const rows = [
      tpl({ id: "1", companyId: 0, status: "active" }),
      tpl({ id: "2", companyId: 42, status: "active" }),
    ];
    expect(pickResolvedTemplate(rows, 42)?.id).toBe("2");
  });

  it("does not let draft company template shadow active platform", () => {
    const rows = [
      tpl({ id: "1", companyId: 0, status: "active" }),
      tpl({ id: "2", companyId: 42, status: "draft" }),
    ];
    expect(pickResolvedTemplate(rows, 42)?.id).toBe("1");
  });

  it("returns null when only inactive or draft templates exist", () => {
    const rows = [
      tpl({ id: "1", companyId: 0, status: "draft" }),
      tpl({ id: "2", companyId: 42, status: "draft" }),
    ];
    expect(pickResolvedTemplate(rows, 42)).toBeNull();
  });
});

describe("mergeGeneratedDocumentMetadata", () => {
  it("merges shallow without dropping prior keys", () => {
    const a = mergeGeneratedDocumentMetadata({ a: 1, stage: "requested" }, { stage: "failed", err: "x" });
    expect(a).toEqual({ a: 1, stage: "failed", err: "x" });
  });

  it("treats null existing as empty object", () => {
    expect(mergeGeneratedDocumentMetadata(null, { x: true })).toEqual({ x: true });
  });
});
