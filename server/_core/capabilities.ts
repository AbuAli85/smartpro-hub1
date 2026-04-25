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
 *                          │ viewList │ edit │ approveAtt │ assignTask │ compliance │ salary │ banking │ identity │ hrNotes │ runPayroll │ approvePayroll │ markPaid │ editLine │ genWps │
 *  company_admin           │    ✓     │  ✓   │     ✓      │     ✓      │     ✓      │   ✓    │    ✓    │    ✓     │    ✓    │     ✓      │       ✓        │    ✓     │    ✓     │   ✓    │
 *  hr_admin                │    ✓     │  ✓   │     ✓      │     ✓      │     ✓      │   –    │    –    │    ✓     │    ✓    │     –      │       –        │    –     │    –     │   –    │
 *  finance_admin           │    ✓     │  –   │     –      │     –      │     –      │   ✓    │    ✓    │    –     │    –    │     ✓      │       –        │    –     │    ✓     │   ✓    │
 *  reviewer                │    ✓     │  –   │     –      │     –      │     ✓      │   –    │    –    │    –     │    –    │     –      │       –        │    –     │    –     │   –    │
 *  external_auditor        │    ✓     │  –   │     –      │     –      │     ✓      │   –    │    –    │    –     │    –    │     –      │       –        │    –     │    –     │   –    │
 *  company_member (dept)   │    ✓     │  –   │     ✓      │     ✓      │     –      │   –    │    –    │    –     │    –    │     –      │       –        │    –     │    –     │   –    │
 *  company_member (team)   │    ✓     │  –   │     ✓      │     ✓      │     –      │   –    │    –    │    –     │    –    │     –      │       –        │    –     │    –     │   –    │
 *  company_member (self)   │    –     │  –   │     –      │     –      │     –      │   –    │    –    │    –     │    –    │     –      │       –        │    –     │    –     │   –    │
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

  // Payroll actions
  /** Execute or create a payroll run (draft or authoritative). */
  canRunPayroll: boolean;
  /** Approve a payroll run (move it from draft/reviewed → approved). */
  canApprovePayroll: boolean;
  /** Mark an approved payroll run as paid. */
  canMarkPayrollPaid: boolean;
  /** Edit individual payroll line items (allowances, deductions, overrides). */
  canEditPayrollLineItem: boolean;
  /** Generate WPS / SIF bank-transfer files for payroll disbursement. */
  canGenerateWpsFile: boolean;

  // Documents
  /** Upload or modify company and employee documents (auditors are read-only). */
  canUploadDocument: boolean;
  /** Read employee document records (identity docs, permits, contracts). */
  canViewEmployeeDocuments: boolean;

  // Compliance
  /** Access the full permit / compliance matrix across the team or company. */
  canViewComplianceMatrix: boolean;
  /** Run or view PASI / WPS / overtime compliance reports. */
  canRunComplianceReports: boolean;

  // Tasks
  /** Approve, reject, or close tasks assigned to employees in scope. */
  canApproveTask: boolean;

  // Attendance (admin-side)
  /** View the live attendance board and per-employee attendance records. */
  canViewAttendanceBoard: boolean;
  /** Create, edit, or delete attendance records on behalf of employees. */
  canManageAttendanceRecords: boolean;

  // Granular attendance capabilities (Phase 7)
  /** Submit a manual HR attendance record on behalf of an employee. */
  canRecordManualAttendance: boolean;
  /** Approve or reject employee-submitted attendance correction requests. */
  canApproveAttendanceCorrections: boolean;
  /** Approve or reject manual check-in requests submitted by employees. */
  canApproveManualCheckIns: boolean;
  /** Force-checkout an employee who has an open clock-in session. */
  canForceCheckout: boolean;
  /** Edit existing attendance records (status, times, notes). */
  canEditAttendanceRecords: boolean;
  /** Lock an attendance period to prevent further edits (payroll cut-off). */
  canLockAttendancePeriod: boolean;
  /** Export attendance data and monthly reports to Excel / CSV. */
  canExportAttendanceReports: boolean;
  /** Read the attendance audit log for HR and compliance review. */
  canViewAttendanceAudit: boolean;
  /** Create, edit, or archive shift templates used in scheduling. */
  canManageShiftTemplates: boolean;
  /** Create, edit, or deactivate attendance site / geo-fence definitions. */
  canManageAttendanceSites: boolean;
  /** Assign or update employee shift schedules. */
  canManageEmployeeSchedules: boolean;

  // Promoter assignments
  /** Create, update, or terminate promoter assignment contracts. */
  canManagePromoterAssignments: boolean;

  // Attendance client approval (Phase 10A)
  /** Create and populate client approval batches (HR/admin). */
  canCreateAttendanceClientApproval: boolean;
  /** Submit a draft batch for client/internal review. */
  canSubmitAttendanceClientApproval: boolean;
  /** Approve or reject a submitted batch (simulated client or HR admin). */
  canApproveAttendanceClientApproval: boolean;
  /** View client approval batches and their items. */
  canViewAttendanceClientApproval: boolean;

  // Attendance data repair (Phase P4)
  /** Run destructive attendance repair mutations: repairSessionFromAttendanceRecord, deduplicateAttendanceRecords. */
  canRepairAttendanceData: boolean;

  // ─── Control Tower access ─────────────────────────────────────────────────
  /**
   * Access the Platform Control Tower (cross-tenant operations view).
   * Only true for platform_admin / super_admin operators — never for tenant users.
   * In practice always false from deriveCapabilities; callers combine with
   * canAccessGlobalAdminProcedures() for the full platform gate.
   */
  canViewPlatformControlTower: boolean;
  /** Access the Company Control Tower decision surface. */
  canViewCompanyControlTower: boolean;
  /** Acknowledge, update status, or edit Control Tower items. */
  canManageControlTowerItems: boolean;
  /** Assign Control Tower items to other users. */
  canAssignControlTowerItems: boolean;
  /** Mark Control Tower items as resolved or dismissed. */
  canResolveControlTowerItems: boolean;
  /** See finance-domain signals: invoices, WPS, payroll mismatch, margins. */
  canViewControlTowerFinanceSignals: boolean;
  /** See HR-domain signals: missing docs, leave conflicts, onboarding gaps. */
  canViewControlTowerHrSignals: boolean;
  /** See compliance-domain signals: Omanisation risk, labour compliance, WPS readiness. */
  canViewControlTowerComplianceSignals: boolean;
  /** See operations-domain signals: overdue tasks, SLA, stalled engagements. */
  canViewControlTowerOperationsSignals: boolean;
  /** See audit-domain signals: attendance audit log, governance trail. */
  canViewControlTowerAuditSignals: boolean;
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
  canRunPayroll: true,
  canApprovePayroll: true,
  canMarkPayrollPaid: true,
  canEditPayrollLineItem: true,
  canGenerateWpsFile: true,
  canUploadDocument: true,
  canViewEmployeeDocuments: true,
  canViewComplianceMatrix: true,
  canRunComplianceReports: true,
  canApproveTask: true,
  canViewAttendanceBoard: true,
  canManageAttendanceRecords: true,
  canRecordManualAttendance: true,
  canApproveAttendanceCorrections: true,
  canApproveManualCheckIns: true,
  canForceCheckout: true,
  canEditAttendanceRecords: true,
  canLockAttendancePeriod: true,
  canExportAttendanceReports: true,
  canViewAttendanceAudit: true,
  canManageShiftTemplates: true,
  canManageAttendanceSites: true,
  canManageEmployeeSchedules: true,
  canManagePromoterAssignments: true,
  canCreateAttendanceClientApproval: true,
  canSubmitAttendanceClientApproval: true,
  canApproveAttendanceClientApproval: true,
  canViewAttendanceClientApproval: true,
  canRepairAttendanceData: true,
  // Control Tower — company_admin gets full company tower; platform tower is gated
  // separately via canAccessGlobalAdminProcedures() and is always false here.
  canViewPlatformControlTower: false,
  canViewCompanyControlTower: true,
  canManageControlTowerItems: true,
  canAssignControlTowerItems: true,
  canResolveControlTowerItems: true,
  canViewControlTowerFinanceSignals: true,
  canViewControlTowerHrSignals: true,
  canViewControlTowerComplianceSignals: true,
  canViewControlTowerOperationsSignals: true,
  canViewControlTowerAuditSignals: true,
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
  canRunPayroll: false,
  canApprovePayroll: false,
  canMarkPayrollPaid: false,
  canEditPayrollLineItem: false,
  canGenerateWpsFile: false,
  canUploadDocument: false,
  canViewEmployeeDocuments: false,
  canViewComplianceMatrix: false,
  canRunComplianceReports: false,
  canApproveTask: false,
  canViewAttendanceBoard: false,
  canManageAttendanceRecords: false,
  canRecordManualAttendance: false,
  canApproveAttendanceCorrections: false,
  canApproveManualCheckIns: false,
  canForceCheckout: false,
  canEditAttendanceRecords: false,
  canLockAttendancePeriod: false,
  canExportAttendanceReports: false,
  canViewAttendanceAudit: false,
  canManageShiftTemplates: false,
  canManageAttendanceSites: false,
  canManageEmployeeSchedules: false,
  canManagePromoterAssignments: false,
  canCreateAttendanceClientApproval: false,
  canSubmitAttendanceClientApproval: false,
  canApproveAttendanceClientApproval: false,
  canViewAttendanceClientApproval: false,
  canRepairAttendanceData: false,
  canViewPlatformControlTower: false,
  canViewCompanyControlTower: false,
  canManageControlTowerItems: false,
  canAssignControlTowerItems: false,
  canResolveControlTowerItems: false,
  canViewControlTowerFinanceSignals: false,
  canViewControlTowerHrSignals: false,
  canViewControlTowerComplianceSignals: false,
  canViewControlTowerOperationsSignals: false,
  canViewControlTowerAuditSignals: false,
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
        canApproveTask: true,
        canViewComplianceCase: true,
        canViewComplianceMatrix: true,
        canRunComplianceReports: true,
        canViewPayrollInputs: true,
        canViewIdentityDocs: true,    // needed for onboarding / visa processing
        canViewHrNotes: true,
        canUploadDocument: true,
        canViewEmployeeDocuments: true,
        canViewAttendanceBoard: true,
        canManageAttendanceRecords: true,
        canRecordManualAttendance: true,
        canApproveAttendanceCorrections: true,
        canApproveManualCheckIns: true,
        canForceCheckout: true,
        canEditAttendanceRecords: true,
        canLockAttendancePeriod: true,
        canExportAttendanceReports: true,
        canViewAttendanceAudit: true,
        canManageShiftTemplates: true,
        canManageAttendanceSites: true,
        canManageEmployeeSchedules: true,
        canManagePromoterAssignments: true,
        canCreateAttendanceClientApproval: true,
        canSubmitAttendanceClientApproval: true,
        canApproveAttendanceClientApproval: true,
        canViewAttendanceClientApproval: true,
        // salary and banking are finance domain — HR does not see them
        canViewSalary: false,
        canViewBankingDetails: false,
        // payroll actions are finance domain — HR cannot run, approve, or disburse
        canRunPayroll: false,
        canApprovePayroll: false,
        canMarkPayrollPaid: false,
        canEditPayrollLineItem: false,
        canGenerateWpsFile: false,
        // Control Tower — HR gets company tower, HR + compliance + audit + ops signals
        canViewPlatformControlTower: false,
        canViewCompanyControlTower: true,
        canManageControlTowerItems: true,
        canAssignControlTowerItems: true,
        canResolveControlTowerItems: true,
        canViewControlTowerFinanceSignals: false,
        canViewControlTowerHrSignals: true,
        canViewControlTowerComplianceSignals: true,
        canViewControlTowerOperationsSignals: true,
        canViewControlTowerAuditSignals: true,
      };

    case "finance_admin":
      return {
        ...NO_CAPS,
        canViewEmployeeList: true,
        canViewAttendanceForOthers: true, // payroll attendance inputs
        canViewAttendanceBoard: true,     // read-only attendance board for payroll
        canViewPayrollInputs: true,
        canViewSalary: true,
        canViewBankingDetails: true,
        canRunComplianceReports: true,    // PASI / WPS reports are finance domain
        canViewEmployeeDocuments: true,   // finance needs contract / permit visibility
        canExportAttendanceReports: true, // payroll reconciliation needs attendance exports
        // payroll actions — finance_admin can run and edit but NOT approve or mark paid
        // (approval and disbursement require company_admin sign-off)
        canRunPayroll: true,
        canApprovePayroll: false,
        canMarkPayrollPaid: false,
        canEditPayrollLineItem: true,
        canGenerateWpsFile: true,
        // finance does not edit profiles, run compliance, or read HR / identity data
        canEditEmployeeProfile: false,
        canApproveAttendance: false,
        canAssignTask: false,
        canApproveTask: false,
        canViewComplianceCase: false,
        canViewComplianceMatrix: false,
        canViewIdentityDocs: false,
        canViewHrNotes: false,
        canUploadDocument: false,
        canManageAttendanceRecords: false,
        // granular attendance mutations are HR domain — finance is read-only for attendance
        canRecordManualAttendance: false,
        canApproveAttendanceCorrections: false,
        canApproveManualCheckIns: false,
        canForceCheckout: false,
        canEditAttendanceRecords: false,
        canLockAttendancePeriod: false,
        canViewAttendanceAudit: false,
        canManageShiftTemplates: false,
        canManageAttendanceSites: false,
        canManageEmployeeSchedules: false,
        // Control Tower — Finance gets company tower, finance signals + ops signals
        canViewPlatformControlTower: false,
        canViewCompanyControlTower: true,
        canManageControlTowerItems: true,
        canAssignControlTowerItems: true,
        canResolveControlTowerItems: true,
        canViewControlTowerFinanceSignals: true,
        canViewControlTowerHrSignals: false,
        canViewControlTowerComplianceSignals: false,
        canViewControlTowerOperationsSignals: true,
        canViewControlTowerAuditSignals: false,
      };

    case "reviewer":
      return {
        ...NO_CAPS,
        canViewEmployeeList: true,
        canViewAttendanceForOthers: true,
        canViewAttendanceBoard: true,
        canViewComplianceCase: true,
        canViewComplianceMatrix: true,
        canViewEmployeeDocuments: true,   // reviewers may inspect documents
        // read-only structural view — no payroll, no mutations, no personal fields
        // Control Tower — read-only: audit and compliance signals only
        canViewCompanyControlTower: true,
        canViewControlTowerComplianceSignals: true,
        canViewControlTowerAuditSignals: true,
      };

    case "external_auditor":
      return {
        ...NO_CAPS,
        canViewEmployeeList: true,     // visible but heavily redacted via payload policy
        canViewAttendanceForOthers: true,
        canViewAttendanceBoard: true,
        canViewComplianceCase: true,   // summary-level only; router applies additional filter
        canViewComplianceMatrix: true, // read-only permit matrix
        canViewEmployeeDocuments: true, // read-only; no upload
        canViewAttendanceAudit: true,  // auditors may read the attendance audit log
        // no salary, banking, identity, payroll inputs, HR notes, or payroll actions
        canUploadDocument: false,
        // Control Tower — read-only: audit and compliance signals only
        canViewCompanyControlTower: true,
        canViewControlTowerComplianceSignals: true,
        canViewControlTowerAuditSignals: true,
      };

    case "company_member": {
      // Scope determines whether member has managerial authority.
      // "company" scope means the member manages across the whole company (e.g. a department head
      // whose scope resolves to company-wide).  "department" and "team" are the typical
      // middle-management cases.  "self" means self-service only.
      const hasAuthority = scope.type === "company" || scope.type === "department" || scope.type === "team";
      return {
        ...NO_CAPS,
        canViewEmployeeList: hasAuthority,
        canViewAttendanceForOthers: hasAuthority,
        canViewAttendanceBoard: hasAuthority,
        canApproveAttendance: hasAuthority,
        canAssignTask: hasAuthority,
        canApproveTask: hasAuthority,
        canViewComplianceMatrix: hasAuthority,
        // members never access salary, banking, identity, payroll, compliance reports, or HR notes
        // Control Tower: only dept/team managers get a scoped dashboard (operations signals only).
        // Self-scope employees have no Control Tower access whatsoever.
        canViewCompanyControlTower: hasAuthority,
        canViewControlTowerOperationsSignals: hasAuthority,
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
