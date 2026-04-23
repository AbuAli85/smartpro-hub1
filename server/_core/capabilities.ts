/**
 * server/_core/capabilities.ts
 *
 * Capability layer: derives WHAT a caller may do, given their role and resolved scope.
 *
 *   Scope   → WHO they can see  (company / department / team / self)
 *   Capabilities → WHAT they can do within that range
 *
 * Usage:
 *
 *   const scope = await resolveVisibilityScope(user, companyId);
 *   const caps  = deriveCapabilities(memberRole, scope);
 *
 *   if (!caps.canAssignTask) throw new TRPCError({ code: "FORBIDDEN" });
 *   const safe = applyEmployeePayloadPolicy(employeeRow, caps);
 *
 * Role capability matrix (see deriveCapabilities for canonical source):
 *
 *                          │ viewList │ edit │ approveAtt │ assignTask │ compliance │ salary │ banking │ identity │ hrNotes │
 *  company_admin           │    ✓     │  ✓   │     ✓      │     ✓      │     ✓      │   ✓    │    ✓    │    ✓     │    ✓    │
 *  hr_admin                │    ✓     │  ✓   │     ✓      │     ✓      │     ✓      │   –    │    –    │    ✓     │    ✓    │
 *  finance_admin           │    ✓     │  –   │     –      │     –      │     –      │   ✓    │    ✓    │    –     │    –    │
 *  reviewer                │    ✓     │  –   │     –      │     –      │     ✓      │   –    │    –    │    –     │    –    │
 *  external_auditor        │    ✓     │  –   │     –      │     –      │     ✓      │   –    │    –    │    –     │    –    │
 *  company_member (dept)   │    ✓     │  –   │     ✓      │     ✓      │     –      │   –    │    –    │    –     │    –    │
 *  company_member (team)   │    ✓     │  –   │     ✓      │     ✓      │     –      │   –    │    –    │    –     │    –    │
 *  company_member (self)   │    –     │  –   │     –      │     –      │     –      │   –    │    –    │    –     │    –    │
 */

import type { VisibilityScope } from "./visibilityScope";
import type { CompanyMember } from "../../drizzle/schema";

export type MemberRole = CompanyMember["role"];

// ─── Capabilities interface ───────────────────────────────────────────────────

export interface Capabilities {
  // People
  /** View a list of employees beyond the caller's own record. */
  canViewEmployeeList: boolean;
  /** Write to employee profile fields (name, status, department, etc.). */
  canEditEmployeeProfile: boolean;

  // Attendance
  /** Read attendance records for employees in scope (not just self). */
  canViewAttendanceForOthers: boolean;
  /** Approve or reject attendance / permit requests. */
  canApproveAttendance: boolean;

  // Tasks
  /** Create tasks assigned to employees within the caller's scope. */
  canAssignTask: boolean;

  // Compliance
  /** Access compliance case details (overtime alerts, violations). */
  canViewComplianceCase: boolean;

  // Payroll / sensitive employee fields
  /** See salary figures. */
  canViewSalary: boolean;
  /** See bank name, IBAN, account number. */
  canViewBankingDetails: boolean;
  /** See national ID and passport number. */
  canViewIdentityDocs: boolean;
  /** See payroll cost-center inputs and attendance-for-payroll summaries. */
  canViewPayrollInputs: boolean;
  /** See HR notes, performance notes, and disciplinary records. */
  canViewHrNotes: boolean;
}

// ─── Baseline capability sets ─────────────────────────────────────────────────

const ALL_CAPS: Capabilities = {
  canViewEmployeeList: true,
  canEditEmployeeProfile: true,
  canViewAttendanceForOthers: true,
  canApproveAttendance: true,
  canAssignTask: true,
  canViewComplianceCase: true,
  canViewSalary: true,
  canViewBankingDetails: true,
  canViewIdentityDocs: true,
  canViewPayrollInputs: true,
  canViewHrNotes: true,
};

const NO_CAPS: Capabilities = {
  canViewEmployeeList: false,
  canEditEmployeeProfile: false,
  canViewAttendanceForOthers: false,
  canApproveAttendance: false,
  canAssignTask: false,
  canViewComplianceCase: false,
  canViewSalary: false,
  canViewBankingDetails: false,
  canViewIdentityDocs: false,
  canViewPayrollInputs: false,
  canViewHrNotes: false,
};

// ─── Core deriver ─────────────────────────────────────────────────────────────

/**
 * Derives the full capabilities matrix for a caller.
 *
 * Platform operators should arrive here with role="company_admin":
 * `requireTenantRole` normalises their effective role, and `resolveVisibilityScope`
 * already returns type="company" for them.
 */
export function deriveCapabilities(role: MemberRole, scope: VisibilityScope): Capabilities {
  switch (role) {
    case "company_admin":
      return ALL_CAPS;

    case "hr_admin":
      return {
        ...NO_CAPS,
        canViewEmployeeList: true,
        canEditEmployeeProfile: true,
        canViewAttendanceForOthers: true,
        canApproveAttendance: true,
        canAssignTask: true,
        canViewComplianceCase: true,
        canViewPayrollInputs: true,
        canViewIdentityDocs: true,    // needed for onboarding / visa processing
        canViewHrNotes: true,
        // salary and banking are finance domain — HR does not see them
        canViewSalary: false,
        canViewBankingDetails: false,
      };

    case "finance_admin":
      return {
        ...NO_CAPS,
        canViewEmployeeList: true,
        canViewAttendanceForOthers: true, // payroll attendance inputs
        canViewPayrollInputs: true,
        canViewSalary: true,
        canViewBankingDetails: true,
        // finance does not edit profiles, run compliance, or read HR / identity data
        canEditEmployeeProfile: false,
        canApproveAttendance: false,
        canAssignTask: false,
        canViewComplianceCase: false,
        canViewIdentityDocs: false,
        canViewHrNotes: false,
      };

    case "reviewer":
      return {
        ...NO_CAPS,
        canViewEmployeeList: true,
        canViewAttendanceForOthers: true,
        canViewComplianceCase: true,
        // read-only structural view — no payroll, no mutations, no personal fields
      };

    case "external_auditor":
      return {
        ...NO_CAPS,
        canViewEmployeeList: true,     // visible but heavily redacted via payload policy
        canViewAttendanceForOthers: true,
        canViewComplianceCase: true,   // summary-level only; router applies additional filter
        // no salary, banking, identity, payroll inputs, or HR notes
      };

    case "company_member": {
      // Scope determines whether member has managerial authority
      const hasAuthority = scope.type === "department" || scope.type === "team";
      return {
        ...NO_CAPS,
        canViewEmployeeList: hasAuthority,
        canViewAttendanceForOthers: hasAuthority,
        canApproveAttendance: hasAuthority,
        canAssignTask: hasAuthority,
        // members never access salary, banking, identity, payroll, compliance, or HR notes
      };
    }

    default:
      // client, unknown roles — no capabilities beyond their own self-service portal
      return NO_CAPS;
  }
}

// ─── Payload policy ───────────────────────────────────────────────────────────

export type EmployeeSensitiveFields = {
  salary?: string | number | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  ibanNumber?: string | null;
  pasiNumber?: string | null;
  nationalId?: string | null;
  passportNumber?: string | null;
  hrNotes?: string | null;
  performanceNotes?: string | null;
  disciplinaryNotes?: string | null;
};

/**
 * Strips employee fields the caller is not permitted to see, driven by the
 * capabilities matrix.  Prefer this over `redactEmployeeForScope` — it is
 * explicit about *why* each field is removed rather than re-deriving access
 * from role+scope a second time.
 */
export function applyEmployeePayloadPolicy<T extends EmployeeSensitiveFields>(
  emp: T,
  caps: Capabilities,
): T {
  const patch: Partial<EmployeeSensitiveFields> = {};

  if (!caps.canViewSalary) {
    patch.salary = null;
  }
  if (!caps.canViewBankingDetails) {
    patch.bankName = null;
    patch.bankAccountNumber = null;
    patch.ibanNumber = null;
  }
  if (!caps.canViewIdentityDocs) {
    patch.nationalId = null;
    patch.passportNumber = null;
    patch.pasiNumber = null;
  }
  if (!caps.canViewHrNotes) {
    patch.hrNotes = null;
    patch.performanceNotes = null;
    patch.disciplinaryNotes = null;
  }

  return { ...emp, ...patch };
}
