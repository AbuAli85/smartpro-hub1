/**
 * Attendance payroll/billing readiness gate (Phase 11).
 *
 * Pure module — no DB, no tRPC, no React.
 *
 * Combines three dimensions into a single gate result:
 *   1. Attendance period lock state (must be locked or exported).
 *   2. Reconciliation readiness (must not be blocked).
 *   3. Client approval batches (must be approved when required).
 *
 * Gate rules (priority order for primary status):
 *   1. Period open/reopened → blocked_period_not_locked
 *   2. Reconciliation blocked → blocked_reconciliation
 *   3. Required client approval rejected → blocked_client_approval_rejected
 *   4. Required client approval pending/missing → blocked_client_approval_pending
 *   5. No blockers, reconciliation needs_review → needs_review
 *   6. No blockers, reconciliation ready → ready
 *
 * All blockers are always collected so the UI can display every issue at once,
 * even when only the highest-priority one drives `status`.
 */

import type { AttendancePeriodStatus } from "./attendancePeriodLock";
import type { ReconciliationReadinessStatus } from "./attendanceReconciliationSummary";
import type { BatchStatus } from "./attendanceClientApproval";

// ─── Status enum ──────────────────────────────────────────────────────────────

export type AttendancePayrollGateStatus =
  | "ready"
  | "blocked_period_not_locked"
  | "blocked_reconciliation"
  | "blocked_client_approval_pending"
  | "blocked_client_approval_rejected"
  | "needs_review"
  | "not_required";

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AttendancePayrollGateBlocker {
  code: string;
  messageKey: string;
  count?: number;
}

export interface AttendancePayrollClientApprovalSummary {
  required: boolean;
  approvedBatches: number;
  pendingBatches: number;
  rejectedBatches: number;
  /** Non-zero when client approval is required but no active (non-cancelled) batch exists. */
  missingBatches: number;
}

export interface AttendancePayrollGateResult {
  /** Primary gate status, determined by highest-priority blocker. */
  status: AttendancePayrollGateStatus;
  /** True when there are no blockers (status is "ready" or "needs_review"). */
  isReady: boolean;
  /** Stable codes for all active blockers (may contain multiple). */
  reasonCodes: string[];
  periodState: AttendancePeriodStatus;
  reconciliationStatus: ReconciliationReadinessStatus;
  clientApproval: AttendancePayrollClientApprovalSummary;
  /** All active blockers collected for UI display. */
  blockers: AttendancePayrollGateBlocker[];
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface AttendancePayrollGateInput {
  periodStatus: AttendancePeriodStatus;
  reconciliationStatus: ReconciliationReadinessStatus;
  requiresClientApproval: boolean;
  /** All batches for the period (optionally site-scoped). Cancelled batches are ignored. */
  clientApprovalBatches: ReadonlyArray<{ status: BatchStatus }>;
}

// ─── Gate computation ─────────────────────────────────────────────────────────

/**
 * Derive the payroll/billing gate result from three input dimensions.
 *
 * Pure — no side effects. All inputs must already be tenant-scoped by the caller.
 */
export function computeAttendancePayrollGate(
  input: AttendancePayrollGateInput,
): AttendancePayrollGateResult {
  const activeBatches = input.clientApprovalBatches.filter((b) => b.status !== "cancelled");
  const approvedBatches = activeBatches.filter((b) => b.status === "approved").length;
  const rejectedBatches = activeBatches.filter((b) => b.status === "rejected").length;
  const pendingBatches = activeBatches.filter(
    (b) => b.status === "draft" || b.status === "submitted",
  ).length;
  const missingBatches =
    input.requiresClientApproval && activeBatches.length === 0 ? 1 : 0;

  const clientApproval: AttendancePayrollClientApprovalSummary = {
    required: input.requiresClientApproval,
    approvedBatches,
    pendingBatches,
    rejectedBatches,
    missingBatches,
  };

  const blockers: AttendancePayrollGateBlocker[] = [];
  const reasonCodes: string[] = [];

  // Rule 1: Period must be locked or exported.
  const periodIsLocked =
    input.periodStatus === "locked" || input.periodStatus === "exported";
  if (!periodIsLocked) {
    blockers.push({
      code: "PERIOD_NOT_LOCKED",
      messageKey: "attendance.payrollGate.blockers.periodNotLocked",
    });
    reasonCodes.push("PERIOD_NOT_LOCKED");
  }

  // Rule 2: Reconciliation must not be blocked.
  if (input.reconciliationStatus === "blocked") {
    blockers.push({
      code: "RECONCILIATION_BLOCKED",
      messageKey: "attendance.payrollGate.blockers.reconciliationBlocked",
    });
    reasonCodes.push("RECONCILIATION_BLOCKED");
  }

  // Rules 3–4: Client approval (only checked when required).
  if (input.requiresClientApproval) {
    if (rejectedBatches > 0) {
      blockers.push({
        code: "CLIENT_APPROVAL_REJECTED",
        messageKey: "attendance.payrollGate.blockers.clientApprovalRejected",
        count: rejectedBatches,
      });
      reasonCodes.push("CLIENT_APPROVAL_REJECTED");
    } else if (pendingBatches > 0 || missingBatches > 0) {
      blockers.push({
        code: "CLIENT_APPROVAL_PENDING",
        messageKey: "attendance.payrollGate.blockers.clientApprovalPending",
        count: pendingBatches + missingBatches,
      });
      reasonCodes.push("CLIENT_APPROVAL_PENDING");
    }
  }

  // Derive primary status by deterministic priority order.
  let status: AttendancePayrollGateStatus;
  if (blockers.length === 0) {
    status = input.reconciliationStatus === "needs_review" ? "needs_review" : "ready";
  } else if (reasonCodes.includes("PERIOD_NOT_LOCKED")) {
    status = "blocked_period_not_locked";
  } else if (reasonCodes.includes("RECONCILIATION_BLOCKED")) {
    status = "blocked_reconciliation";
  } else if (reasonCodes.includes("CLIENT_APPROVAL_REJECTED")) {
    status = "blocked_client_approval_rejected";
  } else {
    status = "blocked_client_approval_pending";
  }

  return {
    status,
    isReady: blockers.length === 0,
    reasonCodes,
    periodState: input.periodStatus,
    reconciliationStatus: input.reconciliationStatus,
    clientApproval,
    blockers,
  };
}
