import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { attendanceRouter } from "./routers/attendance";
import * as db from "./db";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
    getUserCompanyById: vi.fn(),
  };
});

function makeHrCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "o1",
      email: "hr@test.om",
      name: "HR",
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

describe("attendance.forceCheckout", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 10 },
      member: { role: "hr_admin" },
    } as never);
  });

  it("throws NOT_FOUND when attendance record is missing for this company", async () => {
    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    } as never);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.forceCheckout({
        companyId: 10,
        attendanceRecordId: 999,
        reason: "1234567890 long enough",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST when session is already closed", async () => {
    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                {
                  id: 5,
                  companyId: 10,
                  employeeId: 3,
                  checkOut: new Date(),
                  checkIn: new Date(),
                },
              ]),
            ),
          })),
        })),
      })),
    } as never);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.forceCheckout({
        companyId: 10,
        attendanceRecordId: 5,
        reason: "1234567890 long enough",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("closed") });
  });
});

describe("attendance.setOperationalIssueStatus validation", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 10 },
      member: { role: "hr_admin" },
    } as never);
  });

  it("rejects resolve without a long enough note", async () => {
    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      transaction: vi.fn(),
    } as never);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.setOperationalIssueStatus({
        companyId: 10,
        businessDateYmd: "2026-04-14",
        kind: "overdue_checkout",
        attendanceRecordId: 1,
        action: "resolve",
        note: "ab",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("attendance.setOperationalIssueStatus company scope", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 10 },
      member: { role: "hr_admin" },
    } as never);
  });

  it("throws NOT_FOUND when the correction is not in the active company", async () => {
    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      transaction: vi.fn(),
    } as never);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.setOperationalIssueStatus({
        companyId: 10,
        businessDateYmd: "2026-04-14",
        kind: "correction_pending",
        correctionId: 999,
        action: "acknowledge",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("attendance.getOperationalIssueHistory", () => {
  beforeEach(() => {
    vi.mocked(db.getUserCompanyById).mockResolvedValue({
      company: { id: 10 },
      member: { role: "hr_admin" },
    } as never);
  });

  it("throws NOT_FOUND when no operational issue row exists for this company and key", async () => {
    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    } as never);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await expect(
      caller.getOperationalIssueHistory({
        companyId: 10,
        issueKey: "correction_pending:cor:999999",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
