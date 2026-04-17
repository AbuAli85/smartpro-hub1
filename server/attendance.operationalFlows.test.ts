import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { attendanceRouter } from "./routers/attendance";
import * as attendanceAudit from "./attendanceAudit";
import * as db from "./db";
import * as companiesRepo from "./repositories/companies.repository";
import {
  ATTENDANCE_AUDIT_ACTION,
  ATTENDANCE_AUDIT_ENTITY,
  ATTENDANCE_AUDIT_SOURCE,
} from "@shared/attendanceAuditTaxonomy";

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

vi.mock("./repositories/companies.repository", () => ({
  getUserCompanyById: vi.fn(),
}));

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

describe("attendance operational flows (router + audit emission)", () => {
  beforeEach(() => {
    vi.mocked(companiesRepo.getUserCompanyById).mockResolvedValue({
      company: { id: 10 },
      member: { role: "hr_admin" },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forceCheckout writes force_checkout audit row", async () => {
    const insertSpy = vi.spyOn(attendanceAudit, "insertAttendanceAuditRow").mockResolvedValue(undefined);

    const openRec = {
      id: 5,
      companyId: 10,
      employeeId: 3,
      checkOut: null,
      checkIn: new Date("2026-04-14T08:00:00.000Z"),
      scheduleId: 1,
      method: "self",
    };
    const closedRec = { ...openRec, checkOut: new Date("2026-04-14T12:00:00.000Z"), method: "admin" };

    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([closedRec])),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve()),
      })),
    };

    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([openRec])),
          })),
        })),
      })),
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => {
        await fn(tx);
      }),
    } as never);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await caller.forceCheckout({
      companyId: 10,
      attendanceRecordId: 5,
      reason: "1234567890 compliance close",
    });

    expect(insertSpy).toHaveBeenCalled();
    const rowArg = insertSpy.mock.calls[0][1] as { actionType: string; entityType: string; entityId: number };
    expect(rowArg.actionType).toBe(ATTENDANCE_AUDIT_ACTION.FORCE_CHECKOUT);
    expect(rowArg.entityType).toBe(ATTENDANCE_AUDIT_ENTITY.ATTENDANCE_RECORD);
    expect(rowArg.entityId).toBe(5);
    expect(rowArg.source).toBe(ATTENDANCE_AUDIT_SOURCE.ADMIN_PANEL);
  });

  it("setOperationalIssueStatus acknowledge writes operational_issue_acknowledge audit", async () => {
    const insertSpy = vi.spyOn(attendanceAudit, "insertAttendanceAuditRow").mockResolvedValue(undefined);

    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                {
                  id: 20,
                  companyId: 10,
                  businessDateYmd: "2026-04-14",
                  issueKind: "overdue_checkout",
                  issueKey: "overdue_checkout:ar:5",
                  attendanceRecordId: 5,
                  scheduleId: null,
                  correctionId: null,
                  manualCheckinRequestId: null,
                  employeeId: 3,
                  status: "open",
                  assignedToUserId: null,
                  acknowledgedByUserId: null,
                  acknowledgedAt: null,
                  reviewedByUserId: null,
                  reviewedAt: null,
                  resolutionNote: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ]),
            ),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => Promise.resolve()),
      })),
    };

    vi.mocked(db.getDb).mockResolvedValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                {
                  employeeId: 3,
                },
              ]),
            ),
          })),
        })),
      })),
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => {
        await fn(tx);
      }),
    } as never);

    const caller = attendanceRouter.createCaller(makeHrCtx());
    await caller.setOperationalIssueStatus({
      companyId: 10,
      businessDateYmd: "2026-04-14",
      kind: "overdue_checkout",
      attendanceRecordId: 5,
      action: "acknowledge",
      note: "seen",
    });

    expect(insertSpy).toHaveBeenCalled();
    const rowArg = insertSpy.mock.calls[0][1] as { actionType: string };
    expect(rowArg.actionType).toBe(ATTENDANCE_AUDIT_ACTION.OPERATIONAL_ISSUE_ACKNOWLEDGE);
  });
});
