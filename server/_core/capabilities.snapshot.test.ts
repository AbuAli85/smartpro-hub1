/**
 * server/_core/capabilities.snapshot.test.ts
 *
 * Capability matrix snapshot test.
 *
 * Purpose: lock in the exact capability granted to every role × scope combination
 * so that any future change to deriveCapabilities() is immediately visible in CI.
 *
 * How to update: if you intentionally change a capability, run
 *   pnpm test --run server/_core/capabilities.snapshot.test.ts
 * and update the affected assertion below.  Never update snapshots silently.
 */

import { describe, it, expect } from "vitest";
import { deriveCapabilities, applyEmployeePayloadPolicy } from "./capabilities";
import type { VisibilityScope } from "./visibilityScope";

// ─── Scope fixtures ───────────────────────────────────────────────────────────

const SCOPE_COMPANY: VisibilityScope = { type: "company", companyId: 1 };
const SCOPE_DEPT: VisibilityScope = { type: "department", companyId: 1, departmentId: 10 };
const SCOPE_TEAM: VisibilityScope = { type: "team", companyId: 1, teamId: 20 };
const SCOPE_SELF: VisibilityScope = { type: "self", companyId: 1, employeeId: 99 };

// ─── company_admin ────────────────────────────────────────────────────────────

describe("company_admin", () => {
  it("has ALL capabilities regardless of scope", () => {
    for (const scope of [SCOPE_COMPANY, SCOPE_DEPT, SCOPE_TEAM, SCOPE_SELF]) {
      const caps = deriveCapabilities("company_admin", scope);
      expect(caps).toMatchObject({
        canViewEmployeeList: true,
        canEditEmployeeProfile: true,
        canViewAttendanceForOthers: true,
        canApproveAttendance: true,
        canAssignTask: true,
        canApproveTask: true,
        canViewComplianceCase: true,
        canViewComplianceMatrix: true,
        canRunComplianceReports: true,
        canViewSalary: true,
        canViewBankingDetails: true,
        canViewIdentityDocs: true,
        canViewPayrollInputs: true,
        canViewHrNotes: true,
        canRunPayroll: true,
        canApprovePayroll: true,
        canMarkPayrollPaid: true,
        canEditPayrollLineItem: true,
        canGenerateWpsFile: true,
        canUploadDocument: true,
        canViewEmployeeDocuments: true,
        canViewAttendanceBoard: true,
        canManageAttendanceRecords: true,
      });
    }
  });
});

// ─── hr_admin ─────────────────────────────────────────────────────────────────

describe("hr_admin", () => {
  it("has HR capabilities but NOT salary, banking, or payroll actions", () => {
    const caps = deriveCapabilities("hr_admin", SCOPE_COMPANY);
    // HR-positive
    expect(caps.canViewEmployeeList).toBe(true);
    expect(caps.canEditEmployeeProfile).toBe(true);
    expect(caps.canViewAttendanceForOthers).toBe(true);
    expect(caps.canApproveAttendance).toBe(true);
    expect(caps.canAssignTask).toBe(true);
    expect(caps.canApproveTask).toBe(true);
    expect(caps.canViewComplianceCase).toBe(true);
    expect(caps.canViewComplianceMatrix).toBe(true);
    expect(caps.canRunComplianceReports).toBe(true);
    expect(caps.canViewPayrollInputs).toBe(true);
    expect(caps.canViewIdentityDocs).toBe(true);
    expect(caps.canViewHrNotes).toBe(true);
    expect(caps.canUploadDocument).toBe(true);
    expect(caps.canViewEmployeeDocuments).toBe(true);
    expect(caps.canViewAttendanceBoard).toBe(true);
    expect(caps.canManageAttendanceRecords).toBe(true);
    // Finance domain — HR does NOT have these
    expect(caps.canViewSalary).toBe(false);
    expect(caps.canViewBankingDetails).toBe(false);
    expect(caps.canRunPayroll).toBe(false);
    expect(caps.canApprovePayroll).toBe(false);
    expect(caps.canMarkPayrollPaid).toBe(false);
    expect(caps.canEditPayrollLineItem).toBe(false);
    expect(caps.canGenerateWpsFile).toBe(false);
  });

  it("scope does not change hr_admin capabilities", () => {
    const company = deriveCapabilities("hr_admin", SCOPE_COMPANY);
    const dept = deriveCapabilities("hr_admin", SCOPE_DEPT);
    const self = deriveCapabilities("hr_admin", SCOPE_SELF);
    expect(company).toEqual(dept);
    expect(company).toEqual(self);
  });
});

// ─── finance_admin ────────────────────────────────────────────────────────────

describe("finance_admin", () => {
  it("can run payroll, edit line items, generate WPS — but NOT approve or mark paid", () => {
    const caps = deriveCapabilities("finance_admin", SCOPE_COMPANY);
    // Finance-positive
    expect(caps.canViewEmployeeList).toBe(true);
    expect(caps.canViewAttendanceForOthers).toBe(true);
    expect(caps.canViewAttendanceBoard).toBe(true);
    expect(caps.canViewPayrollInputs).toBe(true);
    expect(caps.canViewSalary).toBe(true);
    expect(caps.canViewBankingDetails).toBe(true);
    expect(caps.canRunComplianceReports).toBe(true);
    expect(caps.canViewEmployeeDocuments).toBe(true);
    expect(caps.canRunPayroll).toBe(true);
    expect(caps.canEditPayrollLineItem).toBe(true);
    expect(caps.canGenerateWpsFile).toBe(true);
    // Requires company_admin sign-off — finance_admin CANNOT do these
    expect(caps.canApprovePayroll).toBe(false);
    expect(caps.canMarkPayrollPaid).toBe(false);
    // HR domain
    expect(caps.canEditEmployeeProfile).toBe(false);
    expect(caps.canApproveAttendance).toBe(false);
    expect(caps.canAssignTask).toBe(false);
    expect(caps.canApproveTask).toBe(false);
    expect(caps.canViewComplianceCase).toBe(false);
    expect(caps.canViewComplianceMatrix).toBe(false);
    expect(caps.canViewIdentityDocs).toBe(false);
    expect(caps.canViewHrNotes).toBe(false);
    expect(caps.canUploadDocument).toBe(false);
    expect(caps.canManageAttendanceRecords).toBe(false);
  });

  it("scope does not change finance_admin capabilities", () => {
    const company = deriveCapabilities("finance_admin", SCOPE_COMPANY);
    const self = deriveCapabilities("finance_admin", SCOPE_SELF);
    expect(company).toEqual(self);
  });
});

// ─── reviewer ─────────────────────────────────────────────────────────────────

describe("reviewer", () => {
  it("has read-only structural view — no mutations, no salary, no payroll actions", () => {
    const caps = deriveCapabilities("reviewer", SCOPE_COMPANY);
    expect(caps.canViewEmployeeList).toBe(true);
    expect(caps.canViewAttendanceForOthers).toBe(true);
    expect(caps.canViewAttendanceBoard).toBe(true);
    expect(caps.canViewComplianceCase).toBe(true);
    expect(caps.canViewComplianceMatrix).toBe(true);
    expect(caps.canViewEmployeeDocuments).toBe(true);
    // No mutations
    expect(caps.canEditEmployeeProfile).toBe(false);
    expect(caps.canApproveAttendance).toBe(false);
    expect(caps.canAssignTask).toBe(false);
    expect(caps.canApproveTask).toBe(false);
    expect(caps.canViewSalary).toBe(false);
    expect(caps.canViewBankingDetails).toBe(false);
    expect(caps.canViewIdentityDocs).toBe(false);
    expect(caps.canViewPayrollInputs).toBe(false);
    expect(caps.canViewHrNotes).toBe(false);
    expect(caps.canRunPayroll).toBe(false);
    expect(caps.canApprovePayroll).toBe(false);
    expect(caps.canMarkPayrollPaid).toBe(false);
    expect(caps.canEditPayrollLineItem).toBe(false);
    expect(caps.canGenerateWpsFile).toBe(false);
    expect(caps.canUploadDocument).toBe(false);
    expect(caps.canManageAttendanceRecords).toBe(false);
    expect(caps.canRunComplianceReports).toBe(false);
  });
});

// ─── external_auditor ─────────────────────────────────────────────────────────

describe("external_auditor", () => {
  it("can view list, attendance board, compliance — but cannot upload documents or access sensitive fields", () => {
    const caps = deriveCapabilities("external_auditor", SCOPE_COMPANY);
    expect(caps.canViewEmployeeList).toBe(true);
    expect(caps.canViewAttendanceForOthers).toBe(true);
    expect(caps.canViewAttendanceBoard).toBe(true);
    expect(caps.canViewComplianceCase).toBe(true);
    expect(caps.canViewComplianceMatrix).toBe(true);
    expect(caps.canViewEmployeeDocuments).toBe(true);
    // Auditors are read-only — no uploads or mutations
    expect(caps.canUploadDocument).toBe(false);
    expect(caps.canEditEmployeeProfile).toBe(false);
    expect(caps.canApproveAttendance).toBe(false);
    expect(caps.canAssignTask).toBe(false);
    expect(caps.canApproveTask).toBe(false);
    expect(caps.canManageAttendanceRecords).toBe(false);
    // No sensitive financial or personal data
    expect(caps.canViewSalary).toBe(false);
    expect(caps.canViewBankingDetails).toBe(false);
    expect(caps.canViewIdentityDocs).toBe(false);
    expect(caps.canViewPayrollInputs).toBe(false);
    expect(caps.canViewHrNotes).toBe(false);
    expect(caps.canRunPayroll).toBe(false);
    expect(caps.canApprovePayroll).toBe(false);
    expect(caps.canMarkPayrollPaid).toBe(false);
    expect(caps.canEditPayrollLineItem).toBe(false);
    expect(caps.canGenerateWpsFile).toBe(false);
    expect(caps.canRunComplianceReports).toBe(false);
  });
});

// ─── company_member ───────────────────────────────────────────────────────────

describe("company_member", () => {
  it("scope=company: has managerial capabilities (list, attendance, tasks)", () => {
    const caps = deriveCapabilities("company_member", SCOPE_COMPANY);
    expect(caps.canViewEmployeeList).toBe(true);
    expect(caps.canViewAttendanceForOthers).toBe(true);
    expect(caps.canViewAttendanceBoard).toBe(true);
    expect(caps.canApproveAttendance).toBe(true);
    expect(caps.canAssignTask).toBe(true);
    expect(caps.canApproveTask).toBe(true);
    expect(caps.canViewComplianceMatrix).toBe(true);
    // Still no sensitive fields
    expect(caps.canEditEmployeeProfile).toBe(false);
    expect(caps.canViewSalary).toBe(false);
    expect(caps.canViewBankingDetails).toBe(false);
    expect(caps.canViewIdentityDocs).toBe(false);
    expect(caps.canViewPayrollInputs).toBe(false);
    expect(caps.canViewHrNotes).toBe(false);
    expect(caps.canRunPayroll).toBe(false);
    expect(caps.canApprovePayroll).toBe(false);
    expect(caps.canMarkPayrollPaid).toBe(false);
    expect(caps.canEditPayrollLineItem).toBe(false);
    expect(caps.canGenerateWpsFile).toBe(false);
    expect(caps.canUploadDocument).toBe(false);
    expect(caps.canViewComplianceCase).toBe(false);
    expect(caps.canRunComplianceReports).toBe(false);
  });

  it("scope=department: same managerial capabilities as company scope", () => {
    const caps = deriveCapabilities("company_member", SCOPE_DEPT);
    expect(caps.canViewEmployeeList).toBe(true);
    expect(caps.canApproveAttendance).toBe(true);
    expect(caps.canAssignTask).toBe(true);
    expect(caps.canApproveTask).toBe(true);
    expect(caps.canViewComplianceMatrix).toBe(true);
  });

  it("scope=team: same managerial capabilities as company scope", () => {
    const caps = deriveCapabilities("company_member", SCOPE_TEAM);
    expect(caps.canViewEmployeeList).toBe(true);
    expect(caps.canApproveAttendance).toBe(true);
    expect(caps.canAssignTask).toBe(true);
    expect(caps.canApproveTask).toBe(true);
  });

  it("scope=self: NO managerial capabilities — self-service only", () => {
    const caps = deriveCapabilities("company_member", SCOPE_SELF);
    expect(caps.canViewEmployeeList).toBe(false);
    expect(caps.canViewAttendanceForOthers).toBe(false);
    expect(caps.canViewAttendanceBoard).toBe(false);
    expect(caps.canApproveAttendance).toBe(false);
    expect(caps.canAssignTask).toBe(false);
    expect(caps.canApproveTask).toBe(false);
    expect(caps.canViewComplianceMatrix).toBe(false);
    expect(caps.canEditEmployeeProfile).toBe(false);
    expect(caps.canViewSalary).toBe(false);
    expect(caps.canRunPayroll).toBe(false);
    expect(caps.canApprovePayroll).toBe(false);
    expect(caps.canMarkPayrollPaid).toBe(false);
    expect(caps.canEditPayrollLineItem).toBe(false);
    expect(caps.canGenerateWpsFile).toBe(false);
  });
});

// ─── Unknown / client roles ───────────────────────────────────────────────────

describe("unknown / client role", () => {
  it("has NO capabilities", () => {
    // @ts-expect-error intentionally testing unknown role
    const caps = deriveCapabilities("client", SCOPE_COMPANY);
    const allFalse = Object.values(caps).every((v) => v === false);
    expect(allFalse).toBe(true);
  });
});

// ─── applyEmployeePayloadPolicy ───────────────────────────────────────────────

describe("applyEmployeePayloadPolicy", () => {
  const fullEmployee = {
    id: 1,
    firstName: "Alice",
    salary: "5000",
    bankName: "BankMuscat",
    bankAccountNumber: "123456",
    ibanNumber: "OM12345",
    nationalId: "NID001",
    passportNumber: "PP001",
    pasiNumber: "PASI001",
    hrNotes: "Excellent performer",
    performanceNotes: "Top 10%",
    disciplinaryNotes: null,
  };

  it("company_admin sees all fields", () => {
    const caps = deriveCapabilities("company_admin", SCOPE_COMPANY);
    const result = applyEmployeePayloadPolicy(fullEmployee, caps);
    expect(result.salary).toBe("5000");
    expect(result.bankName).toBe("BankMuscat");
    expect(result.nationalId).toBe("NID001");
    expect(result.hrNotes).toBe("Excellent performer");
  });

  it("hr_admin sees identity and HR notes but NOT salary or banking", () => {
    const caps = deriveCapabilities("hr_admin", SCOPE_COMPANY);
    const result = applyEmployeePayloadPolicy(fullEmployee, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.bankAccountNumber).toBeNull();
    expect(result.ibanNumber).toBeNull();
    expect(result.nationalId).toBe("NID001");
    expect(result.hrNotes).toBe("Excellent performer");
  });

  it("finance_admin sees salary and banking but NOT identity or HR notes", () => {
    const caps = deriveCapabilities("finance_admin", SCOPE_COMPANY);
    const result = applyEmployeePayloadPolicy(fullEmployee, caps);
    expect(result.salary).toBe("5000");
    expect(result.bankName).toBe("BankMuscat");
    expect(result.ibanNumber).toBe("OM12345");
    expect(result.nationalId).toBeNull();
    expect(result.passportNumber).toBeNull();
    expect(result.hrNotes).toBeNull();
    expect(result.performanceNotes).toBeNull();
  });

  it("reviewer sees no sensitive fields", () => {
    const caps = deriveCapabilities("reviewer", SCOPE_COMPANY);
    const result = applyEmployeePayloadPolicy(fullEmployee, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.hrNotes).toBeNull();
  });

  it("external_auditor sees no sensitive fields", () => {
    const caps = deriveCapabilities("external_auditor", SCOPE_COMPANY);
    const result = applyEmployeePayloadPolicy(fullEmployee, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.hrNotes).toBeNull();
  });

  it("company_member (self scope) sees no sensitive fields", () => {
    const caps = deriveCapabilities("company_member", SCOPE_SELF);
    const result = applyEmployeePayloadPolicy(fullEmployee, caps);
    expect(result.salary).toBeNull();
    expect(result.bankName).toBeNull();
    expect(result.nationalId).toBeNull();
    expect(result.hrNotes).toBeNull();
  });

  it("preserves non-sensitive fields for all roles", () => {
    for (const role of ["company_admin", "hr_admin", "finance_admin", "reviewer", "external_auditor", "company_member"] as const) {
      const caps = deriveCapabilities(role, SCOPE_SELF);
      const result = applyEmployeePayloadPolicy(fullEmployee, caps);
      expect(result.id).toBe(1);
      expect(result.firstName).toBe("Alice");
    }
  });
});

// ─── Payroll action matrix (dedicated assertions) ─────────────────────────────

describe("payroll action capability matrix", () => {
  const SCOPES = [SCOPE_COMPANY, SCOPE_DEPT, SCOPE_TEAM, SCOPE_SELF];

  it("only company_admin can approve payroll", () => {
    for (const scope of SCOPES) {
      expect(deriveCapabilities("company_admin", scope).canApprovePayroll).toBe(true);
      expect(deriveCapabilities("hr_admin", scope).canApprovePayroll).toBe(false);
      expect(deriveCapabilities("finance_admin", scope).canApprovePayroll).toBe(false);
      expect(deriveCapabilities("reviewer", scope).canApprovePayroll).toBe(false);
      expect(deriveCapabilities("external_auditor", scope).canApprovePayroll).toBe(false);
      expect(deriveCapabilities("company_member", scope).canApprovePayroll).toBe(false);
    }
  });

  it("only company_admin can mark payroll paid", () => {
    for (const scope of SCOPES) {
      expect(deriveCapabilities("company_admin", scope).canMarkPayrollPaid).toBe(true);
      expect(deriveCapabilities("finance_admin", scope).canMarkPayrollPaid).toBe(false);
      expect(deriveCapabilities("hr_admin", scope).canMarkPayrollPaid).toBe(false);
    }
  });

  it("company_admin and finance_admin can run payroll", () => {
    for (const scope of SCOPES) {
      expect(deriveCapabilities("company_admin", scope).canRunPayroll).toBe(true);
      expect(deriveCapabilities("finance_admin", scope).canRunPayroll).toBe(true);
      expect(deriveCapabilities("hr_admin", scope).canRunPayroll).toBe(false);
      expect(deriveCapabilities("reviewer", scope).canRunPayroll).toBe(false);
      expect(deriveCapabilities("external_auditor", scope).canRunPayroll).toBe(false);
      expect(deriveCapabilities("company_member", scope).canRunPayroll).toBe(false);
    }
  });

  it("company_admin and finance_admin can edit line items and generate WPS", () => {
    for (const scope of SCOPES) {
      expect(deriveCapabilities("company_admin", scope).canEditPayrollLineItem).toBe(true);
      expect(deriveCapabilities("finance_admin", scope).canEditPayrollLineItem).toBe(true);
      expect(deriveCapabilities("company_admin", scope).canGenerateWpsFile).toBe(true);
      expect(deriveCapabilities("finance_admin", scope).canGenerateWpsFile).toBe(true);
      expect(deriveCapabilities("hr_admin", scope).canEditPayrollLineItem).toBe(false);
      expect(deriveCapabilities("hr_admin", scope).canGenerateWpsFile).toBe(false);
    }
  });
});
