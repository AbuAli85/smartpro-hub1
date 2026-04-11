import { describe, expect, it } from "vitest";
import {
  deriveProfileBooleans,
  formatEmploymentType,
  computeProfileCompleteness,
  computeProfileAlerts,
  computeProfileReminderText,
  getProfileDocFields,
  hasAnyExpiringDocField,
  type ProfileEmpData,
} from "./employeeProfileUtils";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEmp(overrides: Partial<ProfileEmpData> = {}): ProfileEmpData {
  return {
    id: 1,
    firstName: "Jane",
    lastName: "Doe",
    ...overrides,
  };
}

const FUTURE_DATE = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
const EXPIRING_DATE = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
const EXPIRED_DATE = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);

// ─── deriveProfileBooleans ────────────────────────────────────────────────────

describe("deriveProfileBooleans", () => {
  it("fullName: joins first + last name", () => {
    const r = deriveProfileBooleans(makeEmp({ firstName: "John", lastName: "Smith" }));
    expect(r.fullName).toBe("John Smith");
  });

  it("fullName: falls back to 'Employee' when both names are null", () => {
    const r = deriveProfileBooleans(makeEmp({ firstName: null, lastName: null }));
    expect(r.fullName).toBe("Employee");
  });

  it("arabicFullName: is null when neither Arabic name field is set", () => {
    const r = deriveProfileBooleans(makeEmp());
    expect(r.arabicFullName).toBeNull();
  });

  it("arabicFullName: joins Arabic name fields when present", () => {
    const r = deriveProfileBooleans(makeEmp({ firstNameAr: "جون", lastNameAr: "سميث" }));
    expect(r.arabicFullName).toBe("جون سميث");
  });

  it("payrollReady: false when no bank details present", () => {
    const r = deriveProfileBooleans(makeEmp());
    expect(r.payrollReady).toBe(false);
  });

  it("payrollReady: true when bankName is set", () => {
    const r = deriveProfileBooleans(makeEmp({ bankName: "Muscat Bank" }));
    expect(r.payrollReady).toBe(true);
  });

  it("payrollReady: true when only bankAccountNumber is set", () => {
    const r = deriveProfileBooleans(makeEmp({ bankAccountNumber: "123456789" }));
    expect(r.payrollReady).toBe(true);
  });

  it("hasPhone: false when phone is null", () => {
    expect(deriveProfileBooleans(makeEmp({ phone: null })).hasPhone).toBe(false);
  });

  it("hasPhone: false when phone is whitespace-only", () => {
    expect(deriveProfileBooleans(makeEmp({ phone: "   " })).hasPhone).toBe(false);
  });

  it("hasPhone: true when phone has content", () => {
    expect(deriveProfileBooleans(makeEmp({ phone: "+968 1234 5678" })).hasPhone).toBe(true);
  });

  it("hasEmergencyContact: true with either name or phone", () => {
    expect(
      deriveProfileBooleans(makeEmp({ emergencyContactName: "Alice" })).hasEmergencyContact,
    ).toBe(true);
  });

  it("hasEmergencyContactFull: only true when both name AND phone are set", () => {
    const partial = deriveProfileBooleans(makeEmp({ emergencyContactName: "Alice" }));
    const full = deriveProfileBooleans(
      makeEmp({ emergencyContactName: "Alice", emergencyContactPhone: "+1 555 0000" }),
    );
    expect(partial.hasEmergencyContactFull).toBe(false);
    expect(full.hasEmergencyContactFull).toBe(true);
  });
});

// ─── formatEmploymentType ────────────────────────────────────────────────────

describe("formatEmploymentType", () => {
  it("returns null for falsy input", () => {
    expect(formatEmploymentType(null)).toBeNull();
    expect(formatEmploymentType(undefined)).toBeNull();
    expect(formatEmploymentType("")).toBeNull();
  });

  it("replaces underscores and title-cases each word", () => {
    expect(formatEmploymentType("full_time")).toBe("Full Time");
    expect(formatEmploymentType("part_time")).toBe("Part Time");
    expect(formatEmploymentType("contract")).toBe("Contract");
    expect(formatEmploymentType("intern")).toBe("Intern");
  });
});

// ─── computeProfileCompleteness ──────────────────────────────────────────────

describe("computeProfileCompleteness", () => {
  it("score is 0 when all fields are missing and no documents", () => {
    const r = computeProfileCompleteness(makeEmp(), { hasDocuments: false });
    expect(r.score).toBe(0);
    expect(r.total).toBe(4);
    expect(r.percent).toBe(0);
    expect(r.status).toBe("incomplete");
  });

  it("score is 4 when all fields are filled", () => {
    const emp = makeEmp({
      phone: "+1 555 0000",
      emergencyContactName: "Alice",
      emergencyContactPhone: "+1 555 0001",
      bankName: "Muscat Bank",
    });
    const r = computeProfileCompleteness(emp, { hasDocuments: true });
    expect(r.score).toBe(4);
    expect(r.percent).toBe(100);
    expect(r.status).toBe("complete");
  });

  it("status is 'good' when 3 out of 4 fields are filled", () => {
    const emp = makeEmp({
      phone: "+1 555 0000",
      emergencyContactName: "Alice",
      emergencyContactPhone: "+1 555 0001",
      bankName: "Muscat Bank",
    });
    const r = computeProfileCompleteness(emp, { hasDocuments: false });
    expect(r.score).toBe(3);
    expect(r.status).toBe("good");
  });

  it("emergency_contact item is done only when BOTH name and phone are provided", () => {
    const onlyName = computeProfileCompleteness(
      makeEmp({ emergencyContactName: "Alice" }),
      { hasDocuments: false },
    );
    const both = computeProfileCompleteness(
      makeEmp({ emergencyContactName: "Alice", emergencyContactPhone: "+968 99999999" }),
      { hasDocuments: false },
    );
    expect(onlyName.items.find((i) => i.key === "emergency_contact")!.done).toBe(false);
    expect(both.items.find((i) => i.key === "emergency_contact")!.done).toBe(true);
  });

  it("managedBy is correct for each item", () => {
    const r = computeProfileCompleteness(makeEmp(), { hasDocuments: false });
    const byKey = Object.fromEntries(r.items.map((i) => [i.key, i.managedBy]));
    expect(byKey.phone).toBe("employee");
    expect(byKey.emergency_contact).toBe("employee");
    expect(byKey.bank).toBe("hr");
    expect(byKey.documents).toBe("hr");
  });
});

// ─── computeProfileAlerts ────────────────────────────────────────────────────

describe("computeProfileAlerts", () => {
  it("returns no alerts when all conditions are met", () => {
    const alerts = computeProfileAlerts(makeEmp(), {
      payrollReady: true,
      hasPhone: true,
      hasEmergencyContact: true,
      expiringDocsCount: 0,
    });
    expect(alerts).toHaveLength(0);
  });

  it("returns bank alert when payroll is not ready", () => {
    const alerts = computeProfileAlerts(makeEmp(), {
      payrollReady: false,
      hasPhone: true,
      hasEmergencyContact: true,
      expiringDocsCount: 0,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toBe("bank");
    expect(alerts[0].severity).toBe("warn");
  });

  it("returns phone and emergency alerts when missing", () => {
    const alerts = computeProfileAlerts(makeEmp(), {
      payrollReady: true,
      hasPhone: false,
      hasEmergencyContact: false,
      expiringDocsCount: 0,
    });
    expect(alerts.map((a) => a.key)).toEqual(["phone", "emergency"]);
    expect(alerts.find((a) => a.key === "phone")!.actionOpenContactEdit).toBe(true);
  });

  it("returns docs alert with singular/plural title", () => {
    const one = computeProfileAlerts(makeEmp(), {
      payrollReady: true, hasPhone: true, hasEmergencyContact: true, expiringDocsCount: 1,
    });
    const many = computeProfileAlerts(makeEmp(), {
      payrollReady: true, hasPhone: true, hasEmergencyContact: true, expiringDocsCount: 3,
    });
    expect(one[0].title).toMatch(/1 document\b/);
    expect(many[0].title).toMatch(/3 documents/);
    expect(one[0].actionTab).toBe("documents");
  });
});

// ─── computeProfileReminderText ───────────────────────────────────────────────

describe("computeProfileReminderText", () => {
  it("returns null when emp is null/undefined", () => {
    expect(computeProfileReminderText(null)).toBeNull();
    expect(computeProfileReminderText(undefined)).toBeNull();
  });

  it("returns null when both fields are present", () => {
    const r = computeProfileReminderText({
      phone: "+1 555 0000",
      emergencyContactName: "Alice",
      emergencyContactPhone: "+1 555 0001",
    });
    expect(r).toBeNull();
  });

  it("returns singular reminder when only phone is missing", () => {
    const r = computeProfileReminderText({
      phone: null,
      emergencyContactName: "Alice",
      emergencyContactPhone: "+1 555 0001",
    });
    expect(r).toBe("Complete your profile — add your phone number.");
  });

  it("returns combined reminder when both are missing", () => {
    const r = computeProfileReminderText({});
    expect(r).toContain("phone number");
    expect(r).toContain("emergency contact");
  });
});

// ─── getProfileDocFields ──────────────────────────────────────────────────────

describe("getProfileDocFields", () => {
  it("filters out fields with no value", () => {
    const fields = getProfileDocFields(makeEmp());
    expect(fields).toHaveLength(0);
  });

  it("includes passport and visa fields when set", () => {
    const fields = getProfileDocFields(
      makeEmp({
        passportNumber: "P123456",
        visaNumber: "V99",
        visaExpiryDate: FUTURE_DATE,
      }),
    );
    const keys = fields.map((f) => f.key);
    expect(keys).toContain("passport");
    expect(keys).toContain("visa");
    expect(keys).toContain("visa_expiry");
  });

  it("includes expiry date on the visa_expiry entry", () => {
    const fields = getProfileDocFields(makeEmp({ visaExpiryDate: FUTURE_DATE }));
    const expiry = fields.find((f) => f.key === "visa_expiry");
    expect(expiry).toBeDefined();
    expect(expiry!.expiryDate).toBe(FUTURE_DATE);
  });
});

// ─── hasAnyExpiringDocField ───────────────────────────────────────────────────

describe("hasAnyExpiringDocField", () => {
  it("returns false for empty field list", () => {
    expect(hasAnyExpiringDocField([])).toBe(false);
  });

  it("returns false when document expiry is far in the future (>90 days)", () => {
    const fields = getProfileDocFields(makeEmp({ visaExpiryDate: FUTURE_DATE }));
    expect(hasAnyExpiringDocField(fields)).toBe(false);
  });

  it("returns true when a document is expiring within 90 days", () => {
    const fields = getProfileDocFields(makeEmp({ visaExpiryDate: EXPIRING_DATE }));
    expect(hasAnyExpiringDocField(fields)).toBe(true);
  });

  it("returns true when a document has already expired", () => {
    const fields = getProfileDocFields(makeEmp({ visaExpiryDate: EXPIRED_DATE }));
    expect(hasAnyExpiringDocField(fields)).toBe(true);
  });

  it("returns false when expiryDate is null (no expiry on this field type)", () => {
    // passport has no expiryDate
    const fields = getProfileDocFields(makeEmp({ passportNumber: "P999" }));
    expect(hasAnyExpiringDocField(fields)).toBe(false);
  });
});
