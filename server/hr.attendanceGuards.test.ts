/**
 * Phase 7.1 regression tests — hr.updateAttendance and hr.deleteAttendance guard migration.
 *
 * Both procedures were previously guarded by requireWorkspaceMembership + requireNotAuditor
 * (broad guard, allowed finance_admin).  After Phase 7.1 they use requireCanEditAttendanceRecords
 * which requires hr_admin or company_admin AND the canEditAttendanceRecords capability.
 *
 * Covers:
 *  - company_member, reviewer, external_auditor are rejected with FORBIDDEN
 *  - finance_admin is rejected (not hr_admin or company_admin)
 *  - hr_admin and company_admin are allowed
 *  - deleteAttendance is a hard delete (TODO: future compliance phase should use void/reversal)
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
    getUserCompanyById: vi.fn(),
    getAttendanceRecordById: vi.fn(),
  };
});

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "o1",
      email: "admin@test.om",
      name: "Admin User",
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

const FAKE_ROW = {
  id: 42,
  companyId: 10,
  employeeId: 5,
  status: "present",
  notes: "",
  date: new Date("2026-04-20"),
  checkIn: null,
  checkOut: null,
};

function seedRow() {
  vi.mocked(db.getAttendanceRecordById).mockResolvedValue(FAKE_ROW as never);
}

function seedMembership(role: string) {
  vi.mocked(db.getUserCompanyById).mockResolvedValue({
    company: { id: 10 },
    member: { role },
  } as never);
}

beforeEach(() => {
  vi.mocked(db.getDb).mockReset();
  vi.mocked(db.getUserCompanyById).mockReset().mockResolvedValue(null);
  vi.mocked(db.getAttendanceRecordById).mockReset().mockResolvedValue(null);
});

// ─── hr.updateAttendance ─────────────────────────────────────────────────────

describe("hr.updateAttendance — Phase 7.1 guard (requireCanEditAttendanceRecords)", () => {
  it("throws NOT_FOUND when row is missing (before guard)", async () => {
    vi.mocked(db.getAttendanceRecordById).mockResolvedValue(null);
    await expect(
      appRouter.createCaller(makeCtx()).hr.updateAttendance({ id: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects company_member with FORBIDDEN", async () => {
    seedRow();
    seedMembership("company_member");
    await expect(
      appRouter.createCaller(makeCtx()).hr.updateAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer with FORBIDDEN", async () => {
    seedRow();
    seedMembership("reviewer");
    await expect(
      appRouter.createCaller(makeCtx()).hr.updateAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects external_auditor with FORBIDDEN", async () => {
    seedRow();
    seedMembership("external_auditor");
    await expect(
      appRouter.createCaller(makeCtx()).hr.updateAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects finance_admin with FORBIDDEN (canEditAttendanceRecords=false for finance)", async () => {
    seedRow();
    seedMembership("finance_admin");
    await expect(
      appRouter.createCaller(makeCtx()).hr.updateAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — guard passes, transaction executes", async () => {
    seedRow();
    seedMembership("hr_admin");
    const fakeTx = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([FAKE_ROW])) })),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve([{ insertId: 1 }])) })),
    };
    vi.mocked(db.getDb).mockResolvedValue({
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    } as never);
    const result = await appRouter.createCaller(makeCtx()).hr.updateAttendance({ id: 42 });
    expect(result).toEqual({ success: true });
  });

  it("allows company_admin — guard passes, transaction executes", async () => {
    seedRow();
    seedMembership("company_admin");
    const fakeTx = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([FAKE_ROW])) })),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve([{ insertId: 1 }])) })),
    };
    vi.mocked(db.getDb).mockResolvedValue({
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    } as never);
    const result = await appRouter.createCaller(makeCtx()).hr.updateAttendance({ id: 42 });
    expect(result).toEqual({ success: true });
  });
});

// ─── hr.deleteAttendance ─────────────────────────────────────────────────────

describe("hr.deleteAttendance — Phase 7.1 guard (requireCanEditAttendanceRecords)", () => {
  it("throws NOT_FOUND when row is missing (before guard)", async () => {
    vi.mocked(db.getAttendanceRecordById).mockResolvedValue(null);
    await expect(
      appRouter.createCaller(makeCtx()).hr.deleteAttendance({ id: 999 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects company_member with FORBIDDEN", async () => {
    seedRow();
    seedMembership("company_member");
    await expect(
      appRouter.createCaller(makeCtx()).hr.deleteAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects reviewer with FORBIDDEN", async () => {
    seedRow();
    seedMembership("reviewer");
    await expect(
      appRouter.createCaller(makeCtx()).hr.deleteAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects external_auditor with FORBIDDEN", async () => {
    seedRow();
    seedMembership("external_auditor");
    await expect(
      appRouter.createCaller(makeCtx()).hr.deleteAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects finance_admin with FORBIDDEN (canEditAttendanceRecords=false for finance)", async () => {
    seedRow();
    seedMembership("finance_admin");
    await expect(
      appRouter.createCaller(makeCtx()).hr.deleteAttendance({ id: 42 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows hr_admin — hard delete executes (guard passes)", async () => {
    seedRow();
    seedMembership("hr_admin");
    const fakeTx = {
      delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve([{ insertId: 1 }])) })),
    };
    vi.mocked(db.getDb).mockResolvedValue({
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    } as never);
    const result = await appRouter.createCaller(makeCtx()).hr.deleteAttendance({ id: 42 });
    expect(result).toEqual({ success: true });
  });

  it("allows company_admin — hard delete executes (guard passes)", async () => {
    seedRow();
    seedMembership("company_admin");
    const fakeTx = {
      delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
      insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve([{ insertId: 1 }])) })),
    };
    vi.mocked(db.getDb).mockResolvedValue({
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx),
    } as never);
    const result = await appRouter.createCaller(makeCtx()).hr.deleteAttendance({ id: 42 });
    expect(result).toEqual({ success: true });
  });
});
