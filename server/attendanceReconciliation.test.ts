import { describe, expect, it } from "vitest";
import { attendanceRecords, attendanceSessions } from "../drizzle/schema";
import {
  buildPayrollStoredPreflightSnapshot,
  compareRecordToSessions,
  evaluatePayrollAttendanceGate,
  evaluatePayrollPreflight,
  muscatInclusiveYmdRangeToUtcHalfOpen,
  RECONCILIATION_MAX_RECORDS,
} from "./attendanceReconciliation";

function baseRecord(over: Partial<typeof attendanceRecords.$inferSelect> = {}): typeof attendanceRecords.$inferSelect {
  const now = new Date();
  return {
    id: 1,
    companyId: 7,
    employeeId: 100,
    scheduleId: null,
    siteId: null,
    promoterAssignmentId: null,
    siteName: null,
    checkIn: new Date("2026-04-15T04:00:00.000Z"),
    checkOut: new Date("2026-04-15T12:00:00.000Z"),
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    method: "qr_scan",
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function baseSession(over: Partial<typeof attendanceSessions.$inferSelect> = {}): typeof attendanceSessions.$inferSelect {
  const now = new Date();
  return {
    id: 50,
    companyId: 7,
    employeeId: 100,
    scheduleId: null,
    businessDate: "2026-04-15",
    status: "closed",
    checkInAt: new Date("2026-04-15T04:00:00.000Z"),
    checkOutAt: new Date("2026-04-15T12:00:00.000Z"),
    siteId: null,
    promoterAssignmentId: null,
    siteName: null,
    method: "qr_scan",
    source: "employee_portal",
    checkInLat: null,
    checkInLng: null,
    checkOutLat: null,
    checkOutLng: null,
    notes: null,
    sourceRecordId: 1,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe("compareRecordToSessions", () => {
  it("flags blocking when closed record has no session", () => {
    const r = baseRecord();
    const m = compareRecordToSessions(r, []);
    expect(m).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "RECORD_CLOSED_MISSING_SESSION", severity: "blocking" }),
      ]),
    );
  });

  it("flags warning when open record has no session", () => {
    const r = baseRecord({ checkOut: null });
    const m = compareRecordToSessions(r, []);
    expect(m).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "RECORD_OPEN_MISSING_SESSION", severity: "warning" }),
      ]),
    );
  });

  it("flags blocking on business_date drift vs Muscat check-in day", () => {
    const r = baseRecord();
    const s = baseSession({ businessDate: "2026-04-14" });
    const m = compareRecordToSessions(r, [s]);
    expect(m.some((x) => x.type === "SESSION_BUSINESS_DATE_DRIFT" && x.severity === "blocking")).toBe(true);
  });

  it("flags blocking when session check-in/out times diverge from record (correction drift)", () => {
    const r = baseRecord();
    const s = baseSession({
      checkInAt: new Date("2026-04-15T04:00:05.000Z"),
      checkOutAt: new Date("2026-04-15T12:00:00.000Z"),
    });
    const m = compareRecordToSessions(r, [s]);
    expect(m.some((x) => x.type === "SESSION_TIME_DRIFT" && x.severity === "blocking")).toBe(true);
  });

  it("flags warning for multiple sessions on same source_record_id", () => {
    const r = baseRecord();
    const m = compareRecordToSessions(r, [baseSession({ id: 1 }), baseSession({ id: 2 })]);
    expect(m.some((x) => x.type === "MULTIPLE_SESSIONS_FOR_RECORD" && x.severity === "warning")).toBe(true);
  });

  it("flags blocking on open/closed mismatch", () => {
    const r = baseRecord({ checkOut: null });
    const s = baseSession({ status: "closed", checkOutAt: new Date("2026-04-15T12:00:00.000Z") });
    const m = compareRecordToSessions(r, [s]);
    expect(m.some((x) => x.type === "SESSION_OPEN_STATE_MISMATCH" && x.severity === "blocking")).toBe(true);
  });
});

describe("evaluatePayrollPreflight", () => {
  it("returns block when any blocking mismatch exists", () => {
    const p = evaluatePayrollPreflight([
      {
        type: "RECORD_OPEN_MISSING_SESSION",
        severity: "warning",
        companyId: 1,
        employeeId: 1,
        summary: "x",
        details: {},
      },
      {
        type: "SESSION_BUSINESS_DATE_DRIFT",
        severity: "blocking",
        companyId: 1,
        employeeId: 1,
        summary: "y",
        details: {},
      },
    ]);
    expect(p.decision).toBe("block");
    expect(p.blockingCount).toBe(1);
    expect(p.warningCount).toBe(1);
  });

  it("returns warnings when only warnings", () => {
    const p = evaluatePayrollPreflight([
      {
        type: "RECORD_OPEN_MISSING_SESSION",
        severity: "warning",
        companyId: 1,
        employeeId: 1,
        summary: "x",
        details: {},
      },
    ]);
    expect(p.decision).toBe("warnings");
    expect(p.blockingCount).toBe(0);
    expect(p.warningCount).toBe(1);
  });

  it("returns safe when list empty", () => {
    expect(evaluatePayrollPreflight([])).toMatchObject({
      decision: "safe",
      blockingCount: 0,
      warningCount: 0,
    });
  });
});

describe("muscatInclusiveYmdRangeToUtcHalfOpen", () => {
  it("produces half-open UTC window for inclusive Muscat YMD bounds", () => {
    const { startUtc, endExclusiveUtc } = muscatInclusiveYmdRangeToUtcHalfOpen("2026-04-01", "2026-04-30");
    expect(startUtc.toISOString()).toBe("2026-03-31T20:00:00.000Z");
    expect(endExclusiveUtc.toISOString()).toBe("2026-04-30T20:00:00.000Z");
  });
});

describe("evaluatePayrollAttendanceGate", () => {
  it("denies when preflight is block", () => {
    const preflight = evaluatePayrollPreflight([
      {
        type: "RECORD_CLOSED_MISSING_SESSION",
        severity: "blocking",
        companyId: 1,
        employeeId: 1,
        summary: "x",
        details: {},
      },
    ]);
    const g = evaluatePayrollAttendanceGate(preflight, false, {
      recordsScanMayBeIncomplete: false,
      blockingCount: 1,
      warningCount: 0,
    });
    expect(g.allow).toBe(false);
    if (!g.allow) expect(g.kind).toBe("blocking");
  });

  it("denies warnings without acknowledgment", () => {
    const preflight = evaluatePayrollPreflight([
      {
        type: "RECORD_OPEN_MISSING_SESSION",
        severity: "warning",
        companyId: 1,
        employeeId: 1,
        summary: "x",
        details: {},
      },
    ]);
    const g = evaluatePayrollAttendanceGate(preflight, false, {
      recordsScanMayBeIncomplete: true,
      blockingCount: 0,
      warningCount: 1,
    });
    expect(g.allow).toBe(false);
    if (!g.allow) {
      expect(g.kind).toBe("warnings_need_ack");
      expect(g.message).toContain("monthly cap");
    }
  });

  it("allows warnings when acknowledged", () => {
    const preflight = evaluatePayrollPreflight([
      {
        type: "LEGACY_PRESENT_WITHOUT_RECORD",
        severity: "warning",
        companyId: 1,
        employeeId: 2,
        summary: "y",
        details: {},
      },
    ]);
    expect(evaluatePayrollAttendanceGate(preflight, true, { recordsScanMayBeIncomplete: false, blockingCount: 0, warningCount: 1 })).toEqual({
      allow: true,
    });
  });
});

describe("buildPayrollStoredPreflightSnapshot", () => {
  it("serializes a compact JSON snapshot for payroll_runs", () => {
    const raw = buildPayrollStoredPreflightSnapshot(
      {
        companyId: 3,
        fromYmd: "2026-01-01",
        toYmd: "2026-01-31",
        windowStartUtc: "",
        windowEndExclusiveUtc: "",
        recordsLoadCap: RECONCILIATION_MAX_RECORDS,
        recordsScanMayBeIncomplete: false,
        totals: { records: 10, sessions: 10, legacyRows: 0 },
        mismatches: [],
        mismatchCountsByType: {},
        blockingCount: 0,
        warningCount: 0,
        affectedEmployeeIds: [],
      },
      { decision: "safe", blockingCount: 0, warningCount: 0, reasons: [] },
      { actorUserId: 99, warningsAcknowledged: false },
    );
    const o = JSON.parse(raw) as { v: number; recordsLoadCap: number; recordsScanMayBeIncomplete: boolean };
    expect(o.v).toBe(1);
    expect(o.recordsLoadCap).toBe(RECONCILIATION_MAX_RECORDS);
    expect(o.recordsScanMayBeIncomplete).toBe(false);
  });
});
