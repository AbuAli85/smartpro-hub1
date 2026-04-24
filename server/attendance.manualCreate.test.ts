/**
 * Phase 2 + Phase 7 tests for manual HR attendance creation.
 *
 * Covers:
 *  1. Requires audit reason (min 10 chars)
 *  2. Rejects weak reason ("test")
 *  3. Duplicate prevention: rejects same employee+date
 *  4. Successful creation writes audit event
 *  5. Tenant isolation: rejects employee from different company
 *  6. Permission: non-HR/admin role is rejected (FORBIDDEN)
 *  7. Phase 7: canRecordManualAttendance capability guard
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import * as attendanceRepo from "./repositories/attendance.repository";

vi.mock("./db", () => ({
  getUserCompanyById: vi.fn().mockResolvedValue(null),
  getEmployeeById: vi.fn().mockResolvedValue(null),
  getDb: vi.fn().mockResolvedValue(null),
  // other db exports referenced indirectly
  getUserCompany: vi.fn().mockResolvedValue(null),
  getUserCompanies: vi.fn().mockResolvedValue([]),
  createAttendanceRecordTx: vi.fn().mockResolvedValue(42),
}));

vi.mock("./repositories/attendance.repository", () => ({
  findAttendanceForDate: vi.fn().mockResolvedValue(null),
  getAttendance: vi.fn().mockResolvedValue([]),
  getAttendanceStats: vi.fn().mockResolvedValue({ present: 0, absent: 0, late: 0, half_day: 0, remote: 0, byDay: [] }),
  createAttendanceRecordTx: vi.fn().mockResolvedValue(42),
  createAttendanceRecord: vi.fn().mockResolvedValue(42),
  updateAttendanceRecord: vi.fn().mockResolvedValue(undefined),
  deleteAttendanceRecord: vi.fn().mockResolvedValue(undefined),
  getAttendanceRecordById: vi.fn().mockResolvedValue(null),
}));

function makeCtx(role: string = "company_admin"): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "test-hr",
      email: "hr@test.om",
      name: "HR User",
      loginMethod: "manus",
      role: "user",
      platformRole: role === "company_admin" ? "company_admin" : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** HR membership mock — returns company_admin by default so requireHrOrAdmin passes. */
function seedHrMembership(role: string = "company_admin") {
  vi.mocked(db.getUserCompanyById).mockResolvedValue({
    company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
    member: { role },
  } as never);
}

/** Standard employee mock — belongs to company 1. */
function seedEmployee(companyId: number = 1) {
  vi.mocked(db.getEmployeeById).mockResolvedValueOnce({ id: 5, companyId } as never);
}

/** Transaction mock that records rows passed to audit insert. */
function makeTxMock(auditRows: unknown[]) {
  const insertId = 42;
  return {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((row: unknown) => {
        // collect audit rows for assertions
        if (table !== null && typeof table === "object" && "name" in (table as object)) {
          // no-op — table object identity check not needed here
        }
        auditRows.push(row);
        return Promise.resolve([{ insertId }]);
      }),
    })),
  };
}

const VALID_INPUT = {
  employeeId: 5,
  companyId: 1,
  date: "2026-04-20",
  status: "present" as const,
  notes: "Manager confirmed presence via badge scan on site.",
};

beforeEach(() => {
  vi.mocked(db.getUserCompanyById).mockReset().mockResolvedValue(null);
  vi.mocked(db.getEmployeeById).mockReset().mockResolvedValue(null);
  vi.mocked(db.getDb).mockReset().mockResolvedValue(null);
  vi.mocked(attendanceRepo.findAttendanceForDate).mockReset().mockResolvedValue(null);
});

const CHECK_IN_ISO = "2026-04-20T06:00:00.000Z";  // 10:00 Muscat
const CHECK_OUT_AFTER_ISO = "2026-04-20T08:00:00.000Z"; // 12:00 Muscat (after check-in)
const CHECK_OUT_SAME_ISO = "2026-04-20T06:00:00.000Z";  // same as check-in
const CHECK_OUT_BEFORE_ISO = "2026-04-20T04:00:00.000Z"; // before check-in

// ─── 0. Time range validation ─────────────────────────────────────────────────

describe("createAttendance — time range validation", () => {
  it("rejects checkOut equal to checkIn with BAD_REQUEST and INVALID_ATTENDANCE_TIME_RANGE", async () => {
    seedHrMembership();
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance({
      ...VALID_INPUT,
      checkIn: CHECK_IN_ISO,
      checkOut: CHECK_OUT_SAME_ISO,
    }).catch((e) => e);
    expect(err.code).toBe("BAD_REQUEST");
    expect((err.cause as { reason?: string } | undefined)?.reason).toBe("INVALID_ATTENDANCE_TIME_RANGE");
  });

  it("rejects checkOut before checkIn with BAD_REQUEST and INVALID_ATTENDANCE_TIME_RANGE", async () => {
    seedHrMembership();
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance({
      ...VALID_INPUT,
      checkIn: CHECK_IN_ISO,
      checkOut: CHECK_OUT_BEFORE_ISO,
    }).catch((e) => e);
    expect(err.code).toBe("BAD_REQUEST");
    expect((err.cause as { reason?: string } | undefined)?.reason).toBe("INVALID_ATTENDANCE_TIME_RANGE");
  });

  it("allows checkOut strictly after checkIn", async () => {
    seedHrMembership();
    seedEmployee();
    const auditRows: unknown[] = [];
    const tx = makeTxMock(auditRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);
    const result = await appRouter.createCaller(makeCtx()).hr.createAttendance({
      ...VALID_INPUT,
      checkIn: CHECK_IN_ISO,
      checkOut: CHECK_OUT_AFTER_ISO,
    });
    expect(result).toHaveProperty("success", true);
  });

  it("allows omitting both checkIn and checkOut (status-only entry)", async () => {
    seedHrMembership();
    seedEmployee();
    const auditRows: unknown[] = [];
    const tx = makeTxMock(auditRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);
    const result = await appRouter.createCaller(makeCtx()).hr.createAttendance(VALID_INPUT);
    expect(result).toHaveProperty("success", true);
  });

  it("existing duplicate prevention still works when time range is valid", async () => {
    seedHrMembership();
    seedEmployee();
    vi.mocked(attendanceRepo.findAttendanceForDate).mockResolvedValueOnce({ id: 99 });
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance({
      ...VALID_INPUT,
      checkIn: CHECK_IN_ISO,
      checkOut: CHECK_OUT_AFTER_ISO,
    }).catch((e) => e);
    expect(err.code).toBe("CONFLICT");
    expect((err.cause as { reason?: string } | undefined)?.reason).toBe("DUPLICATE_MANUAL_ATTENDANCE");
  });

  it("weak reason validation still fires before time range check is reached", async () => {
    seedHrMembership();
    seedEmployee();
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance({
      ...VALID_INPUT,
      notes: "done      ",
      checkIn: CHECK_IN_ISO,
      checkOut: CHECK_OUT_BEFORE_ISO,
    }).catch((e) => e);
    expect(err.code).toBe("BAD_REQUEST");
    expect((err.cause as { reason?: string } | undefined)?.reason).toBe("WEAK_AUDIT_REASON");
  });

  it("valid time range entry still creates an audit row", async () => {
    seedHrMembership();
    seedEmployee();
    const capturedRows: unknown[] = [];
    const tx = makeTxMock(capturedRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);
    await appRouter.createCaller(makeCtx()).hr.createAttendance({
      ...VALID_INPUT,
      checkIn: CHECK_IN_ISO,
      checkOut: CHECK_OUT_AFTER_ISO,
    });
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(capturedRows).toHaveLength(1);
  });
});

// ─── 1. Requires audit reason ─────────────────────────────────────────────────

describe("createAttendance — audit reason", () => {
  it("rejects notes shorter than 10 characters with BAD_REQUEST", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.hr.createAttendance({ ...VALID_INPUT, notes: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts notes of exactly 10 characters", async () => {
    seedHrMembership();
    seedEmployee();
    const auditRows: unknown[] = [];
    const tx = makeTxMock(auditRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);

    const result = await appRouter.createCaller(makeCtx()).hr.createAttendance({
      ...VALID_INPUT,
      notes: "10 chars!!", // exactly 10
    });
    expect(result).toHaveProperty("success", true);
  });
});

// ─── 2. Weak reason rejected ──────────────────────────────────────────────────

describe("createAttendance — weak reason", () => {
  it("rejects notes shorter than 10 characters (caught by Zod)", async () => {
    seedHrMembership();
    const caller = appRouter.createCaller(makeCtx());
    // "test" = 4 chars — Zod min(10) rejects it before weak-reason check
    const err = await caller.hr.createAttendance({ ...VALID_INPUT, notes: "test" }).catch((e) => e);
    expect(err.code).toBe("BAD_REQUEST");
  });

  it("rejects padded weak reason 'done      ' (10 chars; 'done' after trim) with WEAK_AUDIT_REASON", async () => {
    seedHrMembership();
    seedEmployee();
    const caller = appRouter.createCaller(makeCtx());
    // "done      " passes Zod min(10) but isWeakAuditReason("done      ") → true (trim → "done")
    const err = await caller.hr.createAttendance({ ...VALID_INPUT, notes: "done      " }).catch((e) => e);
    expect(err.code).toBe("BAD_REQUEST");
    // In server-side tests (createCaller), error.cause is the raw cause object (no HTTP formatter)
    expect((err.cause as { reason?: string } | undefined)?.reason).toBe("WEAK_AUDIT_REASON");
  });

  it("rejects padded weak reason 'ok        ' (10 chars) with WEAK_AUDIT_REASON", async () => {
    seedHrMembership();
    seedEmployee();
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance({ ...VALID_INPUT, notes: "ok        " }).catch((e) => e);
    expect(err.code).toBe("BAD_REQUEST");
    expect((err.cause as { reason?: string } | undefined)?.reason).toBe("WEAK_AUDIT_REASON");
  });
});

// ─── 3. Duplicate prevention ──────────────────────────────────────────────────

describe("createAttendance — duplicate prevention", () => {
  it("rejects when a record already exists for same employee+date with CONFLICT", async () => {
    seedHrMembership();
    seedEmployee();
    vi.mocked(attendanceRepo.findAttendanceForDate).mockResolvedValueOnce({ id: 99 });
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance(VALID_INPUT).catch((e) => e);
    expect(err.code).toBe("CONFLICT");
    // In server-side tests (createCaller), the raw TRPCError.cause is accessible directly
    expect((err.cause as { reason?: string } | undefined)?.reason).toBe("DUPLICATE_MANUAL_ATTENDANCE");
  });

  it("allows creation when no existing record for the date", async () => {
    seedHrMembership();
    seedEmployee();
    vi.mocked(attendanceRepo.findAttendanceForDate).mockResolvedValueOnce(null);
    const auditRows: unknown[] = [];
    const tx = makeTxMock(auditRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);

    const result = await appRouter.createCaller(makeCtx()).hr.createAttendance(VALID_INPUT);
    expect(result).toHaveProperty("success", true);
  });
});

// ─── 4. Audit event created ───────────────────────────────────────────────────

describe("createAttendance — audit event", () => {
  it("calls db.transaction and inserts audit row on success", async () => {
    seedHrMembership();
    seedEmployee();
    const capturedRows: unknown[] = [];
    const tx = makeTxMock(capturedRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);

    const result = await appRouter.createCaller(makeCtx()).hr.createAttendance(VALID_INPUT);
    expect(result).toHaveProperty("success", true);
    // tx.insert called once for the audit row
    // (createAttendanceRecordTx is mocked at barrel level and does NOT call tx.insert)
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(capturedRows).toHaveLength(1);
  });

  it("audit row includes actor user id, action, source, and reason", async () => {
    seedHrMembership();
    seedEmployee();
    const capturedRows: unknown[] = [];
    const tx = makeTxMock(capturedRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);

    await appRouter.createCaller(makeCtx()).hr.createAttendance(VALID_INPUT);

    const auditRow = capturedRows[0] as Record<string, unknown>;
    expect(auditRow).toMatchObject({
      actorUserId: 7,
      actionType: "hr_attendance_create",
      source: "hr_panel",
      companyId: 1,
      employeeId: 5,
    });
    expect(typeof auditRow.reason).toBe("string");
    expect(auditRow.reason as string).toContain("badge scan");
  });
});

// ─── 5. Tenant isolation ──────────────────────────────────────────────────────

describe("createAttendance — tenant isolation", () => {
  it("rejects when employee belongs to a different company", async () => {
    seedHrMembership(); // active company = 1
    // Employee belongs to company 2 — should be NOT_FOUND
    vi.mocked(db.getEmployeeById).mockResolvedValueOnce({ id: 5, companyId: 2 } as never);
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance(VALID_INPUT).catch((e) => e);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("rejects when employee does not exist at all", async () => {
    seedHrMembership();
    vi.mocked(db.getEmployeeById).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx());
    const err = await caller.hr.createAttendance(VALID_INPUT).catch((e) => e);
    expect(err.code).toBe("NOT_FOUND");
  });
});

// ─── 6. Permission enforcement ────────────────────────────────────────────────

describe("createAttendance — permission", () => {
  it("requires authentication — unauthenticated caller throws", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.hr.createAttendance(VALID_INPUT)).rejects.toMatchObject({
      code: expect.stringMatching(/UNAUTHORIZED/),
    });
  });

  it("rejects company_member role (not HR or admin) with FORBIDDEN", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "company_member" },
    } as never);
    const caller = appRouter.createCaller(makeCtx("company_member"));
    const err = await caller.hr.createAttendance(VALID_INPUT).catch((e) => e);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("rejects external_auditor role with FORBIDDEN", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "external_auditor" },
    } as never);
    const caller = appRouter.createCaller(makeCtx("external_auditor"));
    const err = await caller.hr.createAttendance(VALID_INPUT).catch((e) => e);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("allows hr_admin role", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "hr_admin" },
    } as never);
    seedEmployee();
    const auditRows: unknown[] = [];
    const tx = makeTxMock(auditRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);
    const result = await appRouter.createCaller(makeCtx("hr_admin")).hr.createAttendance(VALID_INPUT);
    expect(result).toHaveProperty("success", true);
  });
});

// ─── 7. Phase 7: canRecordManualAttendance capability guard ───────────────────

describe("createAttendance — Phase 7 canRecordManualAttendance guard", () => {
  it("finance_admin is rejected with FORBIDDEN (does not have canRecordManualAttendance)", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "finance_admin" },
    } as never);
    const caller = appRouter.createCaller(makeCtx("finance_admin"));
    const err = await caller.hr.createAttendance(VALID_INPUT).catch((e) => e);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("reviewer is rejected with FORBIDDEN (does not have canRecordManualAttendance)", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "reviewer" },
    } as never);
    const caller = appRouter.createCaller(makeCtx("reviewer"));
    const err = await caller.hr.createAttendance(VALID_INPUT).catch((e) => e);
    expect(err.code).toBe("FORBIDDEN");
  });

  it("company_admin has canRecordManualAttendance and succeeds", async () => {
    seedHrMembership("company_admin");
    seedEmployee();
    const auditRows: unknown[] = [];
    const tx = makeTxMock(auditRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);
    const result = await appRouter.createCaller(makeCtx("company_admin")).hr.createAttendance(VALID_INPUT);
    expect(result).toHaveProperty("success", true);
  });

  it("hr_admin has canRecordManualAttendance and succeeds", async () => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 1, name: "Co", slug: "co", country: "OM", status: "active" },
      member: { role: "hr_admin" },
    } as never);
    seedEmployee();
    const auditRows: unknown[] = [];
    const tx = makeTxMock(auditRows);
    vi.mocked(db.getDb).mockResolvedValueOnce({
      transaction: async (fn: (t: typeof tx) => Promise<void>) => { await fn(tx); },
    } as never);
    const result = await appRouter.createCaller(makeCtx("hr_admin")).hr.createAttendance(VALID_INPUT);
    expect(result).toHaveProperty("success", true);
  });
});
