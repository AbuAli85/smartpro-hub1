import { describe, expect, it } from "vitest";
import {
  effectiveProfileFieldKeyForIdentity,
  isPendingDuplicateProfileRequest,
  isProfileFieldKey,
  OTHER_PROFILE_FIELD_KEY,
  resolveProfileFieldKeyFromLabel,
} from "./profileChangeRequestFieldKey";
import { normalizeProfileFieldLabelForKey } from "./profileChangeRequestFieldLabel";

describe("resolveProfileFieldKeyFromLabel", () => {
  it("maps employment and bank hints from the profile UI", () => {
    expect(resolveProfileFieldKeyFromLabel("employment details")).toBe("employment_details");
    expect(resolveProfileFieldKeyFromLabel("bank details for payroll")).toBe("bank_details");
  });

  it("maps common HR field phrases", () => {
    expect(resolveProfileFieldKeyFromLabel("Legal name")).toBe("legal_name");
    expect(resolveProfileFieldKeyFromLabel("Phone")).toBe("contact_phone");
    expect(resolveProfileFieldKeyFromLabel("Emergency contact name")).toBe("emergency_contact");
    expect(resolveProfileFieldKeyFromLabel("Nationality")).toBe("nationality");
    expect(resolveProfileFieldKeyFromLabel("Date of birth")).toBe("date_of_birth");
  });

  it("returns other for unclassified free text", () => {
    expect(resolveProfileFieldKeyFromLabel("Something custom")).toBe(OTHER_PROFILE_FIELD_KEY);
  });
});

describe("effectiveProfileFieldKeyForIdentity", () => {
  it("uses stored non-other fieldKey", () => {
    expect(
      effectiveProfileFieldKeyForIdentity({ fieldKey: "legal_name", fieldLabel: "Anything" }),
    ).toBe("legal_name");
  });

  it("infers from label when stored key is other", () => {
    expect(
      effectiveProfileFieldKeyForIdentity({ fieldKey: "other", fieldLabel: "Department" }),
    ).toBe("employment_details");
  });
});

describe("isPendingDuplicateProfileRequest", () => {
  it("detects duplicate canonical fields", () => {
    const incoming = normalizeProfileFieldLabelForKey("Legal name");
    expect(
      isPendingDuplicateProfileRequest("legal_name", incoming, {
        fieldKey: "legal_name",
        fieldLabel: "Legal name (EN)",
      }),
    ).toBe(true);
  });

  it("matches legacy other + label to resolved legal_name", () => {
    expect(
      isPendingDuplicateProfileRequest("legal_name", normalizeProfileFieldLabelForKey("Legal name"), {
        fieldKey: "other",
        fieldLabel: "Legal name",
      }),
    ).toBe(true);
  });

  it("uses label identity for other", () => {
    const norm = normalizeProfileFieldLabelForKey("Custom field");
    expect(
      isPendingDuplicateProfileRequest(OTHER_PROFILE_FIELD_KEY, norm, {
        fieldKey: "other",
        fieldLabel: "Custom field",
      }),
    ).toBe(true);
    expect(
      isPendingDuplicateProfileRequest(OTHER_PROFILE_FIELD_KEY, norm, {
        fieldKey: "other",
        fieldLabel: "Different custom field",
      }),
    ).toBe(false);
  });
});

describe("isProfileFieldKey", () => {
  it("accepts known keys only", () => {
    expect(isProfileFieldKey("legal_name")).toBe(true);
    expect(isProfileFieldKey("not_a_key")).toBe(false);
  });
});
