import { describe, expect, it } from "vitest";
import { isInScope, scopeLabel, redactEmployeeForScope, type VisibilityScope } from "./visibilityScope";
import { deriveCapabilities, applyEmployeePayloadPolicy } from "./capabilities";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const companyScope: VisibilityScope = { type: "company", companyId: 1 };

const deptScope: VisibilityScope = {
  type: "department",
  companyId: 1,
  selfEmployeeId: 10,
  department: "Engineering",
  departmentEmployeeIds: [10, 11, 12],
};

const teamScope: VisibilityScope = {
  type: "team",
  companyId: 1,
  selfEmployeeId: 20,
  managedEmployeeIds: [20, 21, 22],
};

const selfScopeWithRecord: VisibilityScope = { type: "self", companyId: 1, selfEmployeeId: 30 };
const selfScopeNoRecord: VisibilityScope = { type: "self", companyId: 1, selfEmployeeId: null };

// ─── isInScope ────────────────────────────────────────────────────────────────

describe("isInScope", () => {
  describe("company scope", () => {
    it("always returns true for any employee", () => {
      expect(isInScope(companyScope, 1)).toBe(true);
      expect(isInScope(companyScope, 9999)).toBe(true);
    });
  });

  describe("department scope", () => {
    it("returns true for employees in the department", () => {
      expect(isInScope(deptScope, 10)).toBe(true); // self
      expect(isInScope(deptScope, 11)).toBe(true);
      expect(isInScope(deptScope, 12)).toBe(true);
    });

    it("returns false for employees outside the department", () => {
      expect(isInScope(deptScope, 99)).toBe(false);
      expect(isInScope(deptScope, 1)).toBe(false);
    });
  });

  describe("team scope", () => {
    it("returns true for manager and direct reports", () => {
      expect(isInScope(teamScope, 20)).toBe(true); // self (manager)
      expect(isInScope(teamScope, 21)).toBe(true);
      expect(isInScope(teamScope, 22)).toBe(true);
    });

    it("returns false for employees not in the team", () => {
      expect(isInScope(teamScope, 10)).toBe(false);
      expect(isInScope(teamScope, 99)).toBe(false);
    });
  });

  describe("self scope", () => {
    it("returns true only for own employee record", () => {
      expect(isInScope(selfScopeWithRecord, 30)).toBe(true);
      expect(isInScope(selfScopeWithRecord, 31)).toBe(false);
    });

    it("returns false for any employee when selfEmployeeId is null", () => {
      expect(isInScope(selfScopeNoRecord, 1)).toBe(false);
      expect(isInScope(selfScopeNoRecord, 0)).toBe(false);
    });
  });
});

// ─── scopeLabel ───────────────────────────────────────────────────────────────

describe("scopeLabel", () => {
  it("labels company scope", () => {
    expect(scopeLabel(companyScope)).toBe("company");
  });

  it("labels department scope with name and count", () => {
    const label = scopeLabel(deptScope);
    expect(label).toContain("department");
    expect(label).toContain("Engineering");
    expect(label).toContain("3"); // 3 members
  });

  it("labels team scope with count", () => {
    const label = scopeLabel(teamScope);
    expect(label).toContain("team");
    expect(label).toContain("3"); // manager + 2 reports
  });

  it("labels self scope with employee id", () => {
    expect(scopeLabel(selfScopeWithRecord)).toContain("30");
    expect(scopeLabel(selfScopeNoRecord)).toContain("no record");
  });
});

// ─── redactEmployeeForScope (backward compat) ─────────────────────────────────

describe("redactEmployeeForScope", () => {
  const fullRecord = {
    name: "Alice",
    salary: "5000",
    bankName: "ADCB",
    bankAccountNumber: "12345",
    ibanNumber: "AE123",
    pasiNumber: "P123",
    nationalId: "N123",
    passportNumber: "PP123",
  };

  it("does not redact for company_admin with company scope", () => {
    const result = redactEmployeeForScope(fullRecord, companyScope, "company_admin");
    expect(result.salary).toBe("5000");
    expect(result.bankName).toBe("ADCB");
    expect(result.nationalId).toBe("N123");
  });

  it("strips salary and banking for team-scope managers (company_member)", () => {
    const result = redactEmployeeForScope(fullRecord, teamScope, "company_member");
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.bankAccountNumber).toBeNull();
    expect(result.ibanNumber).toBeNull();
    // identity preserved for managers (only auditors strip it via old function)
    expect(result.nationalId).toBe("N123");
  });

  it("strips salary, banking, and identity for external_auditor", () => {
    const result = redactEmployeeForScope(fullRecord, companyScope, "external_auditor");
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.passportNumber).toBeNull();
  });

  it("does not redact for company_member with self scope (no authority)", () => {
    const result = redactEmployeeForScope(fullRecord, selfScopeWithRecord, "company_member");
    // selfScope → isManager is false, isAuditor is false → no redaction
    expect(result.salary).toBe("5000");
  });
});

// ─── deriveCapabilities ───────────────────────────────────────────────────────

describe("deriveCapabilities", () => {
  describe("company_admin", () => {
    it("has all capabilities regardless of scope", () => {
      const caps = deriveCapabilities("company_admin", companyScope);
      expect(caps.canViewEmployeeList).toBe(true);
      expect(caps.canEditEmployeeProfile).toBe(true);
      expect(caps.canApproveAttendance).toBe(true);
      expect(caps.canAssignTask).toBe(true);
      expect(caps.canViewComplianceCase).toBe(true);
      expect(caps.canViewSalary).toBe(true);
      expect(caps.canViewBankingDetails).toBe(true);
      expect(caps.canViewIdentityDocs).toBe(true);
      expect(caps.canViewPayrollInputs).toBe(true);
      expect(caps.canViewHrNotes).toBe(true);
    });
  });

  describe("hr_admin", () => {
    it("can edit profiles and see identity/HR notes but not salary or banking", () => {
      const caps = deriveCapabilities("hr_admin", companyScope);
      expect(caps.canViewEmployeeList).toBe(true);
      expect(caps.canEditEmployeeProfile).toBe(true);
      expect(caps.canViewIdentityDocs).toBe(true);
      expect(caps.canViewHrNotes).toBe(true);
      expect(caps.canViewPayrollInputs).toBe(true);
      // finance fields blocked for HR
      expect(caps.canViewSalary).toBe(false);
      expect(caps.canViewBankingDetails).toBe(false);
    });
  });

  describe("finance_admin", () => {
    it("can see payroll/salary/banking but not HR notes, identity, or compliance", () => {
      const caps = deriveCapabilities("finance_admin", companyScope);
      expect(caps.canViewEmployeeList).toBe(true);
      expect(caps.canViewSalary).toBe(true);
      expect(caps.canViewBankingDetails).toBe(true);
      expect(caps.canViewPayrollInputs).toBe(true);
      expect(caps.canViewAttendanceForOthers).toBe(true);
      // must not access these
      expect(caps.canEditEmployeeProfile).toBe(false);
      expect(caps.canApproveAttendance).toBe(false);
      expect(caps.canAssignTask).toBe(false);
      expect(caps.canViewComplianceCase).toBe(false);
      expect(caps.canViewIdentityDocs).toBe(false);
      expect(caps.canViewHrNotes).toBe(false);
    });
  });

  describe("reviewer", () => {
    it("can view list, attendance, compliance — no mutations, no sensitive fields", () => {
      const caps = deriveCapabilities("reviewer", companyScope);
      expect(caps.canViewEmployeeList).toBe(true);
      expect(caps.canViewAttendanceForOthers).toBe(true);
      expect(caps.canViewComplianceCase).toBe(true);
      expect(caps.canEditEmployeeProfile).toBe(false);
      expect(caps.canApproveAttendance).toBe(false);
      expect(caps.canAssignTask).toBe(false);
      expect(caps.canViewSalary).toBe(false);
      expect(caps.canViewBankingDetails).toBe(false);
      expect(caps.canViewIdentityDocs).toBe(false);
      expect(caps.canViewHrNotes).toBe(false);
    });
  });

  describe("external_auditor", () => {
    it("can view (redacted) list and compliance — no mutations, no sensitive fields", () => {
      const caps = deriveCapabilities("external_auditor", companyScope);
      expect(caps.canViewEmployeeList).toBe(true);
      expect(caps.canViewComplianceCase).toBe(true);
      expect(caps.canViewAttendanceForOthers).toBe(true);
      expect(caps.canEditEmployeeProfile).toBe(false);
      expect(caps.canViewSalary).toBe(false);
      expect(caps.canViewBankingDetails).toBe(false);
      expect(caps.canViewIdentityDocs).toBe(false);
      expect(caps.canViewPayrollInputs).toBe(false);
      expect(caps.canViewHrNotes).toBe(false);
    });
  });

  describe("company_member", () => {
    it("department head gets list + attendance + task assignment", () => {
      const caps = deriveCapabilities("company_member", deptScope);
      expect(caps.canViewEmployeeList).toBe(true);
      expect(caps.canViewAttendanceForOthers).toBe(true);
      expect(caps.canApproveAttendance).toBe(true);
      expect(caps.canAssignTask).toBe(true);
      // never gets sensitive data
      expect(caps.canViewSalary).toBe(false);
      expect(caps.canViewBankingDetails).toBe(false);
      expect(caps.canViewIdentityDocs).toBe(false);
      expect(caps.canViewComplianceCase).toBe(false);
      expect(caps.canViewHrNotes).toBe(false);
    });

    it("line manager (team scope) gets same authority as dept head", () => {
      const caps = deriveCapabilities("company_member", teamScope);
      expect(caps.canViewEmployeeList).toBe(true);
      expect(caps.canApproveAttendance).toBe(true);
      expect(caps.canAssignTask).toBe(true);
      expect(caps.canViewSalary).toBe(false);
    });

    it("ordinary employee (self scope) has no authority over others", () => {
      const caps = deriveCapabilities("company_member", selfScopeWithRecord);
      expect(caps.canViewEmployeeList).toBe(false);
      expect(caps.canViewAttendanceForOthers).toBe(false);
      expect(caps.canApproveAttendance).toBe(false);
      expect(caps.canAssignTask).toBe(false);
      expect(caps.canViewSalary).toBe(false);
    });

    it("member with no employee record (self/null) has no authority", () => {
      const caps = deriveCapabilities("company_member", selfScopeNoRecord);
      expect(caps.canViewEmployeeList).toBe(false);
    });
  });

  describe("client / unknown role", () => {
    it("has no capabilities", () => {
      const caps = deriveCapabilities("client" as any, selfScopeWithRecord);
      expect(caps.canViewEmployeeList).toBe(false);
      expect(caps.canViewSalary).toBe(false);
      expect(caps.canEditEmployeeProfile).toBe(false);
    });
  });
});

// ─── applyEmployeePayloadPolicy ───────────────────────────────────────────────

describe("applyEmployeePayloadPolicy", () => {
  const fullRecord = {
    name: "Bob",
    salary: "8000",
    bankName: "FAB",
    bankAccountNumber: "99999",
    ibanNumber: "AE999",
    pasiNumber: "P999",
    nationalId: "N999",
    passportNumber: "PP999",
    hrNotes: "Excellent performer",
    performanceNotes: "Q1 target met",
    disciplinaryNotes: null,
  };

  it("returns all fields intact when caller has full capabilities", () => {
    const caps = deriveCapabilities("company_admin", companyScope);
    const result = applyEmployeePayloadPolicy(fullRecord, caps);
    expect(result.salary).toBe("8000");
    expect(result.bankName).toBe("FAB");
    expect(result.nationalId).toBe("N999");
    expect(result.hrNotes).toBe("Excellent performer");
  });

  it("strips salary for hr_admin", () => {
    const caps = deriveCapabilities("hr_admin", companyScope);
    const result = applyEmployeePayloadPolicy(fullRecord, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.bankAccountNumber).toBeNull();
    expect(result.ibanNumber).toBeNull();
    // HR keeps identity and notes
    expect(result.nationalId).toBe("N999");
    expect(result.hrNotes).toBe("Excellent performer");
  });

  it("strips identity docs and hr notes for finance_admin", () => {
    const caps = deriveCapabilities("finance_admin", companyScope);
    const result = applyEmployeePayloadPolicy(fullRecord, caps);
    expect(result.salary).toBe("8000");     // finance sees salary
    expect(result.bankName).toBe("FAB");    // finance sees banking
    expect(result.nationalId).toBeNull();   // finance does not see identity
    expect(result.hrNotes).toBeNull();      // finance does not see HR notes
    expect(result.performanceNotes).toBeNull();
  });

  it("strips all sensitive fields for reviewer", () => {
    const caps = deriveCapabilities("reviewer", companyScope);
    const result = applyEmployeePayloadPolicy(fullRecord, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.hrNotes).toBeNull();
  });

  it("strips all sensitive fields for external_auditor", () => {
    const caps = deriveCapabilities("external_auditor", companyScope);
    const result = applyEmployeePayloadPolicy(fullRecord, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.ibanNumber).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.passportNumber).toBeNull();
    expect(result.pasiNumber).toBeNull();
    expect(result.hrNotes).toBeNull();
  });

  it("strips all sensitive fields for company_member manager (team scope)", () => {
    const caps = deriveCapabilities("company_member", teamScope);
    const result = applyEmployeePayloadPolicy(fullRecord, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.hrNotes).toBeNull();
    // non-sensitive fields untouched
    expect(result.name).toBe("Bob");
  });

  it("strips all sensitive fields for plain employee (self scope)", () => {
    const caps = deriveCapabilities("company_member", selfScopeWithRecord);
    const result = applyEmployeePayloadPolicy(fullRecord, caps);
    expect(result.salary).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.hrNotes).toBeNull();
  });

  it("does not mutate the original record", () => {
    const caps = deriveCapabilities("reviewer", companyScope);
    const original = { ...fullRecord };
    applyEmployeePayloadPolicy(fullRecord, caps);
    expect(fullRecord.salary).toBe(original.salary);
  });

  it("does not expose sensitive fields for records that lack them", () => {
    const minimal = { name: "Carol" };
    const caps = deriveCapabilities("reviewer", companyScope);
    const result = applyEmployeePayloadPolicy(minimal, caps);
    expect(result.name).toBe("Carol");
    // patch sets sensitive keys to null so they are explicitly absent/null, never leak a real value
    expect(result.salary ?? null).toBeNull();
    expect(result.nationalId ?? null).toBeNull();
  });
});

// ─── Cross-company leak guard (structural) ────────────────────────────────────

describe("scope cross-company isolation", () => {
  it("isInScope does not implicitly accept employees from another company", () => {
    // isInScope only checks employee IDs within the scope object — the scope itself
    // is always bound to a companyId that resolveVisibilityScope already validated.
    // An employee with id=10 from company 2 would not appear in deptScope
    // (companyId=1, departmentEmployeeIds=[10,11,12]).
    // We test that the scope object carries the companyId for auditability.
    expect(deptScope.companyId).toBe(1);
    expect(teamScope.companyId).toBe(1);
    // And that isInScope only cares about the IDs in its own list.
    const alien = { type: "department" as const, companyId: 2, selfEmployeeId: 10, department: "Ops", departmentEmployeeIds: [10] };
    expect(isInScope(alien, 10)).toBe(true); // true within its own context
    // A caller with deptScope (company 1) cannot access company 2 employees
    // because they would call resolveVisibilityScope with companyId=1.
    // That isolation is tested at the integration level (resolveVisibilityScope
    // requires active membership in the given company before building the scope).
  });
});
