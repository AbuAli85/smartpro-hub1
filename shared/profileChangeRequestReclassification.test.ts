import { describe, expect, it } from "vitest";
import {
  PROFILE_CHANGE_RECLASSIFY_INVALIDATION,
  PROFILE_CHANGE_REQUEST_AUDIT_ACTION,
  PROFILE_CHANGE_REQUEST_AUDIT_ENTITY_TYPE,
  defaultReclassifyTargetKey,
  isValidReclassifyTargetFieldKey,
  reclassifyFieldKeyIsNoOp,
} from "./profileChangeRequestReclassification";

describe("profileChangeRequestReclassification", () => {
  it("exports stable audit constants", () => {
    expect(PROFILE_CHANGE_REQUEST_AUDIT_ENTITY_TYPE).toBe("profile_change_request");
    expect(PROFILE_CHANGE_REQUEST_AUDIT_ACTION).toBe("field_key_reclassified");
  });

  it("lists invalidation targets for client/server alignment", () => {
    expect(PROFILE_CHANGE_RECLASSIFY_INVALIDATION.listCompany).toContain("listCompany");
    expect(PROFILE_CHANGE_RECLASSIFY_INVALIDATION.queueKpis).toContain("queueKpis");
  });

  describe("isValidReclassifyTargetFieldKey", () => {
    it("accepts canonical keys", () => {
      expect(isValidReclassifyTargetFieldKey("other")).toBe(true);
      expect(isValidReclassifyTargetFieldKey("legal_name")).toBe(true);
    });
    it("rejects arbitrary strings", () => {
      expect(isValidReclassifyTargetFieldKey("custom")).toBe(false);
      expect(isValidReclassifyTargetFieldKey("")).toBe(false);
    });
  });

  describe("reclassifyFieldKeyIsNoOp", () => {
    it("detects identical keys (trimmed)", () => {
      expect(reclassifyFieldKeyIsNoOp("other", "other")).toBe(true);
      expect(reclassifyFieldKeyIsNoOp(" other ", "other")).toBe(true);
    });
    it("allows real changes", () => {
      expect(reclassifyFieldKeyIsNoOp("other", "legal_name")).toBe(false);
    });
  });

  describe("defaultReclassifyTargetKey", () => {
    it("picks a different canonical key than current when possible", () => {
      expect(defaultReclassifyTargetKey("other")).not.toBe("other");
      expect(defaultReclassifyTargetKey("legal_name")).not.toBe("legal_name");
    });
    it("treats unknown stored keys like other for defaulting", () => {
      const k = defaultReclassifyTargetKey("legacy_garbage");
      expect(k).not.toBe("other");
    });
  });
});
