/**
 * useMyCapabilities
 *
 * Returns the server-derived Capabilities object for the current user in the
 * active company context. This is the canonical source of truth for all
 * client-side capability gates — never use raw role strings for UI decisions.
 *
 * - Returns all-false capabilities while loading (safe default — never flashes
 *   privileged UI before the membership is confirmed).
 * - Automatically re-fetches when `activeCompanyId` changes (company switch).
 * - The underlying `employeePortal.myCapabilities` procedure enforces the same
 *   role × scope logic as the server-side guards, so client and server are
 *   always in sync.
 *
 * Usage:
 *   const { caps, loading } = useMyCapabilities();
 *   if (caps.canRunPayroll) { ... }
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useActiveCompany } from "@/contexts/ActiveCompanyContext";

/** Capabilities shape — all fields are boolean. */
export type Capabilities = {
  canViewEmployeeList: boolean;
  canEditEmployeeProfile: boolean;
  canViewAttendanceForOthers: boolean;
  canApproveAttendance: boolean;
  canAssignTask: boolean;
  canViewComplianceCase: boolean;
  canViewSalary: boolean;
  canViewBankingDetails: boolean;
  canViewIdentityDocs: boolean;
  canViewPayrollInputs: boolean;
  canViewHrNotes: boolean;
  canRunPayroll: boolean;
  canApprovePayroll: boolean;
  canMarkPayrollPaid: boolean;
  canEditPayrollLineItem: boolean;
  canGenerateWpsFile: boolean;
  canUploadDocument: boolean;
  canViewEmployeeDocuments: boolean;
  canViewComplianceMatrix: boolean;
  canRunComplianceReports: boolean;
  canApproveTask: boolean;
  canViewAttendanceBoard: boolean;
  canManageAttendanceRecords: boolean;
  canManagePromoterAssignments: boolean;
};

/** All capabilities default to false — safe while loading or unauthenticated. */
const EMPTY_CAPS: Capabilities = {
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
  canManagePromoterAssignments: false,
};

export function useMyCapabilities() {
  const { activeCompanyId, loading: companyLoading } = useActiveCompany();

  const { data, isLoading } = trpc.employeePortal.myCapabilities.useQuery(
    { companyId: activeCompanyId ?? undefined },
    {
      enabled: activeCompanyId != null && !companyLoading,
      // Keep previous data while switching companies to avoid all-false flash
      // (tRPC v11 / TanStack Query v5 uses placeholderData instead of keepPreviousData)
      placeholderData: (prev: Capabilities | undefined) => prev,
      staleTime: 30_000,
    },
  );

  const caps = useMemo(
    () => (data ? (data as Capabilities) : EMPTY_CAPS),
    [data],
  );

  return {
    caps,
    /** True while the capabilities are being fetched (company loading or query in-flight). */
    loading: companyLoading || isLoading,
  };
}
