/**
 * Pure unit tests for the Phase 10A attendance client approval state machine.
 *
 * No database, no tRPC, no React.
 *
 * Tests:
 *   1.  draft → submitted allowed
 *   2.  draft cannot be approved directly
 *   3.  submitted → approved allowed
 *   4.  submitted → rejected allowed (reason handled at call site)
 *   5.  approved cannot be rejected (terminal)
 *   6.  rejected cannot be approved (terminal)
 *   7.  draft → cancelled allowed
 *   8.  submitted → cancelled allowed
 *   9.  approved → cancelled not allowed (terminal)
 *  10.  item aggregation: all pending → partial
 *  11.  item aggregation: all approved → all_approved
 *  12.  item aggregation: any rejected → has_rejections
 *  13.  item aggregation: any disputed → attention_disputed (takes priority over rejected)
 *  14.  item aggregation: empty → empty
 *  15.  countItemStatuses totals correctly
 *  16.  deriveClientApprovalReadiness: no batch → not_required
 *  17.  deriveClientApprovalReadiness: draft batch → pending
 *  18.  deriveClientApprovalReadiness: approved batch → approved
 *  19.  deriveClientApprovalReadiness: rejected batch → rejected
 *  20.  deriveClientApprovalReadiness: cancelled batch → not_required
 *  21.  validateBatchTransition: allowed transitions return { allowed: true }
 *  22.  validateBatchTransition: forbidden transitions return { allowed: false, reason }
 */

import { describe, expect, it } from "vitest";
import {
  canSubmitBatch,
  canApproveBatch,
  canRejectBatch,
  canCancelBatch,
  validateBatchTransition,
  countItemStatuses,
  aggregateBatchStatusFromItems,
  deriveClientApprovalReadiness,
  type BatchStatus,
  type ItemStatus,
} from "./attendanceClientApproval";

// ─── 1–9: Batch transition guards ────────────────────────────────────────────

describe("1. draft → submitted allowed", () => {
  it("canSubmitBatch returns true for draft", () => {
    expect(canSubmitBatch("draft")).toBe(true);
  });
  it("canSubmitBatch returns false for submitted", () => {
    expect(canSubmitBatch("submitted")).toBe(false);
  });
  it("canSubmitBatch returns false for approved", () => {
    expect(canSubmitBatch("approved")).toBe(false);
  });
});

describe("2. draft cannot be approved directly", () => {
  it("canApproveBatch returns false for draft", () => {
    expect(canApproveBatch("draft")).toBe(false);
  });
});

describe("3. submitted → approved allowed", () => {
  it("canApproveBatch returns true for submitted", () => {
    expect(canApproveBatch("submitted")).toBe(true);
  });
  it("canApproveBatch returns false for approved (already terminal)", () => {
    expect(canApproveBatch("approved")).toBe(false);
  });
});

describe("4. submitted → rejected allowed", () => {
  it("canRejectBatch returns true for submitted", () => {
    expect(canRejectBatch("submitted")).toBe(true);
  });
  it("canRejectBatch returns false for draft", () => {
    expect(canRejectBatch("draft")).toBe(false);
  });
});

describe("5. approved cannot be rejected (terminal)", () => {
  it("canRejectBatch returns false for approved", () => {
    expect(canRejectBatch("approved")).toBe(false);
  });
});

describe("6. rejected cannot be approved (terminal)", () => {
  it("canApproveBatch returns false for rejected", () => {
    expect(canApproveBatch("rejected")).toBe(false);
  });
});

describe("7. draft → cancelled allowed", () => {
  it("canCancelBatch returns true for draft", () => {
    expect(canCancelBatch("draft")).toBe(true);
  });
});

describe("8. submitted → cancelled allowed", () => {
  it("canCancelBatch returns true for submitted", () => {
    expect(canCancelBatch("submitted")).toBe(true);
  });
});

describe("9. approved → cancelled not allowed (terminal)", () => {
  it("canCancelBatch returns false for approved", () => {
    expect(canCancelBatch("approved")).toBe(false);
  });
  it("canCancelBatch returns false for rejected", () => {
    expect(canCancelBatch("rejected")).toBe(false);
  });
  it("canCancelBatch returns false for cancelled", () => {
    expect(canCancelBatch("cancelled")).toBe(false);
  });
});

// ─── Item aggregation ─────────────────────────────────────────────────────────

function items(statuses: ItemStatus[]) {
  return statuses.map((status) => ({ status }));
}

describe("10. item aggregation: all pending → partial", () => {
  it("returns partial when all items are pending", () => {
    expect(aggregateBatchStatusFromItems(items(["pending", "pending", "pending"]))).toBe("partial");
  });
});

describe("11. item aggregation: all approved → all_approved", () => {
  it("returns all_approved when every item is approved", () => {
    expect(aggregateBatchStatusFromItems(items(["approved", "approved"]))).toBe("all_approved");
  });
});

describe("12. item aggregation: any rejected → has_rejections", () => {
  it("returns has_rejections when at least one item is rejected (no disputed)", () => {
    expect(aggregateBatchStatusFromItems(items(["approved", "rejected", "approved"]))).toBe("has_rejections");
  });
  it("returns has_rejections when mix of approved and rejected", () => {
    expect(aggregateBatchStatusFromItems(items(["rejected"]))).toBe("has_rejections");
  });
});

describe("13. item aggregation: any disputed → attention_disputed (priority over rejected)", () => {
  it("returns attention_disputed even when there are also rejected items", () => {
    expect(aggregateBatchStatusFromItems(items(["disputed", "rejected", "approved"]))).toBe("attention_disputed");
  });
  it("returns attention_disputed for disputed-only items", () => {
    expect(aggregateBatchStatusFromItems(items(["disputed"]))).toBe("attention_disputed");
  });
});

describe("14. item aggregation: empty → empty", () => {
  it("returns empty for an empty items array", () => {
    expect(aggregateBatchStatusFromItems([])).toBe("empty");
  });
});

// ─── 15: countItemStatuses ────────────────────────────────────────────────────

describe("15. countItemStatuses totals correctly", () => {
  it("sums each status category correctly", () => {
    const counts = countItemStatuses(items(["pending", "approved", "approved", "rejected", "disputed", "pending"]));
    expect(counts.total).toBe(6);
    expect(counts.pending).toBe(2);
    expect(counts.approved).toBe(2);
    expect(counts.rejected).toBe(1);
    expect(counts.disputed).toBe(1);
  });

  it("returns all zeros for empty input", () => {
    const counts = countItemStatuses([]);
    expect(counts.total).toBe(0);
    expect(counts.pending).toBe(0);
    expect(counts.approved).toBe(0);
    expect(counts.rejected).toBe(0);
    expect(counts.disputed).toBe(0);
  });
});

// ─── 16–20: deriveClientApprovalReadiness ─────────────────────────────────────

describe("16. deriveClientApprovalReadiness: no batch → not_required", () => {
  it("returns not_required when batchStatus is null", () => {
    expect(deriveClientApprovalReadiness(null, null)).toBe("not_required");
  });
  it("returns not_required when batchStatus is undefined", () => {
    expect(deriveClientApprovalReadiness(undefined, undefined)).toBe("not_required");
  });
});

describe("17. deriveClientApprovalReadiness: draft batch → pending", () => {
  it("returns pending for draft with partial items", () => {
    expect(deriveClientApprovalReadiness("draft", "partial")).toBe("pending");
  });
  it("returns pending for submitted with no item aggregate", () => {
    expect(deriveClientApprovalReadiness("submitted", null)).toBe("pending");
  });
});

describe("18. deriveClientApprovalReadiness: approved batch → approved", () => {
  it("returns approved for approved batch", () => {
    expect(deriveClientApprovalReadiness("approved", "all_approved")).toBe("approved");
  });
});

describe("19. deriveClientApprovalReadiness: rejected batch → rejected", () => {
  it("returns rejected for rejected batch", () => {
    expect(deriveClientApprovalReadiness("rejected", "has_rejections")).toBe("rejected");
  });
  it("returns rejected for submitted batch with has_rejections items", () => {
    expect(deriveClientApprovalReadiness("submitted", "has_rejections")).toBe("rejected");
  });
});

describe("20. deriveClientApprovalReadiness: cancelled batch → not_required", () => {
  it("returns not_required for cancelled batch", () => {
    expect(deriveClientApprovalReadiness("cancelled", "partial")).toBe("not_required");
  });
});

// ─── 21–22: validateBatchTransition ──────────────────────────────────────────

describe("21. validateBatchTransition: allowed transitions return { allowed: true }", () => {
  const allowed: [BatchStatus, BatchStatus][] = [
    ["draft", "submitted"],
    ["submitted", "approved"],
    ["submitted", "rejected"],
    ["draft", "cancelled"],
    ["submitted", "cancelled"],
  ];

  for (const [from, to] of allowed) {
    it(`${from} → ${to}`, () => {
      expect(validateBatchTransition(from, to).allowed).toBe(true);
    });
  }
});

describe("22. validateBatchTransition: forbidden transitions return { allowed: false, reason }", () => {
  const forbidden: [BatchStatus, BatchStatus][] = [
    ["draft", "approved"],
    ["draft", "rejected"],
    ["approved", "submitted"],
    ["approved", "rejected"],
    ["approved", "cancelled"],
    ["rejected", "approved"],
    ["rejected", "cancelled"],
    ["cancelled", "submitted"],
  ];

  for (const [from, to] of forbidden) {
    it(`${from} → ${to} is forbidden`, () => {
      const result = validateBatchTransition(from, to);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  }
});
