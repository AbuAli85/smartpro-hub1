/**
 * Pure tests for the attendance period lock state machine (Phase 5B).
 * No database, no tRPC, no React.
 *
 * Covers the 12 scenarios from the Phase 5B spec:
 *  1.  getAttendancePeriodState returns open default when no row exists
 *  2.  lock rejects blocked summary with ATTENDANCE_PERIOD_NOT_READY
 *  3.  lock succeeds when summary ready and user has canLockAttendancePeriod
 *  4.  lock writes audit event (procedure-level — tested in server/attendance.periodLock.test.ts)
 *  5.  export rejects when period not locked with ATTENDANCE_PERIOD_NOT_LOCKED
 *  6.  export succeeds from locked with canExportAttendanceReports
 *  7.  reopen requires reason
 *  8.  reopen rejects weak/short reason
 *  9.  reopen succeeds from locked/exported with canLockAttendancePeriod
 * 10.  state transitions preserve tenant isolation (companyId propagated)
 * 11.  unauthorized roles are rejected (capability false → FORBIDDEN)
 * 12.  unique company/year/month behavior is safe (DB-level constraint; state machine handles ALREADY_LOCKED)
 */

import { describe, expect, it } from "vitest";
import {
  defaultPeriodLockState,
  validateLockPeriod,
  validateReopenPeriod,
  validateExportPeriod,
  type AttendancePeriodStatus,
  type PeriodLockCaps,
  type PeriodLockState,
} from "./attendancePeriodLock";
import {
  ATTENDANCE_PERIOD_NOT_READY,
  ATTENDANCE_PERIOD_ALREADY_LOCKED,
  ATTENDANCE_PERIOD_NOT_LOCKED,
  ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED,
} from "./attendanceTrpcReasons";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CID = 99;
const YEAR = 2026;
const MONTH = 4;

const FULL_CAPS: PeriodLockCaps = { canLockAttendancePeriod: true, canExportAttendanceReports: true };
const LOCK_ONLY_CAPS: PeriodLockCaps = { canLockAttendancePeriod: true, canExportAttendanceReports: false };
const EXPORT_ONLY_CAPS: PeriodLockCaps = { canLockAttendancePeriod: false, canExportAttendanceReports: true };
const NO_CAPS: PeriodLockCaps = { canLockAttendancePeriod: false, canExportAttendanceReports: false };

function state(status: AttendancePeriodStatus = "open"): PeriodLockState {
  return { status, year: YEAR, month: MONTH, companyId: CID };
}

// ---------------------------------------------------------------------------
// 1. Default state (no DB row) → open
// ---------------------------------------------------------------------------
describe("1. defaultPeriodLockState — no row → open", () => {
  it("returns status=open for the given company/year/month", () => {
    const s = defaultPeriodLockState(CID, YEAR, MONTH);
    expect(s.status).toBe("open");
    expect(s.year).toBe(YEAR);
    expect(s.month).toBe(MONTH);
    expect(s.companyId).toBe(CID);
  });
});

// ---------------------------------------------------------------------------
// 2. Lock rejects when readiness is "blocked"
// ---------------------------------------------------------------------------
describe("2. lock rejects blocked readiness", () => {
  it("returns ATTENDANCE_PERIOD_NOT_READY for blocked readiness", () => {
    const result = validateLockPeriod(state("open"), "blocked", FULL_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(ATTENDANCE_PERIOD_NOT_READY);
      expect(result.code).toBe("BAD_REQUEST");
    }
  });

  it("returns ATTENDANCE_PERIOD_NOT_READY for needs_review readiness", () => {
    const result = validateLockPeriod(state("open"), "needs_review", FULL_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(ATTENDANCE_PERIOD_NOT_READY);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Lock succeeds when ready + canLockAttendancePeriod
// ---------------------------------------------------------------------------
describe("3. lock succeeds — ready + correct capability", () => {
  it("returns ok=true for open period with ready summary", () => {
    const result = validateLockPeriod(state("open"), "ready", FULL_CAPS);
    expect(result.ok).toBe(true);
  });

  it("returns ok=true for reopened period with ready summary", () => {
    const result = validateLockPeriod(state("reopened"), "ready", FULL_CAPS);
    expect(result.ok).toBe(true);
  });

  it("also succeeds with lock-only caps (export cap not needed for lock)", () => {
    const result = validateLockPeriod(state("open"), "ready", LOCK_ONLY_CAPS);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. (Procedure-level: audit write) — tested in server/attendance.periodLock.test.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Export rejects when period is not locked
// ---------------------------------------------------------------------------
describe("5. export rejects when status is not locked", () => {
  for (const status of ["open", "exported", "reopened"] as AttendancePeriodStatus[]) {
    it(`rejects status="${status}" with ATTENDANCE_PERIOD_NOT_LOCKED`, () => {
      const result = validateExportPeriod(state(status), FULL_CAPS);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(ATTENDANCE_PERIOD_NOT_LOCKED);
        expect(result.code).toBe("BAD_REQUEST");
      }
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Export succeeds from locked with canExportAttendanceReports
// ---------------------------------------------------------------------------
describe("6. export succeeds from locked", () => {
  it("returns ok=true when locked + canExportAttendanceReports", () => {
    const result = validateExportPeriod(state("locked"), FULL_CAPS);
    expect(result.ok).toBe(true);
  });

  it("also succeeds with export-only caps (lock cap not needed for export)", () => {
    const result = validateExportPeriod(state("locked"), EXPORT_ONLY_CAPS);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Reopen requires reason (non-empty, ≥ 10 chars)
// ---------------------------------------------------------------------------
describe("7. reopen requires non-trivial reason", () => {
  it("rejects undefined reason with ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED", () => {
    const result = validateReopenPeriod(state("locked"), undefined, FULL_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED);
    }
  });

  it("rejects empty string reason", () => {
    const result = validateReopenPeriod(state("locked"), "", FULL_CAPS);
    expect(result.ok).toBe(false);
  });

  it("rejects reason shorter than 10 chars after trim", () => {
    const result = validateReopenPeriod(state("locked"), "fix it", FULL_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Reopen rejects weak/short reason
// ---------------------------------------------------------------------------
describe("8. reopen rejects weak reason", () => {
  const WEAK_REASONS = ["test      ", "ok", "done", "n/a", "yes"];
  for (const weak of WEAK_REASONS) {
    it(`rejects weak reason "${weak.trim()}"`, () => {
      const padded = weak.trim().padEnd(10, " ");
      const result = validateReopenPeriod(state("locked"), padded, FULL_CAPS);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(ATTENDANCE_PERIOD_REOPEN_REASON_REQUIRED);
      }
    });
  }

  it("accepts a valid, descriptive reason", () => {
    const result = validateReopenPeriod(
      state("locked"),
      "Employee correction approved by HR manager — need to re-run payroll",
      FULL_CAPS,
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Reopen succeeds from locked or exported with canLockAttendancePeriod
// ---------------------------------------------------------------------------
describe("9. reopen succeeds from locked/exported", () => {
  const VALID_REASON = "Correction approved by HR director — payroll needs to be recalculated";

  it("reopens from locked", () => {
    const result = validateReopenPeriod(state("locked"), VALID_REASON, FULL_CAPS);
    expect(result.ok).toBe(true);
  });

  it("reopens from exported", () => {
    const result = validateReopenPeriod(state("exported"), VALID_REASON, FULL_CAPS);
    expect(result.ok).toBe(true);
  });

  it("also succeeds with lock-only caps (export cap not needed for reopen)", () => {
    const result = validateReopenPeriod(state("locked"), VALID_REASON, LOCK_ONLY_CAPS);
    expect(result.ok).toBe(true);
  });

  it("rejects from open status (nothing to reopen)", () => {
    const result = validateReopenPeriod(state("open"), VALID_REASON, FULL_CAPS);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Tenant isolation: companyId propagated through default state
// ---------------------------------------------------------------------------
describe("10. tenant isolation", () => {
  it("defaultPeriodLockState preserves companyId", () => {
    const s = defaultPeriodLockState(42, 2025, 12);
    expect(s.companyId).toBe(42);
  });

  it("validates correct company period regardless of companyId value", () => {
    const differentCompany = { status: "open" as AttendancePeriodStatus, year: 2025, month: 12, companyId: 42 };
    const result = validateLockPeriod(differentCompany, "ready", FULL_CAPS);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 11. Unauthorized roles rejected (capability false → FORBIDDEN)
// ---------------------------------------------------------------------------
describe("11. unauthorized roles are rejected", () => {
  it("validateLockPeriod rejects when canLockAttendancePeriod=false", () => {
    const result = validateLockPeriod(state("open"), "ready", EXPORT_ONLY_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("validateLockPeriod rejects when no caps", () => {
    const result = validateLockPeriod(state("open"), "ready", NO_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("validateExportPeriod rejects when canExportAttendanceReports=false", () => {
    const result = validateExportPeriod(state("locked"), LOCK_ONLY_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("validateExportPeriod rejects when no caps", () => {
    const result = validateExportPeriod(state("locked"), NO_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });

  it("validateReopenPeriod rejects when canLockAttendancePeriod=false", () => {
    const reason = "Valid reason that is long enough to pass validation";
    const result = validateReopenPeriod(state("locked"), reason, EXPORT_ONLY_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("FORBIDDEN");
    }
  });
});

// ---------------------------------------------------------------------------
// 12. ALREADY_LOCKED idempotency guard
// ---------------------------------------------------------------------------
describe("12. unique company/year/month — ALREADY_LOCKED guard", () => {
  it("returns ATTENDANCE_PERIOD_ALREADY_LOCKED when locking an already-locked period", () => {
    const result = validateLockPeriod(state("locked"), "ready", FULL_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(ATTENDANCE_PERIOD_ALREADY_LOCKED);
      expect(result.code).toBe("CONFLICT");
    }
  });

  it("returns BAD_REQUEST for exported status (not lockable directly)", () => {
    const result = validateLockPeriod(state("exported"), "ready", FULL_CAPS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("BAD_REQUEST");
    }
  });
});
