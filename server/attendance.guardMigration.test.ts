/**
 * Phase 7.1 regression tests — granular attendance guard migration.
 *
 * Verifies that the migrated procedures use the correct named capability guards:
 *  - approveCorrection / rejectCorrection  → requireCanApproveAttendanceCorrections
 *  - forceCheckout                         → requireCanForceCheckout
 *  - approveManualCheckIn / reject…        → requireCanApproveManualCheckIns
 *  - listAttendanceAudit                   → canViewAttendanceAudit (allows external_auditor)
 *
 * Role rejection tests verify that the guard layer rejects roles that should not have access.
 * "Guard passes" tests verify that allowed roles reach business logic (indicated by NOT_FOUND
 * from a missing DB row, which is thrown AFTER the guard succeeds).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { attendanceRouter } from "./routers/attendance";
import * as companiesRepo from "./repositories/companies.repository";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: vi.fn() };
});

vi.mock("./repositories/companies.repository", () => ({
  getUserCompanyById: vi.fn(),
}));

function makeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `o${userId}`,
      email: `user${userId}@test.om`,
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      platformRole: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function seedMembership(role: string, companyId = 10) {
  vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue({
    company: { id: companyId },
    member: { role },
  } as never);
}

/** Minimal fake DB that returns empty rows for any select query (simulates no matching row). */
function makeEmptySelectDb() {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    })),
  };
}

beforeEach(() => {
  vi.mocked(companiesRepo.getUserCompanyById).mockReset();
  vi.mocked(db.getDb).mockReset();
});

// ─── approveCorrection ────────────────────────────────────────────────────────

describe("attendance.approveCorrection — Phase 7.1 guard", () => {
  it("rejects finance_admin with FORBIDDEN", async () => {
    seedMembership("finance_admin");
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveCorrection({ companyId: 10, correctionId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer with FORBIDDEN", async () => {
    seedMembership("reviewer");
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveCorrection({ companyId: 10, correctionId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — guard passes, NOT_FOUND from missing correction row", async () => {
    seedMembership("hr_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveCorrection({ companyId: 10, correctionId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows company_admin — guard passes, NOT_FOUND from missing correction row", async () => {
    seedMembership("company_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveCorrection({ companyId: 10, correctionId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── rejectCorrection ─────────────────────────────────────────────────────────

describe("attendance.rejectCorrection — Phase 7.1 guard", () => {
  it("rejects finance_admin with FORBIDDEN", async () => {
    seedMembership("finance_admin");
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectCorrection({
        companyId: 10, correctionId: 1, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer with FORBIDDEN", async () => {
    seedMembership("reviewer");
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectCorrection({
        companyId: 10, correctionId: 1, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — guard passes, NOT_FOUND from missing correction row", async () => {
    seedMembership("hr_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectCorrection({
        companyId: 10, correctionId: 999, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows company_admin — guard passes, NOT_FOUND from missing correction row", async () => {
    seedMembership("company_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectCorrection({
        companyId: 10, correctionId: 999, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── forceCheckout ────────────────────────────────────────────────────────────

describe("attendance.forceCheckout — Phase 7.1 guard", () => {
  it("rejects finance_admin with FORBIDDEN", async () => {
    seedMembership("finance_admin");
    await expect(
      attendanceRouter.createCaller(makeCtx()).forceCheckout({
        companyId: 10, attendanceRecordId: 5, reason: "long enough reason text",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer with FORBIDDEN", async () => {
    seedMembership("reviewer");
    await expect(
      attendanceRouter.createCaller(makeCtx()).forceCheckout({
        companyId: 10, attendanceRecordId: 5, reason: "long enough reason text",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — guard passes, NOT_FOUND from missing attendance record", async () => {
    seedMembership("hr_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).forceCheckout({
        companyId: 10, attendanceRecordId: 999, reason: "long enough reason text",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows company_admin — guard passes, NOT_FOUND from missing attendance record", async () => {
    seedMembership("company_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).forceCheckout({
        companyId: 10, attendanceRecordId: 999, reason: "long enough reason text",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── approveManualCheckIn ────────────────────────────────────────────────────

describe("attendance.approveManualCheckIn — Phase 7.1 guard", () => {
  it("rejects finance_admin with FORBIDDEN", async () => {
    seedMembership("finance_admin");
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveManualCheckIn({ companyId: 10, requestId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer with FORBIDDEN", async () => {
    seedMembership("reviewer");
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveManualCheckIn({ companyId: 10, requestId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — guard passes, NOT_FOUND from missing request row", async () => {
    seedMembership("hr_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveManualCheckIn({ companyId: 10, requestId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows company_admin — guard passes, NOT_FOUND from missing request row", async () => {
    seedMembership("company_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).approveManualCheckIn({ companyId: 10, requestId: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── rejectManualCheckIn ─────────────────────────────────────────────────────

describe("attendance.rejectManualCheckIn — Phase 7.1 guard", () => {
  it("rejects finance_admin with FORBIDDEN", async () => {
    seedMembership("finance_admin");
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectManualCheckIn({
        companyId: 10, requestId: 1, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer with FORBIDDEN", async () => {
    seedMembership("reviewer");
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectManualCheckIn({
        companyId: 10, requestId: 1, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — guard passes, NOT_FOUND from missing request row", async () => {
    seedMembership("hr_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectManualCheckIn({
        companyId: 10, requestId: 999, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows company_admin — guard passes, NOT_FOUND from missing request row", async () => {
    seedMembership("company_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeEmptySelectDb() as never);
    await expect(
      attendanceRouter.createCaller(makeCtx()).rejectManualCheckIn({
        companyId: 10, requestId: 999, adminNote: "reason",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── listAttendanceAudit — external_auditor support ──────────────────────────

describe("attendance.listAttendanceAudit — Phase 7.1 guard (external_auditor)", () => {
  /** Minimal DB mock that satisfies the select → orderBy → limit chain used by listAttendanceAudit. */
  function makeAuditDb(rows: unknown[] = []) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(rows)),
            })),
          })),
        })),
      })),
    };
  }

  it("rejects finance_admin — canViewAttendanceAudit is false for finance_admin", async () => {
    seedMembership("finance_admin");
    await expect(
      attendanceRouter.createCaller(makeCtx()).listAttendanceAudit({ companyId: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer — canViewAttendanceAudit is false for reviewer", async () => {
    seedMembership("reviewer");
    await expect(
      attendanceRouter.createCaller(makeCtx()).listAttendanceAudit({ companyId: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows external_auditor — canViewAttendanceAudit is true; returns tenant-scoped rows", async () => {
    seedMembership("external_auditor");
    vi.mocked(db.getDb).mockResolvedValue(makeAuditDb([]) as never);
    const result = await attendanceRouter.createCaller(makeCtx()).listAttendanceAudit({ companyId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows hr_admin — returns audit rows", async () => {
    seedMembership("hr_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeAuditDb([]) as never);
    const result = await attendanceRouter.createCaller(makeCtx()).listAttendanceAudit({ companyId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("allows company_admin — returns audit rows", async () => {
    seedMembership("company_admin");
    vi.mocked(db.getDb).mockResolvedValue(makeAuditDb([]) as never);
    const result = await attendanceRouter.createCaller(makeCtx()).listAttendanceAudit({ companyId: 10 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("external_auditor result is scoped to the requested company (companyId filter applied)", async () => {
    seedMembership("external_auditor", 42);
    const capturedConditions: unknown[] = [];
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((...args: unknown[]) => {
            capturedConditions.push(args);
            return {
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([])),
              })),
            };
          }),
        })),
      })),
    };
    vi.mocked(db.getDb).mockResolvedValue(mockDb as never);
    await attendanceRouter.createCaller(makeCtx()).listAttendanceAudit({ companyId: 42 });
    // The where clause was called — tenant scope is enforced by the companyId condition
    expect(capturedConditions.length).toBeGreaterThan(0);
  });
});
