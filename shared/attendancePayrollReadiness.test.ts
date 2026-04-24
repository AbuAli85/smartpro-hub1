/**
 * Pure unit tests for the attendance payroll/billing readiness gate (Phase 11).
 *
 * No database, no tRPC, no React.
 *
 * Tests:
 *  1. Open period blocks readiness.
 *  2. Reopened period blocks readiness.
 *  3. Locked period + ready reconciliation + approved client approval = ready.
 *  4. Exported period + ready reconciliation = ready.
 *  5. Reconciliation blocked blocks readiness.
 *  6. Pending client approval blocks readiness.
 *  7. Rejected client approval blocks readiness.
 *  8. Client approval not required does not block.
 *  9. Blocker priority is deterministic.
 */

import { describe, expect, it } from "vitest";
import {
  computeAttendancePayrollGate,
  type AttendancePayrollGateInput,
} from "./attendancePayrollReadiness";
import type { BatchStatus } from "./attendanceClientApproval";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<AttendancePayrollGateInput> = {}): AttendancePayrollGateInput {
  return {
    periodStatus: "locked",
    reconciliationStatus: "ready",
    requiresClientApproval: false,
    clientApprovalBatches: [],
    ...overrides,
  };
}

function batches(...statuses: BatchStatus[]): { status: BatchStatus }[] {
  return statuses.map((status) => ({ status }));
}

// ─── 1. Open period ───────────────────────────────────────────────────────────

describe("1. open period blocks readiness", () => {
  it("returns blocked_period_not_locked", () => {
    const r = computeAttendancePayrollGate(makeInput({ periodStatus: "open" }));
    expect(r.status).toBe("blocked_period_not_locked");
    expect(r.isReady).toBe(false);
    expect(r.reasonCodes).toContain("PERIOD_NOT_LOCKED");
    expect(r.periodState).toBe("open");
  });
  it("blockers array contains PERIOD_NOT_LOCKED entry", () => {
    const r = computeAttendancePayrollGate(makeInput({ periodStatus: "open" }));
    expect(r.blockers.some((b) => b.code === "PERIOD_NOT_LOCKED")).toBe(true);
  });
});

// ─── 2. Reopened period ───────────────────────────────────────────────────────

describe("2. reopened period blocks readiness", () => {
  it("returns blocked_period_not_locked for reopened period", () => {
    const r = computeAttendancePayrollGate(makeInput({ periodStatus: "reopened" }));
    expect(r.status).toBe("blocked_period_not_locked");
    expect(r.isReady).toBe(false);
    expect(r.periodState).toBe("reopened");
  });
});

// ─── 3. Locked + ready + approved = ready ────────────────────────────────────

describe("3. locked period + ready reconciliation + approved client approval = ready", () => {
  it("returns ready with one approved batch", () => {
    const r = computeAttendancePayrollGate(
      makeInput({
        periodStatus: "locked",
        reconciliationStatus: "ready",
        requiresClientApproval: true,
        clientApprovalBatches: batches("approved"),
      }),
    );
    expect(r.status).toBe("ready");
    expect(r.isReady).toBe(true);
    expect(r.blockers).toHaveLength(0);
    expect(r.clientApproval.approvedBatches).toBe(1);
    expect(r.clientApproval.pendingBatches).toBe(0);
    expect(r.clientApproval.rejectedBatches).toBe(0);
  });
  it("returns ready with multiple approved batches", () => {
    const r = computeAttendancePayrollGate(
      makeInput({
        periodStatus: "locked",
        reconciliationStatus: "ready",
        requiresClientApproval: true,
        clientApprovalBatches: batches("approved", "approved"),
      }),
    );
    expect(r.status).toBe("ready");
    expect(r.clientApproval.approvedBatches).toBe(2);
  });
});

// ─── 4. Exported + ready = ready ─────────────────────────────────────────────

describe("4. exported period + ready reconciliation = ready", () => {
  it("returns ready for exported period", () => {
    const r = computeAttendancePayrollGate(makeInput({ periodStatus: "exported" }));
    expect(r.status).toBe("ready");
    expect(r.isReady).toBe(true);
    expect(r.periodState).toBe("exported");
  });
});

// ─── 5. Reconciliation blocked ───────────────────────────────────────────────

describe("5. reconciliation blocked blocks readiness", () => {
  it("returns blocked_reconciliation when reconciliation is blocked", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ periodStatus: "locked", reconciliationStatus: "blocked" }),
    );
    expect(r.status).toBe("blocked_reconciliation");
    expect(r.isReady).toBe(false);
    expect(r.reasonCodes).toContain("RECONCILIATION_BLOCKED");
  });
  it("blockers array contains RECONCILIATION_BLOCKED entry", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ reconciliationStatus: "blocked" }),
    );
    expect(r.blockers.some((b) => b.code === "RECONCILIATION_BLOCKED")).toBe(true);
  });
});

// ─── 6. Pending client approval ──────────────────────────────────────────────

describe("6. pending client approval blocks readiness", () => {
  it("blocked_client_approval_pending for draft batch", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ requiresClientApproval: true, clientApprovalBatches: batches("draft") }),
    );
    expect(r.status).toBe("blocked_client_approval_pending");
    expect(r.isReady).toBe(false);
    expect(r.clientApproval.pendingBatches).toBe(1);
  });
  it("blocked_client_approval_pending for submitted batch", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ requiresClientApproval: true, clientApprovalBatches: batches("submitted") }),
    );
    expect(r.status).toBe("blocked_client_approval_pending");
    expect(r.clientApproval.pendingBatches).toBe(1);
  });
  it("blocked_client_approval_pending when required but no batches", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ requiresClientApproval: true, clientApprovalBatches: [] }),
    );
    expect(r.status).toBe("blocked_client_approval_pending");
    expect(r.clientApproval.missingBatches).toBe(1);
  });
  it("count reflects pending + missing", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ requiresClientApproval: true, clientApprovalBatches: batches("submitted", "draft") }),
    );
    const pendingBlocker = r.blockers.find((b) => b.code === "CLIENT_APPROVAL_PENDING");
    expect(pendingBlocker?.count).toBe(2);
  });
});

// ─── 7. Rejected client approval ─────────────────────────────────────────────

describe("7. rejected client approval blocks readiness", () => {
  it("blocked_client_approval_rejected for rejected batch", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ requiresClientApproval: true, clientApprovalBatches: batches("rejected") }),
    );
    expect(r.status).toBe("blocked_client_approval_rejected");
    expect(r.isReady).toBe(false);
    expect(r.clientApproval.rejectedBatches).toBe(1);
  });
  it("rejected takes priority over pending within client approval dimension", () => {
    const r = computeAttendancePayrollGate(
      makeInput({
        requiresClientApproval: true,
        clientApprovalBatches: batches("rejected", "submitted"),
      }),
    );
    expect(r.status).toBe("blocked_client_approval_rejected");
    expect(r.clientApproval.rejectedBatches).toBe(1);
    expect(r.clientApproval.pendingBatches).toBe(1);
  });
});

// ─── 8. Client approval not required ─────────────────────────────────────────

describe("8. client approval not required does not block", () => {
  it("ready when requiresClientApproval=false even with rejected batches present", () => {
    const r = computeAttendancePayrollGate(
      makeInput({
        requiresClientApproval: false,
        clientApprovalBatches: batches("rejected"),
      }),
    );
    expect(r.status).toBe("ready");
    expect(r.isReady).toBe(true);
    expect(r.clientApproval.required).toBe(false);
  });
  it("cancelled batches are excluded from active batch counts", () => {
    const r = computeAttendancePayrollGate(
      makeInput({
        requiresClientApproval: true,
        clientApprovalBatches: batches("cancelled"),
      }),
    );
    expect(r.clientApproval.approvedBatches).toBe(0);
    expect(r.clientApproval.pendingBatches).toBe(0);
    expect(r.clientApproval.rejectedBatches).toBe(0);
    // Cancelled only → treated as missing
    expect(r.clientApproval.missingBatches).toBe(1);
    expect(r.status).toBe("blocked_client_approval_pending");
  });
});

// ─── 9. Blocker priority is deterministic ────────────────────────────────────

describe("9. blocker priority is deterministic", () => {
  it("period not locked wins over all other blockers", () => {
    const r = computeAttendancePayrollGate(
      makeInput({
        periodStatus: "open",
        reconciliationStatus: "blocked",
        requiresClientApproval: true,
        clientApprovalBatches: batches("rejected"),
      }),
    );
    expect(r.status).toBe("blocked_period_not_locked");
    // All three blockers are still collected
    expect(r.blockers).toHaveLength(3);
    expect(r.reasonCodes).toContain("PERIOD_NOT_LOCKED");
    expect(r.reasonCodes).toContain("RECONCILIATION_BLOCKED");
    expect(r.reasonCodes).toContain("CLIENT_APPROVAL_REJECTED");
  });
  it("reconciliation blocked wins over client approval blockers", () => {
    const r = computeAttendancePayrollGate(
      makeInput({
        periodStatus: "locked",
        reconciliationStatus: "blocked",
        requiresClientApproval: true,
        clientApprovalBatches: batches("rejected"),
      }),
    );
    expect(r.status).toBe("blocked_reconciliation");
    expect(r.blockers).toHaveLength(2);
  });
  it("needs_review returned when no blockers and reconciliation is needs_review", () => {
    const r = computeAttendancePayrollGate(
      makeInput({ periodStatus: "locked", reconciliationStatus: "needs_review" }),
    );
    expect(r.status).toBe("needs_review");
    expect(r.isReady).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });
  it("reasonCodes array is deterministically ordered", () => {
    const r1 = computeAttendancePayrollGate(
      makeInput({
        periodStatus: "open",
        reconciliationStatus: "blocked",
        requiresClientApproval: true,
        clientApprovalBatches: batches("rejected"),
      }),
    );
    const r2 = computeAttendancePayrollGate(
      makeInput({
        periodStatus: "open",
        reconciliationStatus: "blocked",
        requiresClientApproval: true,
        clientApprovalBatches: batches("rejected"),
      }),
    );
    expect(r1.reasonCodes).toEqual(r2.reasonCodes);
  });
});
