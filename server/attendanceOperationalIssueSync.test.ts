import { describe, expect, it, vi } from "vitest";
import { operationalIssueKey } from "@shared/attendanceOperationalIssueKeys";
import {
  missedShiftIssueIdsToAutoResolve,
  resolveOperationalIssueForCorrectionTx,
  resolveOperationalIssueForManualTx,
} from "./attendanceOperationalIssueSync";

describe("missedShiftIssueIdsToAutoResolve", () => {
  it("returns issue ids when schedule is no longer absent on the board", () => {
    const absent = new Set([1, 2]);
    const stale = [
      { id: 10, scheduleId: 3 },
      { id: 11, scheduleId: 1 },
      { id: 12, scheduleId: null },
    ];
    expect(missedShiftIssueIdsToAutoResolve(stale, absent)).toEqual([10]);
  });

  it("returns empty when every stale row is still absent", () => {
    const absent = new Set([7, 8]);
    const stale = [
      { id: 1, scheduleId: 7 },
      { id: 2, scheduleId: 8 },
    ];
    expect(missedShiftIssueIdsToAutoResolve(stale, absent)).toEqual([]);
  });
});

function drizzleLimitChain<T>(rows: T[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
  };
}

describe("resolveOperationalIssueForCorrectionTx", () => {
  it("marks an existing correction_pending issue as resolved", async () => {
    const issueKey = operationalIssueKey({ kind: "correction_pending", correctionId: 12 });
    const issueRow = {
      id: 99,
      companyId: 10,
      issueKey,
      status: "open",
    };
    const setSpy = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));
    const tx = {
      select: vi.fn(() => drizzleLimitChain([issueRow])),
      update: vi.fn(() => ({ set: setSpy })),
    };

    await resolveOperationalIssueForCorrectionTx(tx as never, {
      companyId: 10,
      correctionId: 12,
      requestedDateYmd: "2026-04-14",
      resolvedByUserId: 3,
      resolutionNote: "Correction approved: ok",
    });

    expect(setSpy).toHaveBeenCalled();
    const arg = setSpy.mock.calls[0][0] as { status: string; resolutionNote: string };
    expect(arg.status).toBe("resolved");
    expect(arg.resolutionNote).toBe("Correction approved: ok");
  });

  it("inserts a resolved row when no issue exists yet but correction does", async () => {
    const insertSpy = vi.fn(() => Promise.resolve());
    let selectCalls = 0;
    const tx = {
      select: vi.fn(() => {
        selectCalls += 1;
        if (selectCalls === 1) {
          return drizzleLimitChain([]);
        }
        return drizzleLimitChain([{ employeeId: 7 }]);
      }),
      insert: vi.fn(() => ({ values: insertSpy })),
    };

    await resolveOperationalIssueForCorrectionTx(tx as never, {
      companyId: 10,
      correctionId: 44,
      requestedDateYmd: "2026-05-01",
      resolvedByUserId: 2,
      resolutionNote: "Correction rejected: no",
    });

    expect(insertSpy).toHaveBeenCalled();
    const row = insertSpy.mock.calls[0][0] as { status: string; issueKey: string; correctionId: number };
    expect(row.status).toBe("resolved");
    expect(row.correctionId).toBe(44);
    expect(row.issueKey).toBe(operationalIssueKey({ kind: "correction_pending", correctionId: 44 }));
  });
});

describe("resolveOperationalIssueForManualTx", () => {
  it("marks an existing manual_pending issue as resolved", async () => {
    const issueKey = operationalIssueKey({ kind: "manual_pending", manualCheckinRequestId: 8 });
    const issueRow = { id: 3, companyId: 10, issueKey, status: "open" };
    const setSpy = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));
    let selectN = 0;
    const tx = {
      select: vi.fn(() => {
        selectN += 1;
        if (selectN === 1) return drizzleLimitChain([issueRow]);
        return drizzleLimitChain([{ id: 5 }]);
      }),
      update: vi.fn(() => ({ set: setSpy })),
    };

    await resolveOperationalIssueForManualTx(tx as never, {
      companyId: 10,
      requestId: 8,
      requestedBusinessDateYmd: "2026-04-14",
      employeeUserId: 20,
      resolvedByUserId: 1,
      resolutionNote: "Manual approved",
    });

    expect(setSpy).toHaveBeenCalled();
    expect((setSpy.mock.calls[0][0] as { status: string }).status).toBe("resolved");
  });
});
